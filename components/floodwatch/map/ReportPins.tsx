"use client";

import { useMemo } from "react";
import { Marker } from "react-leaflet";
import L from "leaflet";
import { useFlood } from "@/lib/floodwatch/store";
import { REGIONS, regionReportCount } from "@/lib/floodwatch/geo";

function regionIcon(name: string, count: number): L.DivIcon {
  // A large transparent circle is the click target (easy to tap anywhere on
  // the blob), with the label centred inside it.
  return L.divIcon({
    className: "fw-region-icon",
    html: `
      <div style="width:116px;height:116px;transform:translate(-50%,-50%);border-radius:50%;display:flex;align-items:center;justify-content:center;pointer-events:auto;cursor:pointer">
        <div style="text-align:center;white-space:nowrap">
          <div style="font:700 13px var(--font-sans),sans-serif;color:#12294a;text-shadow:0 1px 3px rgba(235,241,245,.9),0 0 6px rgba(235,241,245,.9)">${name}</div>
          <div style="font:500 9.5px var(--font-mono),monospace;color:#3e5170;text-shadow:0 1px 3px rgba(235,241,245,.9)">${count} report${count === 1 ? "" : "s"}</div>
        </div>
      </div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

function amberPin(): L.DivIcon {
  return L.divIcon({
    className: "fw-amber-icon",
    html: `
      <div class="fw-pin" style="transform:translate(-50%,-100%)">
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
          <path d="M12 22s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12Z" fill="#F2A93B" stroke="#fff" stroke-width="1.5"/>
          <circle cx="12" cy="10" r="3" fill="#fff"/>
        </svg>
      </div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

export default function ReportPins() {
  const { reports, visibleReports, openArea, openReportDetail, ui } =
    useFlood();

  const counts = useMemo(
    () =>
      Object.fromEntries(
        REGIONS.map((r) => [
          r.key,
          regionReportCount(reports, r.key, ui.filters.time),
        ]),
      ),
    [reports, ui.filters.time],
  );

  // Amber pins mark individual unverified reports (awaiting confirmation),
  // respecting the active time/verified filters.
  const unverifiedPins = useMemo(
    () => visibleReports.filter((r) => !r.verified),
    [visibleReports],
  );

  return (
    <>
      {REGIONS.filter((region) => (counts[region.key] ?? 0) > 0).map(
        (region) => (
          <Marker
            key={region.key}
            position={[region.lat, region.lng]}
            icon={regionIcon(region.name, counts[region.key] ?? 0)}
            interactive={ui.step !== "placing"}
            eventHandlers={{ click: () => openArea(region.key) }}
          />
        ),
      )}
      {unverifiedPins.map((r) => (
        <Marker
          key={r.id}
          position={[r.lat, r.lng]}
          icon={amberPin()}
          interactive={ui.step !== "placing"}
          zIndexOffset={1000}
          eventHandlers={{ click: () => openReportDetail(r.id) }}
        />
      ))}
    </>
  );
}
