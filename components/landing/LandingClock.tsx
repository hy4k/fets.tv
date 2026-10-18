"use client";

import { useNow } from "@/lib/use-clock";

/**
 * The time and date, large, in the centre's zone rather than the visitor's —
 * somebody checking from Dubai wants to know what time it is in the hall.
 */
export function LandingClock({ timezone }: { timezone: string }) {
  const now = useNow();
  const at = new Date(now);

  // "4:05" large, with the seconds and AM/PM beside it.
  const parts =
    now === 0
      ? []
      : new Intl.DateTimeFormat("en-US", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
          timeZone: timezone,
        }).formatToParts(at);
  const time =
    now === 0
      ? "--:--"
      : parts
          .filter((p) => p.type !== "dayPeriod")
          .map((p) => p.value)
          .join("")
          .trim();
  const period = parts.find((p) => p.type === "dayPeriod")?.value ?? "";
  const seconds =
    now === 0
      ? "--"
      : new Intl.DateTimeFormat("en-GB", { second: "2-digit", timeZone: timezone })
          .format(at)
          .padStart(2, "0");
  const date =
    now === 0
      ? " "
      : new Intl.DateTimeFormat("en-GB", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
          timeZone: timezone,
        }).format(at);

  return (
    <div className="text-center" suppressHydrationWarning>
      <div className="flex items-baseline justify-center gap-[10px] font-mono tabular-nums">
        <span className="text-[64px] leading-none font-semibold tracking-[-0.02em] sm:text-[92px]">
          {time}
        </span>
        <span className="text-[22px] text-fg-faint sm:text-[28px]">
          {seconds} {period}
        </span>
      </div>
      <div className="mt-[10px] font-serif text-[19px] text-gold sm:text-[23px]">{date}</div>
    </div>
  );
}
