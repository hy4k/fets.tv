import Link from "next/link";
import { LogoMark } from "@/components/brand/Logo";
import { LandingClock } from "@/components/landing/LandingClock";
import { StayCurrent } from "@/components/landing/StayCurrent";
import { todaysSchedule, type ScheduleSlot } from "@/lib/landing-schedule";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata = {
  // The front door wants the plain name, not "FETS · Exam delivery · FETS", so
  // it opts out of the layout's template rather than feeding it.
  title: { absolute: "FETS · Exam delivery" },
  description: "Forun Testing & Educational Services, Calicut.",
};

const HALL_ZONE = "Asia/Kolkata";

/**
 * The front door: the mark, the time, today's exams, and the way in.
 *
 * Nothing else. It is the page left open on the desk screen in the morning, so
 * it answers the two questions asked at that desk — what time is it, and what
 * is on today — and offers the one action.
 */
export default async function Home() {
  const supabase = await supabaseServer();
  const [
    {
      data: { user },
    },
    schedule,
  ] = await Promise.all([supabase.auth.getUser(), todaysSchedule()]);

  const zone = schedule?.[0]?.timezone ?? HALL_ZONE;
  const showCentreNames = (schedule?.length ?? 0) > 1;

  return (
    <main className="relative min-h-dvh overflow-hidden shell-bg">
      <StayCurrent />
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(760px_420px_at_50%_0%,oklch(0.32_0.06_82/0.35),transparent_68%)]" />
      </div>

      <div className="relative mx-auto flex min-h-dvh max-w-[640px] flex-col items-center justify-center px-[16px] py-[36px] sm:py-[48px]">
        <LogoMark size={84} className="text-fg" />
        <span className="mt-[12px] font-serif text-[30px] leading-none tracking-[0.04em]">FETS</span>

        <div className="mt-[36px]">
          <LandingClock timezone={zone} />
        </div>

        <section className="mt-[36px] w-full" aria-label="Today's exams">
          <h2 className="mb-[10px] text-center font-mono text-[10.5px] font-bold tracking-[0.16em] text-fg-dim uppercase">
            Today&rsquo;s exams
          </h2>

          {schedule === null ? (
            <Empty>Today&rsquo;s schedule could not be read. Sign in to see it.</Empty>
          ) : schedule.length === 0 ? (
            <Empty>No exams scheduled today.</Empty>
          ) : (
            <div className="flex flex-col gap-[14px]">
              {schedule.map((day) => (
                <div key={day.centre}>
                  {showCentreNames && (
                    <span className="mb-[6px] block font-mono text-[10.5px] text-gold">
                      {day.centre}
                    </span>
                  )}
                  <ul className="overflow-hidden rounded-[18px] border border-edge bg-panel-soft/70">
                    {day.slots.map((slot) => (
                      <Slot key={slot.key} slot={slot} />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>

        <Link
          href={user ? "/front-office" : "/login"}
          className="mt-[32px] rounded-[15px] gold-bg px-[34px] py-[15px] text-[15px] font-bold text-[#1a1512]"
        >
          {user ? "Open the console" : "Sign in"}
        </Link>
      </div>
    </main>
  );
}

const STATE: Record<ScheduleSlot["state"], { label: string; dot: string }> = {
  upcoming: { label: "Upcoming", dot: "bg-fg-faint" },
  running: { label: "In progress", dot: "bg-mint animate-pulse-dot" },
  done: { label: "Done", dot: "bg-fg-dim" },
};

function Slot({ slot }: { slot: ScheduleSlot }) {
  const state = STATE[slot.state];
  return (
    <li className="flex items-center gap-[14px] border-b border-edge-soft px-[16px] py-[12px] last:border-b-0">
      <span className="w-[52px] shrink-0 font-mono text-[17px] font-semibold tabular-nums">
        {slot.time}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold">{slot.exam}</span>
        {slot.part && (
          <span className="block truncate font-mono text-[11px] text-fg-dim">{slot.part}</span>
        )}
      </span>
      <span className="shrink-0 text-right">
        <span className="block font-mono text-[13px] tabular-nums">
          {slot.seats} {slot.seats === 1 ? "seat" : "seats"}
        </span>
        <span className="mt-[2px] flex items-center justify-end gap-[6px] font-mono text-[10px] text-fg-dim">
          <span className={`h-[6px] w-[6px] rounded-full ${state.dot}`} />
          {state.label}
        </span>
      </span>
    </li>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-[18px] border border-edge bg-panel-soft/70 px-[16px] py-[18px] text-center text-[14px] text-fg-muted">
      {children}
    </p>
  );
}
