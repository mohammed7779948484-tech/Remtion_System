// Agent-facing CLI:  npm run cli -- <command> [...]
//   list [actors|props|environments|shots|moves|moods|screens|sfx|videos]
//   show <actor|prop|environment|mood|screen> <id>
//   new <slug> [--preset landscape|portrait|square] [--env dev-office] [--title "..."]
//   voice <slug> [--provider elevenlabs|system|fixture] [--force]
//   validate <slug>
//   stills <slug> [--frames 0,90,180] [--verify]
//   render <slug> [--out out/<slug>.mp4]
//   catalog
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { cameraAt, project, shotLayout } from "../src/engine/camera/solve";
import { resolveEpisode, type ResolvedEpisode } from "../src/engine/core/timeline";
import type { VideoData } from "../src/engine/player/defineVideo";
import { buildTracks, makeQuery } from "../src/engine/player/scene";
import { buildCatalog, writeCatalog } from "./catalog";
import { generateVoices, readManifest, type Provider } from "./voice";

const ROOT = process.cwd();
if (fs.existsSync(path.join(ROOT, ".env"))) process.loadEnvFile(path.join(ROOT, ".env"));

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] ?? "" : undefined;
};
const has = (name: string) => args.includes(`--${name}`);
const positional = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--") && !["--force", "--verify"].includes(args[i - 1])));

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
  const ctx = { environments: data.environments, actors: data.actorDefs, components: data.componentKinds ?? [] };
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
    sfx: () => console.log(`  ${Object.keys(cat["sfx.json"]).join(", ")}`),
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
  const value = key ? cat[key] : kind === "prop" ? cat["props.json"][id] : kind === "mood" ? cat["moods.json"][id] : kind === "screen" ? cat["screens.json"][id] : undefined;
  if (!value) fail(`nothing for "${kind} ${id}" (kinds: actor, prop, environment, mood, screen)`);
  console.log(JSON.stringify(value, null, 2));
};

const newVideo = () => {
  const slug = positional[1];
  if (!slug || !/^[a-z0-9][a-z0-9-]*$/.test(slug)) fail("usage: new <kebab-case-slug>");
  const dir = videoDir(slug);
  if (fs.existsSync(dir)) fail(`videos/${slug} already exists`);
  const preset = flag("preset") ?? "landscape";
  const env = flag("env") ?? "dev-office";
  fs.mkdirSync(dir, { recursive: true });
  const episode = {
    $schema: "../../catalog/episode.schema.json",
    id: slug,
    title: flag("title") ?? slug,
    format: { preset },
    set: { environment: env },
    cast: {
      rayan: { actor: "rayan", at: "chair-seat", pose: "sit_typing", voice: { system: "Microsoft David Desktop", elevenlabs: { voiceId: "JBFqnCBsd6RMkjVDRZzb" } } },
      claude: { actor: "claude", at: "desk-mascot", scale: 1.5, voice: { system: "Microsoft Zira Desktop", pitch: "+25%", elevenlabs: { voiceId: "EXAVITQu4vr4xnSDxMaL" } } },
    },
    dialogue: [
      { id: "l1", speaker: "rayan", text: "Hello world." },
      { id: "l2", speaker: "claude", text: "Hello, Rayan." },
    ],
    actions: [
      { at: "l1.start", actor: "claude", look: "rayan" },
      { at: "l2.start", actor: "rayan", look: "claude", pose: "sit_idle", emotion: "happy" },
    ],
    camera: [
      { at: 0, shot: "establishing" },
      { at: "l1.start", shot: "close", subject: "rayan" },
      { at: "l2.start", shot: "over-shoulder", subject: "claude", over: "rayan" },
    ],
  };
  fs.writeFileSync(path.join(dir, "episode.json"), JSON.stringify(episode, null, 2) + "\n");
  fs.writeFileSync(
    path.join(dir, "index.tsx"),
    `import { defineVideo } from "../../src/engine";\nimport episode from "./episode.json";\n\n// Add custom code here: components (custom set items), screens, actors, scene, overlay.\nexport default defineVideo({ episode });\n`,
  );
  const reg = path.join(ROOT, "videos", "registry.ts");
  const ident = slug.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase()).replace(/^[0-9]/, (c) => `v${c}`);
  let src = fs.readFileSync(reg, "utf8");
  src = src.replace(/(\nexport const VIDEOS)/, `import ${ident} from "./${slug}";\n$1`).replace(/(VIDEOS: VideoModule\[\] = \[)([^\]]*)\]/, (_, a: string, b: string) => `${a}${b.trim() ? `${b.trim()}, ` : ""}${ident}]`);
  fs.writeFileSync(reg, src);
  console.log(`✔ created videos/${slug}/ (episode.json, index.tsx) and registered it.\nNext: edit episode.json → npm run cli -- voice ${slug} → validate → stills → render`);
};

