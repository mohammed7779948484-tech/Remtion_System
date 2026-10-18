// Public API of the shared engine. Videos import from here only.
//
// High level: defineVideo + episode.json (+ optional custom components/scene/overlay).
// Low level: every primitive below can be used directly from scene code.

// Videos & playback
export { defineVideo, resolveContext, type VideoDefinition, type VideoModule, type VideoProps, type VideoData } from "./player/defineVideo";
export { EpisodePlayer, useEpisode, useEvent, useAnchor, type VideoExtras, type EpisodeState } from "./player/EpisodePlayer";
export { buildTracks, makeQuery, evaluateScene, type SceneFrame } from "./player/scene";

// Direction data
export { EpisodeSchema, parseEpisode, type Episode, type EpisodeInput } from "./core/schema";
export { resolveEpisode, type ResolvedEpisode, type ResolvedLine, type ResolvedActor, type ResolveContext } from "./core/timeline";
export * from "./core/time";

// Actors
export { ACTORS, rayanDef, claudeDef, Rayan, Claude } from "./actors";
export { ACTOR_DEFS } from "./actors/defs";
export { ActorView } from "./actors/Actor";
export * from "./actors/rig";
export type { Actor, ActorViewProps } from "./actors/types";

// World
export { PROPS, type PropMeta } from "./world/props.data";
export { PROP_VIEWS, Mug, type PropViewProps } from "./world/props";
export { SetView } from "./world/SetView";
export { ScreenSurface, SCREEN_PRESETS, type DrawFn, type DrawContext, type ScreenContent } from "./world/Screen";
export { ENVIRONMENTS } from "./world/environments";
export * from "./world/layout";

// Camera, lighting, post
export * from "./camera/solve";
export { CinematicCamera, PostFX } from "./camera/Camera";
export { MOODS, moodAt, mixMoods, resolveMood, pulsedKey, type Mood, type MoodCue, type MoodRef } from "./lighting/moods";
export { Lighting } from "./lighting/Lighting";

// Audio & captions
export * from "./audio/speech";
export { Captions } from "./audio/Captions";
export { Soundtrack } from "./audio/Soundtrack";
export { FONTS } from "./fonts";
