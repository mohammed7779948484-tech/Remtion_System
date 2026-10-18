// Speech data shared by the voice generator (Node) and the renderer (browser). Pure.
//
// Mouth animation here is AMPLITUDE-DRIVEN stylized mouthing: an RMS envelope of the voice clip
// opens the mouth. It is not phoneme lip-sync (no visemes); a phoneme track (e.g. from Rhubarb)
// would be the upgrade path, consumed the same way through an actor's `life` signals.
import type { Caption } from "@remotion/captions";

export type Word = { text: string; start: number; end: number };
export type Envelope = { rate: number; values: number[] };

export type VoiceLine = {
  /** Path relative to public/. */
  file: string;
  hash: string;
  provider: "elevenlabs" | "system" | "fixture";
  text: string;
  duration: number;
  words: Word[];
  envelope: Envelope;
};
export type VoiceManifest = { version: 1; lines: Record<string, VoiceLine> };

/** FNV-1a 32-bit — tiny, identical in Node and the browser. */
export const hashString = (s: string) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
};

export const lineHash = (text: string, voice: unknown, provider: string) => hashString(`${provider}|${text}|${JSON.stringify(voice ?? {})}`);

/** Split text into display words (keeps punctuation attached). */
export const splitWords = (text: string) => text.split(/\s+/).filter(Boolean);

/** Rough timing for lines that have no generated audio yet. */
export const estimateWords = (text: string): { duration: number; words: Word[] } => {
  const words = splitWords(text);
  const per = 0.36;
  let t = 0.05;
  const out = words.map((w) => {
    const d = per * Math.min(2, Math.max(0.6, w.length / 5));
    const word = { text: w, start: t, end: t + d * 0.9 };
    t += d;
    return word;
  });
  return { duration: t + 0.25, words: out };
};

/** RMS envelope (0..1, peak-normalised) at `rate` Hz from mono PCM samples in [-1,1]. */
export const envelopeFromSamples = (samples: Float32Array, sampleRate: number, rate = 60): Envelope => {
  const hop = sampleRate / rate;
  const n = Math.ceil(samples.length / hop);
  const values: number[] = [];
  let peak = 1e-6;
  for (let i = 0; i < n; i++) {
    const a = Math.floor(i * hop);
    const b = Math.min(samples.length, Math.floor((i + 1) * hop));
    let s = 0;
    for (let j = a; j < b; j++) s += samples[j] * samples[j];
    const rms = Math.sqrt(s / Math.max(1, b - a));
    values.push(rms);
    peak = Math.max(peak, rms);
  }
  // Normalise, gate the noise floor, light 3-tap smoothing; keep 3 decimals to stay compact.
  const norm = values.map((v) => Math.max(0, (v / peak - 0.06) / 0.94));
  return {
    rate,
    values: norm.map((v, i) => Math.round(((norm[i - 1] ?? v) * 0.25 + v * 0.5 + (norm[i + 1] ?? v) * 0.25) * 1000) / 1000),
  };
};

export const sampleEnvelope = (env: Envelope, localT: number) => {
  const x = localT * env.rate;
  const i = Math.floor(x);
  if (i < 0 || i >= env.values.length) return 0;
  const a = env.values[i];
  const b = env.values[i + 1] ?? 0;
  return a + (b - a) * (x - i);
};

/** Envelope synthesised from word timings, for lines without audio (keeps mouths moving in preview). */
export const envelopeFromWords = (words: Word[], duration: number, rate = 60): Envelope => {
  const values: number[] = [];
  for (let i = 0; i < Math.ceil(duration * rate); i++) {
    const t = i / rate;
    const w = words.find((x) => t >= x.start && t <= x.end);
    values.push(w ? Math.round(Math.sin(((t - w.start) / Math.max(0.05, w.end - w.start)) * Math.PI) * 800) / 1000 : 0);
  }
  return { rate, values };
};

/** Absolute-time captions (Remotion `Caption` format) for one line. */
export const lineCaptions = (words: Word[], lineStart: number): Caption[] =>
  words.map((w, i) => ({
    text: (i === 0 ? "" : " ") + w.text,
    startMs: Math.round((lineStart + w.start) * 1000),
    endMs: Math.round((lineStart + w.end) * 1000),
    timestampMs: Math.round((lineStart + (w.start + w.end) / 2) * 1000),
    confidence: null,
  }));

/** Character-level alignment (ElevenLabs `alignment`) → words. */
export const wordsFromAlignment = (a: { characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[] }): Word[] => {
  const words: Word[] = [];
  let cur: Word | null = null;
  a.characters.forEach((ch, i) => {
    if (/\s/.test(ch)) {
      if (cur) words.push(cur);
      cur = null;
      return;
    }
    if (!cur) cur = { text: "", start: a.character_start_times_seconds[i], end: a.character_end_times_seconds[i] };
    cur.text += ch;
    cur.end = a.character_end_times_seconds[i];
  });
  if (cur) words.push(cur);
  return words;
};

/** Curated short sound effects hosted by Remotion (see the Remotion sfx skill). */
export const SFX_LIBRARY: Record<string, string> = Object.fromEntries(
  [
    "whoosh", "whip", "page-turn", "switch", "mouse-click", "shutter-modern", "shutter-old", "ding", "bruh", "vine-boom",
    "windows-xp-error", "fah", "spongebob-fail", "omg-hell-nah", "price-is-right-fail", "romance-meme", "bone-crack",
    "anime-wow", "yippee", "loading-lag", "wilhelm-scream", "mac-quack", "skedaddle", "snapchat-notification",
    "nelly-ahh", "sanctuary-guardian-what", "minecraft-hurt", "oh-my-god-vine", "illuminati-confirmed",
    "dramatic-boomer", "triggered", "record-scratch",
  ].map((n) => [n, `https://remotion.media/${n}.wav`]),
);
