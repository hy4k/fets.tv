"use client";

import { useConsole } from "@/lib/console-data";

export function Toasts() {
  const { toasts } = useConsole();

  return (
    <div className="pointer-events-none fixed right-[18px] bottom-[18px] z-50 flex w-[min(360px,calc(100vw-36px))] flex-col gap-[8px]">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={`rounded-[14px] border px-[14px] py-[11px] text-[12.5px] font-semibold shadow-lg ${
            t.tone === "error"
              ? "border-rust/50 bg-[#241512] text-[#f7d9cf]"
              : "border-mint/45 bg-[#12211a] text-[#d6f5e6]"
          }`}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
