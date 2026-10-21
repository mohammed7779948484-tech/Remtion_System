// Masters the soundtrack to -14 LUFS / -1.5 dBTP and muxes it onto the video, whose stream is copied untouched.
//   node --import tsx videos/noir-git-blame/tools/master.mts --video <video.mp4> [--audio <soundtrack.wav>] --out <out.mp4>
// Without --audio the video file's own audio track is used. Same target and two-pass linear loudnorm as
// `render --master`, preceded by a look-ahead peak limiter run at 192 kHz (so it also catches inter-sample peaks),
// -6 dBFS ceiling, 5 ms, latency-compensated. Without it this mix's peak-to-loudness ratio (~16 dB: thunder, door,
// consonants) exceeds the 12.5 dB that -14 LUFS / -1.5 dBTP allows and loudnorm silently falls back to dynamic
// (time-varying) gain. Measured on the real soundtrack: >1 dB of limiting on 2 % of 10 ms windows, max 4.7 dB
// (NOTES.md, problem 13).
import { spawnSync } from "node:child_process";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const video = arg("video");
const audio = arg("audio");
const out = arg("out");
if (!video || !out) throw new Error("usage: master.mts --video <video.mp4> [--audio <soundtrack.wav>] --out <out.mp4>");
const LIMIT = "aresample=192000,alimiter=limit=0.5:attack=5:release=60:level=disabled:latency=1,aresample=48000";
const TARGET = "I=-14:TP=-1.5:LRA=11";

const run = (args: string[]) => spawnSync("ffmpeg", ["-hide_banner", ...args], { encoding: "utf8", maxBuffer: 1 << 28 });
const src = audio ?? video;
const pass1 = run(["-i", src, "-af", `${LIMIT},loudnorm=${TARGET}:print_format=json`, "-f", "null", "-"]).stderr;
const m = JSON.parse(pass1.slice(pass1.lastIndexOf("{"), pass1.lastIndexOf("}") + 1)) as Record<string, string>;
const af = `${LIMIT},loudnorm=${TARGET}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true:print_format=summary,aresample=48000`;
const inputs = audio ? ["-i", video, "-i", audio] : ["-i", video];
const amap = audio ? "1:a:0" : "0:a:0";
const pass2 = run(["-y", ...inputs, "-map", "0:v:0", "-map", amap, "-c:v", "copy", "-af", af, "-c:a", "aac", "-b:a", "256k", "-movflags", "+faststart", "-shortest", out]);
if (pass2.status !== 0) throw new Error(`mastering failed:\n${pass2.stderr.slice(-2000)}`);
const type = pass2.stderr.match(/Normalization Type:\s+(\w+)/)?.[1];
const ebu = run(["-nostats", "-i", out, "-af", "ebur128=peak=sample+true", "-f", "null", "-"]).stderr;
const lufs = ebu.match(/I:\s+(-?[\d.]+) LUFS/g)?.at(-1);
const peaks = [...ebu.matchAll(/Peak:\s+(-?[\d.]+) dBFS/g)].slice(-2).map((x) => x[1]);
console.log(`✔ ${out}: soundtrack ${m.input_i} LUFS / ${m.input_tp} dBTP after the limiter → ${lufs}; sample peak ${peaks[0]} dBFS, true peak ${peaks[1]} dBTP (after AAC); loudnorm mode: ${type}`);
if (type !== "Linear") console.log("⚠ loudnorm did not stay linear — check the mix peaks");
