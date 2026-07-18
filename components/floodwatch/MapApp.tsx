"use client";

import dynamic from "next/dynamic";
import { FloodProvider, useFlood } from "@/lib/floodwatch/store";
import type { Report } from "@/lib/floodwatch/types";
import { Legend, ZoomControl } from "./map/MapControls";
import Onboarding from "./overlays/Onboarding";
import TopBar from "./overlays/TopBar";
import ReportButton from "./overlays/ReportButton";
import PlacingBanner from "./overlays/PlacingBanner";
import ReportModeSheet from "./sheets/ReportModeSheet";
import LocatingModal from "./sheets/LocatingModal";
import ReportDetailsSheet from "./sheets/ReportDetailsSheet";
import DoneSheet from "./sheets/DoneSheet";
import AreaSheet from "./sheets/AreaSheet";
import FilterSheet from "./sheets/FilterSheet";

// Leaflet touches `window`, so the map is client-only. `ssr:false` is only
// legal inside a Client Component (this file) in Next 16.
const FloodMap = dynamic(() => import("./map/FloodMap"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-flood-base" />,
});

function Sheets() {
  const { ui } = useFlood();
  const isReport = ui.sheet === "report";

  if (isReport && ui.step === "mode") return <ReportModeSheet />;
  if (isReport && ui.step === "locating") return <LocatingModal />;
  if (isReport && ui.step === "details") return <ReportDetailsSheet />;
  if (isReport && ui.step === "done") return <DoneSheet />;
  if (ui.sheet === "area") return <AreaSheet />;
  if (ui.sheet === "filter") return <FilterSheet />;
  return null;
}

function AppShell() {
  const { ui, showOnboarding } = useFlood();

  const placing = ui.sheet === "report" && ui.step === "placing";
  const chromeVisible = !ui.sheet && !placing;
  const navVisible = !ui.sheet;

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-flood-base">
      {/* Persistent map layer. `isolate` traps Leaflet's internal pane
          z-indexes (200–600) in their own stacking context so our overlays
          (and onboarding) reliably sit above the map. */}
      <div className="absolute inset-0 isolate">
        <FloodMap />
      </div>

      {/* Attribution (CARTO / OpenStreetMap) */}
      <div className="fw-attribution pointer-events-none absolute bottom-1 right-1.5 z-[11]">
        © OpenStreetMap · © CARTO
      </div>

      {/* Map chrome */}
      {chromeVisible && (
        <>
          <TopBar />
          <Legend />
          <ZoomControl />
        </>
      )}
      {navVisible && <ReportButton />}
      {placing && <PlacingBanner />}

      {/* Sheets / modals */}
      <Sheets />

      {/* Onboarding overlays everything (first run only) */}
      {showOnboarding && <Onboarding />}
    </div>
  );
}

export default function MapApp({
  initialReports = [],
}: {
  initialReports?: Report[];
}) {
  return (
    <FloodProvider initialReports={initialReports}>
      <AppShell />
    </FloodProvider>
  );
}
