import {
  AlreadyVotedError,
  castVote,
  clientIp,
  InvalidVoteError,
  ReportNotFoundError,
  voteReport,
} from "@/lib/floodwatch/server/store";
import type { VoteKind } from "@/lib/floodwatch/types";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ message: "Invalid request body." }, { status: 400 });
  }

  const { region, reportId, kind } = (body ?? {}) as {
    region?: string;
    reportId?: string;
    kind?: VoteKind;
  };
  const ip = clientIp(request);

  try {
    // Per-report vote (verify/dispute a specific report).
    if (reportId) {
      const result = await voteReport(reportId, kind as VoteKind, ip);
      return Response.json(
        { ok: true, verified: result.verified, removed: result.removed },
        { status: 201 },
      );
    }
    // Area-level vote (aggregate confirm/dispute for a monitored region).
    await castVote(region ?? "", kind as VoteKind, ip);
    return Response.json({ ok: true }, { status: 201 });
  } catch (err) {
    if (err instanceof AlreadyVotedError) {
      return Response.json(
        { message: "You already voted on this." },
        { status: 409 },
      );
    }
    if (err instanceof ReportNotFoundError) {
      return Response.json(
        { message: "This report is no longer on the map." },
        { status: 404 },
      );
    }
    if (err instanceof InvalidVoteError) {
      return Response.json({ message: "Invalid vote." }, { status: 400 });
    }
    console.error("[floodwatch] POST /api/votes failed:", err);
    return Response.json({ message: "Something went wrong." }, { status: 500 });
  }
}
