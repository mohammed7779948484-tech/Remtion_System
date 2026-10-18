// Generates (or refreshes) the cached dialogue audio for a video:
//   public/videos/<slug>/voice/<line>-<hash>.wav  +  public/videos/<slug>/voice.json
// Providers: "elevenlabs" (API, needs ELEVENLABS_API_KEY), "system" (offline Windows voices),
// "fixture" (deterministic synthetic babble; any OS; used by tests). Unchanged lines are skipped.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseEpisode, type Episode, type EpisodeVoice } from "../src/engine/core/schema";
import { envelopeFromSamples, hashString, lineHash, splitWords, wordsFromAlignment, type VoiceLine, type VoiceManifest, type Word } from "../src/engine/audio/speech";

export type Provider = "elevenlabs" | "system" | "fixture";

// ---------------------------------------------------------------- WAV helpers

export const readWav = (buf: Buffer): { sampleRate: number; samples: Float32Array } => {
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") throw new Error("not a WAV file");
  let off = 12;
  let fmt: { channels: number; sampleRate: number; bits: number; format: number } | null = null;
  while (off + 8 <= buf.length) {
    const id = buf.toString("ascii", off, off + 4);
    let size = buf.readUInt32LE(off + 4);
    if (id === "fmt ") fmt = { format: buf.readUInt16LE(off + 8), channels: buf.readUInt16LE(off + 10), sampleRate: buf.readUInt32LE(off + 12), bits: buf.readUInt16LE(off + 22) };
    if (id === "data") {
      if (!fmt) throw new Error("WAV data before fmt chunk");
      if (size === 0xffffffff || off + 8 + size > buf.length) size = buf.length - off - 8; // streamed WAVs
      const data = buf.subarray(off + 8, off + 8 + size);
      const bytes = fmt.bits / 8;
      const frames = Math.floor(data.length / (bytes * fmt.channels));
      const samples = new Float32Array(frames);
      for (let i = 0; i < frames; i++) {
        let acc = 0;
        for (let c = 0; c < fmt.channels; c++) {
          const p = (i * fmt.channels + c) * bytes;
          acc += fmt.bits === 16 ? data.readInt16LE(p) / 32768 : fmt.format === 3 ? data.readFloatLE(p) : (data[p] - 128) / 128;
        }
        samples[i] = acc / fmt.channels;
      }
      return { sampleRate: fmt.sampleRate, samples };
    }
    off += 8 + size + (size % 2);
  }
  throw new Error("WAV has no data chunk");
};

export const writeWav = (samples: Float32Array, sampleRate: number): Buffer => {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), i * 2);
  const h = Buffer.alloc(44);
  h.write("RIFF", 0, "ascii");
  h.writeUInt32LE(36 + data.length, 4);
  h.write("WAVEfmt ", 8, "ascii");
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(sampleRate, 24);
  h.writeUInt32LE(sampleRate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36, "ascii");
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
};

/** Raw PCM16 (as returned by some APIs) → WAV. */
const pcmToWav = (pcm: Buffer, sampleRate: number) => {
  const samples = new Float32Array(Math.floor(pcm.length / 2));
  for (let i = 0; i < samples.length; i++) samples[i] = pcm.readInt16LE(i * 2) / 32768;
  return writeWav(samples, sampleRate);
};

// ---------------------------------------------------------------- providers

type Clip = { wav: Buffer; words: Word[] };
type LineJob = { id: string; text: string; voice: EpisodeVoice | undefined; speakerIndex: number; previous?: string; next?: string };

/** Premade ElevenLabs voices used when a cast member has no voiceId (override per cast `voice.elevenlabs.voiceId`). */
export const DEFAULT_ELEVEN_VOICES = ["JBFqnCBsd6RMkjVDRZzb", "EXAVITQu4vr4xnSDxMaL", "pNInz6obpgDQGcFmaJgB", "XB0fDUnXU5powFXDhCwa"];
const DEFAULT_SYSTEM_VOICES = ["Microsoft David Desktop", "Microsoft Zira Desktop", "Microsoft Mark"];

