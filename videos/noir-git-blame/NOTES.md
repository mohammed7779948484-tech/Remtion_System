# git blame — production notes

Production log for `videos/noir-git-blame/`: problems met while making the episode, what caused them, what was done
locally, and what the shared engine/tooling could change upstream. "Confirmed" = reproduced and traced to code;
"suspected" = consistent with the evidence but not proven.

Environment: Linux container, 4 vCPU, no GPU, Node 22, system ffmpeg 6, Remotion 4.0.536 (Chrome headless shell).

## How to run the CLI here

The shared CLI was built on Windows. On this Linux box two adapters are needed; both live in `tools/bin/npx`
(a shim put first on `PATH`), so nothing shared is modified:

```
PATH="$PWD/videos/noir-git-blame/tools/bin:$PATH" npm run cli -- stills noir-git-blame
```

---

## 1. `stills` / `preview` / `render --draft` fail: `--props` is not valid JSON (POSIX) — confirmed

- **Symptom:** `npm run cli -- stills noir-git-blame` → Remotion: "You passed --props but it was neither valid JSON
  nor a file path… Provided value: {silent:true}". Nothing renders.
- **Where:** every still/preview/draft render, whole episode.
- **Evidence:** the failing command line printed by the CLI contains `--props={"silent":true}`; Remotion receives
  `{silent:true}`.
- **Cause (confirmed):** `scripts/cli/shared.ts:29` (`SILENT`) and `scripts/cli/media.ts:128,154` (`draftProps`) build
  `--props={"silent":true}` for non-Windows and pass it to `spawnSync("npx", cmd, { shell: true })`
  (`scripts/cli/shared.ts:25`). `/bin/sh` removes the double quotes before Remotion sees the argument.
- **Local solution:** `tools/bin/npx` rewrites `--props={key:true|false}` back to valid JSON and execs the real `npx`.
- **Verification:** with the shim on `PATH`, `stills` renders and writes `contact.png`.
- **Suggested upstream fix:** on POSIX quote with single quotes (`--props='{"silent":true}'`), or call
  `spawnSync` without `shell: true` and pass the JSON as one argv element.

## 2. Headless Chrome cannot create a WebGL context (no GPU) — confirmed

- **Symptom:** `THREE.WebGLRenderer: A WebGL context could not be created … GL_VENDOR = Disabled` in every render tab.
- **Cause (confirmed):** `remotion.config.ts` sets `Config.setChromiumOpenGlRenderer("angle")`, which needs a GPU
  (fine on the Windows/macOS machines the repo was built on). This container has none.
- **Local solution:** the same `tools/bin/npx` shim appends `--gl=swangle` (ANGLE on SwiftShader, CPU) to
  `remotion render|still` calls unless a `--gl` flag is present (`NOIR_GL=<backend>` overrides). A direct
  `npx remotion still … --gl=swangle` rendered a correct frame in ~11 s including bundling.
- **Consequence:** software rendering is slower than a GPU; it is deterministic (see the `--verify` results below).
- **Suggested upstream fix:** choose the GL backend by platform/GPU availability (e.g. `swangle` on Linux without
  `/dev/dri`), or read it from an env var in `remotion.config.ts`.

## 3. Shared `dust_motes` render as large squares under SwiftShader — confirmed (visual)

- **Symptom:** bright square sprites tens of pixels wide floating over the board (first test still, frame 75).
- **Cause (suspected):** `THREE.Points` with a large `size` in SwiftShader; point sprites without a round alpha map
  render as squares. Not investigated further.
- **Local solution:** the office doesn't use `dust_motes`.
- **Suggested upstream check:** render the micro-keyboard episodes with `--gl=swangle` and compare.

## 4. Numeric camera `height` is relative to the subject's face — documentation gap — confirmed

- **Symptom:** "close on Rayan, height 1.15" (meant as a camera 1.15 m above the floor, below his eyes) looked down
  on the top of his head (contact sheet, 4.8 s and 9.0 s).
- **Cause (confirmed):** `src/engine/camera/solve.ts` `heightRise`: a number means `face + h` metres. `docs/ENGINE.md`
  only says `height` (`eye|low|high|metres`).
- **Local solution:** Rayan's closes use `height: -0.25 / -0.3` (camera below his eye line = the detective's low POV).
- **Suggested upstream fix:** say "metres relative to the face" in ENGINE.md and the schema description.

## 5. Shared desk's glossy rounded edge shows a dotted highlight under the blind stripes — confirmed (visual)

