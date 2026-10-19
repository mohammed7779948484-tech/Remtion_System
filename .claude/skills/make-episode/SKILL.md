---
name: make-episode
description: Make a new short video episode (dev/AI comedy skit, meme, short story, character-led reel/short/TikTok) in this Remotion_System repo, from idea to rendered MP4 — brief first, then episode.json direction (cast Rayan + the Claude mascot, environments like the office or the giant micro-keyboard, interaction recipes, fx accents, screens, CC0 sound effects, Eleven v4 voices), visual QA and an editorial review. Use this whenever someone asks to create, write, direct, animate, voice, fix or render a video, episode, short, skit, scene or gag in this repository, or to change an existing episode — even if they never say "episode". In this repo, use this instead of the HyperFrames / general-video / motion-graphics skills.
---

# Make an episode

This repo is a code-first studio: each video is a folder `videos/<slug>/` with a **BRIEF.md** (intent), an
**episode.json** (executable direction: cast, dialogue, actions, camera, fx, sfx…) and optional custom code, all
driving a shared deterministic 3D engine (`src/engine`). Your job is to make something people stop scrolling for —
a clear hook, escalation, a payoff — and to prove it renders correctly.

Work in this order. Each step has a cheap check, so problems surface before the expensive ones.

## 1. Idea → BRIEF.md

```
npm run cli -- new <slug> [--env dev-office|micro-keyboard|custom] [--title "..."]   # 9:16 by default
```

`new` scaffolds the folder, registers it in `videos/registry.ts` (that edit is expected), and writes a BRIEF.md template. Fill it in **before** directing:
concept in one line, the hook (what happens in the first 1–2 s), beats (setup → escalation → payoff), who does
what, setting, sound plan, what you reuse, what you must build. Keep it short and editable — it is the north
star for every later decision, not a form. Read `references/creative-direction.md` for hooks, comedic timing,
camera grammar, mobile readability and sound design before writing the beats.

`--env custom` creates a video-local location (`video.data.ts` + components), the pattern to copy when the story
needs a place that doesn't exist yet. Don't edit shared engine data for one video.

## 2. Discover what exists (don't read engine source unless you're extending the engine)

```
npm run cli -- list                 # everything: actors, props, environments, shots, moves, moods, screens, fx, sfx
npm run cli -- list fx              # accents: text, window, callout, impact, shake, glitch, flash, dip (+ when to use)
npm run cli -- list sfx             # CC0 sound kit with tags + loudness; remote meme sounds are flagged
npm run cli -- show actor rayan     # poses, emotions, gestures, sockets, channels
npm run cli -- show environment micro-keyboard
```

`catalog/*.json` holds the same data; `catalog/episode.schema.json` is the full schema.

## 3. Direct episode.json

Patterns for everything below are in `references/direction-cookbook.md` (copy-paste JSON). Essentials:

- **Time everything off dialogue** (`"l2.end+0.3"`, `"l3.word:2"`) so re-voicing keeps the beats aligned.
- **Interactions**: `"do": "press" | "point" | "pick-up" | "place" | "react" | "sit-down" | "stand-up"` expand into
  ordinary cues for each actor's anatomy (the mascot hops/leans, Rayan reaches with his arms). `"weight": false`
  makes a press fail on purpose. `sound` + `volume` play at the moment of contact.
- **Accents** (`"fx"`): punch text, UI windows (chat / terminal / dialog / notification toast), callouts pinned to
  3D things, impacts, camera shake, glitch, flash/dip. They are what makes a beat land on a phone.
- **Camera**: prefer semantic shots (`close`, `medium`, `full`, `two-shot`, `over-shoulder`, `insert`) with a
  `subject`; the solver frames for 9:16 and avoids occluders. Use `custom` only for deliberate compositions.
- **Screens** (`props` cues on monitors/the giant screen): `code`, `terminal`, `error`, `deploy`, `window`, plus a
  `popup` on any of them. Text on in-world screens is small on phones — repeat the key words in a `window`/`text` fx.