export const elevenLabsRequest = (job: LineJob, apiKey: string) => {
  const voiceId = job.voice?.elevenlabs?.voiceId ?? DEFAULT_ELEVEN_VOICES[job.speakerIndex % DEFAULT_ELEVEN_VOICES.length];
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps?output_format=wav_24000`;
  const body = {
    text: job.text,
    model_id: job.voice?.elevenlabs?.model ?? "eleven_multilingual_v2",
    voice_settings: { stability: 0.45, similarity_boost: 0.75, style: 0.3, ...(job.voice?.elevenlabs?.settings ?? {}) },
    seed: parseInt(hashString(job.text).slice(0, 7), 16),
    previous_text: job.previous,
    next_text: job.next,
  };
  return { url, init: { method: "POST", headers: { "xi-api-key": apiKey, "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body) } };
};

export const elevenLabsClip = async (job: LineJob, apiKey: string, fetchImpl: typeof fetch = fetch): Promise<Clip> => {
  const { url, init } = elevenLabsRequest(job, apiKey);
  const res = await fetchImpl(url, init);
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as { audio_base64: string; alignment?: Parameters<typeof wordsFromAlignment>[0] | null; normalized_alignment?: Parameters<typeof wordsFromAlignment>[0] | null };
  const raw = Buffer.from(json.audio_base64, "base64");
  const wav = raw.toString("ascii", 0, 4) === "RIFF" ? raw : pcmToWav(raw, 24000);
  const alignment = json.alignment ?? json.normalized_alignment;
  return { wav, words: alignment ? wordsFromAlignment(alignment) : [] };
};

export const elevenLabsSfx = async (prompt: string, apiKey: string, fetchImpl: typeof fetch = fetch): Promise<Buffer> => {
  const res = await fetchImpl("https://api.elevenlabs.io/v1/sound-generation", {
    method: "POST",
    headers: { "xi-api-key": apiKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({ text: prompt, prompt_influence: 0.4 }),
  });
  if (!res.ok) throw new Error(`ElevenLabs SFX ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return Buffer.from(await res.arrayBuffer());
};

const SAPI_SCRIPT = `
param([string]$JobFile)
$job = Get-Content -Raw -Encoding UTF8 $JobFile | ConvertFrom-Json
Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$s.SelectVoice($job.voice)
$fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
$s.SetOutputToWaveFile($job.out, $fmt)
$words = New-Object System.Collections.ArrayList
$s.add_SpeakProgress({ param($sender, $e) [void]$words.Add(@{ text = $e.Text; ms = $e.AudioPosition.TotalMilliseconds }) })
$s.SpeakSsml($job.ssml)
$s.SetOutputToNull()
$s.Dispose()
ConvertTo-Json -Compress -InputObject @($words)
`;

const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const systemClip = (job: LineJob, tmpDir: string): Clip => {
  if (process.platform !== "win32") throw new Error("system voices need Windows (use --provider fixture or elevenlabs)");
  const voice = job.voice?.system ?? DEFAULT_SYSTEM_VOICES[job.speakerIndex % DEFAULT_SYSTEM_VOICES.length];
  const rate = job.voice?.rate ?? 0;
  const prosody = `<prosody rate="${rate >= 0 ? "+" : ""}${rate * 6}%"${job.voice?.pitch ? ` pitch="${xml(job.voice.pitch)}"` : ""}>${xml(job.text)}</prosody>`;
  const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">${prosody}</speak>`;
  const out = path.join(tmpDir, `sapi-${hashString(job.id + job.text)}.wav`);
  const scriptFile = path.join(tmpDir, "sapi.ps1");
  const jobFile = path.join(tmpDir, `job-${job.id}.json`);
  fs.writeFileSync(scriptFile, SAPI_SCRIPT);
  fs.writeFileSync(jobFile, JSON.stringify({ voice, ssml, out }));
  const stdout = execFileSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptFile, "-JobFile", jobFile], { encoding: "utf8" });
  const wav = fs.readFileSync(out);
  const { samples, sampleRate } = readWav(wav);
  // SAPI reports AudioPosition assuming 16 kHz; we render at 16 kHz so it maps 1:1.
  const starts = (JSON.parse(stdout.trim() || "[]") as { text: string; ms: number }[]).map((w) => ({ text: w.text, start: (w.ms / 1000) * (16000 / sampleRate) }));
  return { wav, words: endsFromEnergy(starts, samples, sampleRate, splitWords(job.text)) };
};

