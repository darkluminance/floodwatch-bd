"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useFlood } from "@/lib/floodwatch/store";
import {
  BD_BOUNDS,
  BD_CENTER,
  INITIAL_ZOOM,
  MAX_ZOOM,
  MIN_ZOOM,
} from "@/lib/floodwatch/geo";
import HeatLayer from "./HeatLayer";
import ReportPins from "./ReportPins";

/** Registers the map with the store, wires clicks, and fixes sizing. */
function MapBridge() {
  const map = useMap();
  const { registerMap, placePin, ui } = useFlood();

  useEffect(() => {
    registerMap(map);
    // Ensure the map fills its (flex) container once mounted.
    const t = setTimeout(() => map.invalidateSize(), 0);
    return () => {
      clearTimeout(t);
      registerMap(null);
    };
  }, [map, registerMap]);

  useMapEvents({
    click(e) {
      if (ui.step === "placing") {
        placePin(e.latlng.lat, e.latlng.lng);
      }
    },
  });

  return null;
}

export default function FloodMap() {
  const { visibleReports, ui } = useFlood();

  return (
    <MapContainer
      center={BD_CENTER}
      zoom={INITIAL_ZOOM}
      minZoom={MIN_ZOOM}
      maxZoom={MAX_ZOOM}
      zoomSnap={0.25}
      zoomDelta={0.5}
      maxBounds={L.latLngBounds(BD_BOUNDS[0], BD_BOUNDS[1])}
      maxBoundsViscosity={1}
      zoomControl={false}
      attributionControl={false}
      className="h-full w-full"
      style={{
        cursor: ui.step === "placing" ? "crosshair" : "grab",
      }}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        subdomains="abcd"
        maxZoom={20}
      />
      <MapBridge />
      <HeatLayer reports={visibleReports} />
      <ReportPins />
    </MapContainer>
  );
}
