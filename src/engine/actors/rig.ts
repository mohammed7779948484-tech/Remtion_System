// Generic, actor-agnostic performance evaluator. An actor's state is a flat map of named
// channels (joint angles, face params, squash...). Each actor defines its own channels, so a
// non-humanoid never has to pretend to have a skeleton. Every function here is pure in (track, t).
import {
  clamp,
  envelope,
  lerp,
  lerpAngle,
  noise,
  progress,
  rand,
  type EaseName,
  type Vec3,
} from "../core/time";

export type Channels = Record<string, number>;

export type ChannelSpec = { rest: number; min: number; max: number; description?: string };

export type LifeSignals = {
  t: number;
  pose: string;
  /** -1..1 slow breathing wave. */
  breath: number;
  /** 0..1 eyelid closure from automatic + reaction blinks. */
  blink: number;
  /** 0..1 speech amplitude (stylized mouthing, not phonemes). */
  talk: number;
  /** Radians relative to the body's forward axis. Positive yaw = actor's left (+X), positive pitch = up. */
  lookYaw: number;
  lookPitch: number;
  lookWeight: number;
  /** 0..1 how much gait to show, and the gait phase in radians. */
  walk: number;
  walkPhase: number;
  /** Seeded smooth noise in [-1,1], unique per actor. */
  noise: (name: string, frequency?: number) => number;
};

export type GestureDef = {
  description: string;
  /** Seconds at speed 1. */
  duration: number;
  attack?: number;
  release?: number;
  /** Absolute targets blended in/out by the gesture envelope. */
  set?: Channels;
  /** Additive offsets over normalized gesture time u∈[0,1] (oscillations, beats). */
  add?: (u: number) => Channels;
};

export type AppearanceSpec =
  | { type: "color"; default: string; description: string }
  | { type: "boolean"; default: boolean; description: string }
  | { type: "number"; default: number; min: number; max: number; description: string };

export type ActorDefinition = {
  id: string;
  name: string;
  kind: string;
  description: string;
  /** Standing bounding box at scale 1, metres. */
  size: { height: number; width: number; depth: number };
  channels: Record<string, ChannelSpec>;
  poses: Record<string, { description: string; set: Channels }>;
  emotions: Record<string, { description: string; set: Channels }>;
  gestures: Record<string, GestureDef>;
  sockets: Record<string, string>;
  appearance: Record<string, AppearanceSpec>;
  defaultPose: string;
  defaultEmotion: string;
  /** stride = metres per gait cycle, speed = natural walking speed (m/s), both at scale 1. */
  walk: { stride: number; speed: number };
  /** Root-local, unscaled framing anchors. Must include head, chest, waist, feet, top. */
  anchors: (c: Channels) => Record<string, Vec3>;
  /** Maps automatic life signals onto this actor's channels (mutates `c`). */
  life: (c: Channels, s: LifeSignals) => void;
  /**
   * Optional: channel values that put this actor's `side` effector on `target` (root-local, unscaled
   * metres; +Z forward, +X = actor's left) given its current channels `c`. Humanoids solve their arm;
   * other anatomies lean/stretch toward it. Used by the reach-based recipes (point, press, pick-up, place).
   */
  reach?: (c: Channels, target: Vec3, side: "L" | "R") => { set: Channels; reached: boolean };
  /**
   * Optional: hand-to-self moves for the `facepalm` and `sip` recipes (palm on the face with the head bowed; a held
   * cup at the mouth). Returns the channel values to hold, from the current channels.
   */
  selfReach?: (c: Channels, what: "facepalm" | "sip", side: "L" | "R") => { set: Channels; reached: boolean };
  /** Optional: gesture names the recipes use for this anatomy (defaults: flinch, stomp/hop). */
  recipeGestures?: { flinch?: string; stomp?: string; crouchPose?: string; /** Fraction of the stomp gesture where it lands (default 0.5). */ stompContact?: number };
};

// ---------------------------------------------------------------- track (resolved direction)

