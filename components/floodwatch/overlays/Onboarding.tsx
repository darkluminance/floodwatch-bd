"use client";

import { Droplets, Plus, ThumbsUp, Locate } from "lucide-react";
import { useFlood } from "@/lib/floodwatch/store";

const FEATURES = [
  { Icon: Droplets, text: "Blue shows flooding — the darker, the more reports." },
  { Icon: Plus, text: "Report by GPS or by tapping the map." },
  {
    Icon: ThumbsUp,
    text: "Confirm or dispute reports to keep the map accurate.",
  },
];

export default function Onboarding() {
  const { allowLocation, skipLocation } = useFlood();

  return (
    <div className="absolute inset-0 z-40 flex items-stretch md:items-center md:justify-center md:bg-flood-base md:p-6">
      <div
        className="flex w-full flex-col px-7 pb-8 pt-14 text-white md:h-auto md:max-w-[420px] md:rounded-[32px] md:px-8 md:py-12 md:shadow-[0_30px_80px_-24px_rgba(11,30,74,.6)]"
        style={{
          background:
            "linear-gradient(160deg,#0B3D91 0%,#1466C7 60%,#2E82D3 100%)",
        }}
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-[17px] bg-white/15 backdrop-blur-md">
          <Droplets size={30} className="text-flood-accent" />
        </div>

        <h1 className="mt-6 text-[30px] font-extrabold leading-[1.1] tracking-[-0.02em]">
          FloodWatch
          <br />
          BD
        </h1>
        <p className="mt-3.5 max-w-[250px] text-[15px] font-medium leading-[1.5] text-[#DCEAF8]">
          See flooded areas near you in real time — and report new ones in
          seconds.
        </p>

        <div className="mt-7 flex flex-col gap-3.5">
          {FEATURES.map(({ Icon, text }) => (
            <div key={text} className="flex items-start gap-3">
              <Icon
                size={20}
                strokeWidth={2.2}
                className="mt-0.5 shrink-0 text-flood-accent"
              />
              <span className="text-[13.5px] font-medium leading-[1.4] text-[#EAF3FC]">
                {text}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-9 flex flex-col gap-2.5 md:mt-10">
          <button
            type="button"
            onClick={allowLocation}
            className="flex items-center justify-center gap-2.5 rounded-[14px] bg-white px-4 py-[15px] text-[15px] font-extrabold text-flood-press"
          >
            <Locate size={18} strokeWidth={2.4} />
            Allow location &amp; continue
          </button>
          <button
            type="button"
            onClick={skipLocation}
            className="px-4 py-1.5 text-[13.5px] font-bold text-[#DCEAF8]"
          >
            Not now — I&apos;ll browse the map
          </button>
        </div>
      </div>
    </div>
  );
}
