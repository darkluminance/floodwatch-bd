import MapApp from "@/components/floodwatch/MapApp";
import { listReports } from "@/lib/floodwatch/server/store";

// Reads the shared datastore per request so the map paints with live data.
export const dynamic = "force-dynamic";

export default async function Home() {
  const initialReports = await listReports();
  return <MapApp initialReports={initialReports} />;
}
