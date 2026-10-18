# Engine reference

`src/engine/index.ts` is the public API. Discovery data for agents is generated into `catalog/`
(`npm run catalog`): actor manifests, props, environments, camera shots/moves, moods, screens, sfx and
`episode.schema.json`. This document explains how the pieces fit and how to extend them.

## 1. Model

```
videos/<slug>/episode.json ─┐
public/videos/<slug>/voice.json (generated) ─┼─▶ resolveEpisode() ─▶ ResolvedEpisode (absolute seconds, serializable)
videos/<slug>/video.data.ts (optional) ─┘                         │
                                                                  ▼  per frame t = frame / fps (pure)
                                   evaluateScene(): actor channels · camera (layout + per-frame) · mood
                                                                  ▼
                       <EpisodePlayer>: ThreeCanvas (set, actors, lights, camera, post) + captions + audio
```

- `defineVideo({ episode, ... })` turns a folder into a Remotion composition. Its `calculateMetadata`
  fetches `voice.json` and resolves timing, so duration follows the voices.
- **Determinism**: every value on screen is a pure function of `t`. Cue transitions are recomputed from
  the cue history; idle motion uses seeded noise; mouths read precomputed envelopes; the camera's shot
  layout is computed once per shot and tracking uses a fixed time window over pure trajectories.
  `npm run cli -- stills <slug> --verify` renders frames in two different orders and compares bytes.

## 2. `episode.json`

Validated by zod (strict: unknown keys are errors). Abbreviated example:

```jsonc
{
  "$schema": "../../catalog/episode.schema.json",
  "id": "my-video", "title": "My Video",
  "format": { "preset": "landscape" },            // landscape 1920×1080 | portrait 1080×1920 | square; or width/height/fps
  "seed": "anything",                             // changes idle motion / blinks
  "set": {
    "environment": "dev-office",
    "remove": ["plant"], "move": { "desk": { "position": [0.2, 0, 0.6] } },
    "params": { "monitor-main": { "screen": { "preset": "code", "code": "…" } } },
    "add": [{ "id": "mug-2", "kind": "mug", "on": "desk", "position": [0.1, 0.76, 0] }],
    "shell": { "wall": "#3b2f4a" }, "marks": {}, "cameras": {}
  },
  "mood": "late-night",
  "cast": {
    "rayan":  { "actor": "rayan", "at": "chair-seat", "pose": "sit_typing", "appearance": { "jacketColor": "#22c55e" },
                "voice": { "system": "Microsoft David Desktop", "elevenlabs": { "voiceId": "…", "model": "eleven_multilingual_v2" } } },
    "claude": { "actor": "claude", "at": "desk-mascot", "scale": 1.6 }
  },
  "dialogue": [
    { "id": "l1", "speaker": "rayan", "text": "Okay. Final deploy.", "at": 2 },
    { "id": "l2", "speaker": "claude", "text": "Did you run the tests?", "gap": 0.5 }   // no `at`: follows previous line
  ],
  "actions": [
    { "at": "l2.word:3", "actor": "rayan", "look": "claude", "pose": "sit_idle", "emotion": "skeptical" },
    { "at": "l2.end+0.4", "actor": "rayan", "gesture": "facepalm", "speed": 0.8 },
    { "at": 6, "actor": "rayan", "move": { "to": "door", "speed": 1.2 } },
    { "at": 9, "actor": "rayan", "joints": { "elbowR.x": -2.2 }, "duration": 1, "transition": 0.2 },
    { "at": 9, "actor": "rayan", "hold": { "handR": "mug" } }
  ],
  "camera": [
    { "at": 0, "shot": "establishing", "move": "push-in" },
    { "at": "l1.start", "shot": "close", "subject": "rayan", "track": true },
    { "at": "l2.start", "shot": "over-shoulder", "subject": "claude", "over": "rayan", "rack": [{ "at": "l2.end", "to": "rayan" }] },
    { "at": 6, "shot": "full", "subject": "rayan", "follow": { "lag": 0.8 } },
    { "at": 9, "shot": "insert", "item": "monitor-main", "anchor": "screen" }
  ],
  "lighting": [{ "at": "l2.end", "mood": "red-alert", "transition": 0.2 }],
  "props":    [{ "at": "l2.end", "item": "monitor-main", "set": { "screen": { "preset": "error" } } }],
  "sfx":      [{ "at": "l2.end", "sound": "vine-boom", "volume": 0.6 }],      // library name | URL | file in public/videos/<id>/
  "music":    { "src": "music/bed.mp3", "volume": 0.3, "duck": 0.35 },
  "events":   [{ "at": "l2.end+1", "name": "title", "duration": 3, "data": { "text": "…" } }],
  "captions": { "style": "subtitle" },                                       // subtitle | pop | none
  "end": "l2.end+4"
}
```

