import {
  clientIp,
  geocodeCacheGet,
  geocodeCacheSet,
  geocodeRateOk,
} from "@/lib/floodwatch/server/store";
import { isInBangladesh } from "@/lib/floodwatch/geo";

export const dynamic = "force-dynamic";

const CACHE_TTL = 24 * 3600; // cache each query for a day

export interface GeoResult {
  name: string;
  sublabel: string;
  lat: number;
  lng: number;
}

interface NominatimItem {
  lat: string;
  lon: string;
  name?: string;
  display_name?: string;
  address?: Record<string, string>;
}

function toResult(item: NominatimItem): GeoResult | null {
  const lat = Number(item.lat);
  const lng = Number(item.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !isInBangladesh(lat, lng)) {
    return null;
  }
  const addr = item.address ?? {};
  const name =
    item.name?.trim() ||
    item.display_name?.split(",")[0]?.trim() ||
    "Unknown place";
  const parts = [
    addr.suburb || addr.town || addr.village || addr.city_district,
    addr.county || addr.state_district || addr.district || addr.city,
    addr.state,
  ]
    .map((p) => p?.trim())
    .filter((p, i, a): p is string => !!p && p !== name && a.indexOf(p) === i);
  const sublabel = parts.slice(0, 2).join(", ") || "Bangladesh";
  return { name, sublabel, lat, lng };
}

export async function GET(request: Request) {
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim();
  if (q.length < 2 || q.length > 100) {
    return Response.json({ results: [] });
  }

  const cacheKey = q.toLowerCase();
  const cached = await geocodeCacheGet(cacheKey);
  if (cached) {
    return Response.json({ results: JSON.parse(cached) as GeoResult[] });
  }

  // Only rate-limit true upstream calls (cache hits above are free).
  if (!(await geocodeRateOk(clientIp(request)))) {
    return Response.json({ results: [] }, { status: 429 });
  }

  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("countrycodes", "bd");
    url.searchParams.set("limit", "6");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("q", q);

    const res = await fetch(url, {
      headers: {
        "User-Agent": "FloodWatchBD/1.0 (citizen flood reporting map for Bangladesh)",
        "Accept-Language": "en",
      },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return Response.json({ results: [] });

    const items = (await res.json()) as NominatimItem[];
    const results = items
      .map(toResult)
      .filter((r): r is GeoResult => r !== null);

    await geocodeCacheSet(cacheKey, JSON.stringify(results), CACHE_TTL);
    return Response.json({ results });
  } catch {
    // Upstream timeout / network error — degrade to no results.
    return Response.json({ results: [] });
  }
}