export type LookTarget = Vec3 | { actor: string; anchor?: string } | "camera" | null;

export type PoseCue = { at: number; pose: string; transition?: number };
export type EmotionCue = { at: number; emotion: string; transition?: number };
export type GestureCue = { at: number; gesture: string; speed?: number; intensity?: number };
export type LookCue = { at: number; target: LookTarget; transition?: number; weight?: number };
export type MoveCue = {
  at: number;
  to: Vec3;
  duration?: number;
  speed?: number;
  ease?: EaseName;
  /** "path" (default) turns to walking direction, "keep" holds yaw, a number = yaw in degrees. */
  face?: "path" | "keep" | number;
};
export type TurnCue = { at: number; yaw?: number; toward?: Vec3; duration?: number };
export type OverrideCue = {
  at: number;
  set: Channels;
  duration?: number;
  blend?: number;
  mode?: "absolute" | "add";
};
export type HoldCue = { at: number; socket: string; item: string | null };

export type ActorTrack = {
  id: string;
  def: ActorDefinition;
  seed: string;
  scale: number;
  /** Ground position; yaw in degrees (0 = facing +Z). */
  start: { position: Vec3; yaw: number };
  poses: PoseCue[];
  emotions: EmotionCue[];
  gestures: GestureCue[];
  looks: LookCue[];
  moves: MoveCue[];
  turns: TurnCue[];
  overrides: OverrideCue[];
  holds: HoldCue[];
  talk?: (t: number) => number;
};

export const emptyTrack = (
  id: string,
  def: ActorDefinition,
  start: ActorTrack["start"],
  partial: Partial<ActorTrack> = {},
): ActorTrack => ({
  id,
  def,
  seed: id,
  scale: 1,
  start,
  poses: [],
  emotions: [],
  gestures: [],
  looks: [],
  moves: [],
  turns: [],
  overrides: [],
  holds: [],
  ...partial,
});

const DEG = Math.PI / 180;

/** Index of the last cue with at <= t (cues sorted by `at`), or -1. */
const lastAtOrBefore = (cues: { at: number }[], t: number) => {
  let k = -1;
  for (let i = 0; i < cues.length; i++) {
    if (cues[i].at <= t) k = i;
    else break;
  }
  return k;
};

const mixChannels = (a: Channels, b: Channels, u: number): Channels => {
  if (u <= 0) return a;
  if (u >= 1) return b;
  const out: Channels = { ...a };
  for (const k in b) out[k] = lerp(a[k] ?? b[k], b[k], u);
  return out;
};

/**
 * Value of a cue sequence at t. Each cue blends from wherever the previous cue had reached at
 * the moment it started, so interrupted transitions stay continuous. Recomputed from the start
 * every call: no cached state, identical for any frame visit order.
 */
const sequenceAt = <T>(
  cues: { at: number; transition?: number }[],
  t: number,
  initial: T,
  target: (i: number) => T,
  mix: (a: T, b: T, u: number) => T,
  defaultTransition: number,
): T => {
  const k = lastAtOrBefore(cues, t);
  if (k < 0) return initial;
  let from = initial;
  for (let i = 0; i < k; i++) {
    const u = progress(cues[i + 1].at, cues[i].at, cues[i].transition ?? defaultTransition);
    from = mix(from, target(i), u);
  }
  return mix(from, target(k), progress(t, cues[k].at, cues[k].transition ?? defaultTransition));
};

export const restChannels = (def: ActorDefinition): Channels => {
  const c: Channels = {};
  for (const k in def.channels) c[k] = def.channels[k].rest;
  return c;
};

const poseChannels = (def: ActorDefinition, pose: string): Channels => ({
  ...restChannels(def),
  ...(def.poses[pose]?.set ?? {}),
});

const emotionKeys = (def: ActorDefinition) => {
  const keys = new Set<string>();
  for (const e of Object.values(def.emotions)) for (const k in e.set) keys.add(k);
  return [...keys];
};

