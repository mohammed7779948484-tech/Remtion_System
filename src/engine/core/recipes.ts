// Interaction recipes: one `"do"` action expands, at resolve time, into the cues the engine already
// has (moves, poses, gestures, looks, joints overrides, holds, props cues, sfx). No new runtime layer:
// the result is ordinary direction data, so any frame still evaluates purely from t.
//
//   press      target "item.anchor"      stand on it → stomp/hop; otherwise a hand tap. weight:false = too light
//   point      target place/actor/item   look + straight arm (or a lean for armless actors)
//   pick-up    item                      walk close if needed, crouch, reach, hold in a hand (or on top)
//   place      target place              walk close, reach, release; a copy appears there (weight presses it)
//   react      target? (impact source)   flinch + shocked + look
//   sit-down   target seat mark          walk there, sit;   stand-up: back to standing (optionally walk off)
import { actorBase, type ActorDefinition, type ActorTrack, type Channels } from "../actors/rig";
import type { Layout, SetItem } from "../world/layout";
import type { EpisodeAction } from "./schema";
import type { Vec3 } from "./time";
import type { ResolvedActor } from "./timeline";

export type SubAction = Omit<EpisodeAction, "at" | "actor" | "do"> & { at: number };

export type RecipeHost = {
  ra: ResolvedActor;
  def: ActorDefinition;
  layout: Layout;
  where: string;
  /** Applies a sub-action exactly like an authored action. */
  apply: (sub: SubAction) => void;
  /** World point of a place reference at time `at` (item[.anchor], actor[.anchor], mark or [x,y,z]). */
  pointOf: (ref: Vec3 | string, at: number) => Vec3 | null;
  /** How to press "item.anchor" (props cue builder + key travel), or null if it isn't pressable. */
  pressable: (ref: string) => { item: string; set: (down: boolean) => Record<string, unknown>; travel: number } | null;
  addProp: (at: number, item: string, set: Record<string, unknown>) => void;
  addSfx: (at: number, sound: string) => void;
  addItem: (item: SetItem) => void;
  error: (msg: string) => void;
};

const sorted = <T extends { at: number }>(xs: T[]) => [...xs].sort((a, b) => a.at - b.at);

/** The actor's evaluated base (placement + layered channels) at t, from the cues gathered so far. */
export const baseAt = (ra: ResolvedActor, def: ActorDefinition, t: number) => {
  const track: ActorTrack = {
    id: ra.id,
    def,
    seed: ra.id,
    scale: ra.scale,
    start: ra.start,
    poses: sorted(ra.poses),
    emotions: sorted(ra.emotions),
    gestures: sorted(ra.gestures),
    looks: sorted(ra.looks),
    moves: sorted(ra.moves),
    turns: sorted(ra.turns),
    overrides: sorted(ra.overrides),
    holds: sorted(ra.holds),
  };
  return actorBase(track, t);
};

/** World point → actor root-local, unscaled (inverse of rig.localToWorld). */
const toLocal = (b: ReturnType<typeof baseAt>, scale: number, p: Vec3): Vec3 => {
  const c = Math.cos(b.placement.yaw);
  const s = Math.sin(b.placement.yaw);
  const dx = p[0] - b.placement.position[0];
  const dz = p[2] - b.placement.position[2];
  return [(dx * c - dz * s) / scale, (p[1] - b.placement.position[1]) / scale, (dx * s + dz * c) / scale];
};

const handSockets = (def: ActorDefinition) => ["handR", "handL"].filter((s) => def.sockets[s]);
const sideOf = (local: Vec3): "L" | "R" => (local[0] > 0 ? "L" : "R");

/** Joint values that reach `point` at time `at` (null when the actor has no reach). */
const reachAt = (h: RecipeHost, at: number, point: Vec3, side?: "L" | "R") => {
  if (!h.def.reach) return null;
  const b = baseAt(h.ra, h.def, at);
  const local = toLocal(b, h.ra.scale, point);
  const s = side ?? sideOf(local);
  return { side: s, ...h.def.reach(b.layered, local, s) };
};

/** Walks next to `point` (if farther than `reach`) and returns the arrival time. */
const approach = (h: RecipeHost, t: number, point: Vec3, reach: number): number => {
  const b = baseAt(h.ra, h.def, t);
  const [px, py, pz] = b.placement.position;
  const dx = point[0] - px;
  const dz = point[2] - pz;
  const dist = Math.hypot(dx, dz);
  if (dist <= reach) {
    h.apply({ at: t, turn: point, transition: 0.25 });
    return t + 0.2;
  }
  const k = (dist - reach * 0.85) / dist;
  const to: Vec3 = [px + dx * k, py, pz + dz * k];
  const duration = Math.max(0.35, (dist - reach * 0.85) / (h.def.walk.speed * h.ra.scale * 1.3));
  h.apply({ at: t, move: { to, duration } });
  h.apply({ at: t + duration - 0.1, turn: point, transition: 0.2 });
  return t + duration + 0.05;
};

