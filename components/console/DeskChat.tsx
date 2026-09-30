"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useConsole } from "@/lib/console-data";
import { clockAt, fullName, instantFromZonedTime, todayInZone } from "@/lib/format";
import { locate } from "@/lib/nav";
import { supabaseBrowser } from "@/lib/supabase/client";

type Desk = "front" | "admin" | "lab" | "office";
type Message = {
  id: string;
  center_id: string;
  from_desk: Desk;
  to_desk: Desk | "all";
  body: string;
  candidate_id: string | null;
  author_id: string | null;
  created_at: string;
  seen_at: string | null;
};

const DESK: Record<Desk, { label: string; tone: string }> = {
  front: { label: "Front office", tone: "oklch(0.82 0.12 190)" },
  admin: { label: "Admin room", tone: "oklch(0.8 0.11 275)" },
  lab: { label: "Lab", tone: "oklch(0.83 0.16 158)" },
  office: { label: "Office", tone: "oklch(0.86 0.1 80)" },
};

/** The things the two rooms say to each other all day, one tap each. */
const QUICK: Record<Desk, string[]> = {
  front: ["Next candidate on the way", "Checked in — ready for you", "Hold please, ID issue at the desk", "Late arrival — can we admit?"],
  admin: ["Send the next candidate", "Hold — the lab is full", "Ready for the next one", "Please come to the admin room"],
  lab: ["A seat is free", "Candidate finished — coming out", "Need help in the lab"],
  office: ["Please call the office", "Check the roster for a change"],
};

const REMEMBER = "fets.desk";
const QUIET = "fets.desk.quiet";

/**
 * A quiet line between the rooms.
 *
 * The front office and the admin room are apart, and the day runs on small
 * messages between them. This keeps them in one place: which desk said what
 * to whom, about which candidate, and whether the other room has seen it. It
 * lives in the corner of every page so nobody has to leave their screen to
 * answer, and it rings softly when a message arrives for your desk.
 */
