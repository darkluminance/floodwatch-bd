"use client";

import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet.heat";
import type { Report } from "@/lib/floodwatch/types";

/** Per-report intensity, weighted a little by reported depth. */
function intensity(r: Report): number {
  switch (r.depth) {
    case "Above":
      return 1;
    case "Waist":
      return 0.8;
    case "Knee":
      return 0.6;
    case "Ankle":
      return 0.45;
    default:
      return 0.5;
  }
}

const GRADIENT: Record<number, string> = {
  0.2: "#a9d6f2",
  0.4: "#6fb4e6",
  0.6: "#2e82d3",
  0.8: "#12539e",
  1.0: "#07286a",
};

// leaflet.heat radius is in *pixels*, so a fixed value misrepresents area
// across zooms (huge blobs when zoomed out). Instead we target a roughly
// constant real-world footprint per report and convert to pixels for the
// current zoom, clamped so blobs stay visible but never absurd.
const METERS_RADIUS = 1600; // ~1.6 km real-world radius per report
const MIN_RADIUS = 10;
const MAX_RADIUS = 55;

function radiusForZoom(map: L.Map): { radius: number; blur: number } {
  const lat = map.getCenter().lat;
  const metersPerPixel =
    (156543.03392 * Math.cos((lat * Math.PI) / 180)) /
    Math.pow(2, map.getZoom());
  const px = METERS_RADIUS / metersPerPixel;
  const radius = Math.max(MIN_RADIUS, Math.min(MAX_RADIUS, px));
  return { radius, blur: Math.max(6, radius * 0.55) };
}

export default function HeatLayer({ reports }: { reports: Report[] }) {
  const map = useMap();
  const layerRef = useRef<L.HeatLayer | null>(null);

  useEffect(() => {
    const points = reports.map(
      (r) => [r.lat, r.lng, intensity(r)] as [number, number, number],
    );

    // leaflet.heat draws to a canvas sized from the map. If the container has
    // not been laid out yet, its size is 0 and canvas getImageData() throws
    // (IndexSizeError). Only draw once the map reports a non-zero size.
    const draw = (): boolean => {
      const size = map.getSize();
      if (size.x === 0 || size.y === 0) return false;
      if (!layerRef.current) {
        const { radius, blur } = radiusForZoom(map);
        layerRef.current = L.heatLayer(points, {
          radius,
          blur,
          minOpacity: 0.28,
          gradient: GRADIENT,
        }).addTo(map);
      } else {
        layerRef.current.setLatLngs(points);
      }
      return true;
    };

    if (draw()) return;

    // Container not sized yet — retry when the map resizes / next frame.
    const onResize = () => {
      if (draw()) map.off("resize", onResize);
    };
    map.on("resize", onResize);
    const raf = requestAnimationFrame(() => {
      map.invalidateSize();
      if (draw()) map.off("resize", onResize);
    });
    return () => {
      map.off("resize", onResize);
      cancelAnimationFrame(raf);
    };
  }, [map, reports]);

  // Rescale the blob radius so it tracks a constant geographic size on zoom.
  useEffect(() => {
    const onZoom = () => {
      if (layerRef.current) layerRef.current.setOptions(radiusForZoom(map));
    };
    map.on("zoomend", onZoom);
    return () => {
      map.off("zoomend", onZoom);
    };
  }, [map]);

  useEffect(() => {
    return () => {
      if (layerRef.current) {
        layerRef.current.remove();
        layerRef.current = null;
      }
    };
  }, []);

  return null;
}
