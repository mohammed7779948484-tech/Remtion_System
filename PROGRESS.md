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

---

# V2 (started 2026-10-18) — plan: stabilize V1 → live Eleven v4 → episode-driven slice ("Ctrl+Z", 9:16) → make-episode skill

| Phase | State | Notes |
|---|---|---|
| 0 Safety + baseline | ✅ done | key moved to ignored `.env` (never printed); `.env.example` restored + `tests/secrets.test.ts`; exposure scan: 0/6 commits, nothing staged, no other files (key appeared only in a local session log → rotation recommended, low urgency). Baseline stills in `out/baseline/`. |
| 1 V1 defect fixes | ✅ done | 11 confirmed defects fixed; each new regression test failed on the old code. 86 tests. Stills vs baseline: video 1 12/12 byte-identical; video 2 3/8 identical, others max diff 4/255 on ~0.001% of pixels (≈26 px, the known translucent-holo GPU noise) — harmless. |
| 2 Eleven v4 live | ✅ done | live smoke test passed on the free plan (23 credits, 9,977 left). See log. |
| 3 Showcase slice | ⏳ in progress | done: brief-first scaffolding, micro-keyboard world, recipes, fx engine, AppWindow + KineticText, screen popup/window preset. Left: see "Resume here". |
| 4 Regressions | ⏳ | |
| 5 Docs + skill | ⏳ | |

## V2 log
- Voice cost safety: ElevenLabs runs only with explicit `--provider elevenlabs` (a key alone never switches; an
  ElevenLabs-voiced manifest needs the flag before buying changed lines); `--provider` values validated; character
  count printed before paid generation; manifest written after every clip (a failure keeps paid clips).
- Cache key is now a fingerprint of the *effective* request (`voiceRequest` + `voiceFingerprint` in `speech.ts`,
  scheme 2). Legacy (scheme 1) clips stay valid while their old hash matches → both existing videos untouched.
- Phase 1 fixes: resolver stale-voice detection (names the cause); `auditAudio` shared by `validate`/`render`/
  `calculateMetadata` (final renders refuse unvoiced/stale lines + missing files; drafts refuse only missing files);
  duration from all content; shots after `end` are errors, cues after it warn; moves queue like the rig; same-speaker
  overlap warns; prop parents/cycles/transitive remove/typo ids validated in `resolveLayout`; unknown screen presets/
  params, prop params, appearance keys warn; `checkActorDef` for video-supplied actors; `componentKinds`/`screenKinds`
  without implementations reported; ComposerGate timeout → `cancelRender`; caption pages never hide the next line;
  CLI boolean flags no longer swallow the slug; `new` no longer hard-codes expiring voice ids; `render --draft/--timeout`.
- Verified empirically: `@remotion/media` `<Audio>` aborts a render (even a draft) on a 404 → missing files block drafts.
  A final render with a missing clip now fails up front with a readable list (also via plain `npx remotion render`).
- Screen preset metadata moved to pure `world/screens.data.ts` (Node-safe validation); `SCREEN_PRESETS` keeps its shape.
- **Phase 2 — Eleven v4 verified live (2026-10-18).** Docs: v4 on Text-to-Speech and Text-to-Dialogue, ≤10k chars;
  `wav_24000` allowed on free; v4 settings = stability + similarity only. Chose per-line TTS `/with-timestamps`
  (per-line caching; Dialogue re-buys the whole exchange on any edit). First key was restricted (no `user_read`,
  `models_read`) → reported as a blocker; user widened the key policy. `voice --check`: plan free, 10,000 credits,
  `eleven_v4`/`eleven_v4_turbo` listed, 21 premade voices (defaults now Liam / Jessica / Will / Laura).
  Live line `Ship it. [laughs] Okay!` → RIFF WAV 16-bit mono 24 kHz; alignment present for v4 and includes the tag
  characters (parser skips them → 3 monotonic words); 0.9 s performed laugh between words; cost **23 credits = 1 per
  character incl. tags** (account counter lags a few seconds); re-run = 0 generated (cache); final 9:16 render: AAC
  audio, clip lands at exactly 0.600 s (cross-correlation), captions tag-free and word-synced, mouth opens on speech.
  Response captured as `tests/fixtures/elevenlabs-v4.json` (no headers/key). Temporary video removed.
  Not verified: v4 request stitching (off for v4 by default). Free-plan clips are non-commercial forever and need
  "elevenlabs.io" in the title → `validate`/`render` warn.
- Phase 3 progress: micro-keyboard environment (giant keyboard/screen/duck/dust, macro-warm mood); recipes
  (`do`: press, point, pick-up, place, react, sit-down, stand-up) with closed-form reach (FK(IK) < 1 cm);
  `fx` cues (text, window, callout, impact, shake, glitch, flash, dip; catalog/fx.json, `list fx`);
  reusable components AppWindow (one model, DOM + Canvas2D renderers; patterns adapted from Remocn/Onda, MIT —
  no code copied) and KineticText (fitText via @remotion/layout-utils 4.0.536); `window` screen preset and
  `popup` param on any screen. ctrl-z draft episode + BRIEF.md (renders; stills reviewed once).

## Resume here (next session)
1. Write THIRD_PARTY_NOTICES.md (Remocn / Onda pattern credit, Kenney CC0 once sounds are added).
2. Render-check the new fx/components in stills (not yet seen in a render): `stills ctrl-z --guides`, `stills --verify`.
3. Upgrade ctrl-z/episode.json to use recipes + fx (fixes found in the draft: land Rayan earlier in shot 1;
   replace the overhead run shot with a shot along the keyboard; use `window` fx for the undo-failed popup
   (phone-readable); `place` hides the original duck; tighter final two-shot; brighten Claude's face).
4. SFX kit: Kenney CC0 files into public/sfx/ + SFX_LIBRARY metadata (license/source); mark remote meme sounds unknown.
5. Second usage of AppWindow/KineticText outside ctrl-z (prove reuse); tests for fx resolution.
6. Voice ctrl-z with `--provider elevenlabs` (~200 credits), validate, render, editorial review in this file.
7. Phase 4 regressions (both videos: stills vs out/baseline, re-render), Phase 5 docs + make-episode skill + eval.