const emotionChannels = (def: ActorDefinition, emotion: string): Channels => {
  const out: Channels = {};
  for (const k of emotionKeys(def)) {
    out[k] = def.emotions[emotion]?.set[k] ?? def.emotions[def.defaultEmotion]?.set[k] ?? def.channels[k].rest;
  }
  return out;
};

// ---------------------------------------------------------------- placement & locomotion

type Segment = { start: number; end: number; from: Vec3; to: Vec3; ease: EaseName; distBefore: number; cue: MoveCue };

const moveSegments = (track: ActorTrack): Segment[] => {
  const segs: Segment[] = [];
  let pos = track.start.position;
  let dist = 0;
  let cursor = -Infinity;
  for (const cue of track.moves) {
    const start = Math.max(cue.at, cursor);
    const len = Math.hypot(cue.to[0] - pos[0], cue.to[2] - pos[2]);
    const speed = (cue.speed ?? track.def.walk.speed) * track.scale;
    const duration = cue.duration ?? Math.max(0.2, len / Math.max(0.01, speed));
    segs.push({ start, end: start + duration, from: pos, to: cue.to, ease: cue.ease ?? "smooth", distBefore: dist, cue });
    pos = cue.to;
    dist += len;
    cursor = start + duration;
  }
  return segs;
};

const pathAt = (segs: Segment[], start: Vec3, t: number) => {
  let position = start;
  let dist = 0;
  for (const s of segs) {
    if (t < s.start) break;
    const u = progress(t, s.start, s.end - s.start, s.ease);
    position = [lerp(s.from[0], s.to[0], u), lerp(s.from[1], s.to[1], u), lerp(s.from[2], s.to[2], u)];
    dist = s.distBefore + Math.hypot(s.to[0] - s.from[0], s.to[2] - s.from[2]) * u;
  }
  return { position, dist };
};

export type Placement = { position: Vec3; yaw: number; walk: number; walkPhase: number };

/** Root position (ground), yaw (radians) and gait for an actor at time t. */
export const placementAt = (track: ActorTrack, t: number): Placement => {
  const segs = moveSegments(track);
  const { position, dist } = pathAt(segs, track.start.position, t);

  // Gait amount from path speed (central difference keeps it a pure function of t).
  const eps = 1 / 120;
  const v = (pathAt(segs, track.start.position, t + eps).dist - pathAt(segs, track.start.position, t - eps).dist) / (2 * eps);
  const nominal = track.def.walk.speed * track.scale;
  const walk = clamp(v / (0.35 * nominal), 0, 1);
  const walkPhase = (dist / (track.def.walk.stride * track.scale)) * Math.PI * 2;

  // Yaw: a sequence of turn events (explicit turns + move headings).
  type YawEvent = { at: number; transition: number; yaw: number };
  const events: YawEvent[] = [];
  for (const s of segs) {
    const face = s.cue.face ?? "path";
    if (face === "keep") continue;
    const dx = s.to[0] - s.from[0];
    const dz = s.to[2] - s.from[2];
    if (face === "path" && Math.hypot(dx, dz) < 1e-4) continue;
    events.push({ at: s.start - 0.1, transition: 0.35, yaw: face === "path" ? Math.atan2(dx, dz) : face * DEG });
  }
  for (const turn of track.turns) {
    let yaw = (turn.yaw ?? 0) * DEG;
    if (turn.toward) {
      const p = pathAt(segs, track.start.position, turn.at).position;
      yaw = Math.atan2(turn.toward[0] - p[0], turn.toward[2] - p[2]);
    }
    events.push({ at: turn.at, transition: turn.duration ?? 0.4, yaw });
  }
  events.sort((a, b) => a.at - b.at);
  const yaw = sequenceAt(events, t, track.start.yaw * DEG, (i) => events[i].yaw, lerpAngle, 0.4);

  return { position, yaw, walk, walkPhase };
};

// ---------------------------------------------------------------- evaluation

