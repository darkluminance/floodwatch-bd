"use client";

import { Check, MapPin } from "lucide-react";
import { useFlood } from "@/lib/floodwatch/store";
import { formatCoords } from "@/lib/floodwatch/geo";
import type { Depth } from "@/lib/floodwatch/types";
import { cn } from "@/lib/utils";
import { Sheet } from "./Sheet";

const DEPTHS: Depth[] = ["Ankle", "Knee", "Waist", "Above"];

export default function ReportDetailsSheet() {
  const { ui, setDepth, setNote, submitReport, editLocation, closeSheet } =
    useFlood();
  const { draft, cooldownMsg } = ui;
  const pin = draft.pin;

  return (
    <Sheet onClose={closeSheet}>
      <div className="text-[18px] font-extrabold text-flood-ink">
        Flood details
      </div>

      {/* Location confirm */}
      <div className="mt-3 flex items-center gap-3 rounded-xl border border-flood-line-accent bg-flood-tint p-3">
        <MapPin size={20} strokeWidth={2.2} className="text-flood-primary" />
        <div className="flex-1">
          <div className="text-[13px] font-bold text-flood-ink">
            {draft.locLabel ?? "Pinned location"}
          </div>
          <div className="font-mono text-[11px] text-[#7C8794]">
            {pin ? formatCoords(pin.lat, pin.lng) : "—"}
          </div>
        </div>
        <button
          type="button"
          onClick={editLocation}
          className="text-[12px] font-bold text-flood-primary"
        >
          Change
        </button>
      </div>

      {/* Depth */}
      <div className="mb-2 mt-4 text-[12.5px] font-bold text-flood-ink">
        How deep is the water?{" "}
        <span className="font-medium text-flood-ink-4">(optional)</span>
      </div>
      <div className="flex gap-[7px]">
        {DEPTHS.map((d) => {
          const active = draft.depth === d;
          return (
            <button
              key={d}
              type="button"
              onClick={() => setDepth(d)}
              className={cn(
                "flex-1 rounded-[11px] border-[1.5px] px-1 py-[11px] text-[12px] font-bold transition-colors",
                active
                  ? "border-flood-primary bg-flood-tint text-flood-primary"
                  : "border-flood-line-2 bg-white text-flood-ink-2",
              )}
            >
              {d}
            </button>
          );
        })}
      </div>

      {/* Note */}
      <div className="mb-2 mt-4 text-[12.5px] font-bold text-flood-ink">
        Note <span className="font-medium text-flood-ink-4">(optional)</span>
      </div>
      <textarea
        value={draft.note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="e.g. Road impassable near the bazaar"
        rows={2}
        className="w-full resize-none rounded-xl border-[1.5px] border-flood-line-2 px-3 py-[11px] text-[13px] font-medium text-flood-ink outline-none placeholder:text-flood-ink-4 focus:border-flood-primary"
      />

      {cooldownMsg && (
        <div className="mt-3 rounded-xl border border-[#F4D9A6] bg-[#FFF1DB] px-3 py-2.5 text-[12px] font-medium text-[#9A6410]">
          {cooldownMsg}
        </div>
      )}

      <button
        type="button"
        onClick={submitReport}
        className="mt-[18px] flex w-full items-center justify-center gap-2 rounded-[14px] bg-flood-primary py-[15px] text-[15px] font-extrabold text-white"
      >
        <Check size={17} strokeWidth={2.6} />
        Submit report
      </button>
    </Sheet>
  );
}
