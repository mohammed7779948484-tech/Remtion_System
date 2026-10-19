// Audio readiness of a resolved episode. Drafts (Studio, stills, `render --draft`) may play estimated
// timing and silence; a final render must not. Pure: the caller says which public/ files exist.
import type { ResolvedEpisode } from "../core/timeline";

export type AudioAudit = {
  /** Block a final render. */
  errors: string[];
  /** Worth reading, never blocking. */
  warnings: string[];
  /** Public-relative local files the episode plays. */
  files: string[];
};

const isRemote = (src: string) => /^https?:\/\//.test(src);

/** Missing files block drafts too: @remotion/media's <Audio> aborts any render on a 404. */
export const isMissingFile = (error: string) => error.startsWith("missing audio file");

export const auditAudio = (r: ResolvedEpisode, exists: (publicPath: string) => boolean): AudioAudit => {
  const errors: string[] = [];
  const warnings: string[] = [];
  const files: string[] = [];
  const voiceCmd = `npm run cli -- voice ${r.id}`;
  for (const l of r.lines) {
    if (!l.voiced) errors.push(`line ${l.id}: no voice clip (timing is estimated, it would be silent) — run \`${voiceCmd}\``);
    else if (l.stale) errors.push(`line ${l.id}: voice clip is stale (made with other voice settings) — run \`${voiceCmd}\``);
    if (l.file) files.push(l.file);
  }
  const sources = [...r.sfx.map((s, i) => ({ src: s.src, what: `sfx at ${s.at.toFixed(2)}s (#${i})` })), ...(r.music ? [{ src: r.music.src, what: "music" }] : [])];
  const remote = new Set<string>();
  for (const s of sources) {
    if (isRemote(s.src)) remote.add(s.src.replace(/^https?:\/\/[^/]+\//, ""));
    else files.push(s.src.replace(/^public\//, ""));
  }
  if (remote.size) warnings.push(`${remote.size} remote sound(s) are downloaded at render time (slow or offline renders can fail): ${[...remote].join(", ")}`);
  for (const f of new Set(files)) if (!exists(f)) errors.push(`missing audio file public/${f}`);
  return { errors, warnings, files: [...new Set(files)] };
};
