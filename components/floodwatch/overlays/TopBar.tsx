"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, MapPin, Search } from "lucide-react";
import { useFlood } from "@/lib/floodwatch/store";
import { timeLabel } from "@/lib/floodwatch/geo";
import { searchDistricts } from "@/lib/floodwatch/districts";

interface Result {
  id: string;
  name: string;
  sublabel: string;
  lat: number;
  lng: number;
  zoom: number;
}

export default function TopBar() {
  const { ui, openFilter, focusOn } = useFlood();
  const verified = ui.filters.verified;

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  // Geocoded ("area") results, tagged with the query they belong to so stale
  // responses from a previous keystroke are never shown.
  const [geo, setGeo] = useState<{ q: string; results: Result[] }>({
    q: "",
    results: [],
  });
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced call to the geocoder proxy for sub-district areas.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/geocode?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : { results: [] }))
        .then((d: { results?: Omit<Result, "id" | "zoom">[] }) =>
          setGeo({
            q,
            results: (d.results ?? []).map((r, i) => ({
              ...r,
              id: `g-${i}-${r.lat},${r.lng}`,
              zoom: 16,
            })),
          }),
        )
        .catch(() => {});
    }, 300);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query]);

  const q = query.trim();
  const local: Result[] = searchDistricts(query).map((d) => ({
    id: `d-${d.name}`,
    name: d.name,
    sublabel: d.division,
    lat: d.lat,
    lng: d.lng,
    zoom: 12,
  }));
  const geoResults = geo.q === q ? geo.results : [];
  const localNames = new Set(local.map((l) => l.name.toLowerCase()));
  const results = [
    ...local,
    ...geoResults.filter((g) => !localNames.has(g.name.toLowerCase())),
  ].slice(0, 8);

  const select = (r: Result) => {
    focusOn(r.lat, r.lng, r.zoom);
    setQuery("");
    setOpen(false);
  };

  return (
    <div className="absolute inset-x-0 top-0 z-[14] px-3.5 pt-[max(10px,env(safe-area-inset-top))] md:px-4 md:pt-4">
      <div className="mx-auto w-full max-w-[440px] md:mx-0 md:max-w-[400px]">
        <div className="relative">
          <div className="flex items-center gap-2.5 rounded-[13px] border border-flood-line bg-white px-3.5 py-[11px] shadow-[0_6px_18px_-8px_rgba(15,27,45,.28)]">
            <Search size={15} strokeWidth={2.2} className="text-flood-ink-4" />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              onBlur={() => {
                blurTimer.current = setTimeout(() => setOpen(false), 120);
              }}
              placeholder="Search a district or area"
              aria-label="Search a district or area"
              className="min-w-0 flex-1 bg-transparent text-[13.5px] text-flood-ink outline-none placeholder:text-flood-ink-4"
            />
            <span className="text-[11px] font-bold text-flood-primary">EN</span>
          </div>

          {open && results.length > 0 && (
            <div className="absolute inset-x-0 top-full z-20 mt-1.5 overflow-hidden rounded-[13px] border border-flood-line bg-white shadow-[0_10px_26px_-10px_rgba(15,27,45,.34)]">
              {results.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  // onMouseDown fires before the input's onBlur, so selection wins
                  onMouseDown={(e) => {
                    e.preventDefault();
                    if (blurTimer.current) clearTimeout(blurTimer.current);
                    select(r);
                  }}
                  className="flex w-full items-center gap-2.5 border-b border-[#EDF1F5] px-3.5 py-2.5 text-left last:border-b-0 hover:bg-flood-tint"
                >
                  <MapPin
                    size={14}
                    strokeWidth={2.2}
                    className="shrink-0 text-flood-primary"
                  />
                  <span className="truncate text-[13px] font-semibold text-flood-ink">
                    {r.name}
                  </span>
                  <span className="ml-auto shrink-0 pl-2 text-[11px] font-medium text-flood-ink-4">
                    {r.sublabel}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="mt-2.5 flex gap-[7px]">
          <button
            type="button"
            onClick={openFilter}
            className="flex items-center gap-1.5 rounded-[10px] border border-flood-line bg-white px-[11px] py-[7px] text-[12px] font-semibold text-flood-ink shadow-[0_3px_10px_-5px_rgba(15,27,45,.25)]"
          >
            {timeLabel(ui.filters.time)}
            <ChevronDown size={10} strokeWidth={3} className="text-[#6A7686]" />
          </button>
          <button
            type="button"
            onClick={openFilter}
            className="rounded-[10px] border border-flood-line bg-white px-[11px] py-[7px] text-[12px] font-semibold shadow-[0_3px_10px_-5px_rgba(15,27,45,.25)]"
            style={{ color: verified ? "#1466C7" : "#4A5766" }}
          >
            Verified only
          </button>
        </div>
      </div>
    </div>
  );
}
