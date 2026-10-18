// A video = episode JSON + optional custom code. defineVideo wires it into a Remotion
// composition whose calculateMetadata loads the cached voice manifest and resolves timing.
import { createElement } from "react";
import { staticFile, type CalculateMetadataFunction } from "remotion";
import type { ActorDefinition } from "../actors/rig";
import type { VoiceManifest } from "../audio/speech";
import { resolveEpisode, type ResolvedEpisode } from "../core/timeline";
import type { EnvironmentDef } from "../world/layout";
import { EpisodePlayer, type VideoExtras } from "./EpisodePlayer";

/**
 * Pure (Node-safe) data a video adds to the engine. Keep it in `videos/<slug>/video.data.ts`
 * and spread it into defineVideo, so the CLI (validate/stills) can load it without React.
 */
export type VideoData = {
  environments?: Record<string, EnvironmentDef>;
  actorDefs?: Record<string, ActorDefinition>;
  /** Names of custom set item kinds provided as `components` in index.tsx. */
  componentKinds?: string[];
};

export type VideoDefinition = VideoExtras &
  VideoData & {
    episode: unknown;
  };

export type VideoProps = { resolved: ResolvedEpisode | null };

export type VideoModule = {
  id: string;
  episode: unknown;
  width: number;
  height: number;
  fps: number;
  component: React.FC<VideoProps>;
  calculateMetadata: CalculateMetadataFunction<VideoProps>;
};

const FORMATS: Record<string, [number, number]> = { landscape: [1920, 1080], portrait: [1080, 1920], square: [1080, 1080] };

export const resolveContext = (def: VideoData & Pick<VideoExtras, "actors" | "components">) => ({
  environments: def.environments,
  actors: { ...def.actorDefs, ...Object.fromEntries(Object.entries(def.actors ?? {}).map(([k, v]) => [k, v.def])) },
  components: [...Object.keys(def.components ?? {}), ...(def.componentKinds ?? [])],
});

export const defineVideo = (def: VideoDefinition): VideoModule => {
  const ep = def.episode as { id: string; format?: { width?: number; height?: number; fps?: number; preset?: string } };
  const [w, h] = FORMATS[ep.format?.preset ?? "landscape"] ?? FORMATS.landscape;
  const { episode: _e, environments: _env, actorDefs: _ad, componentKinds: _ck, ...extras } = def;

  const component: React.FC<VideoProps> = ({ resolved }) => (resolved ? createElement(EpisodePlayer, { resolved, ...extras }) : null);

  const calculateMetadata: CalculateMetadataFunction<VideoProps> = async ({ abortSignal }) => {
    let voice: VoiceManifest | null = null;
    try {
      const res = await fetch(staticFile(`videos/${ep.id}/voice.json`), { signal: abortSignal });
      if (res.ok) voice = (await res.json()) as VoiceManifest;
    } catch {
      voice = null;
    }
    const resolved = resolveEpisode(def.episode, voice, resolveContext(def));
    return {
      durationInFrames: resolved.durationInFrames,
      fps: resolved.fps,
      width: resolved.width,
      height: resolved.height,
      props: { resolved },
      defaultOutName: ep.id,
    };
  };

  return { id: ep.id, episode: def.episode, width: ep.format?.width ?? w, height: ep.format?.height ?? h, fps: ep.format?.fps ?? 30, component, calculateMetadata };
};