export const localToWorld = (p: Placement, scale: number, local: Vec3): Vec3 => {
  const c = Math.cos(p.yaw);
  const s = Math.sin(p.yaw);
  const x = local[0] * scale;
  const z = local[2] * scale;
  return [p.position[0] + x * c + z * s, p.position[1] + local[1] * scale, p.position[2] - x * s + z * c];
};

const applyOverrides = (c: Channels, overrides: OverrideCue[], t: number) => {
  for (const o of overrides) {
    const blend = o.blend ?? 0.25;
    const w = envelope(t, o.at, o.duration === undefined ? Infinity : o.at + o.duration, blend, blend);
    if (w <= 0) continue;
    for (const k in o.set) {
      if (!(k in c)) continue;
      c[k] = o.mode === "add" ? c[k] + o.set[k] * w : lerp(c[k], o.set[k], w);
    }
  }
};

const blinkAt = (seed: string, t: number, reactions: number[]) => {
  const windowSize = 3.4;
  const blinkLen = 0.16;
  let w = 0;
  const bump = (start: number) => {
    const u = (t - start) / blinkLen;
    if (u >= 0 && u <= 1) w = Math.max(w, Math.sin(u * Math.PI));
  };
  const idx = Math.floor(t / windowSize);
  for (let i = idx - 1; i <= idx; i++) {
    const start = i * windowSize + 0.4 + rand(seed, "blink", i) * 2.4;
    bump(start);
    if (rand(seed, "double", i) > 0.78) bump(start + 0.24);
  }
  for (const r of reactions) bump(r);
  return w;
};

export type ActorBase = {
  id: string;
  placement: Placement;
  /** Pose + emotion + gestures, before life and overrides. */
  layered: Channels;
  /** World-space framing anchors (stable: ignore breathing/look so cameras stay steady). */
  anchors: Record<string, Vec3>;
  pose: string;
};

/** Pass 1: everything that doesn't depend on other actors or the camera. */
export const actorBase = (track: ActorTrack, t: number): ActorBase => {
  const { def } = track;
  const placement = placementAt(track, t);

  const posed = sequenceAt(
    track.poses,
    t,
    poseChannels(def, def.defaultPose),
    (i) => poseChannels(def, track.poses[i].pose),
    mixChannels,
    0.4,
  );
  const face = sequenceAt(
    track.emotions,
    t,
    emotionChannels(def, def.defaultEmotion),
    (i) => emotionChannels(def, track.emotions[i].emotion),
    mixChannels,
    0.22,
  );
  const layered: Channels = { ...posed, ...face };

  for (const g of track.gestures) {
    const gd = def.gestures[g.gesture];
    if (!gd) continue;
    const duration = gd.duration / (g.speed ?? 1);
    if (t < g.at || t > g.at + duration) continue;
    const u = (t - g.at) / duration;
    const intensity = g.intensity ?? 1;
    if (gd.set) {
      const w = envelope(t, g.at, g.at + duration, (gd.attack ?? 0.2) / (g.speed ?? 1), (gd.release ?? 0.25) / (g.speed ?? 1)) * intensity;
      for (const k in gd.set) if (k in layered) layered[k] = lerp(layered[k], gd.set[k], w);
    }
    if (gd.add) {
      const offsets = gd.add(u);
      for (const k in offsets) if (k in layered) layered[k] += offsets[k] * intensity;
    }
  }

  const forAnchors = { ...layered };
  applyOverrides(forAnchors, track.overrides, t);
  const local = def.anchors(forAnchors);
  const anchors: Record<string, Vec3> = {};
  for (const name in local) anchors[name] = localToWorld(placement, track.scale, local[name]);

  const k = lastAtOrBefore(track.poses, t);
  return { id: track.id, placement, layered, anchors, pose: k >= 0 ? track.poses[k].pose : def.defaultPose };
};

export type LookContext = {
  anchorOf: (actor: string, anchor: string) => Vec3 | undefined;
  camera?: Vec3;
};

