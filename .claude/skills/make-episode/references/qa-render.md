# QA, rendering and review

## validate
Prints a beat sheet (everything in time order) and then:
- `✖` errors — must fix (unknown ids, bad time refs, cuts after `end`, parent cycles, missing audio files).
- `⚠ shot N … blocked / out of frame` — the camera can't see a face. Remove the authored `angle`/`distance`, or
  change `angle`, or add `allowOcclusion` if the foreground object is deliberate.
- `⚠ pacing:` — no hook in the first 1.5 s, or dead air > 1.5 s. Add a line, an action, a cut or a sound there.
- `⚠ voice clip is stale` / `no voice clip` — run `voice`; final renders refuse these.
- `⚠ free plan` / `unknown rights` — licensing notes for the report; prefer CC0 kit sounds.
- `⚠ … has no param …` / `unknown screen preset` — typo; the item would silently ignore it.
- `⚠ shot N … sees the back of <actor>` — that actor faces away from the camera mid-shot (looking at someone, turned by
  a recipe). Author an `angle`, add `look: "camera"`, or cut elsewhere.
- `~ accepted by intent: …` — a finding you marked as deliberate with `allow` (on the shot or the episode; intents:
  `npm run cli -- list direction`). Use it when the choice is creative — a long silence, a slow open, an exit from
  frame, a back-of-head shot — not to hide a mistake. Accepted findings stay in the output and go in your report.

## stills
`stills <slug> --guides` renders the middle of every shot into `out/<slug>/contact.png`, shading the vertical-video
UI zones. Use `--frames a,b,c` to look at accents (pick their `at` × 30 + a few frames); those go to
`contact-frames.png`, so the per-shot `contact.png` stays. Check:
- faces visible and lit; nobody cropped at the head; the subject of the beat is big enough to read
- text readable at thumbnail size and outside the shaded zones; no two overlays fighting for the same spot
- the gag reads without sound (a viewer scrolling muted)

`stills … --verify` renders the same frames in a second order and compares, printing the largest difference and how
many pixels differ. Byte-identical is normal; up to ~4/255 on a few hundred pixels of translucent things (dust, holo
screens, puffs) is known GPU noise. Anything bigger means
something depends on render order (state, `Math.random`, async content) — fix it.

## Fixes that came up in practice

| Symptom | Fix |
|---|---|
| Opening frame is empty (character still out of frame) | start the action earlier / closer; the hook must be visible at frame 0 |
| A gag happens in a wide shot where the actor is tiny | cut to a `medium` on that actor for the gag |
| Pointing/hand gestures disappear | shoot from the side the arm moves across (`angle` ±60–70), not along the lens |
| Custom shot crops the head | prefer a semantic shot (`full`, `medium`) with `angle` |
| Facepalm doesn't reach the face | `do: "facepalm"` (the stock `facepalm` gesture stops at chest height) |
| Back of a head in a shot | author `angle` or `look: "camera"` on that actor |
| A toast or caption covers a face | shot `offset: [0, -0.12]`, or move the accent (`position`, `width`) |
| Screen text too small on a phone | repeat it in a `window` or `text` accent |
| UI ping lands on a word | put it in a pause: `"lN.word:K.end+0.03"` |
| Hit much louder than voices (`review` ⚠) | `volume` 0.4–0.6 on that sound / recipe |
| Drafts run long / captions linger after lines | offline voices trail ~0.7 s of silence: time beats off `lN.word:K.end`, small `gap`s |
| Overlapping lines (negative gaps) hide caption words | don't overlap one speaker's lines; start the next line in the trailing silence instead |

## render
- `render <slug>` — final: refuses unvoiced/stale dialogue and missing files (also enforced inside plain
  `npx remotion render`). `--draft` renders with estimated timing/silence. `--master` normalises the soundtrack to
  -14 LUFS (true peak -1.5 dBTP) — use it for anything you'd post. `--timeout ms` for slow remote sounds.
- Renders take ~1–3 min for 30 s. If a render dies after the machine slept, re-run it.

## review (after render)
`review <slug>` writes `out/<slug>/review-sheet.png` (every shot + accent, from the real MP4) and prints loudness,
true peak, clipping, dialogue level vs each sound, and sounds that land on words. Then the editorial pass:

1. Hook: does the first second show and sound like something happened?
2. Pacing: any stretch where nothing changes? Shots ≤ ~3 s?
3. Timing: a beat before each punchline; sounds on contact; reactions cut in.
4. Acting: readable emotions; looks pointing at what matters.
5. Readability on a phone: text size, safe zones, faces.
6. Mix: voices on top; nothing clipping; loudness ≈ -14 LUFS after `--master`.
7. Payoff: lands, then the video ends quickly.

You can't listen to audio — say so and report the measured numbers instead.
