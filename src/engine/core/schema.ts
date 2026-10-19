// Episode direction schema (zod). Strict objects so typos fail validation instead of being
// silently ignored. `npm run catalog` exports this as catalog/episode.schema.json.
import { z } from "zod";
import { FxEntry } from "./fx";

/** Seconds, or a reference: "l2.start", "l2.end+0.3", "l3.word:4" (4th word start), "l3.word:4.end-0.1". */
export const TIME_REF_RE = /^([A-Za-z][\w-]*)\.(start|end|word:(\d+)(?:\.(start|end))?)([+-]\d+(?:\.\d+)?)?$/;
export const TimeRef = z.union([z.number().min(0), z.string().regex(TIME_REF_RE, "time ref like l2.start, l2.end+0.3, l3.word:4")]);

const Vec3 = z.tuple([z.number(), z.number(), z.number()]);
/** A world point, a set mark name, or "<actor>[.<anchor>]" / "camera" for look targets. */
const Place = z.union([Vec3, z.string()]);

const Voice = z.strictObject({
  elevenlabs: z
    .strictObject({
      voiceId: z.string(),
      model: z.string().optional(),
      settings: z.record(z.string(), z.number()).optional(),
    })
    .optional(),
  /** Offline Windows voice name, e.g. "Microsoft David Desktop". */
  system: z.string().optional(),
  /** Speaking rate for the system voice (-10..10). */
  rate: z.number().min(-10).max(10).optional(),
  /** Pitch shift for the system voice via SSML, e.g. "+15%". */
  pitch: z.string().optional(),
});

const CastMember = z.strictObject({
  actor: z.string(),
  at: Place.optional(),
  yaw: z.number().optional(),
  scale: z.number().positive().optional(),
  pose: z.string().optional(),
  emotion: z.string().optional(),
  appearance: z.record(z.string(), z.unknown()).optional(),
  voice: Voice.optional(),
  /** Caption name tag colour. */
  color: z.string().optional(),
  /** Display name for captions. */
  name: z.string().optional(),
});

const Line = z.strictObject({
  id: z.string().regex(/^[A-Za-z][\w-]*$/),
  speaker: z.string(),
  text: z.string().min(1),
  /** Start time. Omit to follow the previous line after `gap` seconds. */
  at: TimeRef.optional(),
  gap: z.number().optional(),
});

const Action = z.strictObject({
  at: TimeRef,
  actor: z.string(),
  pose: z.string().optional(),
  emotion: z.string().optional(),
  gesture: z.string().optional(),
  look: z.union([Place, z.null()]).optional(),
  move: z
    .strictObject({
      to: Place,
      duration: z.number().positive().optional(),
      speed: z.number().positive().optional(),
      face: z.union([z.literal("path"), z.literal("keep"), z.number()]).optional(),
      /** Timing curve: smooth (default), in (accelerate — falls), out (decelerate — lands softly), linear, snap, backOut, inOut. */
      ease: z.enum(["linear", "in", "out", "inOut", "smooth", "backOut", "snap"]).optional(),
    })
    .optional(),
  /** Turn to a yaw (degrees) or toward a place/actor. */
  turn: z.union([z.number(), Place]).optional(),
  hold: z.record(z.string(), z.union([z.string(), z.null()])).optional(),
  /** Precise channel overrides (see the actor manifest's channels). */
  joints: z.record(z.string(), z.number()).optional(),
  mode: z.union([z.literal("absolute"), z.literal("add")]).optional(),
  /** Seconds a joints override lasts (omit = holds). */
  duration: z.number().positive().optional(),
  transition: z.number().min(0).optional(),
  intensity: z.number().min(0).optional(),
  speed: z.number().positive().optional(),
  /**
   * Interaction recipe, expanded into ordinary cues: press | point | pick-up | place | react | sit-down |
   * stand-up | facepalm | sip. Only `emotion` is applied alongside it.
   */
  do: z.enum(["press", "point", "pick-up", "place", "react", "sit-down", "stand-up", "facepalm", "sip"]).optional(),
  /** Recipe target: "item.anchor" (e.g. "keyboard.key:ctrl"), an item, actor[.anchor], mark or [x,y,z]. */
  target: Place.optional(),
  /** Recipe item (pick-up / place). */
  item: z.string().optional(),
  /** Recipe hand/socket (default: the hand on the target's side). */
  hand: z.string().optional(),
  /** press/place: false = too light to push the target down (the gag). */
  weight: z.boolean().optional(),
  /** Sound played at the recipe's moment of contact (library name or file), and its volume. */
  sound: z.string().optional(),
  volume: z.number().min(0).optional(),
  /** place: yaw (degrees) of the put-down item. */
  rotation: z.number().optional(),
});

const MoveName = z.enum(["static", "push-in", "pull-out", "truck", "orbit", "crane", "handheld"]);
const Move = z.union([MoveName, z.strictObject({ type: MoveName, amount: z.number().optional(), ease: z.string().optional() })]);
const FocusRef = z.union([Vec3, z.string()]);