**Time references**: a number (seconds), `"<line>.start"`, `"<line>.end"`, `"<line>.word:<n>"` (n-th word,
1-based, start) or `"<line>.word:<n>.end"`, each optionally `+0.3` / `-0.2`. Lines can only reference
earlier lines.

**Places / targets**: `[x,y,z]`, a set mark name (`chair-seat`, `door`…), a set item id (`monitor-main`,
`monitor-main.screen`), an actor (`claude`, `claude.face`), or `"camera"` (look into the lens).

**Actions** (any combination per entry): `pose`, `emotion`, `gesture` (+`speed`, `intensity`), `look`
(`null` = straight ahead), `move` (`to`, `speed|duration`, `face`: `path|keep|<deg>`; arriving at a mark
turns to its yaw), `turn` (deg or target), `hold` (`{ socket: item|null }`; a held set item hides from the
set), `joints` (precise channel overrides, see the actor manifest's `channels`; `mode: add` for offsets,
`duration` to release), `transition` (blend seconds).

**Camera shots**: `establishing` (`spot`), `wide`, `full`, `medium`, `close`, `two-shot`, `over-shoulder`
(`over`), `insert` (`item`, `anchor`), `custom` (`position`, `target`, `fov`). Modifiers: `angle` (deg around
the subject from its facing; + = its left), `height` (`eye|low|high|metres`), `size` (framing multiplier),
`distance`, `lens` (mm, short side) or `fov`, `offset` (`[x,y]` subject screen position), `roll`,
`move` (one or a list of `push-in`, `pull-out`, `truck`, `orbit`, `crane`, `handheld`, each with `amount`),
`track` / `follow` (`{ lag }`), `focus` (`auto|none|target`), `rack` (`[{at,to,duration}]`), `dof`
(`auto|off|{bokeh,range}`), `blend` (seconds, instead of a cut), `lock` (no corrections),
`allowOcclusion` (ids allowed in front).

## 3. Camera behaviour

- **Layout, once per shot**: from the subjects' anchors sampled across the whole shot, the shot size,
  lens and aspect ratio, it chooses side/angle, a distance that fits both the vertical and horizontal
  field of view (so 9:16 two-shots back off automatically), height and lead room.
- **Per frame**: aim, position and focus are recomputed at `t`. `track` pans/tilts to a subject smoothed
  over `[t-lag, t]`; `follow` also moves the camera body with a longer window. Moves are eased offsets over
  the shot. `blend` interpolates two pure shot evaluations.
- **Corrections only fill gaps**: occluders (walls, solid props, other actors) and set bounds can change
  the angle, distance or lens *only when you didn't author them*. Authored values and `lock: true` are kept
  and `validate` reports the problem instead.
- **DOF** follows the speaking subject's face (`focus: auto`) on close/medium/OTS/insert shots; wide shots
  are sharp. Post stack: DepthOfField, Bloom, Vignette, Neutral tone mapping, MSAA.

## 4. Code escape hatches (inside the video folder)

```tsx
// videos/<slug>/index.tsx
import { defineVideo, useEpisode, useEvent, useAnchor, ScreenSurface } from "../../src/engine";
import episode from "./episode.json";
import data from "./video.data";               // optional: { environments, actorDefs, componentKinds }

const Billboard: React.FC = () => {             // extra 3D content (inside the canvas)
  const { t } = useEpisode();
  const hit = useEvent("boom");                 // { active, progress, local, data, started }
  return hit.active ? <mesh scale={1 + hit.progress}>…</mesh> : null;
};

export default defineVideo({
  episode, ...data,
  components: { neon_sign: NeonSign },          // custom set item kinds (place them with set.add)
  screens: { dashboard: drawDashboard },        // custom screen presets: { "preset": "dashboard" }
  actors: { robot: { def: robotDef, View: Robot } },
  scene: Billboard,                             // extra 3D
  overlay: TitleCard,                           // extra 2D (Remotion DOM, below captions)
});
```

