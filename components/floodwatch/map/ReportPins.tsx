"use client";

import { useMemo, useState } from "react";
import { Marker, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { useFlood } from "@/lib/floodwatch/store";
import { clusterReports } from "@/lib/floodwatch/geo";

/** A round count badge for a cluster of reports. */
function clusterIcon(count: number, verifiedCount: number): L.DivIcon {
  const size = Math.round(30 + Math.min(24, Math.sqrt(count) * 5));
  const allVerified = count > 0 && verifiedCount === count;
  const bg = allVerified ? "#17A67B" : "#1466C7";
  const label = count > 999 ? "999+" : String(count);
  const fontSize = size > 44 ? 14 : count > 99 ? 11 : 12.5;
  return L.divIcon({
    className: "fw-cluster-icon",
    html: `
      <div style="width:${size}px;height:${size}px;transform:translate(-50%,-50%);border-radius:50%;background:${bg};border:2.5px solid #fff;box-shadow:0 3px 10px -2px rgba(15,27,45,.42);display:flex;align-items:center;justify-content:center;color:#fff;font:800 ${fontSize}px var(--font-sans),sans-serif;pointer-events:auto;cursor:pointer">${label}</div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

export default function ReportPins() {
  const { visibleReports, openCluster, openReportDetail, ui } = useFlood();
  const map = useMap();
  const [zoom, setZoom] = useState(() => map.getZoom());
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) });

  const clusters = useMemo(
    () => clusterReports(visibleReports, zoom),
    [visibleReports, zoom],
  );

  return (
    <>
      {clusters.map((c) => (
        <Marker
          key={c.key}
          position={[c.lat, c.lng]}
          icon={clusterIcon(c.count, c.verifiedCount)}
          interactive={ui.step !== "placing"}
          eventHandlers={{
            click: () =>
              c.count === 1 ? openReportDetail(c.ids[0]) : openCluster(c),
          }}
        />
      ))}
    </>
  );
}
