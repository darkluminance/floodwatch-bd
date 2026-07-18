"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SheetProps {
  onClose: () => void;
  children: ReactNode;
  /** Tap-scrim-to-dismiss. */
  dismissible?: boolean;
  /** Show the mobile grab handle. */
  handle?: boolean;
  className?: string;
}

/**
 * Shared overlay shell. Renders a dimmed scrim plus a panel that is a
 * bottom sheet on mobile and a floating left-docked card on desktop (md+).
 */
export function Sheet({
  onClose,
  children,
  dismissible = true,
  handle = true,
  className,
}: SheetProps) {
  return (
    <div className="fw-anim-fade absolute inset-0 z-30">
      <div
        className="absolute inset-0 bg-[rgba(11,30,74,.4)]"
        onClick={dismissible ? onClose : undefined}
      />
      <div
        className={cn(
          "fw-anim-sheet absolute inset-x-0 bottom-0 z-[31] max-h-[92%] overflow-auto rounded-t-[22px] bg-white px-[18px] pb-6 pt-4 shadow-[0_-6px_30px_-8px_rgba(15,27,45,.3)]",
          "md:inset-x-auto md:bottom-4 md:left-4 md:top-auto md:w-[380px] md:max-h-[calc(100%-2rem)] md:rounded-[22px]",
          className,
        )}
      >
        {handle && (
          <div className="mx-auto mb-3.5 h-1 w-9 rounded-full bg-[#DDE3E9] md:hidden" />
        )}
        {children}
      </div>
    </div>
  );
}