export function DeskChat() {
  const pathname = usePathname();
  const { center, candidates, names, profile, notify } = useConsole();
  const tz = center.timezone;
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [chosen, setChosen] = useState<Desk | null>(null);
  const [quiet, setQuiet] = useState(false);
  const [to, setTo] = useState<Desk | "all" | null>(null);
  const [text, setText] = useState("");
  const [candidateId, setCandidateId] = useState("");
  const [sending, setSending] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const heard = useRef<Set<string>>(new Set());
  // Whether the day's messages have been read once; only later arrivals chime.
  const loaded = useRef(false);
  const may = profile.role !== "viewer";

  // The desk you are at: what you chose, else what the page says.
  const here = locate(pathname);
  const place = here.place?.key;
  const fromPage: Desk =
    place === "hall" ? "admin" : place === "office" || place === "duty" ? "office" : "front";
  const desk = chosen ?? fromPage;
  const target = to ?? (desk === "front" ? "admin" : "front");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(REMEMBER) as Desk | null;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved && saved in DESK) setChosen(saved);
      setQuiet(localStorage.getItem(QUIET) === "1");
    } catch {}
  }, []);

  const load = useCallback(async () => {
    const since = instantFromZonedTime("00:00", tz).toISOString();
    const { data, error } = await supabaseBrowser()
      .from("desk_messages" as never)
      .select("*")
      .eq("center_id", center.id)
      .gte("created_at", since)
      // The newest 300, turned back into reading order: an old-first cap would
      // freeze a busy day's chat at its first 300 messages.
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) return;
    const rows = ((data ?? []) as unknown as Message[]).reverse();
    if (!loaded.current) for (const m of rows) heard.current.add(m.id);
    loaded.current = true;
    setMessages(rows);
  }, [center.id, tz]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    const channel = supabaseBrowser()
      .channel(`desk-chat-${center.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "desk_messages", filter: `center_id=eq.${center.id}` }, () => void load())
      .subscribe();
    // A console left open overnight starts the new day's chat at midnight,
    // not at the first message someone happens to send.
    let midnight: ReturnType<typeof setTimeout>;
    const atMidnight = () => {
      // Tomorrow's date at the centre, then its midnight: a calendar day, not
      // 24 hours, so a clock change cannot skip or repeat it.
      const [y, m, d] = todayInZone(tz).split("-").map(Number);
      const tomorrow = new Date(Date.UTC(y, m - 1, d + 1, 12));
      const next = instantFromZonedTime("00:00", tz, tomorrow).getTime();
      midnight = setTimeout(() => {
        void load();
        atMidnight();
      }, Math.max(1000, next - Date.now() + 1000));
    };
    atMidnight();
    return () => {
      clearTimeout(midnight);
      void supabaseBrowser().removeChannel(channel);
    };
  }, [center.id, load, tz]);

  const forMe = useCallback((m: Message) => m.from_desk !== desk && (m.to_desk === desk || m.to_desk === "all"), [desk]);
  const unread = messages.filter((m) => forMe(m) && !m.seen_at);

  // A soft chime for a new message to this desk, once each.
  useEffect(() => {
    const fresh = unread.filter((m) => !heard.current.has(m.id));
    for (const m of messages) heard.current.add(m.id);
    if (fresh.length === 0 || quiet) return;
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.5);
    } catch {}
  }, [messages, unread, quiet]);

  // Reading the panel is seeing the messages.
  useEffect(() => {
    if (!open || !may || unread.length === 0) return;
    const t = setTimeout(() => {
      // Only what this panel has shown is marked seen.
      void supabaseBrowser().rpc(
        "fets_desk_seen" as never,
        { p_center: center.id, p_desk: desk, p_ids: unread.map((m) => m.id) } as never,
      );
    }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, unread.length, may, center.id, desk]);

  useEffect(() => {
    if (open) list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [open, messages.length]);

  const byId = useMemo(() => new Map(candidates.map((c) => [c.id, c])), [candidates]);

  async function send(body: string) {
    const clean = body.trim();
    if (!clean || sending) return;
    setSending(true);
    const { error } = await supabaseBrowser().rpc("fets_desk_send" as never, {
      p_center: center.id,
      p_from: desk,
      p_to: target,
      p_body: clean,
      p_candidate: candidateId || null,
    } as never);
    setSending(false);
    if (error) return notify(error.message, "error");
    setText("");
    setCandidateId("");
    void load();
  }

  function pickDesk(d: Desk) {
    setChosen(d);
    setTo(null);
    try {
      localStorage.setItem(REMEMBER, d);
    } catch {}
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`Desk chat${unread.length ? `, ${unread.length} new` : ""}`}
        className="fixed right-[14px] bottom-[14px] z-40 flex cursor-pointer items-center gap-[9px] rounded-full border border-edge-warm bg-panel-raised/95 py-[10px] pr-[16px] pl-[12px] text-[13px] font-semibold shadow-[0_18px_40px_-18px_rgba(0,0,0,0.9)] backdrop-blur-md hover:border-accent/50 md:right-[24px] md:bottom-[22px]"
      >
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] text-accent" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M4 5h16v11H9l-5 4z" />
        </svg>
        Desk chat
        {unread.length > 0 && (
          <span className="flex h-[20px] min-w-[20px] items-center justify-center rounded-full bg-rust px-[6px] font-mono text-[10.5px] font-bold text-[#141418]">
            {unread.length}
          </span>
        )}
      </button>

      {open && (
        <section
          aria-label="Desk chat"
          className="fixed inset-x-[8px] bottom-[72px] z-40 flex h-[min(620px,calc(100dvh-150px))] flex-col overflow-hidden rounded-[22px] border border-edge-strong panel-bg shadow-[0_30px_80px_-30px_rgba(0,0,0,0.95)] md:inset-x-auto md:right-[24px] md:bottom-[80px] md:w-[400px]"
        >
          <header className="flex flex-col gap-[10px] border-b border-edge-soft px-[16px] pt-[14px] pb-[12px]">
            <div className="flex items-center gap-[10px]">
              <span className="font-display text-[24px] leading-none">Desk chat</span>
              <span className="flex-1" />
              <button
                type="button"
                onClick={() => {
                  setQuiet((q) => {
                    try {
                      localStorage.setItem(QUIET, q ? "0" : "1");
                    } catch {}
                    return !q;
                  });
                }}
                className="cursor-pointer rounded-[9px] border border-edge px-[9px] py-[5px] font-mono text-[10.5px] text-fg-dim hover:text-fg"
              >
                {quiet ? "Sound off" : "Sound on"}
              </button>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="cursor-pointer px-[4px] text-[18px] text-fg-dim hover:text-fg">
                ×
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-[6px] text-[11.5px]">
              <span className="text-fg-faint">I&rsquo;m at</span>
              {(Object.keys(DESK) as Desk[]).map((d) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={d === desk}
                  onClick={() => pickDesk(d)}
                  style={{ "--t": DESK[d].tone } as React.CSSProperties}
                  className={`cursor-pointer rounded-full border px-[10px] py-[4px] font-semibold ${
                    d === desk ? "border-[var(--t)] bg-[color-mix(in_oklab,var(--t)_18%,transparent)] text-fg" : "border-edge text-fg-dim hover:text-fg"
                  }`}
                >
                  {DESK[d].label}
                </button>
              ))}
            </div>
          </header>

          <div ref={list} className="flex min-h-0 flex-1 flex-col gap-[10px] overflow-y-auto px-[14px] py-[14px]">
            {messages.length === 0 && (
              <p className="m-auto max-w-[260px] text-center text-[13px] leading-[1.5] text-fg-faint">
                Nothing yet today. Messages between the front office and the admin room appear here.
              </p>
            )}
            {messages.map((m) => {
              const mine = m.from_desk === desk;
              const c = m.candidate_id ? byId.get(m.candidate_id) : undefined;
              const tone = DESK[m.from_desk].tone;
              return (
                <div key={m.id} className={`flex flex-col gap-[3px] ${mine ? "items-end" : "items-start"}`}>
                  <span className="px-[4px] font-mono text-[10px] text-fg-faint">
                    <span style={{ color: tone }}>{DESK[m.from_desk].label}</span>
                    {" → "}
                    {m.to_desk === "all" ? "Everyone" : DESK[m.to_desk].label}
                    {m.author_id && names[m.author_id] ? ` · ${names[m.author_id].split(" ")[0]}` : ""}
                  </span>
                  <div
                    style={{ "--t": tone } as React.CSSProperties}
                    className={`max-w-[85%] rounded-[16px] border px-[13px] py-[9px] text-[13.5px] leading-[1.45] ${
                      mine
                        ? "rounded-br-[6px] border-[color-mix(in_oklab,var(--t)_45%,transparent)] bg-[color-mix(in_oklab,var(--t)_16%,transparent)]"
                        : "rounded-bl-[6px] border-edge bg-panel-soft"
                    }`}
                  >
                    {c && (
                      <span className="mb-[4px] block font-mono text-[11px] font-semibold" style={{ color: tone }}>
                        {c.public_token} · {fullName(c)}
                      </span>
                    )}
                    {m.body}
                  </div>
                  <span className="px-[4px] font-mono text-[10px] text-fg-faint">
                    {clockAt(m.created_at, tz)}
                    {mine && (m.seen_at ? ` · seen ${clockAt(m.seen_at, tz)}` : " · sent")}
                  </span>
                </div>
              );
            })}
          </div>

          {may ? (
            <footer className="flex flex-col gap-[8px] border-t border-edge-soft px-[12px] pt-[10px] pb-[12px]">
              <div className="flex flex-wrap gap-[6px]">
                {QUICK[desk].map((q) => (
                  <button
                    key={q}
                    type="button"
                    disabled={sending}
                    onClick={() => void send(q)}
                    className="cursor-pointer rounded-[10px] border border-edge bg-panel-soft px-[9px] py-[5px] text-[11.5px] text-fg-muted hover:border-accent/50 hover:text-fg disabled:opacity-50"
                  >
                    {q}
                  </button>
                ))}
              </div>
              <div className="flex gap-[6px]">
                <select
                  value={target}
                  onChange={(e) => setTo(e.target.value as Desk | "all")}
                  aria-label="Send to"
                  className="min-w-0 flex-1 rounded-[10px] border border-edge-strong bg-panel-soft px-[8px] py-[7px] text-[12px] outline-none focus:border-accent/50"
                >
                  {(Object.keys(DESK) as Desk[])
                    .filter((d) => d !== desk)
                    .map((d) => (
                      <option key={d} value={d}>
                        To {DESK[d].label}
                      </option>
                    ))}
                  <option value="all">To everyone</option>
                </select>
                <select
                  value={candidateId}
                  onChange={(e) => setCandidateId(e.target.value)}
                  aria-label="About a candidate"
                  className="min-w-0 flex-1 rounded-[10px] border border-edge-strong bg-panel-soft px-[8px] py-[7px] text-[12px] outline-none focus:border-accent/50"
                >
                  <option value="">No candidate</option>
                  {candidates
                    .filter((c) => !["signed_out", "no_show"].includes(c.status))
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.public_token} · {fullName(c)}
                      </option>
                    ))}
                </select>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void send(text);
                }}
                className="flex gap-[8px]"
              >
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  maxLength={500}
                  placeholder={`Message ${target === "all" ? "everyone" : DESK[target].label.toLowerCase()}…`}
                  aria-label="Message"
                  className="min-w-0 flex-1 rounded-[12px] border border-edge-strong bg-panel-soft px-[12px] py-[10px] text-[13.5px] outline-none focus:border-accent/50"
                />
                <button
                  type="submit"
                  disabled={sending || !text.trim()}
                  className="cursor-pointer rounded-[12px] gold-bg px-[16px] text-[13px] font-bold text-[#141418] disabled:opacity-40"
                >
                  Send
                </button>
              </form>
            </footer>
          ) : (
            <p className="border-t border-edge-soft px-[14px] py-[12px] text-[12px] text-fg-faint">Viewer accounts can read the chat but not send.</p>
          )}
        </section>
      )}
    </>
  );
}
