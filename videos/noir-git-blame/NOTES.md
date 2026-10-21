# git blame — production notes

Production log for `videos/noir-git-blame/`: problems met while making the episode, what caused them, what was done
locally, and what the shared engine/tooling could change upstream. "Confirmed" = reproduced and traced to code;
"suspected" = consistent with the evidence but not proven.

Environment: Linux container, 4 vCPU, no GPU, Node 22, system ffmpeg 6, Remotion 4.0.536 (Chrome headless shell).

## How to run the CLI here

The shared CLI was built on Windows. On this Linux box two adapters are needed; both live in `tools/bin/npx`
(a shim put first on `PATH`), so nothing shared is modified:

```
PATH="$PWD/videos/noir-git-blame/tools/bin:$PATH" npm run cli -- stills noir-git-blame
```

---

## 1. `stills` / `preview` / `render --draft` fail: `--props` is not valid JSON (POSIX) — confirmed

- **Symptom:** `npm run cli -- stills noir-git-blame` → Remotion: "You passed --props but it was neither valid JSON
  nor a file path… Provided value: {silent:true}". Nothing renders.
- **Where:** every still/preview/draft render, whole episode.
- **Evidence:** the failing command line printed by the CLI contains `--props={"silent":true}`; Remotion receives
  `{silent:true}`.
- **Cause (confirmed):** `scripts/cli/shared.ts:29` (`SILENT`) and `scripts/cli/media.ts:128,154` (`draftProps`) build
  `--props={"silent":true}` for non-Windows and pass it to `spawnSync("npx", cmd, { shell: true })`
  (`scripts/cli/shared.ts:25`). `/bin/sh` removes the double quotes before Remotion sees the argument.
- **Local solution:** `tools/bin/npx` rewrites `--props={key:true|false}` back to valid JSON and execs the real `npx`.
- **Verification:** with the shim on `PATH`, `stills` renders and writes `contact.png`.
- **Suggested upstream fix:** on POSIX quote with single quotes (`--props='{"silent":true}'`), or call
  `spawnSync` without `shell: true` and pass the JSON as one argv element.

## 2. Headless Chrome cannot create a WebGL context (no GPU) — confirmed

- **Symptom:** `THREE.WebGLRenderer: A WebGL context could not be created … GL_VENDOR = Disabled` in every render tab.
- **Cause (confirmed):** `remotion.config.ts` sets `Config.setChromiumOpenGlRenderer("angle")`, which needs a GPU
  (fine on the Windows/macOS machines the repo was built on). This container has none.
- **Local solution:** the same `tools/bin/npx` shim appends `--gl=swangle` (ANGLE on SwiftShader, CPU) to
  `remotion render|still` calls unless a `--gl` flag is present (`NOIR_GL=<backend>` overrides). A direct
  `npx remotion still … --gl=swangle` rendered a correct frame in ~11 s including bundling.
- **Consequence:** software rendering is slower than a GPU; it is deterministic (see the `--verify` results below).
- **Suggested upstream fix:** choose the GL backend by platform/GPU availability (e.g. `swangle` on Linux without
  `/dev/dri`), or read it from an env var in `remotion.config.ts`.

## 3. Shared `dust_motes` render as large squares under SwiftShader — confirmed (visual)

- **Symptom:** bright square sprites tens of pixels wide floating over the board (first test still, frame 75).
- **Cause (suspected):** `THREE.Points` with a large `size` in SwiftShader; point sprites without a round alpha map
  render as squares. Not investigated further.
- **Local solution:** the office doesn't use `dust_motes`.
- **Suggested upstream check:** render the micro-keyboard episodes with `--gl=swangle` and compare.

## 4. Numeric camera `height` is relative to the subject's face — documentation gap — confirmed

- **Symptom:** "close on Rayan, height 1.15" (meant as a camera 1.15 m above the floor, below his eyes) looked down
  on the top of his head (contact sheet, 4.8 s and 9.0 s).
- **Cause (confirmed):** `src/engine/camera/solve.ts` `heightRise`: a number means `face + h` metres. `docs/ENGINE.md`
  only says `height` (`eye|low|high|metres`).
- **Local solution:** Rayan's closes use `height: -0.25 / -0.3` (camera below his eye line = the detective's low POV).
- **Suggested upstream fix:** say "metres relative to the face" in ENGINE.md and the schema description.

## 5. Shared desk's glossy rounded edge shows a dotted highlight under the blind stripes — confirmed (visual)

- **Symptom:** a white dashed line along the desk's front edge in low shots (first contact sheet, 3.5 s).
- **Cause:** the key light is striped by the blinds; the shared desk top is a `RoundedBox` whose bevel catches a
  specular highlight in each lit stripe. Physically plausible, reads as an artifact.
- **Local solution:** a video-local `detective_desk` (rougher wood, square edge, green leather top) replaces the
  shared desk in this set. No shared code changed.
