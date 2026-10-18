# Progress log

Resume point for anyone continuing this build. Plan: phases 0–8 (scaffold/spike → actors →
set/props/lighting → camera → episode JSON/audio → CLI/docs → video 1 → video 2 → handoff).

## Status

| Phase | State | Notes |
|---|---|---|
| 0 Scaffold + risk spike | ✅ done | see findings below |
| 1 Core + actors | ✅ done | actor tests + visual pose/emotion review |
| 2 Set, props, screens, lighting | ✅ done | dev-office layout reworked after stills review |
| 3 Camera + post | ✅ done | camera tests: framing ×3 aspects, tracking, occlusion, overrides |
| 4 Episode JSON, audio, captions | ✅ done | system voices + captions + mouths verified in an MP4 |
| 5 CLI, catalog, docs | ✅ done | CLAUDE.md, docs/ENGINE.md, catalog/, `npm run cli` |
| 6 Video 1 | ✅ done | `it-works-on-my-machine`: 16:9, 30.4 s, renders in ~52 s → out/it-works-on-my-machine.mp4 |
| 7 Video 2 | ✅ done | `launch-promo`: 9:16, 28.7 s, custom stage in its folder → out/launch-promo.mp4 |
| 8 Handoff | ✅ done | tests, validation, determinism checks, docs |

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

## Phase 1–4 findings

- SMAA's lookup textures load asynchronously, so the first frame of each render tab had different edge
  anti-aliasing. Replaced by composer MSAA (multisampling 4); `stills --verify` is now byte-identical.
- The anchor cache keyed time by `toFixed(5)`, which made results depend on evaluation order (nearby
  sample times shared entries). Now keyed by the exact time.
- Remotion's inline audio mixing crashes (EINVAL) on sparse `--frames` lists even with `--muted`; stills
  pass `--props={"silent":true}` and the player then skips the soundtrack.
- `@remotion/media` has no Node export, so the CLI cannot import video modules. Pure per-video data
  (environments, actorDefs, componentKinds) lives in optional `videos/<slug>/video.data.ts`.

## Phase 6–7 findings

- Directing video 1 needed: seated variants of explaining/arms-crossed poses; inserts must not treat their own
  target as an occluder; over-shoulder offsets must scale with the foreground actor's *width* (small mascot).
- Video 2 (new location, custom components, portrait, walking + follow) needed only two generic solver fixes:
  follow shots are occlusion-tested where the camera will travel, and framing distance is now
  perspective-correct (camera above/below the aim with wide portrait lenses clipped heads).
  Video 1 stills were re-rendered afterwards: no regressions (framing marginally looser).
- Reuse proof: video 2 added no files to `src/engine`; everything location-specific lives in
  `videos/launch-promo/` (environment data, 5 stage components, 4 screen drawings, overlays, spotlights).

## Verification snapshot (end of build)

- `npm test`: 57 tests in 5 files (actors, camera incl. tracking/occlusion/overrides/aspect ratios, resolver, voice cache,
  mocked ElevenLabs, catalog freshness, every video resolves). `tsc` clean.
- `cli validate`: both videos valid, no warnings.
- `cli stills --verify` (parallel vs single-tab sequential render):
  - video 1: 11/12 frames byte-identical, 1 frame at 116 dB PSNR.
  - video 2: 3/8 byte-identical, others ≥ 92 dB (≤ 233 pixels off by 1–3 levels near translucent holo
    screens; GPU precision). Scene *state* is exactly deterministic (tested in Node).

## Reuse vs build changes

- shiki (cached locally) used for screen syntax colours as planned.
- `@remotion/google-fonts` → system font stacks (bandwidth); swap to `@remotion/fonts` + woff2 later if needed.
- drei `Text3D` → canvas-text planes (no typeface files available offline).

## Open issues / next steps

- ElevenLabs path implemented against the documented API (with-timestamps, wav_24000, sound-generation) and
  tested with mocked HTTP only — no key yet. To finish: add `ELEVENLABS_API_KEY` to `.env`, run
  `npm run cli -- voice <slug> --provider elevenlabs` for both videos, re-render.
- Current voices are offline Windows SAPI voices (robotic but intelligible). Mouths are amplitude-driven, not
  phoneme lip-sync (upgrade path documented in docs/ENGINE.md §7).
- SFX use Remotion-hosted files fetched at render time (slow on this network); could be cached under public/.
- Residual sub-perceptual pixel noise (≤3/255 on a few hundred pixels) on translucent/reflective effects.
- No drei `Text3D` (no typeface files offline); 3D titles use canvas-text planes.
