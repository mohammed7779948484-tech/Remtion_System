// Agent-facing CLI:  npm run cli -- <command> [...]
//   list [actors|props|environments|shots|moves|moods|screens|fx|sfx|videos]
//   show <actor|prop|environment|mood|screen> <id>
//   new <slug> [--preset portrait|landscape|square] [--env <environment>|custom] [--title "..."]  (writes BRIEF.md)
//   voice <slug> [--provider elevenlabs|system|fixture] [--force]   |   voice --check (free: plan, models, voices)
//   validate <slug>
//   stills <slug> [--frames 0,90,180] [--verify] [--guides]
//   render <slug> [--out out/<slug>.mp4] [--draft] [--master (loudness -14 LUFS)] [--timeout ms]
//   review <slug>   (after render: frame sheet of every shot/accent + loudness and mix balance)
//   catalog
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { auditAudio, isMissingFile } from "../src/engine/audio/audit";
import { cameraAt, project, shotLayout } from "../src/engine/camera/solve";
import { beatSheet, pacingNotes } from "../src/engine/core/pacing";
import { resolveEpisode, type ResolvedEpisode } from "../src/engine/core/timeline";
import { ENVIRONMENTS } from "../src/engine/world/environments";
import type { VideoData } from "../src/engine/player/defineVideo";
import { buildTracks, makeQuery } from "../src/engine/player/scene";
import { buildCatalog, writeCatalog } from "./catalog";
import { elevenLabsAccount, generateVoices, parseProvider, readManifest } from "./voice";

const ROOT = process.cwd();
if (fs.existsSync(path.join(ROOT, ".env"))) process.loadEnvFile(path.join(ROOT, ".env"));

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] ?? "" : undefined;
};
const has = (name: string) => args.includes(`--${name}`);
/** Flags that take no value (everything else consumes the next token). */
const BOOLEAN_FLAGS = ["--force", "--verify", "--draft", "--guides", "--check", "--master"];
const positional = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--") && !BOOLEAN_FLAGS.includes(args[i - 1])));

const fail = (msg: string): never => {
  console.error(`✖ ${msg}`);
  process.exit(1);
};
const npx = (cmd: string[]) => {
  const r = spawnSync("npx", cmd, { stdio: "inherit", shell: true, cwd: ROOT });
  if (r.status !== 0) fail(`npx ${cmd.join(" ")} failed`);
};
// Sparse --frames lists crash Remotion's inline audio mixing; stills don't need audio anyway.
const SILENT = process.platform === "win32" ? `--props="{\\"silent\\":true}"` : `--props={"silent":true}`;
const hasFfmpeg = () => spawnSync("ffmpeg", ["-version"], { shell: true }).status === 0;

const videoDir = (slug: string) => path.join(ROOT, "videos", slug);
const publicExists = (p: string) => fs.existsSync(path.join(ROOT, "public", p));
const loadVideo = async (slug: string) => {
  const dir = videoDir(slug);
  if (!fs.existsSync(path.join(dir, "episode.json"))) fail(`videos/${slug}/episode.json not found (npm run cli -- list videos)`);
  const episode = JSON.parse(fs.readFileSync(path.join(dir, "episode.json"), "utf8"));
  let data: VideoData = {};
  const dataFile = path.join(dir, "video.data.ts");
  if (fs.existsSync(dataFile)) {
    const mod = await import(pathToFileURL(dataFile).href);
    data = (mod.default?.default ?? mod.default ?? mod.data ?? {}) as VideoData;
  }
  const ctx = { environments: data.environments, actors: data.actorDefs, components: data.componentKinds ?? [], screens: data.screenKinds ?? [] };
  return { episode, ctx, manifest: readManifest(ROOT, slug) };
};

const resolve = async (slug: string): Promise<ResolvedEpisode> => {
  const { episode, ctx, manifest } = await loadVideo(slug);
  try {
    return resolveEpisode(episode, manifest, ctx);
  } catch (e) {
    return fail((e as Error).message);
  }
};

// ---------------------------------------------------------------- commands

