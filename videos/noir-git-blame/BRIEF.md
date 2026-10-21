# git blame — brief

> Intent for this episode. episode.json and the code in this folder are the executable direction.

**Concept (one line):** A hard-boiled detective Claude investigates who killed production's login — and when
`git blame` points back at its own commit, it pins the murder on DNS.
**Platform / format:** 9:16 Shorts / Reels / TikTok · ~40 s (a two-hander with a narrator)
**Audience:** developers and AI-curious viewers. Jokes they recognise: "what changed?" / "nothing!", the usual
suspects (the intern, the cache, DNS), "it's always DNS", DNS propagation, `git blame`, an AI that "simplified" auth.

## Hook (0–2 s)
Thunder cracks on frame 1 and a lightning flash reveals a tiny detective in a fedora standing on a desk, seen from
the ceiling through a turning fan, venetian-blind shadows striping the room. A gravel voice: "Two a.m. Production
was dead." Genre, character and a murder question in under two seconds. Nobody expects film noir from the mascot.

## Beats
1. **Setup** — The door bursts open; Rayan, soaked, silhouetted in the doorway: "Somebody killed my login!"
   Claude, deadpan: "Easy, kid. What changed?" — "Nothing! I swear!" — V.O.: "Something always changes."
   (That line is the thesis: what changed is Claude's own commit.)
2. **Escalation (rule of three)** — "So I rounded up the usual suspects." One sustained move along the evidence board
   and its red string, mugshot by mugshot, a camera-flash pop on each and a red CLEARED stamp slammed after each alibi:
   - THE INTERN — "Clean. Only ever touched the README."
   - THE CACHE — "Couldn't remember a thing."
   - DNS — Rayan jabs a finger: "It's always DNS!" Claude: "Not this time, kid. DNS had an alibi… it was still
     propagating." (The DNS mugshot shows a loading spinner.)
3. **Twist** — "That left one place to look." The camera follows the loose end of the red string off the board,
   across the wall, to the CRT terminal on the desk. Claude hops on the keys: `git blame auth/login.ts`. One line is
   highlighted in Claude orange: `claude · 2 hours ago · return; // ✨ simplified auth`. V.O.: "…I knew that
   handwriting." Lightning, dolly zoom on its face, the music dies; only rain.
4. **Payoff** — Rayan: "Well? Who did it?" Claude turns to him in silence… "…DNS." Rayan, arms up: "I KNEW it! It's
   always DNS!" The jazz comes back. Insert: Claude hops out a commit — `git commit -m "fix: DNS issue"`.
   V.O.: "Case closed." Title card: **GIT BLAME** — *a Claude P.I. mystery*.

## Characters & performance
- **Claude (detective)**: tiny, armless, utterly serious. Acts with a slow head turn, narrowed eyes (skeptical), flat
  eyes (annoyed/deadpan), shock (huge eyes on the reveal), and hops on the keyboard to type. Wears a fedora. Its
  inner monologue (V.O.) and its spoken lines share one husky, gravel voice — the joke is the size mismatch.
- **Narrator**: Claude's inner voice — an invisible cast member (video-local actor) so the mascot's body doesn't
  "talk" during narration and the captions can label it.
- **Rayan (the client)**: comes in from the rain, panicked → defensive → eager → triumphant. Points at DNS, throws his
  arms up at "I KNEW it!". His jacket is muted for the noir palette.

## Setting & look
A custom location built in this folder: **Claude's P.I. office, 2:14 a.m.** Back wall with a venetian-blind window —
the key light (cold street light, later lightning) shines *through* the slats, so stripes fall across the desk, the
detective and Rayan's face. Rain streaks on the glass, a blinking red neon outside. Green banker's lamp = warm pool on
the desk. Frosted-glass door with mirrored lettering (CLAUDE · PRIVATE INVESTIGATOR). Cork evidence board with
polaroid mugshots and red string; the string's loose end runs to a CRT terminal. Ceiling fan turning. Wall clock at
2:14. Palette: blue-black and slate, with Claude's orange, the red string/stamps/neon and the lamp's green-gold as the
only colours. Camera: noir grammar — overhead through the fan, silhouettes, low angles on the tiny detective,
close-ups striped by blinds, a dutch tilt on the twist, one sustained dolly along the board, a dolly zoom on the reveal,
inserts on the terminal for information. Cuts on lines, 1–3 s, except the board move.
Planted clue for rewatches: the terminal in the opening shot already shows "claude pushed 1 commit · 2:12".

## Sound
- Voices: ElevenLabs Eleven v4 — a husky gravel voice for Claude + narrator, Liam for Rayan; audio tags for delivery.
- Music: Kevin MacLeod — "Night on the Docks (Sax)" for the opening/narration and "Bass Walker" (walking upright
  bass) under the investigation; cut to silence for the twist, back in on "I KNEW it!". CC BY 4.0 (credited).
- SFX: generated with ElevenLabs where the CC0 kit has nothing (rain on glass loop, thunder, door burst, wet steps,
  camera-flash pop, rubber stamp, CRT hum, neon buzz, mechanical keys, noir brass sting); CC0 kit for UI blips.
- Silence on purpose: the beat before "…DNS." (rain only).

## Reuse vs custom
Reused: engine (actors, camera solver, recipes `point`, fx `flash`/`shake`/`glitch`/`text`, captions, mix, master),
shared props (desk, mug, rug). Custom (this folder): the office environment and its components (walls with a window
opening, blinds, rain glass, neon, door, evidence board + string + mugshots + stamps, CRT terminal and its screens,
keyboard, banker's lamp, fan, clock, coat rack, fedora), the narrator actor, lightning and screen-glow lights, the end
card overlay, and a score edit built from the two tracks.

## Payoff check
The twist recontextualises "Something always changes" and the planted 2:12 commit; the lie calls back the meme the
episode itself had cleared ("DNS had an alibi"); the final commit message pollutes the history for the next
detective — the story is a loop (it started with `git blame`). Last image: the tiny detective tipping its fedora
in the blind-striped dark, then the title.
