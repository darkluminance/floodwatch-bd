"use client";

import { Check, Clock, MapPin, Sun, Waves } from "lucide-react";
import { useFlood } from "@/lib/floodwatch/store";
import { formatCoords, labelForPoint } from "@/lib/floodwatch/geo";
import type { Depth } from "@/lib/floodwatch/types";
import { cn } from "@/lib/utils";
import { Sheet } from "./Sheet";

const DEPTH_LABEL: Record<Depth, string> = {
  Ankle: "Ankle-deep water",
  Knee: "Knee-deep water",
  Waist: "Waist-deep water",
  Above: "Above waist-deep",
};

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr${h === 1 ? "" : "s"} ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

export default function ReportDetailSheet() {
  const { ui, reports, votedReports, voteReport, closeSheet } = useFlood();
  const report = reports.find((r) => r.id === ui.detailReportId);

  // Report gone (cleared/removed) — show any feedback + a way out.
  if (!report) {
    return (
      <Sheet onClose={closeSheet}>
        <div className="text-[18px] font-extrabold text-flood-ink">
          Flood report
        </div>
        <div className="mt-2 text-[13px] font-medium text-flood-ink-3">
          {ui.detailMsg ?? "This report is no longer on the map."}
        </div>
        <button
          type="button"
          onClick={closeSheet}
          className="mt-5 w-full rounded-[14px] bg-flood-primary py-[15px] text-[15px] font-extrabold text-white"
        >
          Back to map
        </button>
      </Sheet>
    );
  }

  const voted = votedReports.has(report.id) || !!ui.detailMsg;

  return (
    <Sheet onClose={closeSheet}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[18px] font-extrabold text-flood-ink">
            Flood report
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[12px] font-medium text-flood-ink-3">
            <Clock size={12} strokeWidth={2.2} />
            {timeAgo(report.createdAt)}
          </div>
        </div>
        {report.verified ? (
          <span className="flex items-center gap-1 rounded-full bg-flood-green-bg px-2.5 py-1 text-[11px] font-bold text-flood-green-fg">
            <Check size={13} strokeWidth={2.6} />
            Verified
          </span>
        ) : (
          <span className="rounded-full bg-[#FFF1DB] px-2.5 py-1 text-[11px] font-bold text-flood-amber">
            Unverified
          </span>
        )}
      </div>

      {/* Location */}
      <div className="mt-3 flex items-center gap-3 rounded-xl border border-flood-line-accent bg-flood-tint p-3">
        <MapPin size={20} strokeWidth={2.2} className="text-flood-primary" />
        <div className="flex-1">
          <div className="text-[13px] font-bold text-flood-ink">
            {labelForPoint(report.lat, report.lng)}
          </div>
          <div className="font-mono text-[11px] text-[#7C8794]">
            {formatCoords(report.lat, report.lng)}
          </div>
        </div>
      </div>

      {/* Depth + note */}
      {report.depth && (
        <div className="mt-3 flex items-center gap-2 text-[13px] font-semibold text-flood-ink">
          <Waves size={16} strokeWidth={2.2} className="text-flood-primary" />
          {DEPTH_LABEL[report.depth]}
        </div>
      )}
      {report.note && (
        <div className="mt-2 rounded-xl border border-flood-line-2 bg-flood-tint-2 px-3 py-2.5 text-[13px] font-medium text-flood-ink-2">
          “{report.note}”
        </div>
      )}

      <div className="mt-3 font-mono text-[11px] text-flood-ink-4">
        {report.votes.confirm} confirmed · {report.votes.dispute} disputed
      </div>

      {/* Verify */}
      <div className="mb-2 mt-[18px] text-[12.5px] font-bold text-flood-ink">
        Is this still flooded?
      </div>
      <div className="flex gap-2.5">
        <button
          type="button"
          onClick={() => voteReport("confirmed")}
          disabled={voted}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-xl border-[1.5px] border-flood-line-2 bg-white py-3 text-[13px] font-bold text-flood-ink-2 transition-colors disabled:opacity-55",
          )}
        >
          <Waves size={16} strokeWidth={2.4} />
          Still flooded
        </button>
        <button
          type="button"
          onClick={() => voteReport("disputed")}
          disabled={voted}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-xl border-[1.5px] border-flood-line-2 bg-white py-3 text-[13px] font-bold text-flood-ink-2 transition-colors disabled:opacity-55",
          )}
        >
          <Sun size={16} strokeWidth={2.4} />
          Cleared now
        </button>
      </div>
      <div className="mt-2 min-h-[15px] text-[11.5px] font-medium text-flood-primary">
        {ui.detailMsg}
      </div>
    </Sheet>
  );
}
