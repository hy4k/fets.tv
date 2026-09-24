import { LogoMark } from "@/components/brand/Logo";
import { CentreChooser } from "@/components/landing/CentreChooser";
import { LandingClock } from "@/components/landing/LandingClock";
import { frontDoorCentres } from "@/lib/landing-centres";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata = {
  // The front door wants the plain name, not "FETS · Exam delivery · FETS", so
  // it opts out of the layout's template rather than feeding it.
  title: { absolute: "FETS · Exam delivery" },
  description: "Forun Testing & Educational Services — Calicut and Cochin.",
};

/**
 * The front door: the mark, the time, which centre, and the way in.
 *
 * Nothing else on purpose. It is the first thing on the desk screen in the
 * morning, and the only question it has to settle before sign-in is where
 * you are working today.
 */
export default async function Home() {
  const supabase = await supabaseServer();
  const [
    {
      data: { user },
    },
    centres,
  ] = await Promise.all([supabase.auth.getUser(), frontDoorCentres()]);

  return (
    <main className="relative min-h-dvh overflow-hidden shell-bg">
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(820px_460px_at_50%_-8%,oklch(0.34_0.06_82/0.32),transparent_70%)]" />
        <div className="absolute inset-x-0 bottom-0 h-px bg-[linear-gradient(90deg,transparent,oklch(0.7_0.1_82/0.35),transparent)]" />
      </div>

      <div className="relative mx-auto flex min-h-dvh max-w-[600px] flex-col items-center justify-center gap-[40px] px-[16px] py-[40px]">
        <div className="flex flex-col items-center gap-[14px]">
          <LogoMark size={76} className="text-fg" />
          <span className="font-serif text-[32px] leading-none tracking-[0.06em]">FETS</span>
        </div>

        <LandingClock timezone={centres[0]?.timezone ?? "Asia/Kolkata"} />

        <CentreChooser centres={centres} signedIn={!!user} />

        <span className="font-mono text-[10px] tracking-[0.16em] text-fg-faint uppercase">
          Forun Testing &amp; Educational Services
        </span>
      </div>
    </main>
  );
}