/** Word end = where speech energy drops before the next word (or the clip end). Uses the script's words for display text. */
const endsFromEnergy = (starts: { text: string; start: number }[], samples: Float32Array, sampleRate: number, display: string[]): Word[] => {
  const env = envelopeFromSamples(samples, sampleRate, 100);
  const duration = samples.length / sampleRate;
  const lastLoud = (() => {
    for (let i = env.values.length - 1; i >= 0; i--) if (env.values[i] > 0.05) return i / 100;
    return duration;
  })();
  return starts.map((w, i) => {
    const next = starts[i + 1]?.start ?? lastLoud + 0.05;
    let end = next - 0.02;
    for (let t = next - 0.02; t > w.start + 0.08; t -= 0.01) {
      if ((env.values[Math.round(t * 100)] ?? 0) > 0.08) {
        end = Math.min(next - 0.02, t + 0.04);
        break;
      }
    }
    return { text: display[i] ?? w.text, start: w.start, end: Math.max(w.start + 0.06, end) };
  });
};

/** Deterministic babble: syllable bursts with a speaker-specific pitch. Any OS, no network. */
export const fixtureClip = (job: LineJob): Clip => {
  const sr = 16000;
  const words = splitWords(job.text);
  const f0 = 105 + (job.speakerIndex % 3) * 55;
  const chunks: number[] = [];
  const out: Word[] = [];
  let t = 0.08;
  const pushSilence = (sec: number) => {
    for (let i = 0; i < Math.round(sec * sr); i++) chunks.push(0);
  };
  pushSilence(0.08);
  words.forEach((w, wi) => {
    const start = t;
    const syllables = Math.max(1, Math.round(w.replace(/[^a-z]/gi, "").length / 3));
    for (let s = 0; s < syllables; s++) {
      const len = 0.11 + (parseInt(hashString(`${job.text}|${wi}|${s}`).slice(0, 2), 16) / 255) * 0.08;
      const n = Math.round(len * sr);
      const pitch = f0 * (1 + 0.12 * Math.sin(wi * 1.7 + s));
      for (let i = 0; i < n; i++) {
        const x = i / sr;
        const amp = Math.sin((i / n) * Math.PI) ** 0.7 * 0.35;
        chunks.push(amp * (Math.sin(2 * Math.PI * pitch * x) * 0.6 + Math.sin(2 * Math.PI * pitch * 2.02 * x) * 0.25 + Math.sin(2 * Math.PI * pitch * 3.1 * x) * 0.15));
      }
      t += len;
    }
    out.push({ text: w, start, end: t });
    const gap = /[.!?]$/.test(w) ? 0.28 : /[,;:]$/.test(w) ? 0.16 : 0.06;
    pushSilence(gap);
    t += gap;
  });
  pushSilence(0.12);
  return { wav: writeWav(Float32Array.from(chunks), sr), words: out };
};

// ---------------------------------------------------------------- orchestration

export type VoiceOptions = {
  provider?: Provider;
  force?: boolean;
  /** Repo root (tests point this at a temp copy). */
  root?: string;
  fetchImpl?: typeof fetch;
  apiKey?: string;
  log?: (msg: string) => void;
};

export const pickProvider = (opts: VoiceOptions): Provider =>
  opts.provider ?? (opts.apiKey ?? process.env.ELEVENLABS_API_KEY ? "elevenlabs" : process.platform === "win32" ? "system" : "fixture");

export const loadEpisodeFile = (root: string, slug: string): Episode => {
  const file = path.join(root, "videos", slug, "episode.json");
  if (!fs.existsSync(file)) throw new Error(`No episode at ${file}`);
  return parseEpisode(JSON.parse(fs.readFileSync(file, "utf8")));
};

export const voiceDir = (root: string, slug: string) => path.join(root, "public", "videos", slug);

