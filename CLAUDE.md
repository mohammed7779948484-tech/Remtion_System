# Remotion_System — video authoring guide (for agents)

A code-first studio for stylized low-poly 3D videos: Remotion + React Three Fiber. Each video is a
folder in `videos/<slug>/` that **reuses** the shared engine (`src/engine`) and adds its own direction
(`episode.json`) and, when needed, its own code. Full reference: `docs/ENGINE.md`.

## Commands

```
npm run cli -- list [actors|props|environments|shots|moves|moods|screens|sfx|videos]
npm run cli -- show actor rayan            # or: prop monitor | environment dev-office | mood late-night | screen code
npm run cli -- new <slug> [--preset portrait] [--env dev-office] [--title "..."]
npm run cli -- voice <slug> [--provider elevenlabs|system|fixture] [--force]
npm run cli -- validate <slug>
npm run cli -- stills <slug> [--frames 0,90] [--verify]   # → out/<slug>/contact.png
npm run cli -- render <slug>                             # → out/<slug>.mp4
npm run dev        # Remotion Studio preview
npm test           # engine tests (determinism, camera, resolver, voice, catalog freshness)
npm run catalog    # regenerate catalog/ after changing the shared engine
```

## Making a video

1. **Discover** what exists: `npm run cli -- list`, then `catalog/actors/*.json`, `catalog/environments/*.json`,
   `catalog/camera.json`. Don't read the 3D source files unless you are changing the engine.
2. **Scaffold**: `npm run cli -- new <slug>` (creates `episode.json` + `index.tsx`, registers in `videos/registry.ts`).
3. **Direct** in `episode.json` (schema: `catalog/episode.schema.json`): cast, dialogue, actions, camera,
   lighting, props/screens, sfx, events. Time anything off dialogue: `"l2.start"`, `"l2.end+0.3"`, `"l3.word:4"`.
4. **Custom code** when JSON isn't enough, all inside the video folder: `index.tsx` → `defineVideo({ episode,
   components, screens, actors, scene, overlay })`. Pure data the CLI must see (custom environments, actor
   definitions, custom item kind names) goes in `video.data.ts` and is spread into `defineVideo`.
5. **Voice**: `npm run cli -- voice <slug>` (ElevenLabs if `ELEVENLABS_API_KEY` is in `.env`, else offline
   Windows voices, else fixture babble). Re-run after editing dialogue; unchanged lines are cached.
6. **Check**: `validate` (fix every ✖; read every ⚠ — camera warnings mean blocked or out-of-frame shots),
   then `stills` and **look at `out/<slug>/contact.png`** (framing, faces visible, focus, lighting).
7. **Render**: `npm run cli -- render <slug>`; spot-check a few frames of the MP4.

## Rules

- **Isolation**: a video only touches `videos/<slug>/` and `public/videos/<slug>/`. Change the set with
  `set.remove / move / params / add` overrides, never by editing shared data. Import only from `src/engine`.
- **Change the shared engine only for reusable capabilities** (a new prop, pose, mood, shot behaviour).
  Then: add/adjust tests, `npm run catalog`, `npm test`, and re-run `stills` of existing videos to check
  for regressions.
- **Determinism** (custom code too): everything must be a pure function of the frame. Use
  `useCurrentFrame()`/`useEpisode().t`, Remotion `interpolate`/`spring`/`random(seed)`, `@remotion/noise`.
  Never `Math.random`, `Date`, `useFrame` animation, damping/accumulation, or async-loaded content without
  `delayRender`. Postprocessing must stay non-temporal.
- **Camera**: prefer semantic shots (`close`, `medium`, `over-shoulder`, `two-shot`, `insert`…) with a
  `subject`; the solver frames for the aspect ratio, avoids occluders and focuses. Anything you author
  (`angle`, `distance`, `lens`, `position`…) is used exactly — a blocked authored angle is reported, not
  fixed. Use `track`/`follow` for moving subjects.
- Mouths are amplitude-driven stylized mouthing (not phoneme lip-sync).

## Gotchas learned building the first videos

- Seated actors need seated poses (`sit_idle`, `sit_typing`, `sit_explaining`, `sit_arms_crossed`); standing
  poses bring standing legs. Gestures (`facepalm`, `nod`…) work in any pose.
- In `dev-office` the monitors sit at the seated actor's left and the mascot spot at their right: front-ish
  angles see faces; strong side angles get blocked (validate will tell you).
- The Claude mascot is ~0.27 m at scale 1; use `scale` 1.5–1.8 on a desk, ~4 standing next to Rayan.
- Remote sound effects (`sfx` library names) download at render time; very slow networks delay renders.
- If a render dies after the machine slept, just re-run it.
