"use client";

import { useMemo } from "react";
import { Check, ChevronLeft, ChevronRight, Plus, Sun, Waves } from "lucide-react";
import { useFlood } from "@/lib/floodwatch/store";
import { commonDepth, labelForPoint } from "@/lib/floodwatch/geo";
import type { Depth } from "@/lib/floodwatch/types";
import { cn } from "@/lib/utils";
import { Sheet } from "./Sheet";

const DENSITY = ["#D7EDF9", "#A9D6F2", "#6FB4E6", "#2E82D3", "#07286A"];
const DEPTH_SHORT: Record<Depth, string> = {
  Ankle: "Ankle-deep",
  Knee: "Knee-deep",
  Waist: "Waist-deep",
  Above: "Above waist",
};
const LIST_CAP = 50;

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function ClusterSheet() {
  const {
    reports,
    activeCluster,
    clusterExpanded,
    locationTally,
    voteLocation,
    setClusterExpanded,
    openReportDetail,
    reportHere,
    closeSheet,
  } = useFlood();

  const members = useMemo(() => {
    if (!activeCluster) return [];
    const ids = new Set(activeCluster.ids);
    return reports
      .filter((r) => ids.has(r.id))
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [reports, activeCluster]);

  if (!activeCluster) return null;

  const count = members.length;
  const verified = members.filter((r) => r.verified).length;
  const depthCounts: Partial<Record<Depth, number>> = {};
  for (const r of members) {
    if (r.depth) depthCounts[r.depth] = (depthCounts[r.depth] ?? 0) + 1;
  }
  const mostly = commonDepth(depthCounts);
  const label = labelForPoint(activeCluster.lat, activeCluster.lng);

  // ---- expanded: list of individual reports ----
  if (clusterExpanded) {
    return (
      <Sheet onClose={closeSheet}>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setClusterExpanded(false)}
            className="flex items-center gap-0.5 text-[13px] font-bold text-flood-primary"
          >
            <ChevronLeft size={16} strokeWidth={2.4} />
            Back
          </button>
          <div className="ml-auto text-[12.5px] font-bold text-flood-ink-3">
            {count} report{count === 1 ? "" : "s"}
          </div>
        </div>
        <div className="mt-3 flex flex-col gap-2">
          {members.slice(0, LIST_CAP).map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => openReportDetail(r.id)}
              className="flex items-center gap-3 rounded-xl border border-flood-line-2 bg-white px-3 py-2.5 text-left hover:bg-flood-tint"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-[13px] font-bold text-flood-ink">
                  {r.depth ? DEPTH_SHORT[r.depth] : "Flood report"}
                  {r.verified ? (
                    <Check
                      size={13}
                      strokeWidth={2.6}
                      className="text-flood-green"
                    />
                  ) : null}
                </div>
                {r.note ? (
                  <div className="truncate text-[11.5px] text-flood-ink-3">
                    {r.note}
                  </div>
                ) : null}
              </div>
              <span className="shrink-0 font-mono text-[10.5px] text-flood-ink-4">
                {timeAgo(r.createdAt)}
              </span>
              <ChevronRight
                size={15}
                strokeWidth={2.4}
                className="shrink-0 text-flood-ink-4"
              />
            </button>
          ))}
          {count > LIST_CAP && (
            <div className="py-1 text-center text-[11.5px] text-flood-ink-4">
              + {count - LIST_CAP} more
            </div>
          )}
        </div>
      </Sheet>
    );
  }

  // ---- summary: aggregate spot view ----
  const mine = locationTally?.mine ?? null;
  const voteMsg =
    mine === "confirmed"
      ? "✓ Thanks — you confirmed flooding here"
      : mine === "disputed"
        ? "✓ Noted — you marked this area cleared"
        : "";

  return (
    <Sheet onClose={closeSheet}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[20px] font-extrabold text-flood-ink">
            {label}
          </div>
          <div className="text-[12.5px] font-medium text-flood-ink-3">
            {verified} of {count} verified
            {mostly ? ` · mostly ${DEPTH_SHORT[mostly].toLowerCase()}` : ""}
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-[20px] font-extrabold text-[#12539E]">
            {count}
          </div>
          <div className="text-[10.5px] font-medium text-flood-ink-4">
            reports
          </div>
        </div>
      </div>

      <div className="mt-3.5 flex items-center">
        {DENSITY.map((c) => (
          <span key={c} className="h-[9px] w-1/5" style={{ background: c }} />
        ))}
      </div>

      {members.find((r) => r.note) && (
        <div className="mt-3 rounded-xl border border-flood-line-2 bg-flood-tint-2 px-3 py-2.5 text-[12.5px] font-medium text-flood-ink-2">
          {members
            .filter((r) => r.note)
            .slice(0, 2)
            .map((r) => `“${r.note}”`)
            .join("  ")}
        </div>
      )}

      {/* Spot vote */}
      <div className="mb-2 mt-[18px] text-[12.5px] font-bold text-flood-ink">
        Is this area still flooded?
      </div>
      <div className="flex gap-2.5">
        <button
          type="button"
          onClick={() => voteLocation("confirmed")}
          disabled={!!mine}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-xl border-[1.5px] py-3 text-[13px] font-bold transition-colors disabled:cursor-default",
            mine === "confirmed"
              ? "border-flood-primary bg-[#E9F1FB] text-flood-primary"
              : "border-flood-line-2 bg-white text-flood-ink-2 disabled:opacity-55",
          )}
        >
          <Waves size={16} strokeWidth={2.4} />
          Still flooded
          {locationTally && locationTally.confirm > 0 && (
            <span className="font-mono text-[11px] opacity-70">
              {locationTally.confirm}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => voteLocation("disputed")}
          disabled={!!mine}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-xl border-[1.5px] py-3 text-[13px] font-bold transition-colors disabled:cursor-default",
            mine === "disputed"
              ? "border-flood-green bg-flood-green-bg text-flood-green-fg"
              : "border-flood-line-2 bg-white text-flood-ink-2 disabled:opacity-55",
          )}
        >
          <Sun size={16} strokeWidth={2.4} />
          Cleared now
          {locationTally && locationTally.dispute > 0 && (
            <span className="font-mono text-[11px] opacity-70">
              {locationTally.dispute}
            </span>
          )}
        </button>
      </div>
      <div
        className="mt-2 min-h-[15px] text-[11.5px] font-medium"
        style={{ color: mine === "disputed" ? "#0E8A63" : "#1466C7" }}
      >
        {voteMsg}
      </div>

      <button
        type="button"
        onClick={() => setClusterExpanded(true)}
        className="mt-1 flex w-full items-center justify-center gap-1 rounded-[13px] border-[1.5px] border-flood-line-2 bg-white py-3 text-[13.5px] font-bold text-flood-ink-2"
      >
        View all {count} report{count === 1 ? "" : "s"}
        <ChevronRight size={16} strokeWidth={2.4} />
      </button>

      <button
        type="button"
        onClick={reportHere}
        className="mt-2 flex w-full items-center justify-center gap-2 rounded-[13px] border-[1.5px] border-flood-line-accent bg-flood-tint py-3 text-[14px] font-extrabold text-flood-primary"
      >
        <Plus size={16} strokeWidth={2.6} />
        Report here too
      </button>
    </Sheet>
  );
}
