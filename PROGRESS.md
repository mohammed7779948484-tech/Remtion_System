# Progress log

Resume point for anyone continuing this build. Plan: phases 0–8 (scaffold/spike → actors →
set/props/lighting → camera → episode JSON/audio → CLI/docs → video 1 → video 2 → handoff).

## Status

| Phase | State | Notes |
|---|---|---|
| 0 Scaffold + risk spike | ✅ done | see findings below |
| 1 Core + actors | 🟡 code written, tests pending | `src/engine/actors` |
| 2 Set, props, screens, lighting | 🟡 code written | `src/engine/world`, `src/engine/lighting` |
| 3 Camera + post | 🟡 code written | `src/engine/camera` |
| 4 Episode JSON, audio, captions | 🟡 code written | `src/engine/core`, `src/engine/audio`, `src/engine/player` |
| 5 CLI, catalog, docs | ⬜ | |
| 6 Video 1 | ⬜ | |
| 7 Video 2 | ⬜ | |
| 8 Handoff | ⬜ | |

## Phase 0 findings (2026-10-18)

- `create-video` refuses a folder containing `.git`; scaffolded in a temp dir and moved in (blank template, rspack).
- Network here is ~18 KB/s to the npm registry: installs take ~1 h. Dropped `@remotion/google-fonts`
  (its metadata alone is tens of MB). Fonts use system stacks (`src/engine/fonts.ts`): Consolas / Segoe UI.
- `three` 0.186 on npm no longer ships `examples/fonts`, so drei `Text3D` has no typeface → 3D titles use
  canvas-text planes instead (decision change vs. plan).
- **EffectComposer renders blank in exports** (works in Studio): it builds passes over several React
  updates, and Remotion captures a tab's first frame before that. Fixed with `ComposerGate`
  (`src/engine/camera/Camera.tsx`): delayRender until passes exist for the current camera, then `advance()`.
- After the fix: DOF/bloom/vignette/AGX visible in exported frames; frame 90 rendered via `remotion still`
  is **byte-identical** to frame 90 from a `--sequence` render; MP4 frame vs PNG = 42.7 dB PSNR (codec loss).
- Audio via `@remotion/media` `<Audio>` present in MP4 (aac, -21 dB mean). Captions as DOM overlay render.
- Speed: 150 frames @1280×720 with shadows + post ≈ 10 s (angle GL on GPU, default concurrency).
- Offline voices: Windows SAPI (David, Zira, Mark) works; `SpeakProgress` word timings assume 16 kHz →
  generate at 16 kHz (or scale by 16000/sampleRate).
- Remotion's bundled ffmpeg lacks `psnr`/`tile`; CLI uses system `ffmpeg` when present for contact sheets
  and pixel comparisons (skips gracefully otherwise).
- three r186 removed PCFSoftShadowMap → use `shadows="percentage"`.

## Reuse vs build changes

- shiki (cached locally) used for screen syntax colours as planned.
- `@remotion/google-fonts` → system font stacks (bandwidth); swap to `@remotion/fonts` + woff2 later if needed.
- drei `Text3D` → canvas-text planes (no typeface files available offline).

## Open issues

- ElevenLabs path implemented against documented API but untested live (no key yet).
