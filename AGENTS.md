# Remotion_System — video authoring guide (for coding agents)

A code-first studio for stylized low-poly 3D shorts: Remotion + React Three Fiber. Each video is a folder in
`videos/<slug>/` that **reuses** the shared engine (`src/engine`) and adds its own brief (`BRIEF.md`), direction
(`episode.json`) and, when needed, its own code. Full reference: `docs/ENGINE.md`.

**Making or changing a video?** Follow the workflow in `.claude/skills/make-episode/SKILL.md` (brief → direction →
voices → checks → render → review) and its `references/` (creative direction, JSON cookbook, QA). Videos in this
repo are made with this engine, not with other video frameworks.

## Commands

```
npm run cli -- list [actors|props|environments|shots|moves|moods|screens|fx|sfx|videos]
npm run cli -- show actor rayan            # or: prop giant_keyboard | environment micro-keyboard | mood macro-warm | screen window | fx callout | sfx key-slam
npm run cli -- new <slug> [--env dev-office|micro-keyboard|custom] [--preset portrait] [--title "..."]   # writes BRIEF.md; 9:16 default
npm run cli -- voice <slug>                          # free offline voices (drafts)
npm run cli -- voice --check                         # free: ElevenLabs plan, credits, models, voices
npm run cli -- voice <slug> --provider elevenlabs    # paid (Eleven v4); never implied by a key in .env
npm run cli -- validate <slug>                       # beat sheet, ✖ errors, ⚠ camera/pacing/audio/licensing
npm run cli -- stills <slug> [--frames 0,90] [--verify] [--guides]   # → out/<slug>/contact.png (--frames: contact-frames.png)
npm run cli -- render <slug> [--master] [--draft]    # → out/<slug>.mp4 (--master: -14 LUFS)
npm run cli -- review <slug>                         # after render: frame sheet + loudness/mix report
npm run dev        # Remotion Studio preview
npm test           # engine tests (determinism, camera, resolver, recipes, fx, voice, audit, catalog freshness)
npm run catalog    # regenerate catalog/ after changing the shared engine
```

## Rules

- **Isolation**: a video only touches `videos/<slug>/` and `public/videos/<slug>/`. Change the set with
  `set.remove / move / params / add` overrides, never by editing shared data. Import only from `src/engine`.
- **Change the shared engine only for reusable capabilities** (a new prop, pose, recipe, accent, mood, shot
  behaviour). Then: add/adjust tests, `npm run catalog`, `npm test`, and re-run `stills` of existing videos to check
  for regressions (byte-identical, or only harmless 1–3/255 GPU noise on translucent effects).
- **Determinism** (custom code too): everything must be a pure function of the frame. Use
  `useCurrentFrame()`/`useEpisode().t`, Remotion `interpolate`/`spring`/`random(seed)`, `@remotion/noise`.
  Never `Math.random`, `Date`, `useFrame` animation, damping/accumulation, or async-loaded content without
  `delayRender`. Postprocessing must stay non-temporal, and its effect set is fixed per episode.
- **Camera**: prefer semantic shots (`close`, `medium`, `over-shoulder`, `two-shot`, `insert`…) with a
  `subject`; the solver frames for the aspect ratio, avoids occluders and focuses. Anything you author
  (`angle`, `distance`, `lens`, `position`…) is used exactly — a blocked authored angle is reported, not fixed.
- **Secrets and cost**: never print or commit `.env`; paid ElevenLabs runs need `--provider elevenlabs`.
  Free-plan voice clips are non-commercial (credit "elevenlabs.io" in titles); prefer the CC0 sound kit.
- Mouths are amplitude-driven stylized mouthing (not phoneme lip-sync).

## Examples

- `videos/ctrl-z/` — 9:16 skit on the `micro-keyboard` world: brief, recipes (press/point/pick-up/place/react),
  accents (impact, shake, slam text, toast, callouts, glitch, dialog, end card), Eleven v4 voices, CC0 sounds.
- `videos/it-works-on-my-machine/` — 16:9 skit in the shared `dev-office` set; JSON direction plus one overlay.
- `videos/launch-promo/` — 9:16 promo on a **new location defined inside the video folder**
  (`video.data.ts` environment + custom stage components, holo-screen drawings, kinetic text overlays).

## Gotchas learned building the first videos

- Seated actors need seated poses (`sit_idle`, `sit_typing`, `sit_explaining`, `sit_arms_crossed`); standing
  poses bring standing legs. The stock `facepalm` gesture stops at chest height; for a palm on the face use the
  `do: "facepalm"` recipe (seated or standing). `do: "sip"` brings a held mug to the mouth.
- In `dev-office` the monitors sit at the seated actor's left and the mascot spot at their right: front-ish
  angles see faces; strong side angles get blocked (validate will tell you).
- The Claude mascot is ~0.27 m at scale 1; use `scale` 1.5–1.8 on a desk, ~2 on giant keys, ~4 standing next to Rayan.
- Gestures along the lens axis (pointing at the camera) vanish; shoot them from the side.
- If a render dies after the machine slept, just re-run it. Remote meme sounds download at render time.
- A subject whose head is turned away (e.g. looking at another actor) can face away from a solver-chosen
  camera: add `look: "camera"` or author an `angle`, then re-check the contact sheet.
- Effects that render extra passes before the main render (drei `MeshReflectorMaterial`) see last frame's
  shadow maps — see the `ShadowPrepass` in `videos/launch-promo/index.tsx`; confirm with `stills --verify`.
