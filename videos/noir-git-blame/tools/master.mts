// Masters a rendered MP4 to -14 LUFS / -1.5 dBTP with the video stream copied untouched.
//   node --import tsx videos/noir-git-blame/tools/master.mts <in.mp4> <out.mp4>
// Same target and two-pass linear loudnorm as `render --master`, preceded by a gentle look-ahead peak limiter
// (-8 dBFS ceiling, 5 ms, latency-compensated). Without it this mix's peak-to-loudness ratio (~16 dB: thunder,
// door, consonants) exceeds the 12.5 dB that -14 LUFS / -1.5 dBTP allows, and ffmpeg's loudnorm silently falls
// back to dynamic (time-varying) gain. Measured on the simulated mix: the limiter works >1 dB on 3.4 % of
// 10 ms windows, max 3.8 dB (NOTES.md, problem 13).
import { spawnSync } from "node:child_process";

const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error("usage: master.mts <in.mp4> <out.mp4>");
const LIMIT = "alimiter=limit=0.4:attack=5:release=60:level=disabled:latency=1";
const TARGET = "I=-14:TP=-1.5:LRA=11";

const run = (args: string[]) => spawnSync("ffmpeg", ["-hide_banner", ...args], { encoding: "utf8", maxBuffer: 1 << 28 });
const pass1 = run(["-i", input, "-af", `${LIMIT},loudnorm=${TARGET}:print_format=json`, "-f", "null", "-"]).stderr;
const m = JSON.parse(pass1.slice(pass1.lastIndexOf("{"), pass1.lastIndexOf("}") + 1)) as Record<string, string>;
const af = `${LIMIT},loudnorm=${TARGET}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true:print_format=summary`;
const pass2 = run(["-y", "-i", input, "-map", "0:v:0", "-map", "0:a:0", "-c:v", "copy", "-af", af, "-ar", "48000", "-c:a", "aac", "-b:a", "256k", "-movflags", "+faststart", output]);
if (pass2.status !== 0) throw new Error(`mastering failed:\n${pass2.stderr.slice(-2000)}`);
const type = pass2.stderr.match(/Normalization Type:\s+(\w+)/)?.[1];
const ebu = run(["-nostats", "-i", output, "-af", "ebur128=peak=true", "-f", "null", "-"]).stderr;
const lufs = ebu.match(/I:\s+(-?[\d.]+) LUFS/g)?.at(-1);
const tp = ebu.match(/Peak:\s+(-?[\d.]+) dBFS/g)?.at(-1);
console.log(`✔ mastered ${output}: input ${m.input_i} LUFS / ${m.input_tp} dBTP (after limiter) → ${lufs}, true peak ${tp}; loudnorm mode: ${type}`);
if (type !== "Linear") console.log("⚠ loudnorm did not stay linear — check the mix peaks");
