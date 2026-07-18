"use client";

import { ChevronRight, Locate, MapPin } from "lucide-react";
import { useFlood } from "@/lib/floodwatch/store";
import { Sheet } from "./Sheet";

export default function ReportModeSheet() {
  const { chooseAuto, chooseManual, closeSheet } = useFlood();

  return (
    <Sheet onClose={closeSheet}>
      <div className="text-[18px] font-extrabold text-flood-ink">
        Report a flood
      </div>
      <div className="mt-[3px] text-[13px] font-medium text-flood-ink-3">
        How do you want to set the location?
      </div>

      <div className="mt-4 flex flex-col gap-[11px]">
        <button
          type="button"
          onClick={chooseAuto}
          className="flex items-center gap-3.5 rounded-[14px] border-[1.5px] border-flood-line-accent bg-flood-tint p-[15px] text-left"
        >
          <div className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[11px] bg-flood-primary">
            <Locate size={21} strokeWidth={2.2} className="text-white" />
          </div>
          <div className="flex-1">
            <div className="text-[14.5px] font-extrabold text-flood-ink">
              Use my location
            </div>
            <div className="text-[12px] font-medium text-flood-ink-3">
              Auto — fastest, uses GPS
            </div>
          </div>
          <ChevronRight
            size={18}
            strokeWidth={2.4}
            className="text-flood-primary"
          />
        </button>

        <button
          type="button"
          onClick={chooseManual}
          className="flex items-center gap-3.5 rounded-[14px] border-[1.5px] border-flood-line-2 bg-white p-[15px] text-left"
        >
          <div className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[11px] bg-flood-press">
            <MapPin size={21} strokeWidth={2.2} className="text-white" />
          </div>
          <div className="flex-1">
            <div className="text-[14.5px] font-extrabold text-flood-ink">
              Pick on the map
            </div>
            <div className="text-[12px] font-medium text-flood-ink-3">
              Manual — tap the flooded spot
            </div>
          </div>
          <ChevronRight
            size={18}
            strokeWidth={2.4}
            className="text-flood-ink-3"
          />
        </button>
      </div>
    </Sheet>
  );
}