- **Symptom:** a white dashed line along the desk's front edge in low shots (first contact sheet, 3.5 s).
- **Cause:** the key light is striped by the blinds; the shared desk top is a `RoundedBox` whose bevel catches a
  specular highlight in each lit stripe. Physically plausible, reads as an artifact.
- **Local solution:** a video-local `detective_desk` (rougher wood, square edge, green leather top) replaces the
  shared desk in this set. No shared code changed.

## 6. Software rendering speed; parallel tabs don't help — measured

- **Symptom:** a 3.6 s half-size `preview` took 5.4 min.
- **Evidence (frames 400–447, full size, `--gl=swangle`):** 12 frames / 1 tab = 39 s incl. ~10 s start-up
  (≈ 2.4 s/frame); 24 frames / 1 tab without the film-grain overlay = 72 s (≈ 2.6 s/frame, so the SVG grain is not
  the cost); 24 frames / 2 tabs = 79 s; 48 frames / 4 tabs = 156 s (≈ 3.2 s/frame). SwiftShader already uses every
  core, so extra tabs only contend.
- **Local solution:** the shim adds `--concurrency=1` to renders (override with `NOIR_CONCURRENCY`). A full render of
  this ~54 s episode takes about 70 min here. Iteration used `stills` (seconds) and short previews; full renders
  only for review and the master.
- **Suggested upstream:** document the expected CPU-only render time; consider a `render --scale` review mode.

## 7. Engine music ducking switches volume in hard per-frame steps — confirmed (code reading)

- **Where:** `src/engine/audio/Soundtrack.tsx`: `volume={(f) => music.volume * (speaking(f / fps) ? music.duck : 1)}`
  — a step between 1 and `duck` at frame boundaries (no ramp), ~9 dB at `duck: 0.35`.
- **Risk:** audible pumping/zipper steps on sustained music (not verified by listening; inferred from the code).
- **Local solution:** `tools/build-score.mts` pre-builds the score + ambience stem with ffmpeg `sidechaincompress`
  keyed on the placed dialogue clips (25 ms attack, 420 ms release, ratio 8), and episode.json plays it with
  `"duck": 1` (no engine ducking). The stem must be rebuilt after timing changes (it reads the resolved timeline).
- **Suggested upstream fix:** ramp the duck gain over ~80–300 ms (pure function of t from the line windows).

## 8. `music.src` resolves from `public/`, `sfx` from the video folder — documentation gap — confirmed

- **Symptom:** `"music": { "src": "music/score.wav" }` → `✖ missing audio file public/music/score.wav`, while
  `"sound": "sfx/x.wav"` resolves to `public/videos/<id>/sfx/x.wav`.
- **Local solution:** `"src": "videos/noir-git-blame/music/score.wav"`.
- **Suggested upstream fix:** resolve both the same way, or say so in the cookbook ("Episode-specific files").

## 9. `voice --dry-run` does not exist and is silently ignored — confirmed

- **Symptom:** `voice <slug> --provider elevenlabs --dry-run` generated all 16 clips (584 credits). The script was
  already locked and paid generation was authorized, so nothing was wasted, but an unknown flag spent credits.
- **Suggested upstream fix:** reject unknown flags, or add a real `--dry-run` (the character count is already
  printed before generating).

## 10. No narrator/voice-over support — worked around with a video-local actor

- **Need:** Claude's inner monologue must not animate the visible mascot (its body pulses with speech) and should
  be captioned differently.
- **Local solution:** `narrator` actor (`video.data.ts` def + an index.tsx view that renders nothing): one channel,
  anchors at the detective's mark (so auto focus lands on the detective), `effectors` with no volumes (never
  blocks a sightline). Shots during narration set `focus` explicitly.
- **Suggested upstream:** a built-in `voice-over` cast kind (no body, captions styled as V.O.).

## 11. Custom captions are outside the engine's overlay checks — by design here

- **Why custom:** typewriter captions for narration and serif for dialogue (`overlay.tsx`), using the engine's own
  `captionPages`/`captionIndexAt`, placed at the engine's subtitle height (bottom edge 20 % above the frame bottom).
- **Consequence:** with `captions.style: "none"`, `inspect`'s caption-over-face check no longer sees them. They were
  checked by eye on every contact sheet and on the final render instead (see Verification).

## 12. Generated SFX needed measurement-based placement and one level fix

