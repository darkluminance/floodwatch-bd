import type { Report, TimeRange } from "./types";

/** Bangladesh bounding box [south, west, north, east]. */
export const BD_BOUNDS: [[number, number], [number, number]] = [
  [20.55, 88.0],
  [26.65, 92.7],
];

export const BD_CENTER: [number, number] = [23.75, 90.38];

export const MIN_ZOOM = 6.4;
// CARTO basemap tiles are available up to z20; 19 gives street-level detail.
export const MAX_ZOOM = 19;
export const INITIAL_ZOOM = 6.7;

export interface Region {
  key: string;
  name: string;
  division: string;
  lat: number;
  lng: number;
}

/**
 * Monitored flood-prone areas of Bangladesh, shown as tappable reference
 * points. Report counts and density shown for these are computed live from
 * real reports — nothing here is pre-populated.
 */
export const REGIONS: Region[] = [
  {
    key: "Sunamganj",
    name: "Sunamganj",
    division: "Sylhet Division",
    lat: 25.0658,
    lng: 91.395,
  },
  {
    key: "Kurigram",
    name: "Kurigram",
    division: "Rangpur Division",
    lat: 25.8072,
    lng: 89.6295,
  },
  {
    key: "Sylhet",
    name: "Sylhet",
    division: "Sylhet Division",
    lat: 24.8949,
    lng: 91.8687,
  },
];

export function regionByKey(key: string | null): Region | undefined {
  if (!key) return undefined;
  return REGIONS.find((r) => r.key === key);
}

/** Rough great-circle-ish distance in km (equirectangular approximation). */
export function distanceKm(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const mLat = (((aLat + bLat) / 2) * Math.PI) / 180;
  const x = dLng * Math.cos(mLat);
  return Math.sqrt(dLat * dLat + x * x) * R;
}

/** Nearest known region within `maxKm`, else undefined. */
export function nearestRegion(
  lat: number,
  lng: number,
  maxKm = 60,
): Region | undefined {
  let best: Region | undefined;
  let bestD = Infinity;
  for (const r of REGIONS) {
    const d = distanceKm(lat, lng, r.lat, r.lng);
    if (d < bestD) {
      bestD = d;
      best = r;
    }
  }
  return best && bestD <= maxKm ? best : undefined;
}

/** Human label for a coordinate, using the nearest region when close. */
export function labelForPoint(lat: number, lng: number): string {
  const r = nearestRegion(lat, lng, 45);
  return r ? `Near ${r.name}, ${r.division.replace(" Division", "")}` : "Pinned location";
}

export function formatCoords(lat: number, lng: number): string {
  return `${lat.toFixed(2)}°N, ${lng.toFixed(2)}°E`;
}

/** Round to ~100m precision so published reports don't reveal a device's
 * exact location (e.g. a reporter's home from the "auto" geolocation flow). */
export function roundCoord(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function isInBangladesh(lat: number, lng: number): boolean {
  const [[s, w], [n, e]] = BD_BOUNDS;
  return lat >= s && lat <= n && lng >= w && lng <= e;
}

/** Clamp a coordinate to the Bangladesh bounding box. */
export function clampToBD(lat: number, lng: number): [number, number] {
  const [[s, w], [n, e]] = BD_BOUNDS;
  return [Math.min(Math.max(lat, s), n), Math.min(Math.max(lng, w), e)];
}

export const TIME_WINDOW_MS: Record<TimeRange, number> = {
  "6h": 6 * 3600 * 1000,
  "24h": 24 * 3600 * 1000,
  "3d": 3 * 24 * 3600 * 1000,
};

export function timeLabel(t: TimeRange): string {
  return t === "6h" ? "Last 6h" : t === "3d" ? "Last 3 days" : "Last 24h";
}

/** Filter reports by the active time window + verified flag. */
export function filterReports(
  reports: Report[],
  time: TimeRange,
  verifiedOnly: boolean,
  now: number = Date.now(),
): Report[] {
  const cutoff = now - TIME_WINDOW_MS[time];
  return reports.filter(
    (r) =>
      r.createdAt >= cutoff && (!verifiedOnly || r.verified),
  );
}

/** Factual density description for an area, from its live report count. */
export function densityLabel(count: number): string {
  if (count === 0) return "No active flood reports right now";
  if (count <= 3) return "A few recent reports";
  if (count <= 9) return "Rising reports — monitor closely";
  return "High density — many recent reports";
}

/** Count of reports attributed to a region within the window. */
export function regionReportCount(
  reports: Report[],
  regionKey: string,
  time: TimeRange,
  now: number = Date.now(),
): number {
  const cutoff = now - TIME_WINDOW_MS[time];
  const region = regionByKey(regionKey);
  if (!region) return 0;
  return reports.filter(
    (r) =>
      r.createdAt >= cutoff &&
      distanceKm(r.lat, r.lng, region.lat, region.lng) <= 30,
  ).length;
}