const list = async () => {
  const kind = positional[1];
  const cat = buildCatalog() as Record<string, Record<string, unknown>>;
  const actors = Object.entries(cat).filter(([k]) => k.startsWith("actors/")).map(([, v]) => v as Record<string, Record<string, unknown> | string>);
  const sections: Record<string, () => void> = {
    actors: () => {
      for (const a of actors) {
        console.log(`\n${a.id} — ${a.description}`);
        console.log(`  poses:    ${Object.keys(a.poses).join(", ")}`);
        console.log(`  emotions: ${Object.keys(a.emotions).join(", ")}`);
        console.log(`  gestures: ${Object.keys(a.gestures).join(", ")}`);
        console.log(`  sockets:  ${Object.keys(a.sockets).join(", ")}   anchors: ${Object.keys(a.anchors).join(", ")}`);
      }
    },
    props: () => {
      for (const [id, p] of Object.entries(cat["props.json"] as Record<string, { description: string; params: Record<string, unknown> }>)) console.log(`  ${id.padEnd(14)} ${p.description}  [params: ${Object.keys(p.params).join(", ")}]`);
    },
    environments: () => {
      for (const [k, e] of Object.entries(cat).filter(([k]) => k.startsWith("environments/"))) {
        const env = e as { id: string; description: string; items: { id: string; kind: string }[]; marks: object; cameras: object };
        console.log(`\n${env.id} — ${env.description}  (${k})`);
        console.log(`  items:   ${env.items.map((i) => `${i.id}(${i.kind})`).join(", ")}`);
        console.log(`  marks:   ${Object.keys(env.marks).join(", ")}`);
        console.log(`  cameras: ${Object.keys(env.cameras).join(", ")}`);
      }
    },
    shots: () => Object.entries((cat["camera.json"] as { shots: Record<string, string> }).shots).forEach(([k, v]) => console.log(`  ${k.padEnd(14)} ${v}`)),
    moves: () => Object.entries((cat["camera.json"] as { moves: Record<string, string> }).moves).forEach(([k, v]) => console.log(`  ${k.padEnd(14)} ${v}`)),
    moods: () => Object.entries(cat["moods.json"] as Record<string, { description: string }>).forEach(([k, v]) => console.log(`  ${k.padEnd(14)} ${v.description}`)),
    screens: () => Object.entries(cat["screens.json"] as Record<string, { description: string; params: object }>).forEach(([k, v]) => console.log(`  ${k.padEnd(14)} ${v.description}  [${Object.keys(v.params).join(", ")}]`)),
    sfx: () => {
      const all = Object.entries(cat["sfx.json"] as Record<string, { license: string; tags: string[]; description: string; meanDb?: number }>);
      for (const [k, v] of all.filter(([, v]) => v.license !== "unknown")) console.log(`  ${k.padEnd(14)} ${v.description}  [${v.tags.join(", ")}]${v.meanDb !== undefined ? ` ${v.meanDb} dB` : ""}  ${v.license}`);
      console.log(`  remote, unknown rights (avoid in monetized work): ${all.filter(([, v]) => v.license === "unknown").map(([k]) => k).join(", ")}`);
    },
    fx: () => Object.entries(cat["fx.json"] as Record<string, { layer: string; description: string; pickWhen: string; params: string[] }>).forEach(([k, v]) => console.log(`  ${k.padEnd(9)} [${v.layer}] ${v.description}
            use for: ${v.pickWhen}
            params: ${v.params.join(", ")}`)),
    videos: () => fs.readdirSync(path.join(ROOT, "videos"), { withFileTypes: true }).filter((d) => d.isDirectory()).forEach((d) => console.log(`  ${d.name}`)),
  };
  if (kind && !sections[kind]) fail(`unknown list kind "${kind}" (${Object.keys(sections).join(", ")})`);
  for (const [name, fn] of Object.entries(sections)) {
    if (kind && kind !== name) continue;
    if (!kind) console.log(`\n== ${name} ==`);
    fn();
  }
  if (!kind) console.log(`\nDetails: npm run cli -- show actor rayan  |  catalog/*.json  |  docs/ENGINE.md`);
};

const show = () => {
  const [, kind, id] = positional;
  const cat = buildCatalog() as Record<string, Record<string, unknown>>;
  const key = kind === "actor" ? `actors/${id}.json` : kind === "environment" ? `environments/${id}.json` : null;
  const value = key ? cat[key] : kind === "prop" ? cat["props.json"][id] : kind === "mood" ? cat["moods.json"][id] : kind === "screen" ? cat["screens.json"][id] : kind === "fx" ? cat["fx.json"][id] : kind === "sfx" ? cat["sfx.json"][id] : undefined;
  if (!value) fail(`nothing for "${kind} ${id}" (kinds: actor, prop, environment, mood, screen, fx, sfx)`);
  console.log(JSON.stringify(value, null, 2));
};

