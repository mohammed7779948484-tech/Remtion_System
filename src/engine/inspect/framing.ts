// Framing: on every frame of every semantic shot, the subjects' faces are in frame and not turned
// away from the camera (using the final head turn, so looks count).
import { sourceOf } from "../core/trace";
import type { InspectContext } from "./context";
import { hitCollector, type Finding } from "./findings";

/** Shots that are authored compositions or have no faces to keep (checked by other means). */
const UNFRAMED = new Set(["custom", "establishing", "insert"]);

export const framingChecks = (ctx: InspectContext): Finding[] => {
  const out = hitCollector(ctx.fps);
  ctx.frames.forEach((fr, f) => {
    const k = ctx.shotOf[f];
    const shot = ctx.r.shots[k];
    if (!shot || UNFRAMED.has(shot.type) || shot.lock) return;
    const source = sourceOf(ctx.trace, shot);
    for (const id of shot.subjects) {
      const body = ctx.body(f, id);
      const anchors = ctx.frameOf(f, id)?.anchors;
      const face = body?.points.face ?? anchors?.face;
      const head = body?.points.head ?? anchors?.head;
      if (!face) continue;
      const s = ctx.toScreen(fr.camera, face);
      if (!s || Math.abs(s.ndc.x) > 1 || Math.abs(s.ndc.y) > 1) {
        out.add(f, {
          key: `offscreen:${k}:${id}`,
          check: "framing",
          kind: "face-offscreen",
          level: "warning",
          object: `${id}.face`,
          source,
          intent: "offscreen",
          accepted: ctx.accepted("offscreen", shot.allow),
          message: `${id}'s face is out of frame — loosen the size, add an offset, follow/track the subject, or cut`,
        });
        continue;
      }
      if (shot.type === "over-shoulder" || !head) continue;
      // Facing (head → face) against the direction to the camera, on the ground plane.
      const fx = face[0] - head[0];
      const fz = face[2] - head[2];
      const cx = fr.camera.position[0] - face[0];
      const cz = fr.camera.position[2] - face[2];
      const cos = (fx * cx + fz * cz) / Math.max(1e-6, Math.hypot(fx, fz) * Math.hypot(cx, cz));
      if (cos < -0.2)
        out.add(f, {
          key: `back:${k}:${id}`,
          check: "framing",
          kind: "back-of-head",
          level: "warning",
          object: id,
          source,
          intent: "back-of-head",
          accepted: ctx.accepted("back-of-head", shot.allow),
          measure: -cos,
          message: `the camera sees the back of ${id}'s head (it is looking/turned away) — author an \`angle\`, add \`look: "camera"\`, or cut elsewhere`,
        });
    }
  });
  return out.findings();
};