- `stamp-thump` came back at −31 dBFS peak → peak-normalised to −3 dBFS (`peak` in `tools/sfx.json`, recorded in
  `sfx/provenance.json`). The 3 s clock clip ticks at 0.03/1.0/2.0/3.0 s; a 1.6 s excerpt (`clock-two-ticks.wav`)
  keeps a tick off the word "DNS". The door bang sits at 0.41 s into its clip, so the cue starts 0.12 s before the
  door event. Onsets, envelopes and a speech check (no speech in any clip) were measured with librosa/whisper.

## 13. Masking and balance found by measurement, fixed before the full render

- **Method:** with no way to listen, the soundtrack was simulated offline (ffmpeg: the same clip windows, gains,
  SFX times/volumes and the music stem) and split into voice / music / SFX stems; per-line RMS of each stem and a
  speech-to-text pass (faster-whisper small.en) on the *mix* measured intelligibility.
- **Found (first pass):** word recall 90 %. The opening thunder was 16 dB above "Two a.m. Production was dead."
  (1/5 words recovered); the brass sting + thunder at the twist buried "…that handwriting"; footsteps blurred
  "What changed?". Narrator/Claude lines sat ~4.5 dB under Rayan's (the engine levels each speaker to its own
  median, not across speakers); music under some narration was only 4.5–7 dB below the voice.
- **Fixes:** first line moved to 0.75 s after a shortened thunder crack (derived clip, −8 dB); twist re-blocked so
  the sting + lightning + startle come *after* "…I knew that handwriting." (dolly zoom held through the sting,
  1.5 s before "Well? Who did it?"); `gain: 4` on every narrator/Claude line; music bed −2 dB; footsteps, door,
  stamps and the twist thunder lowered (a short derived thunder roll).
- **After:** all voices within 2 dB of each other; music 9–14 dB under every line; word recall 97 % on the real
  engine soundtrack — the two "misses" are "Two" transcribed as "2" and "touched" heard as "touch", which the
  isolated clip also gives. (Measured, not heard; the real soundtrack is ~3 dB hotter on voices than the
  simulation because ffmpeg's mono→stereo upmix drops the centre by 3 dB and Remotion's doesn't.)

## 14. `render --master` would fall back to dynamic loudnorm on this mix — measured

- **Evidence:** the engine soundtrack (audio-only render, see 15) measures −17.1 LUFS integrated, sample peak −1.0
  dBFS, true peak −0.9 dBTP: a peak-to-loudness ratio of ~16 dB. −14 LUFS with −1.5 dBTP allows 12.5 dB, so the
  CLI's two-pass `loudnorm … linear=true` cannot stay linear; ffmpeg then silently switches to *dynamic* mode
  (confirmed: "Normalization Type: Dynamic" on the same audio), i.e. a time-varying gain.
- **Tried:** a gentle bus compressor before the limiter lowered loudness more than peaks (worse ratio, discarded).
  A sample-level limiter at −6 dBFS kept loudnorm linear but left inter-sample overs: sample peak −2.2 dBFS vs
  true peak **+0.1 dBTP** after normalisation.
- **Local solution:** `tools/master.mts`: `aresample=192000, alimiter (−6 dBFS, 5 ms look-ahead,
  latency-compensated), aresample=48000`, then the same two-pass linear loudnorm (−14 LUFS, −1.5 dBTP, LRA 11),
  AAC 256 kbps, video stream copied. On the real soundtrack: loudnorm **Linear**, −13.8 LUFS, true peak −2.1 dBTP;
  the limiter reduces gain by >1 dB in 2 % of 10 ms windows, never more than 4.7 dB (consonants of "propagating",
  the door, a stamp). Measured, not heard.
- **Suggested upstream:** have `render --master` report the loudnorm mode, and add an oversampled peak limiter
  before it when the peak-to-loudness ratio exceeds the target's headroom.

## 15. Rendering in parts + an audio-only soundtrack render

- **Why:** the background job runner here stops commands after 2 h and a full software render is ~2 h.
- **How:** the video is rendered muted in two frame ranges (`npx remotion render … --frames=0-829 --muted`,
  `--frames=830-1658`), joined with ffmpeg's concat demuxer (stream copy, identical encoder settings), and the
  soundtrack is rendered once in full with `--codec=wav --props='{"audioOnly":true}'`. In that mode index.tsx
  mounts only the engine's own `<Soundtrack>` (same component and resolved data as the full render): ~20 s instead
  of hours. `tools/master.mts` muxes and masters it. One audio render means no seam at the join.
- **Also found:** an audio-only render of the full composition still mounts the 3D scene for every frame (it failed
  without the GL shim), so it would not have been faster without this switch.
