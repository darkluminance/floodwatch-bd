"use client";

import { Check } from "lucide-react";
import { useFlood } from "@/lib/floodwatch/store";

export default function DoneSheet() {
  const { finishReport } = useFlood();
  return (
    <div className="fw-anim-fade absolute inset-0 z-30 flex items-end bg-[rgba(11,30,74,.42)]">
      <div className="fw-anim-sheet w-full rounded-t-[22px] bg-white px-[22px] pb-6 pt-[30px] text-center md:mx-4 md:mb-4 md:max-w-[380px] md:rounded-[22px]">
        <div className="mx-auto flex h-[62px] w-[62px] items-center justify-center rounded-full bg-flood-green-bg">
          <Check size={30} strokeWidth={2.6} className="text-flood-green" />
        </div>
        <div className="mt-4 text-[19px] font-extrabold text-flood-ink">
          Thanks — report added
        </div>
        <div className="mx-auto mt-1.5 max-w-[250px] text-[13px] font-medium leading-[1.5] text-flood-ink-3">
          Your pin is on the map now, marked{" "}
          <b className="text-flood-amber">unverified</b>. It&apos;s confirmed
          once a few neighbors agree.
        </div>
        <button
          type="button"
          onClick={finishReport}
          className="mt-5 w-full rounded-[14px] bg-flood-primary py-[15px] text-[15px] font-extrabold text-white"
        >
          Back to map
        </button>
      </div>
    </div>
  );
}
