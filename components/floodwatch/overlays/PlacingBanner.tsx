"use client";

import { MapPin } from "lucide-react";
import { useFlood } from "@/lib/floodwatch/store";

export default function PlacingBanner() {
  const { closeSheet } = useFlood();
  return (
    <div className="fw-anim-fade absolute inset-x-0 top-0 z-[20] bg-flood-press px-4 pb-3.5 pt-[max(28px,env(safe-area-inset-top))] text-white shadow-[0_8px_22px_-10px_rgba(11,61,145,.6)]">
      <div className="mx-auto flex w-full max-w-[440px] items-center gap-2.5 md:mx-0">
        <MapPin size={20} strokeWidth={2.2} className="text-flood-accent" />
        <div>
          <div className="text-[14px] font-extrabold">Tap the flooded spot</div>
          <div className="text-[11.5px] font-medium text-[#AEC6EA]">
            Drop a pin where you see flooding
          </div>
        </div>
        <button
          type="button"
          onClick={closeSheet}
          className="ml-auto rounded-lg bg-white/15 px-2.5 py-[7px] text-[12px] font-bold text-white"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