Everything is also usable without the player: `evaluateActor(track, t)`, `<ActorView>`, `cameraAt`,
`<SetView>`, `<Lighting>`, `<PostFX>`, `ScreenSurface`.

## 5. Actors

Contract (`src/engine/actors/rig.ts`): an actor's state is a flat map of named **channels** it defines
itself (Rayan: joint angles + face; the mascot: squash, tilt, eye shapes). A definition provides `channels`
(rest/min/max), `poses`, `emotions`, `gestures` (absolute `set` blended by an envelope and/or additive `add(u)`),
`sockets`, `appearance`, framing `anchors(channels)` (`feet, waist, chest, head, face, top`) and
`life(channels, signals)` mapping breath, blinks, amplitude talk, look yaw/pitch and gait onto its channels.
Layering: placement/locomotion → pose → emotion → gestures → life → `joints` overrides.

**Add an actor**: `src/engine/actors/<id>/<id>.data.ts` (pure) + `<Id>.tsx` (R3F view taking `channels`,
`appearance`, `held`); register in `actors/defs.ts` and `actors/index.ts`; `npm run catalog && npm test`.
A one-off actor can live in a video folder instead (`actors` + `actorDefs` in `video.data.ts`).

## 6. Sets, props, screens, moods

- Environment = data (`world/<env>/<env>.data.ts`): `shell` (floor/walls), `items` (catalog kind, position,
  yaw, `on` parent, params), `marks`, camera `cameras`, `bounds`, `defaultMood`. Register in
  `world/environments.ts`. Brand-new locations for one video can be defined in its `video.data.ts`.
- Prop = catalog metadata (`world/props.data.ts`: size = occluder box, anchors, params) + view
  (`world/props.tsx`). Props get time-resolved params (`props` cues) and the mood's practical-light levels.
- Screens (`world/Screen.tsx`): canvas textures redrawn per frame by pure `draw(ctx, {t, since}, params)`;
  presets `code` (shiki-highlighted typing), `terminal`, `error`, `deploy`, `off`.
- Moods (`lighting/moods.ts`): data for key/fill/rim/ambient/hemi/fog/background/exposure/bloom/practicals,
  plus optional `pulse`. Inline moods: `{ "base": "late-night", "bloom": 1.2, … }`.

## 7. Voice, captions, sound

- `npm run cli -- voice <slug>` writes `public/videos/<slug>/voice/<line>-<hash>.wav` + `voice.json`
  (duration, words, 60 Hz envelope). Providers: `elevenlabs` (needs `ELEVENLABS_API_KEY` in `.env`;
  `with-timestamps` endpoint, wav_24000, character alignment → words), `system` (offline Windows SAPI with
  word timings), `fixture` (deterministic babble). Lines are cached by content hash; stale clips removed.
  Without a manifest, timing is estimated and Studio shows a warning.
- Mouths: **amplitude-driven stylized mouthing**, not phoneme lip-sync. A phoneme/viseme track (e.g. from
  Rhubarb) would be the upgrade: add it to `voice.json` and map it in an actor's `life`.
- Captions: word timings → `@remotion/captions` pages; styles `subtitle` (name tag + progressive words) and
  `pop` (big word-highlight).
- SFX: library names (`catalog/sfx.json`, hosted by Remotion), URLs, or files under `public/videos/<id>/`.
  An `sfx` entry with a `prompt` is generated by ElevenLabs into that path when a key is set.

## 8. Troubleshooting

- Blank 3D in exports but fine in Studio → something renders asynchronously; gate it with `delayRender`
  (see `ComposerGate` in `camera/Camera.tsx`).
- `stills --verify` reports differences → something depends on render order (state, async textures,
  `Math.random`). Scene state can be checked in Node with `evaluateScene` in both orders.
- Render timeout after sleep → re-run. Sparse `--frames` lists must be rendered `--props={"silent":true}`.
- Passes that render before the main render (reflections, render targets) read shadow maps from the
  previous frame → order-dependent pixels. Refresh shadows first with a negative-priority `useFrame`
  pre-render (`ShadowPrepass` in `videos/launch-promo/index.tsx`). Only render-order plumbing may use
  `useFrame`; never animate with it.
- Async textures (e.g. SMAA lookup images) make a tab's first frame differ — that's why the engine uses MSAA.
