// Pure whole-scene evaluation: resolved episode + time → actor frames, camera, mood.
// Used by the player, the validator and tests (Node-safe: no React).
import { ACTOR_DEFS } from "../actors/defs";
import { actorBase, actorFinal, type ActorBase, type ActorDefinition, type ActorFrame, type ActorTrack } from "../actors/rig";
import { sampleEnvelope } from "../audio/speech";
import { cameraAt, type CameraFrame, type SceneQuery } from "../camera/solve";
import type { ResolvedEpisode } from "../core/timeline";
import { moodAt, type Mood } from "../lighting/moods";
import { itemAnchor, itemWorld, occluders } from "../world/layout";
import { PROPS } from "../world/props.data";

export const buildTracks = (r: ResolvedEpisode, defs: Record<string, ActorDefinition> = {}): ActorTrack[] => {
  const all = { ...ACTOR_DEFS, ...defs };
  return r.actors.map((a) => {
    const lines = r.lines.filter((l) => l.speaker === a.id);
    return {
      id: a.id,
      def: all[a.actor],
      seed: `${r.seed}:${a.id}`,
      scale: a.scale,
      start: a.start,
      poses: a.poses,
      emotions: a.emotions,
      gestures: a.gestures,
      looks: a.looks,
      moves: a.moves,
      turns: a.turns,
      overrides: a.overrides,
      holds: a.holds,
      talk: (t: number) => {
        let v = 0;
        for (const l of lines) if (t >= l.start && t <= l.end) v = Math.max(v, sampleEnvelope(l.envelope, t - l.start));
        return v;
      },
    };
  });
};

export const makeQuery = (r: ResolvedEpisode, tracks: ActorTrack[]): SceneQuery => {
  const byId = new Map(tracks.map((t) => [t.id, t]));
  // Cache of pure results (bounded); safe because actorBase is a pure function of (track, t).
  const cache = new Map<string, ActorBase>();
  const base = (id: string, t: number) => {
    const track = byId.get(id);
    if (!track) return undefined;
    const key = `${id}@${t.toFixed(5)}`;
    let b = cache.get(key);
    if (!b) {
      if (cache.size > 4000) cache.clear();
      b = actorBase(track, t);
      cache.set(key, b);
    }
    return b;
  };
  const items = new Map(r.layout.items.map((i) => [i.id, i]));
  return {
    aspect: r.width / r.height,
    anchor: (id, anchor, t) => base(id, t)?.anchors[anchor],
    facing: (id, t) => base(id, t)?.placement.yaw ?? 0,
    actorBox: (id, t) => {
      const b = base(id, t);
      const track = byId.get(id);
      if (!b || !track) return undefined;
      const feet = b.anchors.feet;
      const top = b.anchors.top;
      const half = (Math.max(track.def.size.width, track.def.size.depth) * track.scale) / 2;
      return { id, center: [feet[0], (feet[1] + top[1]) / 2, feet[2]], half: [half * 0.8, (top[1] - feet[1]) / 2, half * 0.8], yaw: b.placement.yaw };
    },
    actorIds: tracks.map((t) => t.id),
    item: (id, anchor) => (items.has(id) ? itemAnchor(r.layout, id, anchor) : undefined),
    itemYaw: (id) => (items.has(id) ? itemWorld(r.layout, id).yaw : undefined),
    itemSize: (id) => {
      const it = items.get(id);
      return it ? it.size ?? PROPS[it.kind]?.size : undefined;
    },
    spot: (name) => r.layout.cameras[name],
    occluders: occluders(r.layout),
    bounds: r.layout.bounds,
    speakerAt: (t) => r.lines.find((l) => t >= l.start && t <= l.end)?.speaker,
  };
};

export type SceneFrame = { t: number; actors: ActorFrame[]; camera: CameraFrame; mood: Mood };

export const evaluateScene = (r: ResolvedEpisode, tracks: ActorTrack[], query: SceneQuery, t: number): SceneFrame => {
  const bases = tracks.map((tr) => actorBase(tr, t));
  const camera = cameraAt(r.shots, query, t);
  const anchorOf = (id: string, anchor: string) => query.anchor(id, anchor, t);
  const actors = tracks.map((tr, i) => actorFinal(tr, bases[i], t, { anchorOf, camera: camera.position }));
  return { t, actors, camera, mood: moodAt(r.moods, t, r.initialMood) };
};
