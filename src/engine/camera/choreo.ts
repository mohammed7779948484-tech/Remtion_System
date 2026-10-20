// Camera choreography math: keyframes interpolated with a smooth spline (continuous speed through every
// key, easing in at the first and out at the last), world-space paths, the subtle `life` drift and
// blends that arc around the subject. Pure functions of time; the solver composes them.
import { noise, type Vec3 } from "../core/time";

/** Cubic Hermite spline through (t_i, v_i) with Catmull-Rom tangents in time; zero speed at the ends. */
export const splineAt = (times: number[], values: number[], t: number): number => {
  const n = times.length;
  if (n === 0) return NaN;
  if (n === 1 || t <= times[0]) return values[0];
  if (t >= times[n - 1]) return values[n - 1];
  let i = 0;
  while (i < n - 2 && t > times[i + 1]) i++;
  const t0 = times[i];
  const t1 = times[i + 1];
  const h = Math.max(1e-6, t1 - t0);
  const slope = (k: number) => (k <= 0 || k >= n - 1 ? 0 : (values[k + 1] - values[k - 1]) / Math.max(1e-6, times[k + 1] - times[k - 1]));
  const m0 = slope(i) * h;
  const m1 = slope(i + 1) * h;
  const u = (t - t0) / h;
  const u2 = u * u;
  const u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * values[i] + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * values[i + 1] + (u3 - u2) * m1;
};

export const splineVec3 = (times: number[], values: Vec3[], t: number): Vec3 => [0, 1, 2].map((k) => splineAt(times, values.map((v) => v[k]), t)) as Vec3;

/**
 * Value of one keyed channel at t. `keys` carry optional values; a missing value holds the previous one.
 * `base` is the value at the shot start (the solver's own), used before the first key that sets it.
 */
export const keyedValue = <K extends { at: number }>(keys: K[], pick: (k: K) => number | undefined, base: number, shotStart: number, t: number) => {
  const times = [shotStart];
  const values = [base];
  let last = base;
  for (const k of keys) {
    const v = pick(k);
    last = v ?? last;
    if (k.at <= shotStart + 1e-6) {
      values[0] = last;
      continue;
    }
    times.push(k.at);
    values.push(last);
  }
  return splineAt(times, values, t);
};

/**
 * `life`: a barely visible breathing camera — a slow push (4 % of the distance over the window at amount 1)
 * plus a slow seeded drift sideways and up. Returns the offsets to add to position and aim.
 */
export const lifeOffset = (seed: string, t: number, u: number, amount: number, toCam: Vec3, right: Vec3) => {
  const dist = Math.hypot(toCam[0], toCam[1], toCam[2]);
  const push = -0.04 * amount * u;
  const sx = noise(`${seed}:lx`, t, 0.13) * 0.025 * amount * dist;
  const sy = noise(`${seed}:ly`, t, 0.11) * 0.012 * amount * dist;
  const pos: Vec3 = [toCam[0] * push + right[0] * sx, toCam[1] * push + sy, toCam[2] * push + right[2] * sx];
  const aim: Vec3 = [right[0] * sx * 0.3, sy * 0.3, right[2] * sx * 0.3];
  return { pos, aim };
};

/**
 * Blend two camera poses by arcing around their aim points: the aim moves straight, the aim→camera vector
 * turns (yaw and pitch) and scales (log-distance), so the camera never cuts through the subject.
 */
export const arcBlend = (a: { position: Vec3; target: Vec3 }, b: { position: Vec3; target: Vec3 }, u: number) => {
  const target: Vec3 = [a.target[0] + (b.target[0] - a.target[0]) * u, a.target[1] + (b.target[1] - a.target[1]) * u, a.target[2] + (b.target[2] - a.target[2]) * u];
  const polar = (p: Vec3, c: Vec3) => {
    const d: Vec3 = [p[0] - c[0], p[1] - c[1], p[2] - c[2]];
    const r = Math.max(1e-6, Math.hypot(d[0], d[1], d[2]));
    return { yaw: Math.atan2(d[0], d[2]), pitch: Math.asin(Math.max(-1, Math.min(1, d[1] / r))), r };
  };
  const pa = polar(a.position, a.target);
  const pb = polar(b.position, b.target);
  const dyaw = Math.atan2(Math.sin(pb.yaw - pa.yaw), Math.cos(pb.yaw - pa.yaw));
  const yaw = pa.yaw + dyaw * u;
  const pitch = pa.pitch + (pb.pitch - pa.pitch) * u;
  const r = Math.exp(Math.log(pa.r) + (Math.log(pb.r) - Math.log(pa.r)) * u);
  const position: Vec3 = [target[0] + Math.sin(yaw) * Math.cos(pitch) * r, target[1] + Math.sin(pitch) * r, target[2] + Math.cos(yaw) * Math.cos(pitch) * r];
  return { position, target };
};