const lookAngles = (base: ActorBase, target: LookTarget, ctx: LookContext) => {
  if (target === null) return { yaw: 0, pitch: 0 };
  let p: Vec3 | undefined;
  if (target === "camera") p = ctx.camera;
  else if (Array.isArray(target)) p = target;
  else p = ctx.anchorOf(target.actor, target.anchor ?? "head");
  const head = base.anchors.head;
  if (!p || !head) return { yaw: 0, pitch: 0 };
  const dx = p[0] - head[0];
  const dy = p[1] - head[1];
  const dz = p[2] - head[2];
  const c = Math.cos(-base.placement.yaw);
  const s = Math.sin(-base.placement.yaw);
  const lx = dx * c + dz * s;
  const lz = -dx * s + dz * c;
  return { yaw: Math.atan2(lx, lz), pitch: Math.atan2(dy, Math.hypot(lx, lz)) };
};

export type ActorFrame = {
  id: string;
  channels: Channels;
  position: Vec3;
  yaw: number;
  scale: number;
  anchors: Record<string, Vec3>;
  held: Record<string, string>;
  pose: string;
};

/** Pass 2: look-at, automatic life (breath, blinks, talk, gait) and precise overrides. */
export const actorFinal = (track: ActorTrack, base: ActorBase, t: number, ctx: LookContext): ActorFrame => {
  const { def } = track;
  const c: Channels = { ...base.layered };

  type Look = { yaw: number; pitch: number; weight: number };
  const look = sequenceAt<Look>(
    track.looks,
    t,
    { yaw: 0, pitch: 0, weight: 0 },
    (i) => ({ ...lookAngles(base, track.looks[i].target, ctx), weight: track.looks[i].target === null ? 0 : track.looks[i].weight ?? 1 }),
    (a, b, u) => ({ yaw: lerp(a.yaw, b.yaw, u), pitch: lerp(a.pitch, b.pitch, u), weight: lerp(a.weight, b.weight, u) }),
    0.35,
  );

  // Reaction blinks on emotion changes and gaze shifts read as alive.
  const reactions = [...track.emotions.map((e) => e.at), ...track.looks.map((l) => l.at + 0.05)];
  const seed = track.seed;
  def.life(c, {
    t,
    pose: base.pose,
    breath: Math.sin(t * Math.PI * 2 * 0.24 + rand(seed, "breath") * 6) * (0.85 + 0.15 * noise(seed + "b", t, 0.3)),
    blink: blinkAt(seed, t, reactions),
    talk: clamp(track.talk?.(t) ?? 0, 0, 1),
    lookYaw: look.yaw,
    lookPitch: look.pitch,
    lookWeight: look.weight,
    walk: Math.max(base.placement.walk, base.pose === "walk" ? 1 : 0),
    walkPhase: base.pose === "walk" && base.placement.walk === 0 ? t * Math.PI * 2 * 1.6 : base.placement.walkPhase,
    noise: (name, frequency = 1) => noise(`${seed}:${name}`, t, frequency),
  });
  applyOverrides(c, track.overrides, t);
  for (const k in c) {
    const spec = def.channels[k];
    if (spec) c[k] = clamp(c[k], spec.min, spec.max);
  }

  const held: Record<string, string> = {};
  for (const h of track.holds) {
    if (h.at > t) break;
    if (h.item === null) delete held[h.socket];
    else held[h.socket] = h.item;
  }

  return {
    id: track.id,
    channels: c,
    position: base.placement.position,
    yaw: base.placement.yaw,
    scale: track.scale,
    anchors: base.anchors,
    held,
    pose: base.pose,
  };
};

/** Convenience for code-driven scenes: evaluate one actor with no other actors around. */
export const evaluateActor = (track: ActorTrack, t: number, camera?: Vec3): ActorFrame =>
  actorFinal(track, actorBase(track, t), t, { anchorOf: () => undefined, camera });
