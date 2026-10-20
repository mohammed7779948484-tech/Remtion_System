// Voice commands: generate/cache dialogue clips, and check the ElevenLabs account (free calls).
import { elevenLabsAccount, generateVoices, parseProvider } from "../voice";
import { fail, flag, has, positional } from "./shared";

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

export const voice = async () => {
  if (has("check")) return voiceCheck();
  const slug = positional[1] ?? fail("usage: voice <slug> [--provider elevenlabs|system|fixture] [--force]  |  voice --check");
  const r = await generateVoices(slug, { provider: parseProvider(flag("provider")), force: has("force"), saveResponse: flag("save-response") });
  console.log(`✔ voice (${r.provider}): ${r.generated} generated, ${r.skipped} cached → public/videos/${slug}/voice.json`);
};