export const readManifest = (root: string, slug: string): VoiceManifest | null => {
  const file = path.join(voiceDir(root, slug), "voice.json");
  return fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf8")) as VoiceManifest) : null;
};

export const generateVoices = async (slug: string, opts: VoiceOptions = {}) => {
  const root = opts.root ?? process.cwd();
  const log = opts.log ?? console.log;
  const ep = loadEpisodeFile(root, slug);
  const provider = pickProvider(opts);
  const apiKey = opts.apiKey ?? process.env.ELEVENLABS_API_KEY ?? "";
  if (provider === "elevenlabs" && !apiKey) throw new Error("ELEVENLABS_API_KEY is not set (put it in .env)");
  const dir = voiceDir(root, slug);
  fs.mkdirSync(path.join(dir, "voice"), { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "voice-"));
  const old = readManifest(root, slug);
  const manifest: VoiceManifest = { version: 1, lines: {} };
  const speakers = Object.keys(ep.cast);
  let generated = 0;
  let skipped = 0;

  for (let i = 0; i < ep.dialogue.length; i++) {
    const line = ep.dialogue[i];
    const voice = ep.cast[line.speaker]?.voice;
    const hash = lineHash(line.text, voice, provider);
    const prev = old?.lines[line.id];
    if (!opts.force && prev && prev.hash === hash && fs.existsSync(path.join(root, "public", prev.file))) {
      manifest.lines[line.id] = prev;
      skipped++;
      continue;
    }
    const job: LineJob = { id: line.id, text: line.text, voice, speakerIndex: Math.max(0, speakers.indexOf(line.speaker)), previous: ep.dialogue[i - 1]?.text, next: ep.dialogue[i + 1]?.text };
    log(`  ${provider}: ${line.id} (${line.speaker}) "${line.text.slice(0, 60)}"`);
    const clip = provider === "elevenlabs" ? await elevenLabsClip(job, apiKey, opts.fetchImpl) : provider === "system" ? systemClip(job, tmp) : fixtureClip(job);
    const { samples, sampleRate } = readWav(clip.wav);
    const file = `videos/${slug}/voice/${line.id}-${hash}.wav`;
    if (prev && prev.file !== file) fs.rmSync(path.join(root, "public", prev.file), { force: true });
    fs.writeFileSync(path.join(root, "public", file), clip.wav);
    const duration = samples.length / sampleRate;
    const words = clip.words.length ? clip.words : evenWords(line.text, duration);
    const entry: VoiceLine = { file, hash, provider, text: line.text, duration, words, envelope: envelopeFromSamples(samples, sampleRate, 60) };
    manifest.lines[line.id] = entry;
    generated++;
  }

  // Generated sound effects (sfx entries with a `prompt`), cached next to the voices.
  for (const s of ep.sfx) {
    if (!s.prompt) continue;
    const target = path.join(dir, s.sound.replace(/^videos\/[^/]+\//, ""));
    if (fs.existsSync(target) && !opts.force) continue;
    if (provider !== "elevenlabs") {
      log(`  ! sfx "${s.sound}" needs ElevenLabs to generate (prompt: ${s.prompt}); add the file manually or set a key`);
      continue;
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, await elevenLabsSfx(s.prompt, apiKey, opts.fetchImpl));
    log(`  sfx: ${s.sound}`);
  }

  // Drop clips of lines that no longer exist.
  for (const f of fs.readdirSync(path.join(dir, "voice"))) {
    const keep = Object.values(manifest.lines).some((l) => l.file.endsWith(`/${f}`));
    if (!keep) fs.rmSync(path.join(dir, "voice", f), { force: true });
  }
  fs.writeFileSync(path.join(dir, "voice.json"), JSON.stringify(manifest));
  fs.rmSync(tmp, { recursive: true, force: true });
  return { provider, generated, skipped, manifest };
};

const evenWords = (text: string, duration: number): Word[] => {
  const words = splitWords(text);
  const per = (duration - 0.2) / Math.max(1, words.length);
  return words.map((w, i) => ({ text: w, start: 0.1 + i * per, end: 0.1 + (i + 0.85) * per }));
};