const BRIEF = (title: string, preset: string, env: string) => `# ${title} — brief

> Write this before episode.json, keep it short, and update it as the idea changes. It is the intent;
> episode.json and custom code are the executable direction.

**Concept (one line):**
**Platform / format:** ${preset === "portrait" ? "9:16 Shorts / Reels / TikTok" : preset === "square" ? "1:1 feed" : "16:9 YouTube"} · target ~15–35 s
**Audience:** developers and AI-curious viewers

## Hook (0–2 s)
What stops the scroll in the first second? (visual surprise, a sound hit, a line that raises a question)

## Beats
1. Setup —
2. Escalation —
3. Twist / payoff —

## Characters & performance
- Rayan:
- Claude:

## Setting & look
Environment: \`${env}\`. Mood, key props, screens, camera style (cuts, inserts, moves), on-screen graphics.

## Sound
Voices (provider, tags like [laughs]), SFX hits on the jokes, music (or none), silence used on purpose.

## Reuse vs custom
Reused: environments / props / recipes / fx / sfx from the engine. Custom: anything new in this folder.

## Payoff check
Why would someone rewatch or share it? What is the last image?
`;

const CUSTOM_DATA = (slug: string) => `// Pure data for this video's own location (the CLI loads it for validate/stills). Edit freely:
// shell, items (catalog props or the custom kinds below), marks for the cast, camera spots, bounds.
import type { EnvironmentDef, VideoData } from "../../src/engine";

const stage: EnvironmentDef = {
  id: "${slug}-stage",
  description: "TODO: describe this place.",
  shell: { floor: "#1f2433", wall: "#151a26", trim: "#10141d", back: -3, left: -7, height: 5, walls: { back: false, left: false } },
  items: [{ id: "backdrop", kind: "backdrop", position: [0, 0, -2.6], size: [12, 5, 0.2] }],
  marks: {
    hero: { position: [-0.6, 0, 0], yaw: 15, description: "Main character spot" },
    sidekick: { position: [0.7, 0, 0.2], yaw: -20, description: "Second character spot" },
  },
  cameras: { wide: { position: [0, 1.6, 6.5], target: [0, 1.0, 0], fov: 40, description: "Whole stage" } },
  bounds: { min: [-6, 0.1, -2.4], max: [6, 5, 12] },
  defaultMood: "soft-studio",
};

const data: VideoData = { environments: { [stage.id]: stage }, componentKinds: ["backdrop"] };
export default data;
`;

const CUSTOM_INDEX = `import { defineVideo, type PropViewProps } from "../../src/engine";
import episode from "./episode.json";
import data from "./video.data";

// Custom set item kinds for this location (placed in video.data.ts). Animate only from props.t.
const Backdrop: React.FC<PropViewProps> = () => (
  <mesh position={[0, 2.5, 0]} receiveShadow>
    <boxGeometry args={[12, 5, 0.2]} />
    <meshStandardMaterial color="#232a3d" roughness={0.9} />
  </mesh>
);

// More escape hatches: screens (custom screen presets), actors, scene (extra 3D), overlay (extra 2D).
export default defineVideo({ episode, ...data, components: { backdrop: Backdrop } });
`;

