"use client";

import type { CallSound } from "@/lib/types";

/**
 * What the hall hears when a name goes up on the TV: a soft three-note chime,
 * then the name read out once. Made in the browser, so there is no sound file
 * to load and nothing to go missing.
 *
 * Browsers keep a page silent until somebody has touched it once. The TV page
 * asks for that touch (or a key on the remote) with a small prompt; a browser
 * started with autoplay allowed never needs it.
 */
type Ctor = typeof AudioContext;

let ctx: AudioContext | null = null;
let queue: Promise<void> = Promise.resolve();

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (ctx) return ctx;
  const C: Ctor | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext;
  if (!C) return null;
  try {
    ctx = new C();
  } catch {
    ctx = null;
  }
  return ctx;
}

/** True once the page may make a sound. */
export function soundReady() {
  const a = audio();
  return !!a && a.state === "running";
}

/** Call from a click or key press: opens the page's sound for the rest of the day. */
export async function unlockSound() {
  const a = audio();
  try {
    await a?.resume();
  } catch {}
  // A silent word primes speech, which some browsers also hold back until a touch.
  try {
    if ("speechSynthesis" in window) {
      const u = new SpeechSynthesisUtterance(" ");
      u.volume = 0;
      window.speechSynthesis.speak(u);
    }
  } catch {}
  return soundReady();
}

/** A soft rising chime: G, C, E with a long, gentle fade. About 1.6 seconds. */
function chime(): Promise<void> {
  const a = audio();
  if (!a || a.state !== "running") return Promise.resolve();
  const t0 = a.currentTime + 0.05;
  const master = a.createGain();
  master.gain.value = 0.32;
  master.connect(a.destination);
  ([
    [392.0, 0],
    [523.25, 0.32],
    [659.25, 0.64],
  ] as const).forEach(([freq, at]) => {
    // A sine with a quiet octave above it reads as a bell, not a beep.
    for (const [mult, level] of [[1, 1], [2, 0.18]] as const) {
      const osc = a.createOscillator();
      const g = a.createGain();
      osc.type = "sine";
      osc.frequency.value = freq * mult;
      g.gain.setValueAtTime(0, t0 + at);
      g.gain.linearRampToValueAtTime(level, t0 + at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 1.1);
      osc.connect(g).connect(master);
      osc.start(t0 + at);
      osc.stop(t0 + at + 1.15);
    }
  });
  return new Promise((done) => setTimeout(done, 1700));
}

/** An Indian English voice when the device has one; otherwise any English voice. */
function pickVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((v) => v.lang === "en-IN") ??
    voices.find((v) => v.lang === "en-GB") ??
    voices.find((v) => v.lang.startsWith("en")) ??
    null
  );
}

function say(text: string): Promise<void> {
  if (!("speechSynthesis" in window)) return Promise.resolve();
  return new Promise((done) => {
    try {
      const u = new SpeechSynthesisUtterance(text);
      const voice = pickVoice();
      if (voice) {
        u.voice = voice;
        u.lang = voice.lang;
      } else {
        u.lang = "en-IN";
      }
      u.rate = 0.88;
      u.pitch = 1;
      u.volume = 1;
      // Some browsers never fire onend; the timer keeps the queue moving.
      const guard = setTimeout(done, Math.max(4000, text.length * 120));
      u.onend = u.onerror = () => {
        clearTimeout(guard);
        done();
      };
      window.speechSynthesis.speak(u);
    } catch {
      done();
    }
  });
}

/**
 * Play the call once. Calls that arrive together are played one after the
 * other, never over each other.
 */
export function announceCall(mode: CallSound, text: string | null) {
  if (mode === "off") return;
  queue = queue.then(async () => {
    await chime();
    if (mode === "voice" && text) await say(text);
  });
}