const poseAt = (ra: ResolvedActor, def: ActorDefinition, t: number) => sorted(ra.poses).filter((p) => p.at <= t).at(-1)?.pose ?? def.defaultPose;
const heldAt = (ra: ResolvedActor, socket: string, t: number) => sorted(ra.holds).filter((x) => x.at <= t && x.socket === socket).at(-1)?.item ?? null;

/** Expands one `do` action. Returns the time the interaction is finished. */
export const expandRecipe = (a: EpisodeAction, t: number, h: RecipeHost): number => {
  const def = h.def;
  const g = def.recipeGestures ?? {};
  const scale = h.ra.scale;
  const humanoidReach = 0.55 * scale;

  switch (a.do) {
    case "press": {
      if (typeof a.target !== "string") return h.error(`${h.where}: press needs a target "item.anchor" (e.g. "keyboard.key:ctrl")`), t;
      const point = h.pointOf(a.target, t);
      if (!point) return t;
      const press = h.pressable(a.target);
      const weight = a.weight !== false;
      const b = baseAt(h.ra, def, t);
      const [px, py, pz] = b.placement.position;
      const standing = Math.hypot(point[0] - px, point[2] - pz) < 0.6 * scale && Math.abs(point[1] - py) < 0.35 * scale;
      let contact: number;
      if (standing || !def.reach) {
        // Stomp (humanoid) or hop (mascot) on the thing underfoot.
        const gesture = g.stomp ?? "hop";
        const gd = def.gestures[gesture];
        if (!gd) return h.error(`${h.where}: ${def.id} has no "${gesture}" gesture for press`), t;
        const speed = a.speed ?? 1;
        contact = t + (gd.duration / speed) * (g.stompContact ?? 0.5);
        h.apply({ at: t, gesture, speed });
        if (weight && press && standing) h.apply({ at: contact, move: { to: [px, py - press.travel, pz], duration: 0.07, face: "keep" } });
      } else {
        // Hand tap.
        const r = reachAt(h, t, [point[0], point[1] + 0.04, point[2]]);
        contact = t + 0.28;
        if (r) h.apply({ at: t, look: point, joints: r.set, duration: 0.28 + (a.duration ?? 0.3), transition: 0.2 });
      }
      if (weight && press) {
        h.addProp(contact, press.item, press.set(true));
        if (a.duration !== undefined) {
          h.addProp(contact + a.duration, press.item, press.set(false));
          if (standing) h.apply({ at: contact + a.duration, move: { to: [px, py, pz], duration: 0.1, face: "keep" } });
        }
      }
      if (a.sound) h.addSfx(contact, a.sound);
      return contact + (a.duration ?? 0.3);
    }

    case "point": {
      if (a.target === undefined) return h.error(`${h.where}: point needs a target`), t;
      const point = h.pointOf(a.target, t);
      if (!point) return t;
      const hold = a.duration ?? 1.2;
      h.apply({ at: t, look: point, transition: 0.2 });
      const r = reachAt(h, t, point);
      if (r) h.apply({ at: t, joints: r.set, duration: hold, transition: 0.22 });
      if (a.sound) h.addSfx(t, a.sound);
      return t + hold;
    }

    case "pick-up": {
      const item = a.item ?? (typeof a.target === "string" ? a.target.split(".")[0] : undefined);
      if (!item || !h.layout.items.some((i) => i.id === item)) return h.error(`${h.where}: pick-up needs a set "item" (got ${item ?? "none"})`), t;
      const center = h.pointOf(`${item}.center`, t)!;
      const top = h.pointOf(`${item}.top`, t) ?? center;
      const grip: Vec3 = [center[0], center[1] + (top[1] - center[1]) * 0.6, center[2]];
      const sockets = handSockets(def);
      if (!sockets.length) {
        // Armless: hop and balance it on top.
        const tA = approach(h, t, center, 0.2 * scale);
        const socket = def.sockets.top ? "top" : Object.keys(def.sockets)[0];
        h.apply({ at: tA, gesture: g.stomp ?? "hop", look: grip });
        h.apply({ at: tA + 0.35, hold: { [socket]: item } });
        return tA + 0.7;
      }
      const tA = approach(h, t, center, humanoidReach);
      const before = poseAt(h.ra, def, tA);
      const low = grip[1] - baseAt(h.ra, def, tA).placement.position[1] < 0.9 * scale;
      h.apply({ at: tA, look: grip, transition: 0.2 });
      if (low && g.crouchPose) h.apply({ at: tA, pose: g.crouchPose, transition: 0.32 });
      const r = reachAt(h, tA + 0.32, grip, a.hand === "handL" ? "L" : a.hand === "handR" ? "R" : undefined);
      const socket = a.hand ?? (r?.side === "L" ? "handL" : "handR");
      const contact = tA + 0.45;
      if (r) h.apply({ at: tA + 0.08, joints: r.set, duration: 0.5, transition: 0.3 });
      h.apply({ at: contact, hold: { [socket]: item } });
      if (low && g.crouchPose) h.apply({ at: contact + 0.15, pose: before, transition: 0.35 });
      h.apply({ at: contact + 0.3, look: null, transition: 0.3 });
      if (a.sound) h.addSfx(contact, a.sound);
      return contact + 0.5;
    }

    case "place": {
      if (a.target === undefined) return h.error(`${h.where}: place needs a target`), t;
      const sockets = [...handSockets(def), ...Object.keys(def.sockets)];
      const socket = a.hand ?? sockets.find((s) => heldAt(h.ra, s, t));
      const item = a.item ?? (socket ? heldAt(h.ra, socket, t) : null);
      if (!socket || !item) return h.error(`${h.where}: place: ${h.ra.id} isn't holding anything at ${t.toFixed(2)}s (pick-up first or give "item"/"hand")`), t;
      const point = h.pointOf(a.target, t);
      if (!point) return t;
      const press = typeof a.target === "string" ? h.pressable(a.target) : null;
      const weight = !!press && a.weight !== false;
      const rest: Vec3 = [point[0], point[1] - (weight ? press!.travel : 0), point[2]];
      const tA = approach(h, t, point, handSockets(def).length ? humanoidReach : 0.2 * scale);
      const before = poseAt(h.ra, def, tA);
      const low = point[1] - baseAt(h.ra, def, tA).placement.position[1] < 0.9 * scale;
      h.apply({ at: tA, look: point, transition: 0.2 });
      if (low && g.crouchPose && handSockets(def).length) h.apply({ at: tA, pose: g.crouchPose, transition: 0.32 });
      const r = handSockets(def).includes(socket) ? reachAt(h, tA + 0.32, [point[0], point[1] + 0.12, point[2]], socket === "handL" ? "L" : "R") : null;
      const contact = tA + 0.45;
      if (r) h.apply({ at: tA + 0.08, joints: r.set, duration: 0.5, transition: 0.3 });
      h.apply({ at: contact, hold: { [socket]: null } });
      if (low && g.crouchPose && handSockets(def).length) h.apply({ at: contact + 0.15, pose: before, transition: 0.35 });
      h.apply({ at: contact + 0.3, look: null, transition: 0.3 });
      // The carried item stays gone; a copy (hidden until now) appears where it was put down.
      const original = h.layout.items.find((i) => i.id === item);
      const copyId = `${item}@${h.ra.id}-${contact.toFixed(2)}`;
      h.addItem({ id: copyId, kind: original?.kind ?? item, position: rest, rotation: a.rotation ?? original?.rotation, scale: original?.scale, params: { ...(original?.params ?? {}), visible: false } });
      h.addProp(contact, copyId, { visible: true });
      if (original) h.addProp(contact, item, { visible: false });
      if (weight) h.addProp(contact + 0.05, press!.item, press!.set(true));
      if (a.sound) h.addSfx(contact, a.sound);
      return contact + 0.5;
    }

    case "react": {
      const flinch = g.flinch ?? "flinch";
      if (!def.gestures[flinch]) return h.error(`${h.where}: ${def.id} has no "${flinch}" gesture for react`), t;
      h.apply({ at: t, gesture: flinch, intensity: a.intensity, ...(a.emotion ? {} : def.emotions.shocked ? { emotion: "shocked" } : {}), ...(a.target !== undefined ? { look: a.target } : {}) });
      if (a.sound) h.addSfx(t, a.sound);
      return t + def.gestures[flinch].duration;
    }

    case "sit-down": {
      const seat = a.target;
      const sitPose = a.pose ?? "sit_idle";
      if (!def.poses[sitPose]) return h.error(`${h.where}: ${def.id} has no "${sitPose}" pose to sit in`), t;
      let at = t;
      if (seat !== undefined) {
        const p = h.pointOf(seat, t);
        if (!p) return t;
        const b = baseAt(h.ra, def, t);
        const dist = Math.hypot(p[0] - b.placement.position[0], p[2] - b.placement.position[2]);
        if (dist > 0.05) {
          const duration = Math.max(0.4, dist / (def.walk.speed * h.ra.scale));
          h.apply({ at, move: { to: seat } });
          at += duration;
        }
      }
      h.apply({ at, pose: sitPose, transition: 0.6 });
      return at + 0.6;
    }

    case "stand-up": {
      const standPose = a.pose && !a.pose.startsWith("sit") ? a.pose : def.poses.stand_idle ? "stand_idle" : def.defaultPose;
      h.apply({ at: t, pose: standPose, transition: 0.5 });
      if (a.target !== undefined) h.apply({ at: t + 0.5, move: { to: a.target as Vec3 | string } });
      return t + 0.5;
    }
  }
  return t;
};

export type { Channels };
