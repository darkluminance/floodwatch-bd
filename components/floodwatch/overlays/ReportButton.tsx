"use client";

import { Plus } from "lucide-react";
import { useFlood } from "@/lib/floodwatch/store";

export default function ReportButton() {
  const { openReport } = useFlood();
  return (
    <button
      type="button"
      onClick={openReport}
      className="absolute bottom-6 right-3.5 z-[16] flex items-center gap-2 rounded-2xl bg-flood-primary px-5 py-3.5 text-[14px] font-extrabold text-white shadow-[0_12px_26px_-8px_rgba(20,102,199,.62)] transition-transform active:scale-95"
    >
      <Plus size={19} strokeWidth={2.6} />
      Report flood
    </button>
  );
}