const newVideo = () => {
  const slug = positional[1];
  if (!slug || !/^[a-z0-9][a-z0-9-]*$/.test(slug)) fail("usage: new <kebab-case-slug> [--preset portrait|landscape|square] [--env <environment>|custom] [--title ...]");
  const dir = videoDir(slug);
  if (fs.existsSync(dir)) fail(`videos/${slug} already exists`);
  const preset = flag("preset") ?? "portrait";
  if (!["portrait", "landscape", "square"].includes(preset)) fail(`unknown preset "${preset}"`);
  const envFlag = flag("env") ?? "dev-office";
  const custom = envFlag === "custom";
  const envId = custom ? `${slug}-stage` : envFlag;
  const env = custom ? null : ENVIRONMENTS[envId];
  if (!custom && !env) fail(`unknown environment "${envId}" (${Object.keys(ENVIRONMENTS).join(", ")}, or "custom" for a new location in the video folder)`);
  // Cast on the environment's first two marks: "seat"/"chair" marks get a seated pose; a mascot on a
  // raised mark (a desk, a key) stays small, on the floor it is scaled up to stand next to Rayan.
  const marks = custom ? [["hero", { position: [-0.6, 0, 0] }], ["sidekick", { position: [0.7, 0, 0.2] }]] : Object.entries(env!.marks);
  const [hero, partner] = [marks[0], marks[1]] as [string, { position: number[] }][];
  const seated = !!hero && /seat|chair/.test(hero[0]);
  const raised = !!partner && partner[1].position[1] > 0.3;
  fs.mkdirSync(dir, { recursive: true });
  const episode = {
    $schema: "../../catalog/episode.schema.json",
    id: slug,
    title: flag("title") ?? slug,
    format: { preset },
    set: { environment: envId },
    cast: {
      rayan: { actor: "rayan", at: hero?.[0] ?? [-0.6, 0, 0], pose: seated ? "sit_typing" : "stand_idle", voice: { system: "Microsoft David Desktop" } },
      claude: { actor: "claude", at: partner?.[0] ?? [0.7, 0, 0.2], scale: raised ? 1.5 : 4, voice: { system: "Microsoft Zira Desktop", pitch: "+30%" } },
    },
    dialogue: [
      { id: "l1", speaker: "rayan", text: "Hello world." },
      { id: "l2", speaker: "claude", text: "Hello, Rayan." },
    ],
    actions: [
      { at: "l1.start", actor: "claude", look: "rayan" },
      { at: "l2.start", actor: "rayan", look: "claude", emotion: "happy", ...(seated ? { pose: "sit_idle" } : {}) },
    ],
    camera: [
      { at: 0, shot: "close", subject: "rayan" },
      { at: "l1.end", shot: "medium", subject: "claude" },
      { at: "l2.start", shot: "over-shoulder", subject: "claude", over: "rayan" },
    ],
  };
  fs.writeFileSync(path.join(dir, "episode.json"), JSON.stringify(episode, null, 2) + "\n");
  fs.writeFileSync(path.join(dir, "BRIEF.md"), BRIEF(flag("title") ?? slug, preset, envId));
  if (custom) {
    fs.writeFileSync(path.join(dir, "video.data.ts"), CUSTOM_DATA(slug));
    fs.writeFileSync(path.join(dir, "index.tsx"), CUSTOM_INDEX);
  } else {
    fs.writeFileSync(
      path.join(dir, "index.tsx"),
      `import { defineVideo } from "../../src/engine";\nimport episode from "./episode.json";\n\n// Add custom code here: components (custom set items), screens, actors, scene, overlay.\nexport default defineVideo({ episode });\n`,
    );
  }
  const reg = path.join(ROOT, "videos", "registry.ts");
  const ident = slug.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase()).replace(/^[0-9]/, (c) => `v${c}`);
  let src = fs.readFileSync(reg, "utf8");
  src = src.replace(/(\nexport const VIDEOS)/, `import ${ident} from "./${slug}";\n$1`).replace(/(VIDEOS: VideoModule\[\] = \[)([^\]]*)\]/, (_, a: string, b: string) => `${a}${b.trim() ? `${b.trim()}, ` : ""}${ident}]`);
  fs.writeFileSync(reg, src);
  console.log(`✔ created videos/${slug}/ (BRIEF.md, episode.json, index.tsx${custom ? ", video.data.ts" : ""}) and registered it.`);
  console.log(`Next: fill BRIEF.md (hook, beats, payoff) → direct episode.json → npm run cli -- voice ${slug} → validate → stills → render`);
};

const voiceCheck = async () => {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) fail("ELEVENLABS_API_KEY is not set (put it in .env)");
  const a = await elevenLabsAccount(key!);
  console.log(`ElevenLabs plan: ${a.tier}${a.limit !== null ? ` — ${a.used}/${a.limit} credits used this period (${a.limit - (a.used ?? 0)} left)` : ""}`);
  const v4 = a.models.filter((m) => m.id.startsWith("eleven_v4"));
  console.log(`models: ${a.models.length} (${v4.length ? v4.map((m) => `${m.id}${m.tts ? " tts" : ""}${m.maxChars ? ` ≤${m.maxChars} chars` : ""}`).join(", ") : "no eleven_v4 model visible"})`);
  console.log(`voices usable by this key: ${a.voices.length}`);
  for (const v of a.voices) console.log(`  ${v.id}  ${v.name.padEnd(28)} ${v.category.padEnd(10)} ${Object.values(v.labels).join(", ")}`);
  for (const n of a.notes) console.log(`⚠ ${n}`);
  if (a.tier === "free") console.log("⚠ free plan: audio is non-commercial (also after upgrading) and published titles must credit elevenlabs.io");
};

