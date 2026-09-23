import Link from "next/link";
import { LoginForm } from "@/components/console/LoginForm";
import { Logo, LogoMark } from "@/components/brand/Logo";

export const metadata = {
  title: "Sign in · FETS",
};

/**
 * Signing in.
 *
 * Two panels from the small screens up: the mark and what this is on the left,
 * the form on the right. On a phone the form comes first, because somebody
 * opening this at the door on their phone wants the password field, not the
 * poetry.
 *
 * The line about who can sign in is there deliberately. Everybody on staff has
 * the same access, and saying so on the way in saves the question being asked.
 */
export default function LoginPage() {
  return (
    <main className="relative min-h-dvh overflow-hidden shell-bg">
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <LogoMark
          size={620}
          className="absolute -bottom-[180px] -left-[170px] text-fg opacity-[0.05]"
        />
      </div>

      <div className="relative mx-auto flex min-h-dvh max-w-[920px] items-center px-[20px] py-[30px]">
        <div className="grid w-full items-center gap-[28px] md:grid-cols-[1fr_380px] md:gap-[44px]">
          {/* Second on a phone: the form is what somebody came for. */}
          <div className="order-2 md:order-1">
            <Logo size={44} subtitle={null} />

            <h1 className="mt-[22px] font-serif text-[32px] leading-[1.1] sm:text-[40px]">
              The console for
              <br />
              <span className="text-gold">FETS Calicut.</span>
            </h1>

            <p className="mt-[14px] max-w-[42ch] text-[14px] leading-[1.6] text-fg-muted">
              Forun Testing &amp; Educational Services — CELPIP, ACCA, CMA US, MRCS, MRCP, AWS
              and Microsoft certifications, delivered at Site 4960.
            </p>

            <p className="mt-[18px] max-w-[42ch] rounded-[14px] border border-edge bg-panel-soft/60 px-[13px] py-[11px] text-[12.5px] leading-[1.55] text-fg-muted">
              <span className="font-semibold text-fg">Everybody on staff has the same access.</span>{" "}
              Whoever is at the desk can run the day, change the setup, and sign a post over.
            </p>
          </div>

          <div className="order-1 rounded-[24px] border border-edge-mid panel-bg p-[22px] md:order-2 md:p-[26px]">
            <span className="block font-serif text-[23px] leading-none">Sign in</span>
            <span className="mt-[6px] block font-mono text-[10.5px] text-fg-dim">
              With the email your centre account uses
            </span>

            <LoginForm />

            <p className="mt-[16px] border-t border-edge-soft pt-[13px] font-mono text-[10.5px] leading-[1.6] text-fg-faint">
              Forgotten it, or no account yet? Ask Mithun or Niyas — they can set you up.
            </p>
          </div>
        </div>
      </div>

      <Link
        href="/"
        className="absolute top-[18px] left-[20px] font-mono text-[11px] text-fg-faint hover:text-fg-muted"
      >
        ← fets.online
      </Link>
    </main>
  );
}
