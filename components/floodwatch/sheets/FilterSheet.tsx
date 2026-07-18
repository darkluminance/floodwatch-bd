"use client";

import { useFlood } from "@/lib/floodwatch/store";
import type { TimeRange } from "@/lib/floodwatch/types";
import { cn } from "@/lib/utils";
import { Sheet } from "./Sheet";

const TIMES: { value: TimeRange; label: string }[] = [
  { value: "6h", label: "Last 6h" },
  { value: "24h", label: "Last 24h" },
  { value: "3d", label: "3 days" },
];

export default function FilterSheet() {
  const { ui, setTime, toggleVerified, closeSheet } = useFlood();
  const { filters } = ui;

  return (
    <Sheet onClose={closeSheet}>
      <div className="text-[18px] font-extrabold text-flood-ink">Filters</div>

      <div className="mb-2 mt-4 text-[12.5px] font-bold text-flood-ink">
        Time range
      </div>
      <div className="flex gap-[7px]">
        {TIMES.map((t) => {
          const active = filters.time === t.value;
          return (
            <button
              key={t.value}
              type="button"
              onClick={() => setTime(t.value)}
              className={cn(
                "flex-1 rounded-[11px] border-[1.5px] py-[11px] text-[12.5px] font-bold transition-colors",
                active
                  ? "border-flood-primary bg-flood-tint text-flood-primary"
                  : "border-flood-line-2 bg-white text-flood-ink-2",
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="mt-5 flex items-center justify-between rounded-xl border border-[#EDF1F5] bg-flood-tint-2 p-3">
        <div>
          <div className="text-[13.5px] font-bold text-flood-ink">
            Verified only
          </div>
          <div className="text-[11.5px] font-medium text-flood-ink-4">
            Hide unconfirmed reports
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={filters.verified}
          onClick={toggleVerified}
          className="relative h-[27px] w-[46px] rounded-[14px] transition-colors"
          style={{ background: filters.verified ? "#1466C7" : "#CDD6DF" }}
        >
          <span
            className="absolute top-[3px] h-[21px] w-[21px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,.3)] transition-[left]"
            style={{ left: filters.verified ? "22px" : "3px" }}
          />
        </button>
      </div>

      <button
        type="button"
        onClick={closeSheet}
        className="mt-[18px] w-full rounded-[14px] bg-flood-primary py-[15px] text-[15px] font-extrabold text-white"
      >
        Show results
      </button>
    </Sheet>
  );
}
