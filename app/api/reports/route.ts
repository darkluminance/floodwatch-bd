import {
  addReport,
  clientIp,
  CooldownError,
  getVotes,
  isSameOrigin,
  listReports,
  OutOfBoundsError,
} from "@/lib/floodwatch/server/store";

// Reads request headers and mutates a datastore — always run at request time.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const ip = clientIp(request);
  const [reports, votes] = await Promise.all([listReports(), getVotes(ip)]);
  return Response.json({
    reports,
    votes: votes.tallies,
    myVotes: votes.mine,
  });
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return Response.json({ message: "Forbidden." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ message: "Invalid request body." }, { status: 400 });
  }

  const { lat, lng, depth, note } = (body ?? {}) as Record<string, unknown>;

  try {
    const report = await addReport(
      { lat: lat as number, lng: lng as number, depth, note },
      clientIp(request),
    );
    return Response.json({ report }, { status: 201 });
  } catch (err) {
    if (err instanceof CooldownError) {
      const mins = Math.ceil(err.seconds / 60);
      return Response.json(
        {
          message: `You just submitted a report. Please wait about ${mins} minute${
            mins === 1 ? "" : "s"
          } before adding another.`,
        },
        { status: 429 },
      );
    }
    if (err instanceof OutOfBoundsError) {
      return Response.json(
        { message: "That location is outside Bangladesh." },
        { status: 422 },
      );
    }
    console.error("[floodwatch] POST /api/reports failed:", err);
    return Response.json({ message: "Something went wrong." }, { status: 500 });
  }
}