const voice = async () => {
  const slug = positional[1] ?? fail("usage: voice <slug>");
  const r = await generateVoices(slug, { provider: flag("provider") as Provider | undefined, force: has("force") });
  console.log(`✔ voice (${r.provider}): ${r.generated} generated, ${r.skipped} cached → public/videos/${slug}/voice.json`);
};

const validate = async () => {
  const slug = positional[1] ?? fail("usage: validate <slug>");
  const r = await resolve(slug);
  const problems: string[] = [];
  const notes: string[] = [...r.warnings];
  for (const l of r.lines) if (l.file && !fs.existsSync(path.join(ROOT, "public", l.file))) problems.push(`line ${l.id}: audio file missing (${l.file})`);
  for (const s of r.sfx) if (!/^https?:/.test(s.src) && !fs.existsSync(path.join(ROOT, "public", s.src))) problems.push(`sfx at ${s.at.toFixed(2)}s: file missing public/${s.src}`);
  const manifest = readManifest(ROOT, slug);
  if (process.env.ELEVENLABS_API_KEY && manifest && Object.values(manifest.lines).some((l) => l.provider !== "elevenlabs")) notes.push("ELEVENLABS_API_KEY is set but some clips use local voices — run `voice --provider elevenlabs` for final quality");

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
      }
    }
  });

  console.log(`${r.title} — ${r.width}×${r.height} @ ${r.fps}fps, ${r.duration.toFixed(2)}s (${r.durationInFrames} frames), ${r.shots.length} shots, ${r.lines.length} lines`);
  for (const l of r.lines) console.log(`  ${l.voiced ? "♪" : "·"} ${l.id.padEnd(6)} ${l.start.toFixed(2).padStart(6)}–${l.end.toFixed(2).padEnd(6)} ${l.speaker}: ${l.text}`);
  for (const n of notes) console.log(`⚠ ${n}`);
  for (const p of problems) console.log(`✖ ${p}`);
  if (problems.length) process.exit(1);
  console.log(`✔ ${slug} is valid${notes.length ? ` (${notes.length} warning${notes.length > 1 ? "s" : ""})` : ""}`);
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
    const sheet = path.join("out", slug, "contact.png");
    spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", path.join(tmp, "%04d.png"), "-vf", `scale=480:-1,tile=${cols}x${rows}:padding=4:color=black`, "-frames:v", "1", sheet], { stdio: "inherit", shell: true });
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
      diffs.push(`${f}: PSNR ${psnr} dB`);
    }
    console.log(`✔ determinism: ${identical}/${files.length} frames byte-identical across render orders`);
    for (const d of diffs) console.log(`⚠ ${d}`);
    if (diffs.some((d) => /PSNR (\d+)/.test(d) && Number(/PSNR ([\d.]+)/.exec(d)![1]) < 45)) fail("frames differ between render orders");
  }
};

const render = async () => {
  const slug = positional[1] ?? fail("usage: render <slug>");
  await resolve(slug); // fail fast on invalid direction
  const out = flag("out") ?? path.join("out", `${slug}.mp4`);
  npx(["remotion", "render", slug, out, "--log=info"]);
  console.log(`✔ rendered ${out}`);
};

const commands: Record<string, () => unknown> = {
  list,
  show,
  new: newVideo,
  voice,
  validate,
  stills,
  render,
  catalog: () => console.log(`✔ catalog/: ${writeCatalog().length} files`),
};

const cmd = positional[0];
if (!cmd || !commands[cmd]) {
  console.log(fs.readFileSync(__filename, "utf8").split("\n").filter((l) => l.startsWith("//")).slice(0, 10).join("\n").replace(/^\/\/ ?/gm, ""));
  process.exit(cmd ? 1 : 0);
}
Promise.resolve(commands[cmd]()).catch((e) => fail((e as Error).stack ?? String(e)));
