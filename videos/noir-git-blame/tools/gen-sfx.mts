// Generates this episode's sound effects with ElevenLabs sound generation (paid; never implied by a key alone).
//   node --import tsx videos/noir-git-blame/tools/gen-sfx.mts --yes [--only id,id]
// Reads tools/sfx.json; each clip is cached by a hash of its request (unchanged prompts cost nothing), converted to
// 48 kHz WAV with ffmpeg, and recorded in public/videos/noir-git-blame/sfx/provenance.json. The API key comes from
// ELEVENLABS_API_KEY and is never printed or written.
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");
const outDir = path.join(root, "public/videos/noir-git-blame/sfx");
const spec = JSON.parse(fs.readFileSync(path.join(here, "sfx.json"), "utf8")) as {
  model: string;
  sounds: { id: string; prompt: string; duration?: number; loop?: boolean; influence?: number }[];
};
const args = process.argv.slice(2);
const only = args.includes("--only") ? args[args.indexOf("--only") + 1].split(",") : null;
const yes = args.includes("--yes");
const key = process.env.ELEVENLABS_API_KEY;

fs.mkdirSync(outDir, { recursive: true });
const provPath = path.join(outDir, "provenance.json");
const prov: Record<string, unknown> = fs.existsSync(provPath) ? JSON.parse(fs.readFileSync(provPath, "utf8")) : {};

for (const s of spec.sounds) {
  if (only && !only.includes(s.id)) continue;
  const body = { text: s.prompt, model_id: spec.model, duration_seconds: s.duration, prompt_influence: s.influence ?? 0.5, ...(s.loop ? { loop: true } : {}) };
  const hash = createHash("sha256").update(JSON.stringify(body)).digest("hex").slice(0, 8);
  const wav = path.join(outDir, `${s.id}-${hash}.wav`);
  if (fs.existsSync(wav)) {
    console.log(`cached  ${s.id} → ${path.relative(root, wav)}`);
    continue;
  }
  if (!yes) {
    console.log(`would generate ${s.id} (${s.duration ?? "auto"} s) — pass --yes to spend credits`);
    continue;
  }
  if (!key) throw new Error("ELEVENLABS_API_KEY is not set");
  const res = await fetch("https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_192", {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = (await res.text()).slice(0, 300);
    throw new Error(`ElevenLabs sound-generation ${res.status} for ${s.id}: ${text}`);
  }
  const mp3 = path.join(outDir, `${s.id}-${hash}.mp3`);
  fs.writeFileSync(mp3, Buffer.from(await res.arrayBuffer()));
  const conv = spawnSync("ffmpeg", ["-v", "error", "-y", "-i", mp3, "-ar", "48000", "-ac", "2", wav]);
  if (conv.status !== 0) throw new Error(`ffmpeg could not convert ${mp3}`);
  fs.rmSync(mp3);
  // Older clips of the same id are stale.
  for (const f of fs.readdirSync(outDir)) if (f.startsWith(`${s.id}-`) && f !== path.basename(wav) && f.endsWith(".wav")) fs.rmSync(path.join(outDir, f));
  prov[s.id] = {
    file: `sfx/${path.basename(wav)}`,
    source: "ElevenLabs sound generation (/v1/sound-generation)",
    model: spec.model,
    request: { prompt: s.prompt, duration_seconds: s.duration, prompt_influence: body.prompt_influence, loop: !!s.loop },
    characterCost: res.headers.get("character-cost") ?? res.headers.get("x-character-count") ?? null,
    requestId: res.headers.get("request-id") ?? null,
    generated: new Date().toISOString().slice(0, 10),
    license: "ElevenLabs free plan output: non-commercial use; credit elevenlabs.io",
  };
  console.log(`made    ${s.id} → ${path.relative(root, wav)}`);
}
// Post-process: peak-normalise one-shots that came back too quiet (`peak` dBFS in sfx.json), once per file.
for (const s of spec.sounds as { id: string; peak?: number }[]) {
  const p = prov[s.id] as { file: string; processed?: string } | undefined;
  if (!s.peak || !p || p.processed) continue;
  const file = path.join(outDir, path.basename(p.file));
  const det = spawnSync("ffmpeg", ["-hide_banner", "-i", file, "-af", "volumedetect", "-f", "null", "-"], { encoding: "utf8" }).stderr;
  const max = Number(det.match(/max_volume:\s*(-?[\d.]+) dB/)?.[1] ?? 0);
  const gain = s.peak - max;
  const tmp = `${file}.tmp.wav`;
  const r = spawnSync("ffmpeg", ["-v", "error", "-y", "-i", file, "-af", `volume=${gain.toFixed(2)}dB`, tmp]);
  if (r.status !== 0) throw new Error(`normalise failed for ${s.id}`);
  fs.renameSync(tmp, file);
  p.processed = `peak-normalised ${max.toFixed(1)} → ${s.peak} dBFS (+${gain.toFixed(1)} dB)`;
  console.log(`normalised ${s.id}: ${p.processed}`);
}
// Derived clips: a trimmed/faded excerpt of a generated clip (`derive` in sfx.json), made locally (no credits).
for (const d of (spec as unknown as { derive?: { id: string; from: string; start: number; end: number; fadeOut: number }[] }).derive ?? []) {
  const src = prov[d.from] as { file: string } | undefined;
  if (!src) continue;
  const file = path.join(outDir, `${d.id}.wav`);
  const len = d.end - d.start;
  const r = spawnSync("ffmpeg", ["-v", "error", "-y", "-i", path.join(outDir, path.basename(src.file)), "-af", `atrim=start=${d.start}:end=${d.end},asetpts=PTS-STARTPTS,afade=t=out:st=${(len - d.fadeOut).toFixed(3)}:d=${d.fadeOut}`, file]);
  if (r.status !== 0) throw new Error(`derive failed for ${d.id}`);
  prov[d.id] = { file: `sfx/${d.id}.wav`, derivedFrom: d.from, edit: `${d.start}–${d.end} s, ${d.fadeOut} s fade-out (ffmpeg, local)`, license: (prov[d.from] as { license: string }).license };
  console.log(`derived ${d.id} from ${d.from}`);
}
fs.writeFileSync(provPath, JSON.stringify(prov, null, 2) + "\n");