const voice = async () => {
  if (has("check")) return voiceCheck();
  const slug = positional[1] ?? fail("usage: voice <slug> [--provider elevenlabs|system|fixture] [--force]  |  voice --check");
  const r = await generateVoices(slug, { provider: parseProvider(flag("provider")), force: has("force"), saveResponse: flag("save-response") });
  console.log(`✔ voice (${r.provider}): ${r.generated} generated, ${r.skipped} cached → public/videos/${slug}/voice.json`);
};

const validate = async () => {
  const slug = positional[1] ?? fail("usage: validate <slug>");
  const r = await resolve(slug);
  const problems: string[] = [];
  const notes: string[] = [...r.warnings, ...pacingNotes(r)];
  if (!fs.existsSync(path.join(videoDir(slug), "BRIEF.md"))) notes.push("no BRIEF.md: write the hook, beats and payoff before directing (npm run cli -- new writes a template)");
  // Missing files are errors even for drafts; unvoiced/stale lines only block final renders.
  const audio = auditAudio(r, publicExists);
  for (const e of audio.errors) (isMissingFile(e) ? problems : notes).push(e);
  notes.push(...audio.warnings);
  const manifest = readManifest(ROOT, slug);
  if (process.env.ELEVENLABS_API_KEY && manifest && Object.values(manifest.lines).some((l) => l.provider !== "elevenlabs")) notes.push("info: clips use offline voices; `voice <slug> --provider elevenlabs` would re-voice them (paid, changes timing)");

  const tracks = buildTracks(r);
  const q = makeQuery(r, tracks);
  const aspect = r.width / r.height;
  r.shots.forEach((shot, i) => {
    const label = `shot ${i} (${shot.type}${shot.subjects.length ? ` ${shot.subjects.join("+")}` : ""} @ ${shot.at.toFixed(2)}s)`;
    for (const w of shotLayout(shot, q).warnings) notes.push(`${label}: ${w}`);
    if (shot.type === "custom" || shot.type === "establishing" || shot.lock) return;
    const ids = shot.type === "insert" ? [] : shot.subjects;
    for (const u of [0.02, 0.5, 0.98]) {
      const t = shot.at + (shot.end - shot.at) * u;
      const f = cameraAt(r.shots, q, t);
      for (const id of ids) {
        const p = q.anchor(id, "face", t);
        if (!p) continue;
        const n = project(f, p, aspect);
        if (n.depth <= 0 || Math.abs(n.x) > 1 || Math.abs(n.y) > 1) notes.push(`${label}: ${id}'s face is out of frame at ${t.toFixed(2)}s`);
        // Back of the head: the body faces away from the camera (looks/turns during the shot change this).
        const head = q.anchor(id, "head", t);
        if (head && u === 0.5 && shot.type !== "over-shoulder") {
          const fx = p[0] - head[0];
          const fz = p[2] - head[2];
          const cx = f.position[0] - p[0];
          const cz = f.position[2] - p[2];
          const cos = (fx * cx + fz * cz) / Math.max(1e-6, Math.hypot(fx, fz) * Math.hypot(cx, cz));
          if (cos < -0.2) notes.push(`${label}: the camera sees the back of ${id} at ${t.toFixed(2)}s — author an \`angle\`, add \`look: "camera"\`, or cut elsewhere`);
        }
      }
    }
  });

  console.log(`${r.title} — ${r.width}×${r.height} @ ${r.fps}fps, ${r.duration.toFixed(2)}s (${r.durationInFrames} frames), ${r.shots.length} shots, ${r.lines.length} lines`);
  // Beat sheet: everything that happens, in time order (review pacing without rendering).
  for (const b of beatSheet(r)) console.log(`  ${b.at.toFixed(2).padStart(6)}${b.kind === "line" ? `–${b.end!.toFixed(2).padEnd(6)}` : " ".repeat(7)} ${b.kind.padEnd(6)} ${b.text}`);
  for (const n of notes) console.log(`⚠ ${n}`);
  for (const p of problems) console.log(`✖ ${p}`);
  if (problems.length) process.exit(1);
  console.log(`✔ ${slug} is valid${notes.length ? ` (${notes.length} warning${notes.length > 1 ? "s" : ""})` : ""}`);
  console.log(audio.errors.length ? `  final render: not ready (${audio.errors.length} audio issue${audio.errors.length > 1 ? "s" : ""} above); drafts: \`render ${slug} --draft\`` : "  final render: ready");
};

