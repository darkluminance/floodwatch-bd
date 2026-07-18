"use client";

import { Plus, Sun, Waves } from "lucide-react";
import { useFlood } from "@/lib/floodwatch/store";
import {
  densityLabel,
  regionByKey,
  regionReportCount,
} from "@/lib/floodwatch/geo";
import { cn } from "@/lib/utils";
import { Sheet } from "./Sheet";

const DENSITY = ["#D7EDF9", "#A9D6F2", "#6FB4E6", "#2E82D3", "#07286A"];

export default function AreaSheet() {
  const {
    ui,
    reports,
    tallies,
    confirmArea,
    disputeArea,
    reportHere,
    closeSheet,
  } = useFlood();
  const region = regionByKey(ui.area);
  if (!region) return null;

  const count = regionReportCount(reports, region.key, ui.filters.time);
  const windowLabel =
    ui.filters.time === "6h" ? "6h" : ui.filters.time === "3d" ? "3 days" : "24h";
  const vote = ui.vote;
  const tally = tallies[region.key] ?? { confirm: 0, dispute: 0 };

  const voteMsg =
    vote === "confirmed"
      ? "✓ Thanks — you confirmed this area is still flooded"
      : vote === "disputed"
        ? "✓ Noted — marked as possibly cleared, pending review"
        : "";

  return (
    <Sheet onClose={closeSheet} className="md:max-h-[calc(100%-2rem)]">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[20px] font-extrabold text-flood-ink">
            {region.name}
          </div>
          <div className="text-[12.5px] font-medium text-flood-ink-3">
            {region.division}
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-[20px] font-extrabold text-[#12539E]">
            {count}
          </div>
          <div className="text-[10.5px] font-medium text-flood-ink-4">
            reports · {windowLabel}
          </div>
        </div>
      </div>

      <div className="mt-3.5 flex items-center">
        {DENSITY.map((c) => (
          <span
            key={c}
            className="h-[9px] w-1/5"
            style={{ background: c }}
          />
        ))}
      </div>
      <div className="mt-1.5 text-[12px] font-medium text-flood-ink-3">
        {densityLabel(count)}
      </div>

      {/* Confirm / dispute */}
      <div className="mb-2 mt-[18px] text-[12.5px] font-bold text-flood-ink">
        Is this still flooded?
      </div>
      <div className="flex gap-2.5">
        <button
          type="button"
          onClick={confirmArea}
          disabled={!!vote}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-xl border-[1.5px] py-3 text-[13px] font-bold transition-colors disabled:cursor-default",
            vote === "confirmed"
              ? "border-flood-primary bg-[#E9F1FB] text-flood-primary"
              : "border-flood-line-2 bg-white text-flood-ink-2",
          )}
        >
          <Waves size={16} strokeWidth={2.4} />
          Still flooded
          {tally.confirm > 0 && (
            <span className="font-mono text-[11px] opacity-70">
              {tally.confirm}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={disputeArea}
          disabled={!!vote}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-xl border-[1.5px] py-3 text-[13px] font-bold transition-colors disabled:cursor-default",
            vote === "disputed"
              ? "border-flood-green bg-flood-green-bg text-flood-green-fg"
              : "border-flood-line-2 bg-white text-flood-ink-2",
          )}
        >
          <Sun size={16} strokeWidth={2.4} />
          Cleared now
          {tally.dispute > 0 && (
            <span className="font-mono text-[11px] opacity-70">
              {tally.dispute}
            </span>
          )}
        </button>
      </div>
      <div
        className="mt-2 min-h-[15px] text-[11.5px] font-medium"
        style={{ color: vote === "disputed" ? "#0E8A63" : "#1466C7" }}
      >
        {voteMsg}
      </div>

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
