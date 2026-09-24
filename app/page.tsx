import Link from "next/link";
import { Logo, LogoMark } from "@/components/brand/Logo";
import { supabaseServer } from "@/lib/supabase/server";

export const metadata = {
  // The front door wants the plain name, not "FETS · Exam delivery · FETS", so
  // it opts out of the layout's template rather than feeding it.
  title: { absolute: "FETS · Exam delivery" },
  description:
    "The console that runs exam day at Forun Testing & Educational Services, Calicut.",
};

/**
 * The front door.
 *
 * This used to redirect straight to the front office, which is right for
 * somebody already halfway through a shift and wrong for everyone else: a
 * staff member on their first morning, somebody opening the link on a phone,
 * or Mithun showing the centre to a partner. So the address now has something
 * at it.
 *
 * It is not a marketing page. It says what this is, who it is for, and gets
 * out of the way — and because the session is read on the server, the one
 * button on it is already the right button before the page is painted.
 */
export default async function Home() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="relative min-h-dvh overflow-hidden shell-bg">
      {/* The hall behind everything: the same grid the mark is cut from, at a
          whisper, so the page has depth without an image to download. */}
      <HallBackdrop />

      <div className="relative mx-auto flex min-h-dvh max-w-[960px] flex-col px-[22px] py-[28px] sm:px-[32px]">
        <header className="flex shrink-0 flex-wrap items-center gap-[14px]">
          <Logo size={42} />
          <span className="min-w-[12px] flex-1" />
          <span className="hidden items-center gap-[8px] rounded-[12px] border border-edge-strong bg-panel-soft py-[7px] pr-[12px] pl-[10px] sm:flex">
            <span className="h-[7px] w-[7px] animate-pulse-dot rounded-full bg-mint" />
            <span className="font-mono text-[11px] font-semibold text-fg-muted">
              CALICUT · SITE 4960
            </span>
          </span>
        </header>

        <div className="flex flex-1 flex-col justify-center gap-[44px] py-[40px]">
          <div>
            <h1 className="max-w-[16ch] font-serif text-[40px] leading-[1.04] sm:text-[62px]">
              Every exam day, <span className="text-gold">accounted for.</span>
            </h1>

            <p className="mt-[18px] max-w-[54ch] text-[15px] leading-[1.6] text-fg-muted sm:text-[16.5px]">
              The console that runs the room at FETS Calicut — candidates from
              the door to the seat, the clock on every exam, the rota, the floor
              walk, and the record of what happened when something went wrong.
            </p>

            <div className="mt-[30px] flex flex-wrap items-center gap-[12px]">
              <Link
                href={user ? "/front-office" : "/login"}
                className="rounded-[15px] gold-bg px-[26px] py-[15px] text-[15px] font-bold text-[#1a1512]"
              >
                {user ? "Open the console" : "Sign in"}
              </Link>
              <span className="font-mono text-[11.5px] text-fg-faint">
                {user ? "You are already signed in" : "For centre staff"}
              </span>
            </div>
          </div>

          <section className="grid gap-[10px] sm:grid-cols-3">
            {[
              ["The room", "Check-in, seating, and every clock on one screen."],
              [
                "The rota",
                "Who holds which post, the ten-minute walk, the week ahead.",
              ],
              [
                "The record",
                "Incidents, materials, and a report written from what happened.",
              ],
            ].map(([title, line]) => (
              <div
                key={title}
                className="rounded-[16px] border border-edge bg-panel-soft/60 p-[14px]"
              >
                <span className="block font-mono text-[10px] font-bold tracking-[0.13em] text-gold uppercase">
                  {title}
                </span>
                <span className="mt-[6px] block text-[13px] leading-[1.5] text-fg-muted">
                  {line}
                </span>
              </div>
            ))}
          </section>
        </div>

        <footer className="mt-[26px] shrink-0 border-t border-edge-soft pt-[14px] font-mono text-[10.5px] text-fg-faint">
          Forun Testing &amp; Educational Services · Calicut, Kerala
        </footer>
      </div>
    </main>
  );
}

/**
 * The seating grid, very faint, bleeding off the top right.
 *
 * Decoration, so it is hidden from anybody listening to the page rather than
 * looking at it. Drawn once as an SVG pattern instead of shipped as an image.
 */
function HallBackdrop() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <LogoMark
        size={540}
        className="absolute -top-[70px] -right-[90px] text-fg opacity-[0.05]"
      />
      <div className="absolute inset-0 bg-[radial-gradient(900px_420px_at_18%_8%,oklch(0.32_0.06_82/0.35),transparent_66%)]" />
    </div>
  );
}