const stillFrames = (r: ResolvedEpisode) => {
  const custom = flag("frames");
  if (custom) return custom.split(",").map((s) => Number(s.trim()));
  const frames = r.shots.map((s) => Math.round(((s.at + s.end) / 2) * r.fps));
  return [...new Set(frames.map((f) => Math.min(r.durationInFrames - 1, Math.max(0, f))))].sort((a, b) => a - b);
};

const stills = async () => {
  const slug = positional[1] ?? fail("usage: stills <slug>");
  const r = await resolve(slug);
  const frames = stillFrames(r);
  const out = path.join("out", slug, "stills");
  fs.rmSync(path.join(ROOT, out), { recursive: true, force: true });
  npx(["remotion", "render", slug, out, "--sequence", `--frames=${frames.join(",")}`, "--image-format=png", SILENT, "--log=error"]);
  const files = fs.readdirSync(path.join(ROOT, out)).filter((f) => f.endsWith(".png")).sort();
  console.log(`✔ ${files.length} stills → ${out}/ (frames ${frames.join(", ")})`);
  if (hasFfmpeg() && files.length) {
    const tmp = path.join(ROOT, out, "_seq");
    fs.mkdirSync(tmp, { recursive: true });
    files.forEach((f, i) => fs.copyFileSync(path.join(ROOT, out, f), path.join(tmp, `${String(i).padStart(4, "0")}.png`)));
    const cols = Math.min(4, files.length);
    const rows = Math.ceil(files.length / cols);
    // Spot checks (--frames) get their own sheet so the one-per-shot contact.png stays intact.
    const sheet = path.join("out", slug, flag("frames") ? "contact-frames.png" : "contact.png");
    // --guides: shade where vertical-video platforms put their UI (top bar, caption/description area,
    // right-hand action rail) so faces, captions and titles can be checked against it.
    const guides = has("guides") && r.height > r.width ? "drawbox=x=0:y=0:w=iw:h=ih*0.10:color=red@0.3:t=fill,drawbox=x=0:y=ih*0.80:w=iw:h=ih*0.20:color=red@0.3:t=fill,drawbox=x=iw*0.86:y=ih*0.40:w=iw*0.14:h=ih*0.40:color=red@0.3:t=fill," : "";
    spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", path.join(tmp, "%04d.png"), "-vf", `"${guides}scale=480:-1,tile=${cols}x${rows}:padding=4:color=black"`, "-frames:v", "1", sheet], { stdio: "inherit", shell: true });
    fs.rmSync(tmp, { recursive: true, force: true });
    console.log(`✔ contact sheet → ${sheet} (shots in order, left→right, top→bottom)`);
  } else console.log("  (install ffmpeg on PATH for a contact sheet)");

  if (has("verify")) {
    // Re-render the same frames in a single tab, in order: a different visiting order than the parallel run.
    const vout = path.join("out", slug, "verify");
    fs.rmSync(path.join(ROOT, vout), { recursive: true, force: true });
    npx(["remotion", "render", slug, vout, "--sequence", `--frames=${frames.join(",")}`, "--image-format=png", SILENT, "--concurrency=1", "--log=error"]);
    let identical = 0;
    const diffs: string[] = [];
    for (const f of files) {
      const a = fs.readFileSync(path.join(ROOT, out, f));
      const b = fs.readFileSync(path.join(ROOT, vout, f));
      if (a.equals(b)) {
        identical++;
        continue;
      }
      const psnr = hasFfmpeg() ? spawnSync("ffmpeg", ["-hide_banner", "-i", path.join(out, f), "-i", path.join(vout, f), "-lavfi", "psnr", "-f", "null", "-"], { encoding: "utf8", shell: true }).stderr.match(/average:([\w.]+)/)?.[1] : "?";
      // How big and how widespread: max channel difference and number of differing pixels.
      const stat = (extra: string) =>
        hasFfmpeg() ? spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-i", path.join(out, f), "-i", path.join(vout, f), "-filter_complex", `"[0:v][1:v]blend=all_mode=difference,format=gray${extra},signalstats,metadata=mode=print:file=-"`, "-f", "null", "-"], { encoding: "utf8", shell: true }).stdout : "";
      const max = stat("").match(/YMAX=(\d+)/)?.[1] ?? "?";
      const frac = Number(stat(",geq=lum='gt(lum(X\,Y)\,0)*255'").match(/YAVG=([\d.]+)/)?.[1] ?? NaN);
      const px = Number.isNaN(frac) ? "?" : String(Math.round((frac / 255) * r.width * r.height));
      diffs.push(`${f}: PSNR ${psnr} dB, max difference ${max}/255 on ${px} pixels${Number(max) <= 4 ? " (harmless GPU noise)" : ""}`);
    }
    console.log(`✔ determinism: ${identical}/${files.length} frames byte-identical across render orders`);
    for (const d of diffs) console.log(`⚠ ${d}`);
    if (diffs.some((d) => /PSNR (\d+)/.test(d) && Number(/PSNR ([\d.]+)/.exec(d)![1]) < 45)) fail("frames differ between render orders");
  }
};

