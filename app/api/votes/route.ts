import {
  AlreadyVotedError,
  castVote,
  clientIp,
  InvalidVoteError,
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

  const { region, kind } = (body ?? {}) as {
    region?: string;
    kind?: VoteKind;
  };

  try {
    await castVote(region ?? "", kind as VoteKind, clientIp(request));
    return Response.json({ ok: true }, { status: 201 });
  } catch (err) {
    if (err instanceof AlreadyVotedError) {
      return Response.json(
        { message: "You already voted on this area." },
        { status: 409 },
      );
    }
    if (err instanceof InvalidVoteError) {
      return Response.json({ message: "Invalid vote." }, { status: 400 });
    }
    console.error("[floodwatch] POST /api/votes failed:", err);
    return Response.json({ message: "Something went wrong." }, { status: 500 });
  }
}