const Shot = z.strictObject({
  at: TimeRef,
  shot: z.enum(["establishing", "wide", "full", "medium", "close", "two-shot", "over-shoulder", "insert", "custom"]),
  subject: z.union([z.string(), z.array(z.string())]).optional(),
  over: z.string().optional(),
  spot: z.string().optional(),
  item: z.string().optional(),
  anchor: z.string().optional(),
  size: z.number().positive().optional(),
  angle: z.number().optional(),
  height: z.union([z.enum(["eye", "low", "high"]), z.number()]).optional(),
  distance: z.number().positive().optional(),
  lens: z.number().positive().optional(),
  fov: z.number().positive().optional(),
  position: Vec3.optional(),
  target: Vec3.optional(),
  offset: z.tuple([z.number(), z.number()]).optional(),
  roll: z.number().optional(),
  move: z.union([Move, z.array(Move)]).optional(),
  track: z.union([z.boolean(), z.strictObject({ lag: z.number().min(0) })]).optional(),
  follow: z.union([z.boolean(), z.strictObject({ lag: z.number().min(0) })]).optional(),
  focus: z.union([z.literal("auto"), z.literal("none"), FocusRef]).optional(),
  rack: z.array(z.strictObject({ at: TimeRef, to: FocusRef, duration: z.number().positive().optional() })).optional(),
  dof: z.union([z.literal("auto"), z.literal("off"), z.strictObject({ bokeh: z.number().min(0).optional(), range: z.number().positive().optional() })]).optional(),
  lock: z.boolean().optional(),
  allowOcclusion: z.array(z.string()).optional(),
  blend: z.number().min(0).optional(),
});

const MoodRef = z.union([z.string(), z.record(z.string(), z.unknown())]);

export const EpisodeSchema = z.strictObject({
  $schema: z.string().optional(),
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "kebab-case id"),
  title: z.string(),
  format: z
    .strictObject({
      width: z.number().int().positive().optional(),
      height: z.number().int().positive().optional(),
      fps: z.number().positive().optional(),
      preset: z.enum(["landscape", "portrait", "square"]).optional(),
    })
    .optional(),
  seed: z.string().optional(),
  set: z
    .strictObject({
      environment: z.string(),
      remove: z.array(z.string()).optional(),
      move: z.record(z.string(), z.strictObject({ position: Vec3.optional(), rotation: z.number().optional(), scale: z.number().optional() })).optional(),
      params: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
      add: z
        .array(
          z.strictObject({
            id: z.string(),
            kind: z.string(),
            position: Vec3,
            rotation: z.number().optional(),
            scale: z.number().optional(),
            params: z.record(z.string(), z.unknown()).optional(),
            on: z.string().optional(),
            size: Vec3.optional(),
          }),
        )
        .optional(),
      shell: z.record(z.string(), z.unknown()).optional(),
      marks: z.record(z.string(), z.strictObject({ position: Vec3, yaw: z.number(), description: z.string().optional() })).optional(),
      cameras: z.record(z.string(), z.strictObject({ position: Vec3, target: Vec3, fov: z.number(), description: z.string().optional() })).optional(),
    }),
  mood: MoodRef.optional(),
  cast: z.record(z.string(), CastMember),
  dialogue: z.array(Line).default([]),
  actions: z.array(Action).default([]),
  camera: z.array(Shot).min(1),
  lighting: z.array(z.strictObject({ at: TimeRef, mood: MoodRef, transition: z.number().min(0).optional() })).default([]),
  props: z.array(z.strictObject({ at: TimeRef, item: z.string(), set: z.record(z.string(), z.unknown()) })).default([]),
  sfx: z.array(z.strictObject({ at: TimeRef, sound: z.string(), volume: z.number().min(0).optional(), prompt: z.string().optional() })).default([]),
  music: z.strictObject({ src: z.string(), volume: z.number().min(0).optional(), duck: z.number().min(0).max(1).optional() }).optional(),
  events: z.array(z.strictObject({ at: TimeRef, name: z.string(), duration: z.number().min(0).optional(), data: z.record(z.string(), z.unknown()).optional() })).default([]),
  /** Accents: text | window | callout | impact | shake | glitch | flash | dip (catalog/fx.json). */
  fx: z.array(FxEntry).default([]),
  captions: z
    .strictObject({
      style: z.enum(["subtitle", "pop", "none"]).optional(),
      /** Max seconds of speech per caption page. */
      pageSeconds: z.number().positive().optional(),
    })
    .optional(),
  /** Total duration (seconds or time ref). Default: last dialogue/event end + 1.5 s. */
  end: TimeRef.optional(),
});

export type Episode = z.infer<typeof EpisodeSchema>;
export type EpisodeInput = z.input<typeof EpisodeSchema>;
export type EpisodeShot = z.infer<typeof Shot>;
export type EpisodeAction = z.infer<typeof Action>;
export type EpisodeVoice = z.infer<typeof Voice>;

export const parseEpisode = (input: unknown): Episode => {
  const r = EpisodeSchema.safeParse(input);
  if (!r.success) {
    const issues = r.error.issues.map((i) => `  • ${i.path.join(".") || "(root)"}: ${i.message}`).join("\n");
    throw new Error(`Invalid episode:\n${issues}`);
  }
  return r.data;
};
