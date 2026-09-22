"use client";

import { useEffect, useRef } from "react";

/**
 * A pop-up for the one decision in front of you: the locker key, a candidate's
 * details. It takes over the screen so nothing behind it can be clicked by
 * mistake, and on a phone it rises from the bottom where a thumb can reach it.
 */
export function Dialog({
  open,
  title,
  subtitle,
  onClose,
  children,
  footer,
  width = 520,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: number;
}) {
  const panel = useRef<HTMLDivElement>(null);

  // Escape closes it, and the page behind stops scrolling so a swipe does not
  // move the list underneath while the pop-up is up.
  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);

    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(8,6,5,0.72)] p-0 backdrop-blur-[3px] sm:items-center sm:p-[20px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        style={{ maxWidth: width }}
        className="flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[24px] border border-edge-mid panel-bg shadow-[0_24px_70px_rgba(0,0,0,0.55)] outline-none sm:rounded-[24px]"
      >
        <div className="flex shrink-0 items-start gap-[14px] border-b border-edge-soft px-[20px] py-[17px]">
          <span className="min-w-0 flex-1">
            <span className="block font-serif text-[21px] leading-[1.2]">{title}</span>
            {subtitle && <span className="mt-[3px] block text-[12.5px] text-fg-faint">{subtitle}</span>}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-[34px] w-[34px] shrink-0 cursor-pointer items-center justify-center rounded-[11px] border border-edge text-[17px] text-fg-muted hover:border-edge-warm hover:text-fg"
          >
            ×
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-[20px] py-[18px]">{children}</div>

        {footer && (
          <div className="flex shrink-0 flex-wrap gap-[10px] border-t border-edge-soft px-[20px] py-[15px]">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
