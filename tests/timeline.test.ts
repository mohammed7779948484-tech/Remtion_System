import { describe, expect, it } from "vitest";
import type { VoiceManifest } from "../src/engine/audio/speech";
import { resolveEpisode } from "../src/engine/core/timeline";

const base = {
  id: "t",
  title: "t",
  set: { environment: "dev-office" },
  cast: { rayan: { actor: "rayan", at: "chair-seat", pose: "sit_typing" }, claude: { actor: "claude", at: "desk-mascot", scale: 1.5 } },
  dialogue: [
    { id: "l1", speaker: "rayan", text: "Okay. Final deploy." },
    { id: "l2", speaker: "claude", text: "Did you run the tests?" },
    { id: "l3", speaker: "rayan", text: "Tests are for people who doubt themselves.", at: "l2.end+0.5" },
  ],
  camera: [{ at: 0, shot: "establishing" }],
};

const voice: VoiceManifest = {
  version: 1,
  lines: {
    l1: { file: "videos/t/voice/l1.wav", hash: "x", provider: "fixture", text: "Okay. Final deploy.", duration: 2, words: [{ text: "Okay.", start: 0.1, end: 0.5 }, { text: "Final", start: 0.9, end: 1.2 }, { text: "deploy.", start: 1.25, end: 1.8 }], envelope: { rate: 60, values: [0, 1, 0] } },
    l2: { file: "videos/t/voice/l2.wav", hash: "y", provider: "fixture", text: "Did you run the tests?", duration: 1.5, words: [{ text: "Did", start: 0, end: 0.2 }, { text: "you", start: 0.25, end: 0.4 }, { text: "run", start: 0.45, end: 0.6 }, { text: "the", start: 0.65, end: 0.75 }, { text: "tests?", start: 0.8, end: 1.3 }], envelope: { rate: 60, values: [0, 1, 0] } },
  },
};

describe("resolveEpisode", () => {
  it("auto-times dialogue from voice durations and references", () => {
    const r = resolveEpisode(base, voice);
    const [l1, l2, l3] = r.lines;
    expect(l1.start).toBeCloseTo(0.6);
    expect(l1.end).toBeCloseTo(2.6);
    expect(l2.start).toBeCloseTo(2.95); // default 0.35 s gap
    expect(l3.start).toBeCloseTo(l2.end + 0.5);
    expect(l1.voiced && l2.voiced).toBe(true);
    expect(l3.voiced).toBe(false); // no clip yet → estimated
    expect(r.warnings.join()).toMatch(/no generated voice/);
  });

  it("resolves word references for actions and camera cuts", () => {
    const r = resolveEpisode(
      {
        ...base,
        actions: [{ at: "l2.word:5", actor: "rayan", emotion: "shocked" }],
        camera: [
          { at: 0, shot: "establishing" },
          { at: "l1.word:2-0.1", shot: "close", subject: "rayan" },
        ],
      },
      voice,
    );
    const rayan = r.actors.find((a) => a.id === "rayan")!;
    expect(rayan.emotions.at(-1)!.at).toBeCloseTo(2.95 + 0.8);
    expect(r.shots[1].at).toBeCloseTo(0.6 + 0.9 - 0.1);
    expect(r.shots[0].end).toBeCloseTo(r.shots[1].at);
  });

  it("places cast at marks and resolves look targets", () => {
    const r = resolveEpisode({ ...base, actions: [{ at: 1, actor: "rayan", look: "claude" }, { at: 2, actor: "claude", look: "monitor-main.screen" }] }, null);
    const rayan = r.actors.find((a) => a.id === "rayan")!;
    expect(rayan.start.position).toEqual([0, 0, -0.06]);
    expect(rayan.looks[0].target).toEqual({ actor: "claude", anchor: "face" });
    expect(Array.isArray(r.actors.find((a) => a.id === "claude")!.looks[0].target)).toBe(true);
  });

  it("reports every problem at once with helpful names", () => {
    const bad = {
      ...base,
      actions: [
        { at: 1, actor: "rayan", pose: "moonwalk" },
        { at: 1, actor: "nobody", emotion: "happy" },
        { at: "l9.start", actor: "claude", gesture: "spin" },
      ],
      camera: [{ at: 0, shot: "close", subject: "ghost" }],
    };
    let message = "";
    try {
      resolveEpisode(bad, null);
    } catch (e) {
      message = (e as Error).message;
    }
    for (const needle of ["4 problem", "moonwalk", "nobody", "l9", "ghost"]) expect(message).toContain(needle);
  });

  it("rejects unknown fields (typos) through the schema", () => {
    expect(() => resolveEpisode({ ...base, camera: [{ at: 0, shot: "close", subjct: "rayan" }] }, null)).toThrow(/subjct|Unrecognized/);
  });

  it("applies set overrides without touching the shared environment", () => {
    const r = resolveEpisode({ ...base, set: { environment: "dev-office", remove: ["plant"], move: { desk: { position: [1, 0, 1] } }, add: [{ id: "mug-2", kind: "mug", on: "desk", position: [0, 0.76, 0] }] } }, null);
    expect(r.layout.items.find((i) => i.id === "plant")).toBeUndefined();
    expect(r.layout.items.find((i) => i.id === "desk")!.position).toEqual([1, 0, 1]);
    expect(r.layout.items.find((i) => i.id === "mug-2")).toBeDefined();
    const again = resolveEpisode(base, null);
    expect(again.layout.items.find((i) => i.id === "plant")).toBeDefined();
    expect(again.layout.items.find((i) => i.id === "desk")!.position).toEqual([0, 0, 0.62]);
  });

  it("sets duration from `end` or the last cue", () => {
    expect(resolveEpisode({ ...base, end: 12 }, voice).durationInFrames).toBe(360);
    const r = resolveEpisode(base, voice);
    expect(r.duration).toBeCloseTo(r.lines[2].end + 1.5);
  });
});
