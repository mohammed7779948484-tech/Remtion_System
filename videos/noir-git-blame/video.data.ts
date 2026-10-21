// Pure data for "git blame" (the CLI loads it for voice/validate/stills): Claude's P.I. office at 2:14 a.m.
// and an invisible narrator actor (Claude's inner voice). Components for the custom kinds live in index.tsx.
import type { ActorDefinition, EnvironmentDef, VideoData } from "../../src/engine";

// ---------------------------------------------------------------- the office

/** Room extents (metres). The +Z side is open to the camera. */
export const ROOM = { left: -2.6, right: 2.6, back: -2.2, height: 3.2 } as const;
/** Window opening in the back wall (x centre, width, sill, top). */
export const WINDOW = { x: -0.1, width: 1.7, sill: 0.8, top: 2.5 } as const;
/** Door opening in the right wall (z centre, width, height). */
export const DOOR = { z: -0.15, width: 0.95, height: 2.15 } as const;
/** World points the loose red string runs between: the evidence board → the CRT on the desk. */
export const STRING_PATH: [number, number, number][] = [
  [-2.52, 1.28, -0.12],
  [-1.6, 1.02, -0.62],
  [-0.68, 1.02, -1.16],
];

const office: EnvironmentDef = {
  id: "pi-office",
  description:
    "Claude's private-investigator office at night: venetian-blind window with rain and a red neon outside (the key light shines through the slats), desk with a green banker's lamp and a CRT terminal, cork evidence board with red string, frosted-glass door, ceiling fan, wall clock at 2:14.",
  shell: { floor: "#17110e", wall: "#1d2322", trim: "#120d0b", back: ROOM.back, left: ROOM.left, height: ROOM.height, walls: { back: false, left: false } },
  items: [
    { id: "walls", kind: "room_walls", position: [0, 0, 0] },
    { id: "floorboards", kind: "floorboards", position: [0, 0, 0] },
    { id: "window", kind: "venetian_window", position: [WINDOW.x, 0, ROOM.back] },
    { id: "door", kind: "pi_door", position: [ROOM.right, 0, DOOR.z], rotation: -90 },
    { id: "desk", kind: "detective_desk", position: [0, 0, -1.15], size: [1.7, 0.76, 0.8] },
    { id: "chair", kind: "office_chair", position: [0.62, 0, -1.86], rotation: 200, params: { color: "#2a1d18", accent: "#3a2a20" } },
    { id: "lamp", kind: "bankers_lamp", on: "desk", position: [0.6, 0.76, 0.16], rotation: -30, size: [0.3, 0.42, 0.2] },
    { id: "crt", kind: "crt_terminal", on: "desk", position: [-0.5, 0.76, -0.1], rotation: 58, size: [0.44, 0.4, 0.44] },
    { id: "keyboard", kind: "mech_keyboard", on: "desk", position: [0.08, 0.76, -0.27], rotation: 20 },
    { id: "mug", kind: "mug", on: "desk", position: [0.44, 0.76, -0.31], params: { color: "#cfc8bd", steam: true } },
    { id: "clutter", kind: "desk_clutter", on: "desk", position: [0.64, 0.76, -0.22] },
    { id: "fan", kind: "ceiling_fan", position: [0.1, ROOM.height, -0.75] },
    { id: "board", kind: "evidence_board", position: [ROOM.left + 0.03, 0, -0.45], rotation: 90, size: [1.75, 2.15, 0.08] },
    { id: "string", kind: "red_string", position: [0, 0, 0] },
    { id: "clock", kind: "wall_clock", position: [1.45, 2.3, ROOM.back + 0.02] },
    { id: "cabinet", kind: "filing_cabinet", position: [-2.12, 0, -1.9], size: [0.5, 1.3, 0.6] },
    { id: "rack", kind: "coat_rack", position: [2.05, 0, -1.8] },
    { id: "rug", kind: "rug", position: [0.35, 0, 0.35], params: { color: "#3a1c1a", border: "#5a3a20" } },
    { id: "fedora", kind: "fedora", position: [2.05, 1.72, -1.8], params: { size: 1.8 } },  ],
  marks: {
    "desk-top": { position: [0.05, 0.76, -1.02], yaw: 0, description: "Claude standing on the desk, facing the client" },
    keys: { position: [0.08, 0.799, -1.42], yaw: -70, description: "On the keyboard beside the CRT, facing its screen" },
    client: { position: [0.18, 0, 0.32], yaw: 180, description: "Client spot in front of the desk, facing the window" },
    hall: { position: [3.45, 0, -0.15], yaw: -90, description: "Outside the door, in the hallway" },
    doorway: { position: [2.25, 0, -0.1], yaw: -90, description: "Just inside the door" },
  },
  cameras: {
    "fan-overhead": { position: [0.35, 2.92, 0.05], target: [0.05, 0.85, -1.0], fov: 52, description: "From the ceiling past the fan, down on the desk" },
    "door-wide": { position: [-1.3, 1.25, -1.85], target: [2.4, 1.2, -0.1], fov: 46, description: "From behind the desk toward the door" },
    "board-wide": { position: [0.2, 1.5, 0.9], target: [-2.5, 1.45, -0.45], fov: 42, description: "Across the room to the evidence board" },
  },
  bounds: { min: [ROOM.left + 0.12, 0.1, ROOM.back + 0.12], max: [ROOM.right - 0.12, ROOM.height - 0.1, 7] },
  defaultMood: "late-night",
  shadowRadius: 4.6,
};

// ---------------------------------------------------------------- the narrator

// Claude's inner voice: a cast member with a voice and captions but no body. It stands at the detective's
// mark, so auto focus during narration lands on the detective; it has no volumes, so it never blocks or
// collides with anything.
const NARRATOR_ANCHORS = {
  feet: [0, 0, 0],
  waist: [0, 0.1, 0],
  chest: [0, 0.2, 0.04],
  head: [0, 0.21, 0.05],
  face: [0, 0.21, 0.14],
  top: [0, 0.48, 0],
} as Record<string, [number, number, number]>;

export const narratorDef: ActorDefinition = {
  id: "narrator",
  name: "Narrator",
  kind: "voice",
  description: "Invisible voice-over: speaks and gets captions, renders nothing, has no body volumes.",
  size: { height: 0.01, width: 0.01, depth: 0.01 },
  channels: { idle: { rest: 0, min: 0, max: 1 } },
  poses: { stand_idle: { description: "Nothing to pose.", set: {} } },
  emotions: { neutral: { description: "Calm.", set: {} } },
  gestures: {},
  sockets: {},
  appearance: {},
  defaultPose: "stand_idle",
  defaultEmotion: "neutral",
  walk: { stride: 1, speed: 1 },
  anchors: () => NARRATOR_ANCHORS,
  life: () => {},
  effectors: () => ({ points: { head: NARRATOR_ANCHORS.head, face: NARRATOR_ANCHORS.face }, parts: [] }),
};

const data: VideoData = {
  environments: { "pi-office": office },
  actorDefs: { narrator: narratorDef },
  componentKinds: [
    "room_walls",
    "detective_desk",
    "floorboards",
    "venetian_window",
    "pi_door",
    "bankers_lamp",
    "crt_terminal",
    "mech_keyboard",
    "desk_clutter",
    "ceiling_fan",
    "evidence_board",
    "red_string",
    "wall_clock",
    "filing_cabinet",
    "coat_rack",
    "fedora",
  ],
  screenKinds: ["term-idle", "term-blame", "term-commit"],
};

export default data;
