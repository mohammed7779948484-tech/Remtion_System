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
| 3 Showcase slice | ✅ done | `videos/ctrl-z` (9:16, 31.3 s, Eleven v4, CC0 sfx, mastered −14.4 LUFS); editorial review below. |
| 4 Regressions | ✅ done | 111 tests, tsc clean; both originals validate; stills vs baseline: video 1 12/12 byte-identical, video 2 4/8 identical + 4 frames ≤4/255 on ≤89 px (known holo GPU noise); both MP4s re-rendered (30.4 s 16:9, 28.7 s 9:16, audio present) and reviewed. |
| 5 Docs + skill | ✅ done | `.claude/skills/make-episode/` (skill-creator), `CLAUDE.md` → `@AGENTS.md` + skill pointer; 2 eval rounds with fresh agents; feedback applied (log below). 118 tests, tsc clean. |

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

## Ctrl+Z — editorial / audiovisual review (final render, 9:16, 31.3 s)

Method: watched by frame sheets from the real MP4 (`review` sheet: every shot + accent), measured audio with
`review` (EBU R128, dialogue vs sfx, words). I can't listen, so delivery/tone judgments rely on the v4 timing data
(e.g. the 0.8 s performed sigh) and levels, not on hearing.

- **Hook (0–1 s)**: Rayan is in frame from frame 0, falling; CLACK + impact debris + shake at 0.48 s, "DEPLOYED." slams
  in at 0.55 s. Passes: motion, sound and a question within the first second.
- **Pacing**: a new beat every 1–3 s (beat sheet); the longest still stretch is Claude's sigh line (4.2 s), which is
  the deliberate pause before "Duck. Now." No dead-air warnings.
- **Comedic timing**: the useless hops get their own medium shot; glitch + error land 0.2 s after the second hop
  (beat of air before the failure); "Deploy succeeded" toast lands after the line ends, then face-in-hand 0.4 s later,
  then the title — reaction before title.
- **Acting**: readable emotions in the closes (shocked, skeptical, pleading, tired); point read from the side;
  crouch pick-up and carry; place presses CTRL; celebrate on success; face-in-hand payoff (joints override from `reach`).
- **Mobile readability**: slam text ~200 px; toast/dialog text ≈ 60–70 px at 1080 wide; callouts pinned to the
  keys; all key text outside the platform UI bands (`--guides`). Screen text in-world is decoration; the dialog
  repeats what matters.
- **Mix**: −14.4 LUFS integrated after `--master`, true peak −1.4 dBFS, 0 clipped samples; no sound lands on a word;
  all hits within +5 dB of dialogue (success jingle and the final key slam are the loudest, intentionally).
- **Payoff**: "Oh, and I redeployed it for you." → green "✓ LIVE" + toast → face in hand under the CTRL+Z title,
  ends ~1.7 s later.
- **Fixed during review**: empty first 0.3 s (fall started too high), tiny hops in a wide two-shot, pointing
  foreshortened toward the lens, head cropped in the carry shot, facepalm not reaching the face standing (shared
  gesture is tuned for seated), notification pings on words, three hits 6–8 dB over the voices, −18 LUFS loudness,
  end title covering the payoff face, duplicated popup on the giant screen.
- **Known limits**: free-plan voices (non-commercial; credit elevenlabs.io); 1–2/255 render-order noise on ≤90 px of
  translucent dust/puff pixels (verified harmless).

## Phase 5 — make-episode skill and fresh-agent evals (2026-10-19)
- Skill created with skill-creator: `SKILL.md` (brief → discover → direct → custom code → voices → check → render +
  review) and references `creative-direction.md`, `direction-cookbook.md`, `qa-render.md`; `evals/evals.json` holds
  the two prompts and their assertions. `CLAUDE.md` imports `AGENTS.md` (one copy of the rules) and routes video
  requests to the skill rather than the global HyperFrames/video skills.
- Method: one fresh agent per prompt × {with skill, without skill}, each in its own git worktree (offline voices, no
  credits), graded by `grade.mjs` plus reading their BRIEF/episode/contact sheets. Workspace (gitignored):
  `.claude/skills/make-episode-workspace/`; viewer `out/skill-eval/review.html`.
- Round 1 was invalid for the cloud-stage prompt (worktrees cut from `main`, without V2); its findings were still fixed
  (commit c255a4b). Round 2 (worktrees on `v2`): with skill 24/24 assertions, without skill 23/24 (the baseline
  skipped the `sit-down` recipe). The objective assertions barely separate the two because AGENTS.md is already
  strong; the qualitative difference was in the briefs, hooks and QA loop. Both with-skill episodes were good; the
  office-css run reused `AppWindow` through `fx window` — the second real usage of the component.
- Round 2 feedback → fixes (commit 49247ba): `facepalm` and `sip` recipes (via the actor's `selfReach`, seated or
  standing; the mascot gets tired + head shake); stationary pick-up/place turn back; `validate` warns when a shot sees
  the back of its subject; same-speaker overlap ignores trailing silence; `shell.floor: "none"`; `stills --frames`
  writes `contact-frames.png`; `--verify` prints max difference and pixel count; `new` template opens on a close-up.
  Docs now state camera `angle`/`offset` semantics, custom-location facts (floor, shadowRadius, far plane 80 m,
  anchors from `size`, `useEvent`), walk-in-and-sit, SAPI rate/pauses; the wrong AGENTS.md facepalm gotcha is fixed.
- Check after the fixes: 118 tests, tsc clean, catalog regenerated; ctrl-z, it-works-on-my-machine and launch-promo
  validate with the same warnings as before, and their resolved episodes are byte-identical to the previous commit
  (render code for them is unchanged), so no re-render was needed.

## Next steps
- Rotate the ElevenLabs key (it appeared once in a local session log; never committed).
- Before monetizing: voice with a paid plan (free-plan clips stay non-commercial) and replace the remote meme sounds
  in the two V1 videos with kit sounds (`validate` lists them).
- Deferred from the plan: `floating-space` preset (`new --env custom` covers new worlds today), a 3D chat screen,
  music ducking.
- Optional: `render --master` the two V1 videos (−16.8 / −17.3 LUFS as originally mixed).