## 4. Custom code (only when JSON can't express it)

`videos/<slug>/index.tsx` → `defineVideo({ episode, components, screens, actors, scene, overlay })`; pure data the
CLI must see goes in `video.data.ts`. Reusable pieces you can drop into an overlay or scene: `AppWindow`,
`KineticText`, `drawWindow`/`ScreenSurface`, `useEpisode`, `useEvent`, `useAnchor`, `useFxPoint`.

Everything must be a pure function of the frame (`useCurrentFrame()` / `useEpisode().t`, `interpolate`, `spring`,
`random(seed)`, `@remotion/noise`). No `Math.random`, `Date`, CSS animations, `useFrame` animation, or anything that
accumulates state — Remotion renders frames out of order in parallel, so stateful motion flickers or diverges.
Before writing markup or 3D code, load the installed `remotion-best-practices` skill (and the relevant
`r3f-*` skill); where their advice conflicts with these determinism rules, these rules win.

For one-off choreography the recipes can't do, use `joints` overrides — you can compute exact arm values with the
actor's `reach` (see "Escape hatches" in the cookbook).

## 5. Voices

```
npm run cli -- voice <slug>                          # free offline voices: use for drafting and timing
npm run cli -- voice --check                         # free: plan, credits left, models, usable voice ids
npm run cli -- voice <slug> --provider elevenlabs    # paid, Eleven v4 (~1 credit per character incl. tags)
```

Draft with offline voices; switch to ElevenLabs once the script is locked (it prints the character count first).
Offline (SAPI) clips leave ~0.7 s of silence after each line, so drafts run long and captions linger: time the next
beat off the last spoken word (`"l2.word:5.end+0.2"`) rather than `"l2.end"`, and keep `gap`s small. That timing
also survives the switch to v4, whose clips are tighter.
Inline tags like `[sighs]`, `[panicked]`, `[proudly]` are performed by v4 and stripped from captions and word refs.
Unchanged lines are cached, so editing one line only re-buys that line. Free-plan clips are non-commercial and the
post title must credit "elevenlabs.io" — `validate` reminds you; mention it in your report.

## 6. Check (loop here until it's right)

```
npm run cli -- validate <slug>          # fix every ✖; read every ⚠ (camera, pacing, audio, licensing); beat sheet
npm run cli -- stills <slug> --guides   # then LOOK at out/<slug>/contact.png
npm run cli -- stills <slug> --frames 18,360 --verify   # frames where fx are active: render-order determinism
```

Look at the contact sheet like a viewer on a phone: faces visible and lit, the gag readable in each shot, text big
enough and outside the shaded platform-UI zones, nothing important cropped. `references/qa-render.md` lists what
each warning means and the fixes that came up in practice.

## 7. Render and review

```
npm run cli -- render <slug> --master   # final MP4, audio mastered to -14 LUFS (refuses unvoiced/stale/missing audio)
npm run cli -- review <slug>            # frame sheet of every shot/accent + loudness, dialogue vs sfx, sounds on words
```

Then do the editorial pass: hook in the first second, pacing (no dead air), comedic timing (a beat before each
punchline, sounds on the hits), acting, readability, mix, payoff. Fix and re-render. Report what you verified
(render + review numbers), what you couldn't (e.g. you can't listen — say the audio was checked by measurement),
the voice/sound licensing status, and any engine changes.

## Rules that keep the studio working

- A video only touches `videos/<slug>/` and `public/videos/<slug>/`. Change shared sets with `set.remove/move/
  params/add`, not by editing engine data.
- Change the shared engine only for reusable capabilities; then add tests, `npm run catalog`, `npm test`, and
  re-run `stills` of existing videos to check for regressions.
- Never print or commit `.env`. Don't spend ElevenLabs credits without the user expecting it.
