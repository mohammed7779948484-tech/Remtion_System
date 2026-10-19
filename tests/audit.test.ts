// Final-render audio readiness: drafts may be silent/estimated, final renders may not.
import { describe, expect, it } from "vitest";
import { auditAudio } from "../src/engine/audio/audit";
import { lineHash, type VoiceManifest } from "../src/engine/audio/speech";
import { resolveEpisode } from "../src/engine/core/timeline";

const castVoice = { system: "Microsoft David Desktop" };
const ep = {
  id: "t",
  title: "t",
  set: { environment: "dev-office" },
  cast: { rayan: { actor: "rayan", voice: castVoice } },
  dialogue: [{ id: "l1", speaker: "rayan", text: "Ship it." }],
  camera: [{ at: 0, shot: "establishing" }],
  sfx: [{ at: 1, sound: "sfx/pop.wav" }, { at: 2, sound: "https://example.com/boom.wav" }],
};
const manifest = (voice: object = castVoice): VoiceManifest => ({
  version: 1,
  lines: { l1: { file: "videos/t/voice/l1.wav", hash: lineHash("Ship it.", voice, "system"), provider: "system", text: "Ship it.", duration: 1, words: [], envelope: { rate: 60, values: [0] } } },
});
const all = () => true;

describe("auditAudio", () => {
  it("is clean when every line is voiced and every local file exists", () => {
    const a = auditAudio(resolveEpisode(ep, manifest()), all);
    expect(a.errors).toEqual([]);
    expect(a.files).toEqual(["videos/t/voice/l1.wav", "videos/t/sfx/pop.wav"]);
    expect(a.warnings.join()).toMatch(/1 remote sound\(s\).*example.com|boom.wav/);
  });

  it("blocks unvoiced lines (estimated timing would render silent)", () => {
    expect(auditAudio(resolveEpisode(ep, null), all).errors.join()).toMatch(/line l1: no voice clip/);
  });

  it("blocks clips made with other voice settings", () => {
    expect(auditAudio(resolveEpisode(ep, manifest({ system: "Microsoft Mark" })), all).errors.join()).toMatch(/line l1: voice clip is stale/);
  });

  it("blocks missing local dialogue and sfx files", () => {
    const a = auditAudio(resolveEpisode(ep, manifest()), (f) => !f.endsWith(".wav"));
    expect(a.errors).toEqual(["missing audio file public/videos/t/voice/l1.wav", "missing audio file public/videos/t/sfx/pop.wav"]);
  });
});
