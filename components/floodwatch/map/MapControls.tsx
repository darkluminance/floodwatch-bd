"use client";

import { Minus, Plus } from "lucide-react";
import { useFlood } from "@/lib/floodwatch/store";
import { timeLabel } from "@/lib/floodwatch/geo";

export function Legend() {
  const { ui } = useFlood();
  return (
    <div className="pointer-events-none absolute bottom-6 left-3.5 z-[12] rounded-xl border border-flood-line bg-white/95 px-3.5 py-3 shadow-[0_6px_18px_-8px_rgba(15,27,45,.24)] backdrop-blur-sm">
      <div className="mb-2 text-[11px] font-bold text-flood-ink">
        Reports · {timeLabel(ui.filters.time)}
      </div>
      <div
        className="h-2.5 w-[132px] rounded-[5px]"
        style={{
          background:
            "linear-gradient(90deg,#D7EDF9,#6FB4E6,#12539E,#07286A)",
        }}
      />
      <div className="mt-1 flex justify-between font-mono text-[9.5px] font-medium text-flood-ink-4">
        <span>1</span>
        <span>20+</span>
      </div>
    </div>
  );
}

export function ZoomControl() {
  const { zoomIn, zoomOut } = useFlood();
  return (
    <div className="absolute bottom-[104px] right-3.5 z-[12] flex flex-col overflow-hidden rounded-[10px] border border-flood-line bg-white shadow-[0_4px_12px_-5px_rgba(15,27,45,.22)]">
      <button
        type="button"
        aria-label="Zoom in"
        onClick={zoomIn}
        className="flex h-9 w-9 items-center justify-center border-b border-[#EDF1F5] text-[#4A5766] transition-colors hover:bg-flood-tint"
      >
        <Plus size={19} strokeWidth={2.4} />
      </button>
      <button
        type="button"
        aria-label="Zoom out"
        onClick={zoomOut}
        className="flex h-9 w-9 items-center justify-center text-[#4A5766] transition-colors hover:bg-flood-tint"
      >
        <Minus size={19} strokeWidth={2.4} />
      </button>
    </div>
  );
}
