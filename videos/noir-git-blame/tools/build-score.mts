// Builds public/videos/noir-git-blame/music/score.wav: the edited music + ambience stem, timed to the resolved
// episode and ducked smoothly under the dialogue (ffmpeg sidechaincompress keyed on the placed voice clips).
//   node --import tsx videos/noir-git-blame/tools/build-score.mts
// Re-run after any timing change. The engine's own music ducking switches volume per frame (audible steps), so
// episode.json plays this stem with duck: 1 (NOTES.md, problem 7).
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");
const pub = path.join(root, "public/videos/noir-git-blame");
const engine = await import(pathToFileURL(path.join(root, "src/engine/core/timeline.ts")).href);
const data = (await import(pathToFileURL(path.join(here, "../video.data.ts")).href)).default;
const episode = JSON.parse(fs.readFileSync(path.join(here, "../episode.json"), "utf8"));
const voice = JSON.parse(fs.readFileSync(path.join(pub, "voice.json"), "utf8"));
const r = engine.resolveEpisode(episode, voice, {
  environments: data.environments,
  actors: data.actorDefs,
  components: data.componentKinds,
  screens: data.screenKinds,
});

const line = (id: string) => {
  const l = r.lines.find((x: { id: string }) => x.id === id);
  if (!l) throw new Error(`no line ${id}`);
  return l as { start: number; end: number; file: string; clip?: { from: number; to: number }; gain?: number; words: { start: number; end: number }[] };
};
const T = r.duration as number;

// ---------------------------------------------------------------- the cue sheet (absolute seconds)
const SAX = { file: "music/Night_on_the_Docks_-_Sax.mp3", from: 11.6 }; // the theme enters at ~12 s
const BASS = { file: "music/Bass_Walker.mp3", from: 0 }; // first beat at 0.14 s
const FAST = { file: "music/Fast_Talkin.mp3", from: 0 };
const n3 = line("n3");
const n6 = line("n6");
const r5 = line("r5");
const cues = [
  // [source, start on timeline, end on timeline, fade-in s, fade-out s, gain dB]
  { src: SAX, at: 0, end: n3.start + 0.1, fadeIn: 0.5, fadeOut: 0.7, gain: 0 },
  { src: BASS, at: n3.start - 0.29, end: n6.end + 0.25, fadeIn: 0.05, fadeOut: 1.4, gain: 0 },
  { src: FAST, at: r5.start - 0.2, end: T, fadeIn: 0.05, fadeOut: 2.0, gain: 0 },
];

// ---------------------------------------------------------------- loudness of each used section
const lufs = (file: string, from: number, dur: number) => {
  const res = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-ss", String(from), "-t", String(dur), "-i", path.join(pub, file), "-af", "ebur128", "-f", "null", "-"], { encoding: "utf8" });
  const m = [...res.stderr.matchAll(/I:\s+(-?[\d.]+) LUFS/g)].pop();
  return m ? Number(m[1]) : -23;
};
const MUSIC_TARGET = -28; // unducked bed; the master later lifts the whole mix to -14 LUFS
for (const c of cues) {
  const l = lufs(c.src.file, c.src.from, c.end - c.at);
  c.gain = MUSIC_TARGET - l;
  console.log(`cue ${path.basename(c.src.file)} ${c.at.toFixed(2)}–${c.end.toFixed(2)} s: ${l.toFixed(1)} LUFS → gain ${c.gain.toFixed(1)} dB`);
}

// ---------------------------------------------------------------- ffmpeg graph
const sfxDir = path.join(pub, "sfx");
const find = (prefix: string) => {
  const f = fs.readdirSync(sfxDir).find((x) => x.startsWith(prefix) && x.endsWith(".wav"));
  if (!f) throw new Error(`no ${prefix} clip in sfx/`);
  return path.join(sfxDir, f);
};
const inputs: string[] = [];
const graph: string[] = [];
const add = (file: string, loop = false) => {
  if (loop) inputs.push("-stream_loop", "-1");
  inputs.push("-i", file);
  return inputs.filter((x) => x === "-i").length - 1;
};
const fmt = "aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo";

const musicLabels: string[] = [];
cues.forEach((c, i) => {
  const k = add(path.join(pub, c.src.file));
  const d = c.end - c.at;
  graph.push(
    `[${k}:a]${fmt},atrim=start=${c.src.from}:duration=${d.toFixed(3)},asetpts=PTS-STARTPTS,afade=t=in:d=${c.fadeIn},afade=t=out:st=${(d - c.fadeOut).toFixed(3)}:d=${c.fadeOut},volume=${c.gain.toFixed(2)}dB,adelay=${Math.round(c.at * 1000)}:all=1[m${i}]`,
  );
  musicLabels.push(`[m${i}]`);
});
graph.push(`${musicLabels.join("")}amix=inputs=${musicLabels.length}:normalize=0:duration=longest,apad=whole_dur=${T.toFixed(3)},atrim=duration=${T.toFixed(3)}[music]`);

// Sidechain key: every voice clip at its place, with its window and level, as the engine plays it.
const keyLabels: string[] = [];
r.lines.forEach((l: { start: number; end: number; file?: string; clip?: { from: number; to: number }; gain?: number }, i: number) => {
  if (!l.file) return;
  const k = add(path.join(root, "public", l.file));
  const from = l.clip?.from ?? 0;
  const dur = l.end - l.start;
  graph.push(`[${k}:a]${fmt},atrim=start=${from}:duration=${dur.toFixed(3)},asetpts=PTS-STARTPTS,volume=${(l.gain ?? 0).toFixed(2)}dB,adelay=${Math.round(l.start * 1000)}:all=1[v${i}]`);
  keyLabels.push(`[v${i}]`);
});
graph.push(`${keyLabels.join("")}amix=inputs=${keyLabels.length}:normalize=0:duration=longest,apad=whole_dur=${T.toFixed(3)},atrim=duration=${T.toFixed(3)},volume=6dB[key]`);
graph.push(`[music][key]sidechaincompress=threshold=0.012:ratio=8:attack=25:release=420:knee=4:makeup=1[ducked]`);

// Ambience: rain on the window (seamless 22 s loop) and the neon buzz, not ducked.
const rain = add(find("rain-window-"), true);
const neon = add(find("neon-buzz-"), true);
graph.push(`[${rain}:a]${fmt},atrim=duration=${T.toFixed(3)},afade=t=in:d=0.15,afade=t=out:st=${(T - 1.2).toFixed(3)}:d=1.2,volume=-5dB[rain]`);
graph.push(`[${neon}:a]${fmt},atrim=duration=${T.toFixed(3)},volume=-12dB[neon]`);
graph.push(`[ducked][rain][neon]amix=inputs=3:normalize=0:duration=first,alimiter=limit=0.89:level=disabled[out]`);

const out = path.join(pub, "music/score.wav");
const res = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...inputs, "-filter_complex", graph.join(";"), "-map", "[out]", "-ar", "48000", "-c:a", "pcm_s16le", out], { encoding: "utf8" });
if (res.status !== 0) throw new Error(`ffmpeg failed:\n${res.stderr}`);
console.log(`✔ ${path.relative(root, out)} (${T.toFixed(2)} s)`);
console.log(`  loudness: ${lufs("music/score.wav", 0, T).toFixed(1)} LUFS integrated`);
