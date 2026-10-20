// Engine version, production profile and declared intent: the one place that decides which
// automatic behaviours and check thresholds an episode gets. Engine-1 episodes (no `engine` field)
// keep the original behaviour exactly; new defaults read only from the resolved `Behaviour`. Pure.

/** 1 = original engine (frozen behaviour); 2 = current defaults. A missing `engine` means 1. */
export const ENGINE_VERSIONS = [1, 2] as const;
export type EngineVersion = (typeof ENGINE_VERSIONS)[number];

/**
 * Findings the director accepts on purpose (`allow` on the episode or a shot). A check that would
 * report one of these lists it as "accepted by intent" instead — still visible, never hidden.
 */
export const INTENTS = {
  silence: "long pauses are deliberate (dead-air notes are accepted)",
  "slow-open": "the opening is deliberately slow (no-hook notes are accepted)",
  offscreen: "a subject's face leaves the frame on purpose",
  "back-of-head": "seeing the back of a subject is deliberate",
} as const;
export type Intent = keyof typeof INTENTS;
export const INTENT_NAMES = Object.keys(INTENTS) as [Intent, ...Intent[]];

/** Defaults and check thresholds for a kind of production (explained in the make-episode skill). */
export type Profile = {
  description: string;
  /** Seconds within which something should happen (pacing note). */
  hook: number;
  /** Longest stretch with nothing happening before a pacing note. */
  deadAir: number;
};

export const PROFILES = {
  standard: { description: "Short-form defaults: something happens within 1.5 s and no stretch of more than 1.5 s without a line, action, cut or sound.", hook: 1.5, deadAir: 1.5 },
} as const satisfies Record<string, Profile>;
export type ProfileName = keyof typeof PROFILES;
export const PROFILE_NAMES = Object.keys(PROFILES) as [ProfileName, ...ProfileName[]];

export type Behaviour = { engine: EngineVersion; profile: ProfileName; allow: Intent[] };

export const resolveBehaviour = (ep: { engine?: EngineVersion; profile?: ProfileName; allow?: Intent[] }): Behaviour => ({
  engine: ep.engine ?? 1,
  profile: ep.profile ?? "standard",
  allow: ep.allow ?? [],
});

export const profileOf = (b: Pick<Behaviour, "profile">): Profile => PROFILES[b.profile];

/** Whether `intent` is accepted by the episode or any of the given scopes (e.g. the shot). */
export const accepts = (intent: Intent, ...scopes: ({ allow?: readonly Intent[] } | undefined)[]) => scopes.some((s) => s?.allow?.includes(intent));
