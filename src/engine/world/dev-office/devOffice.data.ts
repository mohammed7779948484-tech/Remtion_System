// "dev-office": a modular programmer workspace. Pure data — move/remove/add items per episode
// via set overrides. Layout: the desk sits mid-room; a seated actor at `chair-seat` faces +Z
// (toward the open side), monitors angle in from both sides so the face stays visible.
import type { EnvironmentDef } from "../layout";

export const devOffice: EnvironmentDef = {
  id: "dev-office",
  description: "Corner office set: back + left wall, window with night skyline, desk with two monitors, lamp, mug, chair, bookshelf, plants, rug.",
  shell: { floor: "#3a3f4b", wall: "#2c3348", trim: "#1c2130", back: -1.8, left: -2.8, height: 2.9, walls: { back: true, left: true } },
  items: [
    { id: "rug", kind: "rug", position: [0.1, 0, 0.3] },
    { id: "desk", kind: "desk", position: [0, 0, 0.62] },
    { id: "monitor-main", kind: "monitor", on: "desk", position: [0.42, 0.76, 0.12], rotation: 210, params: { screen: { preset: "code" } } },
    { id: "monitor-side", kind: "monitor", on: "desk", position: [-0.42, 0.76, 0.12], rotation: 150, params: { screen: { preset: "terminal" } } },
    { id: "keyboard", kind: "keyboard", on: "desk", position: [0, 0.76, -0.2], rotation: 180 },
    { id: "mug", kind: "mug", on: "desk", position: [0.64, 0.76, -0.16] },
    { id: "lamp", kind: "desk_lamp", on: "desk", position: [-0.68, 0.76, 0.2], rotation: 200 },
    { id: "chair", kind: "office_chair", position: [0, 0, -0.08] },
    { id: "bookshelf", kind: "bookshelf", position: [-1.6, 0, -1.6] },
    { id: "plant", kind: "plant", position: [-2.3, 0, -1.25] },
    { id: "plant-2", kind: "plant", position: [2.4, 0, -1.35], scale: 0.8, params: { leaves: "#3fae6a" } },
    { id: "window", kind: "window", position: [1.25, 0.9, -1.74] },
  ],
  marks: {
    "chair-seat": { position: [0, 0, -0.06], yaw: 0, description: "Root for a seated humanoid (sit_idle / sit_typing), facing +Z" },
    "desk-mascot": { position: [-0.42, 0.76, 0.45], yaw: 70, description: "On the desk at the seated actor's right, angled toward them and the camera" },
    "beside-desk": { position: [1.05, 0, 0.35], yaw: -20, description: "Standing spot beside the desk" },
    door: { position: [3.4, 0, 1.4], yaw: -90, description: "Off-set entrance at screen right" },
  },
  cameras: {
    establishing: { position: [2.4, 1.9, 3.4], target: [0, 0.95, 0.25], fov: 40, description: "3/4 high wide of the whole desk area" },
    "wide-front": { position: [0, 1.35, 3.6], target: [0, 1.0, 0.3], fov: 36, description: "Straight-on wide" },
    "high-corner": { position: [2.2, 2.6, 2.2], target: [0, 0.8, 0.2], fov: 45, description: "High angle looking down" },
  },
  bounds: { min: [-2.6, 0.15, -1.6], max: [6, 2.7, 7] },
  defaultMood: "late-night",
};
