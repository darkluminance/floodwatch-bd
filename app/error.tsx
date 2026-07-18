"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[floodwatch] app error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[100dvh] w-full flex-col items-center justify-center gap-4 bg-flood-base px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-flood-press text-white">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="M12 21s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12Z" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <circle cx="12" cy="15.5" r="0.6" fill="currentColor" />
        </svg>
      </div>
      <div className="text-[18px] font-extrabold text-flood-ink">
        Something went wrong
      </div>
      <div className="max-w-[280px] text-[13px] font-medium leading-[1.5] text-flood-ink-3">
        The map hit an unexpected error. You can try again — your reports are
        saved on the server.
      </div>
      <button
        type="button"
        onClick={reset}
        className="mt-1 rounded-[14px] bg-flood-primary px-6 py-3 text-[14px] font-extrabold text-white"
      >
        Try again
      </button>
    </div>
  );
}
