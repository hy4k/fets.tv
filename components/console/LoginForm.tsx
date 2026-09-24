"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

function Form() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(
    params.get("error") === "no-profile" ? "This account has no operator profile at any center." : null,
  );
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const { error } = await supabaseBrowser().auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }

    // The centre chosen at the front door. If the move is refused — say they
    // still hold a post at the other centre — they go in where they are and
    // the header shows which; signing in must not fail over it.
    const centre = params.get("centre");
    if (centre) {
      await supabaseBrowser().rpc("fets_switch_centre" as never, { p_center: centre } as never);
    }

    router.replace(params.get("next") ?? "/front-office");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="mt-[18px] flex flex-col gap-[10px]">
      <label className="flex flex-col gap-[6px]">
        <span className="text-[10px] font-bold tracking-[0.12em] text-fg-dim uppercase">Email</span>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-[14px] border border-edge-strong bg-panel-soft px-[13px] py-[12px] text-[14px] outline-none focus:border-accent/60"
        />
      </label>

      <label className="flex flex-col gap-[6px]">
        <span className="text-[10px] font-bold tracking-[0.12em] text-fg-dim uppercase">Password</span>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-[14px] border border-edge-strong bg-panel-soft px-[13px] py-[12px] text-[14px] outline-none focus:border-accent/60"
        />
      </label>

      {error && <p className="text-[12px] font-semibold text-rust">{error}</p>}

      <button
        type="submit"
        disabled={busy}
        className="mt-[6px] cursor-pointer rounded-[15px] gold-bg p-[14px] text-[14px] font-bold text-[#1a1512] disabled:opacity-60"
      >
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

export function LoginForm() {
  return (
    <Suspense fallback={null}>
      <Form />
    </Suspense>
  );
}
