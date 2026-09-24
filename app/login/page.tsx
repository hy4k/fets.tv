import Link from "next/link";
import { LogoMark } from "@/components/brand/Logo";
import { LoginForm } from "@/components/console/LoginForm";
import { centreLook, shortName } from "@/lib/centres";
import { frontDoorCentres } from "@/lib/landing-centres";

// The root layout appends " · FETS"; saying it here too gives it twice.
export const metadata = {
  title: "Sign in",
};

/**
 * Signing in, to the centre chosen at the front door.
 *
 * One card: the centre's mark in its own metal, its name, the form. The way
 * back to change centre is under it, so somebody at the Cochin desk who
 * landed on Calicut does not have to guess.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ centre?: string }>;
}) {
  const { centre: centreId } = await searchParams;
  const centres = await frontDoorCentres();
  const centre = centres.find((c) => c.id === centreId) ?? null;
  const look = centreLook(centre?.name);

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden shell-bg px-[16px] py-[40px]">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div
          className="absolute inset-0"
          style={{
            background: `radial-gradient(700px 420px at 50% -6%, color-mix(in oklab, ${look.tone[1]} 26%, transparent), transparent 70%)`,
          }}
        />
      </div>

      <div className="relative w-full max-w-[400px]">
        <div className="flex flex-col items-center gap-[12px] text-center">
          <LogoMark size={60} tone={look.tone} className="text-fg" />
          {centre ? (
            <>
              <span
                className="bg-clip-text font-serif text-[34px] leading-none text-transparent"
                style={{ backgroundImage: `linear-gradient(120deg, ${look.tone[0]}, ${look.tone[1]})` }}
              >
                {shortName(centre.name)}
              </span>
              <span className="font-mono text-[10.5px] tracking-[0.16em] text-fg-faint uppercase">
                FETS · Site {centre.site_code}
              </span>
            </>
          ) : (
            <span className="font-serif text-[32px] leading-none tracking-[0.06em]">FETS</span>
          )}
        </div>

        <div className="mt-[26px] rounded-[24px] border border-edge-mid panel-bg p-[22px] sm:p-[26px]">
          <span className="block font-serif text-[23px] leading-none">Sign in</span>
          <span className="mt-[6px] block font-mono text-[10.5px] text-fg-dim">
            With the email your staff account uses
          </span>
          <LoginForm />
        </div>

        <div className="mt-[18px] flex items-center justify-between font-mono text-[11px] text-fg-faint">
          <Link href="/" className="hover:text-fg-muted">
            ← {centre ? "Change centre" : "Choose a centre"}
          </Link>
          <span>Forgotten it? Ask Mithun or Niyas.</span>
        </div>
      </div>
    </main>
  );
}
