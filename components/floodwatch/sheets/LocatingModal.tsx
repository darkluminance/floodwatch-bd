"use client";

export default function LocatingModal() {
  return (
    <div className="fw-anim-fade absolute inset-0 z-30 flex items-center justify-center bg-[rgba(11,30,74,.42)]">
      <div className="flex flex-col items-center gap-4 rounded-[18px] bg-white px-[30px] py-7 shadow-[0_20px_50px_-14px_rgba(11,30,74,.5)]">
        <div className="relative flex h-[50px] w-[50px] items-center justify-center">
          <div className="fw-anim-ping absolute h-[50px] w-[50px] rounded-full bg-flood-primary" />
          <div className="z-[1] h-4 w-4 rounded-full border-[3px] border-white bg-flood-primary shadow-[0_0_0_2px_#1466C7]" />
        </div>
        <div className="text-[14px] font-bold text-flood-ink">
          Finding your location…
        </div>
      </div>
    </div>
  );
}