const render = async () => {
  const slug = positional[1] ?? fail("usage: render <slug> [--draft] [--out file] [--timeout ms]");
  const r = await resolve(slug); // fail fast on invalid direction
  const draft = has("draft");
  const audio = auditAudio(r, publicExists);
  for (const w of audio.warnings) console.log(`⚠ ${w}`);
  const blocking = draft ? audio.errors.filter(isMissingFile) : audio.errors;
  if (blocking.length) fail(`not ready for a ${draft ? "draft" : "final"} render:\n${blocking.map((e) => `  • ${e}`).join("\n")}${draft ? "" : "\n  (render a draft with --draft)"}`);
  const out = flag("out") ?? path.join("out", `${slug}${draft ? "-draft" : ""}.mp4`);
  const timeout = flag("timeout");
  const draftProps = process.platform === "win32" ? `--props="{\\"draft\\":true}"` : `--props={"draft":true}`;
  const master = has("master");
  const target = master ? out.replace(/\.mp4$/, ".unmastered.mp4") : out;
  npx(["remotion", "render", slug, target, "--log=info", ...(draft ? [draftProps] : []), ...(timeout ? [`--timeout=${timeout}`] : [])]);
  if (master) {
    // Social platforms normalise to about -14 LUFS: master the soundtrack there (two-pass loudnorm,
    // true peak -1.5 dBTP) and copy the video stream untouched.
    if (!hasFfmpeg()) fail("--master needs ffmpeg on PATH");
    const measure = spawnSync("ffmpeg", ["-hide_banner", "-i", target, "-af", "loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"], { cwd: ROOT, encoding: "utf8" }).stderr;
    const m = JSON.parse(measure.slice(measure.lastIndexOf("{"), measure.lastIndexOf("}") + 1)) as Record<string, string>;
    const af = `loudnorm=I=-14:TP=-1.5:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
    const r = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", target, "-c:v", "copy", "-af", af, "-ar", "48000", "-c:a", "aac", "-b:a", "256k", out], { cwd: ROOT, encoding: "utf8" });
    if (r.status !== 0) fail(`mastering failed: ${r.stderr}`);
    fs.rmSync(path.join(ROOT, target), { force: true });
    console.log(`✔ mastered to -14 LUFS (was ${m.input_i} LUFS, true peak ${m.input_tp} dBTP)`);
  }
  console.log(`✔ rendered ${out}${draft ? " (draft)" : ""}`);
};

/** Post-render review: a frame sheet of every shot/accent from the MP4, plus loudness and mix balance. */
const review = async () => {
  const slug = positional[1] ?? fail("usage: review <slug>   (after render)");
  const mp4 = flag("file") ?? path.join("out", `${slug}.mp4`);
  if (!fs.existsSync(path.join(ROOT, mp4))) fail(`${mp4} not found — run \`npm run cli -- render ${slug}\` first`);
  if (!hasFfmpeg()) fail("review needs ffmpeg on PATH");
  const r = await resolve(slug);
  const run = (a: string[]) => spawnSync("ffmpeg", a, { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 28 });

  // Frames: the middle of every shot and the peak of every screen accent, in time order.
  const times = [...new Set([...r.shots.map((s) => (s.at + s.end) / 2), ...r.fx.filter((f) => f.type !== "shake").map((f) => Math.min(f.end - 0.05, f.at + 0.35))].map((t) => Math.round(t * 10) / 10))].sort((a, b) => a - b);
  const dir = path.join("out", slug, "review");
  fs.rmSync(path.join(ROOT, dir), { recursive: true, force: true });
  fs.mkdirSync(path.join(ROOT, dir), { recursive: true });
  times.forEach((t, i) => run(["-v", "error", "-y", "-ss", String(t), "-i", mp4, "-frames:v", "1", "-vf", "scale=360:-1", path.join(dir, `${String(i).padStart(3, "0")}.png`)]));
  const cols = Math.min(6, times.length);
  run(["-v", "error", "-y", "-i", path.join(dir, "%03d.png"), "-filter_complex", `tile=${cols}x${Math.ceil(times.length / cols)}:padding=4`, "-frames:v", "1", path.join("out", slug, "review-sheet.png")]);
  console.log(`✔ review sheet → out/${slug}/review-sheet.png (${times.length} frames at ${times.map((t) => t.toFixed(1)).join(", ")} s)`);

  // Loudness (EBU R128) and true peak.
  const ebu = run(["-hide_banner", "-nostats", "-i", mp4, "-af", "ebur128=peak=true", "-f", "null", "-"]).stderr;
  const lufs = ebu.match(/I:\s+(-?[\d.]+) LUFS/g)?.at(-1)?.match(/-?[\d.]+/)?.[0];
  const tp = ebu.match(/Peak:\s+(-?[\d.]+) dBFS/g)?.at(-1)?.match(/-?[\d.]+/)?.[0];
  console.log(`loudness: ${lufs} LUFS integrated (social platforms normalise around -14), true peak ${tp} dBFS${Number(tp) > -1 ? "  ⚠ above -1 dBFS" : ""}`);

  // Mix: dialogue level over spoken words vs a 0.25 s window at each sound; sounds that land on words.
  const pcm = spawnSync("ffmpeg", ["-v", "error", "-i", mp4, "-ac", "1", "-ar", "16000", "-f", "s16le", "-"], { cwd: ROOT, maxBuffer: 1 << 28 }).stdout as Buffer;
  const sr = 16000;
  const n = pcm.length / 2;
  let clipped = 0;
  for (let i = 0; i < n; i++) if (Math.abs(pcm.readInt16LE(i * 2)) >= 32700) clipped++;
  const rms = (a: number, b: number) => {
    let s = 0;
    const i0 = Math.max(0, Math.floor(a * sr));
    const i1 = Math.min(n, Math.floor(b * sr));
    for (let i = i0; i < i1; i++) s += (pcm.readInt16LE(i * 2) / 32768) ** 2;
    return Math.sqrt(s / Math.max(1, i1 - i0));
  };
  const dB = (v: number) => 20 * Math.log10(Math.max(1e-9, v));
  const hits = r.sfx.map((s) => s.at);
  const words = r.lines.flatMap((l) => l.words.map((w) => ({ line: l.id, text: w.text, a: l.start + w.start, b: l.start + w.end })));
  const clean = words.filter((w) => !hits.some((h) => h > w.a - 0.35 && h < w.b + 0.05));
  const dialogue = clean.length ? Math.sqrt(clean.reduce((s, w) => s + rms(w.a, w.b) ** 2, 0) / clean.length) : 0;
  console.log(`clipped samples: ${clipped}${clipped ? "  ⚠" : ""}; dialogue level ${dialogue ? dB(dialogue).toFixed(1) : "—"} dBFS RMS`);
  for (const s of r.sfx) {
    const rel = dialogue ? dB(rms(s.at, s.at + 0.25)) - dB(dialogue) : NaN;
    const on = words.find((w) => s.at >= w.a - 0.05 && s.at <= w.b);
    const loud = rel > 6 ? "  ⚠ much louder than the voices" : "";
    console.log(`  ${s.src.replace(/^.*\//, "").padEnd(20)} @${s.at.toFixed(2).padStart(6)}s  ${Number.isNaN(rel) ? "" : `${rel >= 0 ? "+" : ""}${rel.toFixed(1)} dB vs dialogue`}${on ? `  ⚠ lands on "${on.text}" (${on.line})` : ""}${loud}`);
  }
  console.log("Now watch the MP4 with sound and write the editorial review (hook, pacing, timing, acting, readability, mix, payoff).");
};

const commands: Record<string, () => unknown> = {
  list,
  show,
  new: newVideo,
  voice,
  validate,
  stills,
  render,
  review,
  catalog: () => console.log(`✔ catalog/: ${writeCatalog().length} files`),
};

const cmd = positional[0];
if (!cmd || !commands[cmd]) {
  const header = fs.readFileSync(__filename, "utf8").split("\n");
  console.log(header.slice(0, header.findIndex((l) => !l.startsWith("//"))).join("\n").replace(/^\/\/ ?/gm, ""));
  process.exit(cmd ? 1 : 0);
}
Promise.resolve(commands[cmd]()).catch((e) => fail((e as Error).stack ?? String(e)));
