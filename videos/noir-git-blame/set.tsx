// Claude's P.I. office: every custom set piece of this video. Positions/kinds are in video.data.ts.
// All motion is a pure function of `t` and named timeline events (useEvent); art is seeded.
import { useMemo } from "react";
import { random, spring, useVideoConfig } from "remotion";
import * as THREE from "three";
import { ScreenSurface, useEpisode, useEvent, type PropViewProps } from "../../src/engine";
import { clamp01, hash, NOIR_FONTS, smooth, useLiveTexture, useStaticTexture } from "./lib";
import { DOOR, ROOM, STRING_PATH, WINDOW } from "./video.data";

type V3 = [number, number, number];

const Box: React.FC<{ p: V3; s: V3; color: string; rough?: number; metal?: number; cast?: boolean; rot?: V3; map?: THREE.Texture }> = ({ p, s, color, rough = 0.9, metal = 0, cast = true, rot, map }) => (
  <mesh position={p} rotation={rot} castShadow={cast} receiveShadow>
    <boxGeometry args={s} />
    <meshStandardMaterial color={color} roughness={rough} metalness={metal} map={map ?? null} />
  </mesh>
);

/** 0..1 lightning brightness: a double strike over a `lightning` event. */
export const useLightning = () => {
  const ev = useEvent("lightning");
  if (!ev.started || !ev.active) return 0;
  const l = ev.local;
  const pulse = (at: number, len: number) => (l < at ? 0 : Math.exp(-(l - at) / len));
  return Math.min(1, pulse(0, 0.06) + 0.75 * pulse(0.15, 0.1)) * (Number(ev.data.strength ?? 1));
};

// ---------------------------------------------------------------- walls, ceiling, floor

const WALL = "#26302d";
const PANEL = "#1b130f";
const TRIM = "#0e0a08";

const paintWallpaper = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
  ctx.fillStyle = WALL;
  ctx.fillRect(0, 0, w, h);
  // Faded vertical stripes with a small diamond motif, plus grime.
  for (let x = 0; x < w; x += 32) {
    ctx.fillStyle = (x / 32) % 2 ? "rgba(255,255,255,0.025)" : "rgba(0,0,0,0.06)";
    ctx.fillRect(x, 0, 16, h);
    for (let y = 8; y < h; y += 32) {
      ctx.fillStyle = "rgba(190,200,170,0.05)";
      ctx.beginPath();
      ctx.moveTo(x + 24, y - 5);
      ctx.lineTo(x + 29, y);
      ctx.lineTo(x + 24, y + 5);
      ctx.lineTo(x + 19, y);
      ctx.fill();
    }
  }
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = `rgba(0,0,0,${0.03 + 0.05 * hash(i * 3.1)})`;
    ctx.fillRect(hash(i) * w, hash(i + 0.5) * h, 2 + 6 * hash(i * 1.7), 2 + 10 * hash(i * 2.3));
  }
};

const useWallMaterial = (repeatX: number, repeatY: number, key: string) => {
  const tex = useStaticTexture(256, 256, paintWallpaper, `wallpaper-${key}`, [repeatX, repeatY]);
  return useMemo(() => new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }), [tex]);
};

const WallPiece: React.FC<{ p: V3; s: V3; mat: THREE.Material }> = ({ p, s, mat }) => (
  <mesh position={p} castShadow receiveShadow material={mat}>
    <boxGeometry args={s} />
  </mesh>
);

export const RoomWalls: React.FC<PropViewProps> = () => {
  const T = 0.12;
  const H = ROOM.height;
  const wl = WINDOW.x - WINDOW.width / 2;
  const wr = WINDOW.x + WINDOW.width / 2;
  const dz0 = DOOR.z - DOOR.width / 2;
  const dz1 = DOOR.z + DOOR.width / 2;
  const front = 2.4;
  const back = useWallMaterial(6, 4, "back");
  const side = useWallMaterial(6, 4, "side");
  const bz = ROOM.back - T / 2;
  const lx = ROOM.left - T / 2;
  const rx = ROOM.right + T / 2;
  const panelH = 0.92;
  return (
    <group>
      {/* back wall with the window opening */}
      <WallPiece p={[(ROOM.left - T + wl) / 2, H / 2, bz]} s={[wl - ROOM.left + T, H, T]} mat={back} />
      <WallPiece p={[(wr + ROOM.right + T) / 2, H / 2, bz]} s={[ROOM.right + T - wr, H, T]} mat={back} />
      <WallPiece p={[WINDOW.x, WINDOW.sill / 2, bz]} s={[WINDOW.width, WINDOW.sill, T]} mat={back} />
      <WallPiece p={[WINDOW.x, (WINDOW.top + H) / 2, bz]} s={[WINDOW.width, H - WINDOW.top, T]} mat={back} />
      {/* left wall */}
      <WallPiece p={[lx, H / 2, (ROOM.back - T + front) / 2]} s={[T, H, front - ROOM.back + T]} mat={side} />
      {/* right wall with the door opening */}
      <WallPiece p={[rx, H / 2, (ROOM.back - T + dz0) / 2]} s={[T, H, dz0 - ROOM.back + T]} mat={side} />
      <WallPiece p={[rx, H / 2, (dz1 + front) / 2]} s={[T, H, front - dz1]} mat={side} />
      <WallPiece p={[rx, (DOOR.height + H) / 2, DOOR.z]} s={[T, H - DOOR.height, DOOR.width]} mat={side} />
      {/* wainscot panels + chair rail + baseboard */}
      <Box p={[(ROOM.left + wl) / 2, panelH / 2, ROOM.back + 0.012]} s={[wl - ROOM.left, panelH, 0.024]} color={PANEL} rough={0.7} />
      <Box p={[(wr + ROOM.right) / 2, panelH / 2, ROOM.back + 0.012]} s={[ROOM.right - wr, panelH, 0.024]} color={PANEL} rough={0.7} />
      <Box p={[WINDOW.x, (WINDOW.sill - 0.04) / 2, ROOM.back + 0.012]} s={[WINDOW.width, WINDOW.sill - 0.04, 0.024]} color={PANEL} rough={0.7} />
      <Box p={[ROOM.left + 0.012, panelH / 2, (ROOM.back + front) / 2]} s={[0.024, panelH, front - ROOM.back]} color={PANEL} rough={0.7} />
      <Box p={[ROOM.right - 0.012, panelH / 2, (ROOM.back + dz0) / 2]} s={[0.024, panelH, dz0 - ROOM.back]} color={PANEL} rough={0.7} />
      <Box p={[ROOM.right - 0.012, panelH / 2, (dz1 + front) / 2]} s={[0.024, panelH, front - dz1]} color={PANEL} rough={0.7} />
      <Box p={[0, panelH + 0.015, ROOM.back + 0.03]} s={[ROOM.right - ROOM.left, 0.03, 0.04]} color={TRIM} rough={0.6} />
      <Box p={[ROOM.left + 0.03, panelH + 0.015, (ROOM.back + front) / 2]} s={[0.04, 0.03, front - ROOM.back]} color={TRIM} rough={0.6} />
      {/* ceiling (dark, never in the key light) */}
      <mesh position={[0, H + 0.03, (ROOM.back + front) / 2]} receiveShadow>
        <boxGeometry args={[ROOM.right - ROOM.left + 2 * T, 0.06, front - ROOM.back + T]} />
        <meshStandardMaterial color="#120f0d" roughness={1} />
      </mesh>
      <Box p={[0, H - 0.04, ROOM.back + 0.04]} s={[ROOM.right - ROOM.left, 0.08, 0.08]} color={TRIM} cast={false} />
    </group>
  );
};

const paintPlanks = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
  const planks = 30;
  const pw = w / planks;
  for (let i = 0; i < planks; i++) {
    let y = -hash(i * 7.7) * 400;
    let j = 0;
    while (y < h) {
      const len = 260 + 380 * hash(i * 13.1 + j);
      const v = hash(i * 3.3 + j * 5.1);
      const r = 40 + 22 * v;
      const g = 26 + 14 * v;
      const b = 18 + 9 * v;
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(i * pw, y, pw, len);
      // grain
      for (let k = 0; k < 7; k++) {
        ctx.fillStyle = `rgba(0,0,0,${0.08 + 0.1 * hash(i + j * 9 + k)})`;
        ctx.fillRect(i * pw + hash(k + i * 2.2 + j) * pw, y, 1.4, len);
      }
      ctx.fillStyle = "rgba(0,0,0,0.75)";
      ctx.fillRect(i * pw, y, pw, 2.5);
      y += len;
      j++;
    }
    ctx.fillStyle = "rgba(0,0,0,0.8)";
    ctx.fillRect(i * pw, 0, 2.5, h);
  }
};

export const Floorboards: React.FC<PropViewProps> = () => {
  const tex = useStaticTexture(2048, 2048, paintPlanks, "planks");
  const W = ROOM.right - ROOM.left;
  const D = 5.2;
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.003, ROOM.back + D / 2]} receiveShadow>
      <planeGeometry args={[W, D]} />
      <meshStandardMaterial map={tex} roughness={0.42} metalness={0.05} />
    </mesh>
  );
};

// ---------------------------------------------------------------- window: blinds, rain, city, neon

const paintCity = (ctx: CanvasRenderingContext2D, w: number, h: number, t: number, flash: number, neon: number) => {
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, `rgb(${10 + 140 * flash},${14 + 150 * flash},${30 + 170 * flash})`);
  sky.addColorStop(1, `rgb(${30 + 90 * flash},${34 + 90 * flash},${58 + 100 * flash})`);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  // two rows of buildings with lit windows
  for (let layer = 0; layer < 2; layer++) {
    let x = -20;
    let i = 0;
    while (x < w) {
      const bw = 70 + 110 * hash(layer * 100 + i);
      const bh = (layer ? 0.45 : 0.62) * h + hash(layer * 50 + i * 3) * 0.3 * h;
      const top = h - bh + (layer ? 60 : 0);
      ctx.fillStyle = layer ? `rgb(${8 + 30 * flash},${9 + 30 * flash},${14 + 40 * flash})` : `rgb(${16 + 40 * flash},${18 + 40 * flash},${28 + 50 * flash})`;
      ctx.fillRect(x, top, bw, h - top);
      for (let wy = top + 16; wy < h - 10; wy += 22) {
        for (let wx = x + 10; wx < x + bw - 12; wx += 18) {
          const k = hash(wx * 0.37 + wy * 1.31 + layer * 7);
          if (k > 0.72) {
            const warm = hash(wx + wy) > 0.35;
            ctx.fillStyle = warm ? `rgba(255,196,120,${0.35 + 0.4 * k})` : `rgba(150,190,255,${0.3 + 0.3 * k})`;
            ctx.fillRect(wx, wy, 8, 11);
          }
        }
      }
      x += bw + 6;
      i++;
    }
  }
  // the neon sign (a vertical HOTEL blade) — buzzes and blinks
  const nx = w * 0.22;
  ctx.save();
  ctx.shadowColor = "#ff2a4d";
  ctx.shadowBlur = 30 * neon;
  ctx.fillStyle = `rgba(255,${60 + 40 * neon},${90 + 30 * neon},${0.25 + 0.75 * neon})`;
  ctx.font = `700 ${h * 0.085}px ${NOIR_FONTS.serif}`;
  ctx.textAlign = "center";
  "HOTEL".split("").forEach((ch, i) => ctx.fillText(ch, nx, h * 0.18 + i * h * 0.1));
  ctx.restore();
  // rain streaks
  ctx.strokeStyle = `rgba(200,215,255,${0.16 + 0.3 * flash})`;
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 160; i++) {
    const sx = hash(i * 1.9) * (w + 200) - 100;
    const speed = 900 + 500 * hash(i * 2.7);
    const y = ((hash(i * 4.1) * h + t * speed) % (h + 80)) - 40;
    ctx.beginPath();
    ctx.moveTo(sx, y);
    ctx.lineTo(sx - 7, y + 34);
    ctx.stroke();
  }
};

const paintGlass = (ctx: CanvasRenderingContext2D, w: number, h: number, t: number, flash: number) => {
  ctx.clearRect(0, 0, w, h);
  // static beads
  for (let i = 0; i < 260; i++) {
    const x = hash(i * 9.1) * w;
    const y = hash(i * 3.7) * h;
    const r = 0.8 + 1.8 * hash(i * 5.3) ** 2;
    ctx.fillStyle = `rgba(210,225,255,${0.1 + 0.22 * flash})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // running drops: each slides down, pauses, slides (pure in t)
  for (let i = 0; i < 26; i++) {
    const x = hash(i * 11.3) * w;
    const period = 2.5 + 3 * hash(i * 2.9);
    const phase = ((t + hash(i * 6.1) * period) % period) / period;
    const y = phase * (h + 60) - 30;
    ctx.strokeStyle = `rgba(210,225,255,${0.14 + 0.2 * flash})`;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x, Math.max(0, y - 90 * phase));
    ctx.lineTo(x + 2, y);
    ctx.stroke();
    ctx.fillStyle = `rgba(230,240,255,${0.22 + 0.3 * flash})`;
    ctx.beginPath();
    ctx.arc(x + 2, y, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }
};

/** Neon level 0.15..1: a steady buzz with a seeded flicker and a short dropout every few seconds. */
export const neonLevel = (t: number) => {
  const cycle = t % 3.7;
  if (cycle > 3.42 && cycle < 3.52) return 0.15;
  const buzz = 0.88 + 0.12 * Math.sin(t * 47) * Math.sin(t * 13.3);
  return random(`neon-${Math.floor(t * 24)}`) > 0.94 ? 0.45 : buzz;
};

export const VenetianWindow: React.FC<PropViewProps> = ({ t }) => {
  const flash = useLightning();
  const neon = neonLevel(t);
  const W = WINDOW.width;
  const H = WINDOW.top - WINDOW.sill;
  const cy = (WINDOW.top + WINDOW.sill) / 2;
  const city = useLiveTexture(1024, 768, (ctx, w, h) => paintCity(ctx, w, h, t, flash, neon));
  const glass = useLiveTexture(512, 512, (ctx, w, h) => paintGlass(ctx, w, h, t, flash));
  const slats = useMemo(() => {
    const out: number[] = [];
    for (let y = WINDOW.top - 0.07; y > WINDOW.sill + 0.04; y -= 0.052) out.push(y);
    return out;
  }, []);
  const tilt = 0.42;
  const frame = "#2a1d15";
  return (
    <group>
      {/* the street beyond: never casts shadows (the key light comes through it) */}
      <mesh position={[0.3, cy + 0.2, -1.4]}>
        <planeGeometry args={[4.6, 3.4]} />
        <meshBasicMaterial map={city} toneMapped={false} color={[0.55 + flash, 0.55 + flash, 0.55 + flash]} />
      </mesh>
      {/* rain on the glass */}
      <mesh position={[0, cy, -0.05]}>
        <planeGeometry args={[W, H]} />
        <meshBasicMaterial map={glass} transparent depthWrite={false} toneMapped={false} opacity={0.9} />
      </mesh>
      {/* casing + sill */}
      <Box p={[-W / 2 - 0.04, cy, 0.02]} s={[0.08, H + 0.16, 0.06]} color={frame} rough={0.6} />
      <Box p={[W / 2 + 0.04, cy, 0.02]} s={[0.08, H + 0.16, 0.06]} color={frame} rough={0.6} />
      <Box p={[0, WINDOW.top + 0.04, 0.02]} s={[W + 0.16, 0.08, 0.06]} color={frame} rough={0.6} />
      <Box p={[0, WINDOW.sill - 0.02, 0.07]} s={[W + 0.24, 0.04, 0.16]} color={frame} rough={0.55} />
      {/* mullion: an old double-hung sash */}
      <Box p={[0, cy, -0.04]} s={[W, 0.035, 0.03]} color={frame} rough={0.6} />
      {/* the blinds: slats cast the stripes */}
      <Box p={[0, WINDOW.top - 0.03, 0.06]} s={[W - 0.02, 0.04, 0.06]} color="#8f897c" rough={0.7} />
      {slats.map((y) => (
        <mesh key={y} position={[0, y, 0.06]} rotation={[tilt, 0, 0]} castShadow receiveShadow>
          <boxGeometry args={[W - 0.04, 0.005, 0.046]} />
          <meshStandardMaterial color="#b8b1a2" roughness={0.65} />
        </mesh>
      ))}
      {[-0.45, 0.45].map((x) => (
        <mesh key={x} position={[x * W * 0.6, cy, 0.062]} castShadow>
          <cylinderGeometry args={[0.0025, 0.0025, H, 4]} />
          <meshStandardMaterial color="#6d675c" />
        </mesh>
      ))}
      {/* neon spill: red light from the sign outside (no shadows: a glow through the slats) */}
      <pointLight position={[-0.55, 1.9, -0.7]} color="#ff2a4d" intensity={0.55 * neon} distance={4.5} decay={1.8} />
    </group>
  );
};

// ---------------------------------------------------------------- the door, frosted glass, hallway

const paintDoorGlass = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
  // Frosted amber glass; the lettering reads from the hallway, so from inside it is mirrored.
  const g = ctx.createRadialGradient(w * 0.5, h * 0.35, 20, w * 0.5, h * 0.5, w * 0.8);
  g.addColorStop(0, "#f2d6a2");
  g.addColorStop(1, "#b98d52");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 3000; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.05 * hash(i * 1.3)})`;
    ctx.fillRect(hash(i * 2.1) * w, hash(i * 3.3) * h, 2, 2);
  }
  ctx.save();
  ctx.translate(w, 0);
  ctx.scale(-1, 1);
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(30,20,10,0.92)";
  ctx.font = `700 ${h * 0.2}px ${NOIR_FONTS.serif}`;
  ctx.fillText("CLAUDE", w / 2, h * 0.4);
  ctx.font = `400 ${h * 0.075}px ${NOIR_FONTS.type}`;
  ctx.fillText("PRIVATE  INVESTIGATOR", w / 2, h * 0.56);
  ctx.font = `400 ${h * 0.055}px ${NOIR_FONTS.type}`;
  ctx.fillText("bugs · outages · missing semicolons", w / 2, h * 0.68);
  ctx.restore();
};

export const PiDoor: React.FC<PropViewProps> = () => {
  const { fps } = useVideoConfig();
  const ev = useEvent("door");
  const target = Number(ev.data.angle ?? 100);
  const open = ev.started ? spring({ frame: ev.local * fps, fps, config: { damping: 11, stiffness: 210, mass: 0.7 } }) : 0;
  const angle = (open * target * Math.PI) / 180;
  const glassTex = useStaticTexture(512, 512, paintDoorGlass, "door-glass");
  const W = DOOR.width;
  const H = DOOR.height;
  const wood = "#2c1d14";
  const hall = 0.25 + 0.75 * clamp01(open * 1.4);
  const spillTarget = useMemo(() => new THREE.Object3D(), []);
  return (
    <group>
      {/* casing */}
      <Box p={[-W / 2 - 0.045, H / 2, 0.02]} s={[0.09, H + 0.09, 0.18]} color={wood} rough={0.6} />
      <Box p={[W / 2 + 0.045, H / 2, 0.02]} s={[0.09, H + 0.09, 0.18]} color={wood} rough={0.6} />
      <Box p={[0, H + 0.045, 0.02]} s={[W + 0.18, 0.09, 0.18]} color={wood} rough={0.6} />
      {/* leaf, hinged on the +x (front, camera) side, swinging into the room: it opens away from the
          shots taken from behind the desk, so the bright doorway stays clear */}
      <group position={[W / 2, 0, 0.0]} rotation={[0, angle, 0]}>
        <group position={[-W / 2, 0, 0]}>
          <Box p={[0, 0.55, 0]} s={[W - 0.02, 1.1, 0.045]} color={wood} rough={0.55} />
          <Box p={[0, 0.55, 0.026]} s={[W - 0.2, 0.8, 0.01]} color="#24170f" rough={0.6} />
          <Box p={[-(W - 0.02) / 2 + 0.05, 1.62, 0]} s={[0.1, 1.04, 0.045]} color={wood} rough={0.55} />
          <Box p={[(W - 0.02) / 2 - 0.05, 1.62, 0]} s={[0.1, 1.04, 0.045]} color={wood} rough={0.55} />
          <Box p={[0, 2.1, 0]} s={[W - 0.02, 0.08, 0.045]} color={wood} rough={0.55} />
          <mesh position={[0, 1.6, 0]}>
            <planeGeometry args={[W - 0.2, 0.9]} />
            <meshStandardMaterial map={glassTex} transparent opacity={0.62} emissiveMap={glassTex} emissive="#ffffff" emissiveIntensity={0.55 * hall} roughness={0.4} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
          <mesh position={[-W / 2 + 0.1, 1.02, 0.05]} castShadow>
            <sphereGeometry args={[0.03, 12, 8]} />
            <meshStandardMaterial color="#b08a3e" metalness={0.8} roughness={0.3} />
          </mesh>
        </group>
      </group>
      {/* hallway: floor, walls, a bright end wall for silhouettes */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, -1.6]} receiveShadow>
        <planeGeometry args={[1.6, 3.2]} />
        <meshStandardMaterial color="#241a14" roughness={0.8} />
      </mesh>
      <mesh position={[0, 1.3, -3.1]}>
        <planeGeometry args={[1.8, 2.6]} />
        <meshBasicMaterial color={[1.5 * hall + 0.5, 1.1 * hall + 0.36, 0.62 * hall + 0.18]} toneMapped={false} />
      </mesh>
      {[-0.8, 0.8].map((x) => (
        <mesh key={x} position={[x, 1.3, -1.6]} rotation={[0, x > 0 ? -Math.PI / 2 : Math.PI / 2, 0]} receiveShadow>
          <planeGeometry args={[3.2, 2.6]} />
          <meshStandardMaterial color="#1e1712" roughness={0.95} />
        </mesh>
      ))}
      <pointLight position={[0, 2.3, -2.4]} color="#ffb36b" intensity={4.0} distance={2.6} decay={1.5} />
      {/* light spilling through the open door into the room */}
      <primitive object={spillTarget} position={[0, 0.4, 2.2]} />
      <spotLight position={[0, 2.0, -1.9]} target={spillTarget} color="#ffbe7a" intensity={11 * clamp01(open)} distance={7} angle={0.42} penumbra={0.7} decay={1.6} />
    </group>
  );
};

// ---------------------------------------------------------------- desk pieces

/** A heavy pedestal desk with a green leather top. Front (+z) faces the client. Top at 0.76 m. */
export const DetectiveDesk: React.FC<PropViewProps> = () => {
  const wood = "#3a2418";
  const dark = "#22150e";
  const W = 1.7;
  const D = 0.8;
  return (
    <group>
      <Box p={[0, 0.735, 0]} s={[W, 0.05, D]} color={wood} rough={0.72} />
      <mesh position={[0, 0.7605, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[W - 0.16, D - 0.16]} />
        <meshStandardMaterial color="#1d3a2a" roughness={0.88} />
      </mesh>
      {[-1, 1].map((sx) => (
        <group key={sx} position={[sx * (W / 2 - 0.25), 0, 0]}>
          <Box p={[0, 0.355, 0]} s={[0.46, 0.71, D - 0.06]} color={wood} rough={0.75} />
          {[0, 1, 2].map((i) => (
            <group key={i} position={[0, 0.13 + i * 0.2, -(D - 0.06) / 2 - 0.006]}>
              <Box p={[0, 0, 0]} s={[0.4, 0.17, 0.012]} color={dark} rough={0.7} />
              <Box p={[0, 0, -0.012]} s={[0.09, 0.016, 0.014]} color="#9a7a36" rough={0.3} metal={0.8} />
            </group>
          ))}
        </group>
      ))}
      {/* modesty panel on the client side, with two raised panels */}
      <Box p={[0, 0.4, D / 2 - 0.05]} s={[W - 0.92, 0.56, 0.03]} color={wood} rough={0.75} />
      {[-1, 1].map((sx) => (
        <Box key={sx} p={[sx * (W / 2 - 0.25), 0.38, D / 2 - 0.025]} s={[0.36, 0.5, 0.012]} color={dark} rough={0.72} />
      ))}
      <Box p={[0, 0.03, 0]} s={[W - 0.02, 0.06, D - 0.04]} color={dark} rough={0.8} />
    </group>
  );
};

export const BankersLamp: React.FC<PropViewProps> = ({ practicals }) => {
  const k = practicals.lamp;
  const target = useMemo(() => new THREE.Object3D(), []);
  return (
    <group>
      <Box p={[0, 0.014, 0]} s={[0.2, 0.028, 0.12]} color="#8a6a2e" rough={0.35} metal={0.75} />
      <mesh position={[0, 0.16, -0.02]} castShadow>
        <cylinderGeometry args={[0.009, 0.009, 0.28, 8]} />
        <meshStandardMaterial color="#9a7a36" metalness={0.8} roughness={0.3} />
      </mesh>
      <group position={[0, 0.33, 0.01]} rotation={[0, 0, Math.PI / 2]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.075, 0.075, 0.3, 20, 1, true, Math.PI / 2, Math.PI]} />
          <meshStandardMaterial color="#1d6b3c" emissive="#2fa860" emissiveIntensity={0.35 * k} roughness={0.25} metalness={0.1} side={THREE.DoubleSide} />
        </mesh>
      </group>
      <mesh position={[0, 0.315, 0.01]}>
        <sphereGeometry args={[0.03, 12, 8]} />
        <meshBasicMaterial color={[2.2 * k, 1.8 * k, 1.1 * k]} toneMapped={false} />
      </mesh>
      <primitive object={target} position={[-0.25, 0, 0.2]} />
      <spotLight position={[0, 0.3, 0.01]} target={target} color="#ffcf8a" intensity={5.5 * k} distance={2.4} angle={1.05} penumbra={0.75} decay={1.8} castShadow shadow-mapSize={[1024, 1024]} shadow-bias={-0.0006} />
    </group>
  );
};

export const CrtTerminal: React.FC<PropViewProps> = ({ params, since, t, practicals, screens }) => {
  // A `highlight` props cue (its own param, so the screen's typing doesn't restart) marks the culprit's line.
  const screen = (params.screen as { preset: string } | undefined) ?? { preset: "term-idle" };
  const content = params.highlight ? { ...screen, highlightSince: since.highlight ?? 0 } : screen;
  const draw = screens?.[content.preset];
  const beige = "#8f8a7c";
  const glow = practicals.screens;
  return (
    <group>
      <Box p={[0, 0.02, -0.06]} s={[0.3, 0.04, 0.3]} color="#6f6a5e" rough={0.7} />
      <Box p={[0, 0.215, 0]} s={[0.42, 0.35, 0.06]} color={beige} rough={0.6} />
      <mesh position={[0, 0.2, -0.17]} castShadow receiveShadow>
        <boxGeometry args={[0.34, 0.29, 0.28]} />
        <meshStandardMaterial color="#7f7a6d" roughness={0.65} />
      </mesh>
      <Box p={[0, 0.215, 0.031]} s={[0.35, 0.27, 0.004]} color="#0b0f0c" rough={0.3} />
      <group position={[0, 0.218, 0.034]}>
        <ScreenSurface width={0.32} height={0.24} content={content} draw={draw} t={t} since={since.screen ?? 0} brightness={1.0 + 0.2 * glow} resolution={1024} />
      </group>
      <mesh position={[0.17, 0.06, 0.032]}>
        <sphereGeometry args={[0.006, 8, 6]} />
        <meshBasicMaterial color={[0.4, 2.2, 0.8]} toneMapped={false} />
      </mesh>
      {/* the screen lights whoever stands in front of it */}
      <pointLight position={[0, 0.24, 0.32]} color="#6dffa8" intensity={0.3 * glow} distance={1.3} decay={1.8} />
      {/* where the red string ends: a pin on the bezel */}
      <mesh position={[-0.18, 0.36, 0.035]}>
        <sphereGeometry args={[0.012, 10, 8]} />
        <meshStandardMaterial color="#c8102e" roughness={0.35} />
      </mesh>
    </group>
  );
};

export const MechKeyboard: React.FC<PropViewProps> = () => {
  const keys = useMemo(() => {
    const out: V3[] = [];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 12; c++) out.push([-0.155 + c * 0.028 + (r % 2) * 0.006, 0.033, -0.042 + r * 0.028]);
    return out;
  }, []);
  return (
    <group>
      <Box p={[0, 0.013, 0]} s={[0.37, 0.026, 0.14]} color="#7d735f" rough={0.6} />
      {keys.map((p, i) => (
        <mesh key={i} position={p} castShadow>
          <boxGeometry args={[0.022, 0.012, 0.022]} />
          <meshStandardMaterial color={i % 7 === 3 ? "#5b5446" : "#cfc5ae"} roughness={0.55} />
        </mesh>
      ))}
    </group>
  );
};

export const DeskClutter: React.FC<PropViewProps> = () => (
  <group>
    <Box p={[-0.1, 0.008, 0]} s={[0.24, 0.016, 0.32]} color="#b38f55" rough={0.85} rot={[0, 0.12, 0]} />
    <Box p={[-0.1, 0.022, 0.01]} s={[0.23, 0.012, 0.31]} color="#c79d5e" rough={0.85} rot={[0, -0.05, 0]} />
    <Box p={[0.2, 0.006, 0.05]} s={[0.12, 0.012, 0.17]} color="#e9e2cf" rough={0.9} rot={[0, -0.3, 0]} />
    <mesh position={[0.2, 0.015, 0.05]} rotation={[0, 0.8, Math.PI / 2]} castShadow>
      <cylinderGeometry args={[0.004, 0.004, 0.14, 6]} />
      <meshStandardMaterial color="#d9a521" />
    </mesh>
    {/* magnifying glass */}
    <group position={[0.06, 0.012, 0.16]} rotation={[-Math.PI / 2, 0, 0.6]}>
      <mesh castShadow>
        <torusGeometry args={[0.04, 0.006, 8, 24]} />
        <meshStandardMaterial color="#8a6a2e" metalness={0.8} roughness={0.3} />
      </mesh>
      <mesh position={[0, -0.085, 0]} castShadow>
        <cylinderGeometry args={[0.007, 0.009, 0.09, 8]} />
        <meshStandardMaterial color="#1a1210" roughness={0.5} />
      </mesh>
    </group>
  </group>
);

// ---------------------------------------------------------------- ceiling fan, clock, cabinet, coat rack

export const CeilingFan: React.FC<PropViewProps> = ({ t }) => {
  const spin = t * 1.7;
  return (
    <group>
      <mesh position={[0, -0.16, 0]} castShadow>
        <cylinderGeometry args={[0.012, 0.012, 0.32, 6]} />
        <meshStandardMaterial color="#3a3026" metalness={0.5} roughness={0.5} />
      </mesh>
      <mesh position={[0, -0.38, 0]} castShadow>
        <cylinderGeometry args={[0.07, 0.095, 0.13, 14]} />
        <meshStandardMaterial color="#4a3b2b" metalness={0.55} roughness={0.4} />
      </mesh>
      <group position={[0, -0.4, 0]} rotation={[0, spin, 0]}>
        {[0, 1, 2, 3].map((i) => (
          <group key={i} rotation={[0, (i * Math.PI) / 2, 0]}>
            <mesh position={[0.38, 0, 0]} rotation={[0.16, 0, 0]} castShadow>
              <boxGeometry args={[0.6, 0.01, 0.12]} />
              <meshStandardMaterial color="#3b2a1c" roughness={0.6} />
            </mesh>
          </group>
        ))}
      </group>
      <mesh position={[0, -0.48, 0]}>
        <sphereGeometry args={[0.06, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2]} />
        <meshStandardMaterial color="#d8cfb8" roughness={0.4} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
};

const paintClock = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
  ctx.fillStyle = "#e8dfc8";
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#1a1612";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 ${w * 0.1}px ${NOIR_FONTS.serif}`;
  for (let i = 1; i <= 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    ctx.fillText(String(i), w / 2 + Math.sin(a) * w * 0.38, h / 2 - Math.cos(a) * h * 0.38);
  }
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2;
    const r0 = i % 5 ? 0.46 : 0.43;
    ctx.lineWidth = i % 5 ? 2 : 5;
    ctx.strokeStyle = "#1a1612";
    ctx.beginPath();
    ctx.moveTo(w / 2 + Math.sin(a) * w * r0, h / 2 - Math.cos(a) * h * r0);
    ctx.lineTo(w / 2 + Math.sin(a) * w * 0.49, h / 2 - Math.cos(a) * h * 0.49);
    ctx.stroke();
  }
};

/** The clock starts at 2:14:05 and runs with the episode. */
export const WallClock: React.FC<PropViewProps> = ({ t }) => {
  const face = useStaticTexture(512, 512, paintClock, "clock");
  const secs = 2 * 3600 + 14 * 60 + 5 + t;
  const hand = (frac: number, len: number, width: number, color: string, z: number) => (
    <group rotation={[0, 0, -frac * Math.PI * 2]} position={[0, 0, z]}>
      <mesh position={[0, len / 2 - 0.02, 0]}>
        <boxGeometry args={[width, len, 0.004]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </group>
  );
  return (
    <group>
      <mesh position={[0, 0, 0.01]}>
        <circleGeometry args={[0.17, 40]} />
        <meshStandardMaterial map={face} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0, 0.015]}>
        <torusGeometry args={[0.175, 0.016, 8, 40]} />
        <meshStandardMaterial color="#2a1d15" roughness={0.5} />
      </mesh>
      {hand(((secs / 3600) % 12) / 12, 0.09, 0.012, "#111", 0.02)}
      {hand(((secs / 60) % 60) / 60, 0.135, 0.008, "#111", 0.024)}
      {hand((secs % 60) / 60, 0.145, 0.003, "#8b1a1a", 0.028)}
    </group>
  );
};

export const FilingCabinet: React.FC<PropViewProps> = () => (
  <group>
    <Box p={[0, 0.65, 0]} s={[0.5, 1.3, 0.6]} color="#3b403d" rough={0.55} metal={0.45} />
    {[0, 1, 2].map((i) => (
      <group key={i} position={[0, 0.25 + i * 0.4, 0.302]}>
        <Box p={[0, 0, 0]} s={[0.44, 0.36, 0.01]} color="#454b47" rough={0.5} metal={0.5} />
        <Box p={[0, -0.06, 0.012]} s={[0.12, 0.02, 0.02]} color="#9c9583" rough={0.3} metal={0.8} />
        <Box p={[0, 0.07, 0.008]} s={[0.1, 0.05, 0.004]} color="#d8cfb6" rough={0.9} />
      </group>
    ))}
  </group>
);

export const CoatRack: React.FC<PropViewProps> = () => (
  <group>
    <mesh position={[0, 0.9, 0]} castShadow>
      <cylinderGeometry args={[0.018, 0.022, 1.8, 8]} />
      <meshStandardMaterial color="#2a1d15" roughness={0.6} />
    </mesh>
    <mesh position={[0, 0.02, 0]} castShadow>
      <cylinderGeometry args={[0.2, 0.22, 0.04, 12]} />
      <meshStandardMaterial color="#2a1d15" roughness={0.6} />
    </mesh>
    {/* a trench coat hanging */}
    <mesh position={[0, 1.22, 0.07]} castShadow>
      <cylinderGeometry args={[0.13, 0.24, 0.95, 10, 1, true]} />
      <meshStandardMaterial color="#7a6a4e" roughness={0.85} side={THREE.DoubleSide} />
    </mesh>
    <mesh position={[0, 1.72, 0.05]} castShadow>
      <sphereGeometry args={[0.1, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
      <meshStandardMaterial color="#7a6a4e" roughness={0.85} />
    </mesh>
  </group>
);

/** The detective's fedora. `size` = the wearer's scale (held items are drawn at real-world size). */
export const Fedora: React.FC<PropViewProps> = ({ params }) => {
  const s = Number(params.size ?? 1);
  const felt = "#3b3943";
  return (
    <group scale={s} position={[0, -0.04 * s, 0.002 * s]} rotation={[0.14, 0, -0.12]}>
      <mesh castShadow receiveShadow scale={[1, 1, 0.86]}>
        <cylinderGeometry args={[0.074, 0.077, 0.005, 28]} />
        <meshStandardMaterial color={felt} roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.024, 0]} castShadow receiveShadow scale={[1, 1, 0.8]}>
        <cylinderGeometry args={[0.036, 0.043, 0.046, 24]} />
        <meshStandardMaterial color={felt} roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.047, -0.002]} scale={[1, 0.3, 0.64]}>
        <sphereGeometry args={[0.036, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={felt} roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.009, 0]} scale={[1, 1, 0.8]}>
        <cylinderGeometry args={[0.0435, 0.0445, 0.012, 24]} />
        <meshStandardMaterial color="#5a1420" roughness={0.6} />
      </mesh>
    </group>
  );
};

// ---------------------------------------------------------------- the evidence board

type Pinned = { id: string; x: number; y: number; w: number; h: number; rot: number };
/** Board-local layout (x along the board toward the back wall, y up from the floor). */
export const BOARD = { cx: 0, cy: 1.55, w: 1.7, h: 1.15 };
export const SUSPECTS: (Pinned & { name: string; alibi: string })[] = [
  { id: "intern", name: "THE INTERN", alibi: "README ONLY", x: -0.52, y: 1.72, w: 0.3, h: 0.36, rot: 0.05 },
  { id: "cache", name: "THE CACHE", alibi: "NO MEMORY", x: 0.0, y: 1.42, w: 0.3, h: 0.36, rot: -0.04 },
  { id: "dns", name: "DNS", alibi: "PROPAGATING", x: 0.52, y: 1.74, w: 0.3, h: 0.36, rot: 0.06 },
];
const HUB = { x: -0.33, y: 1.28 };

const paintCork = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
  ctx.fillStyle = "#6b4a2e";
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 9000; i++) {
    const v = hash(i * 1.37);
    ctx.fillStyle = v > 0.5 ? `rgba(160,120,80,${0.25 * v})` : `rgba(30,18,10,${0.35 * v})`;
    ctx.fillRect(hash(i * 2.11) * w, hash(i * 3.07) * h, 2 + 3 * hash(i), 2 + 3 * hash(i * 1.9));
  }
};

const mugshotBack = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
  // polaroid frame + lineup wall
  ctx.fillStyle = "#ece6d6";
  ctx.fillRect(0, 0, w, h);
  const px = w * 0.07;
  const pw = w * 0.86;
  const ph = h * 0.7;
  ctx.fillStyle = "#4a5054";
  ctx.fillRect(px, px, pw, ph);
  ctx.strokeStyle = "rgba(230,230,220,0.35)";
  ctx.fillStyle = "rgba(230,230,220,0.5)";
  ctx.lineWidth = 2;
  ctx.font = `400 ${h * 0.03}px ${NOIR_FONTS.type}`;
  for (let i = 0; i < 7; i++) {
    const y = px + ph - (i + 1) * ph * 0.13;
    ctx.beginPath();
    ctx.moveTo(px, y);
    ctx.lineTo(px + pw, y);
    ctx.stroke();
    ctx.fillText(`${4 + i}'`, px + 8, y - 4);
  }
  return { px, pw, ph };
};

const placard = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, text: string, num: string) => {
  ctx.fillStyle = "#151515";
  ctx.fillRect(x, y, w, w * 0.3);
  ctx.fillStyle = "#f2efe6";
  ctx.textAlign = "center";
  ctx.font = `400 ${w * 0.1}px ${NOIR_FONTS.type}`;
  ctx.fillText(num, x + w / 2, y + w * 0.12);
  ctx.font = `400 ${w * 0.13}px ${NOIR_FONTS.type}`;
  ctx.fillText(text, x + w / 2, y + w * 0.25);
  ctx.textAlign = "left";
};

const paintIntern = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
  const { px, pw, ph } = mugshotBack(ctx, w, h);
  const cx = px + pw / 2;
  // shoulders + hoodie
  ctx.fillStyle = "#3d6fb0";
  ctx.beginPath();
  ctx.ellipse(cx, px + ph, pw * 0.36, ph * 0.3, 0, Math.PI, 0);
  ctx.fill();
  // lanyard + badge
  ctx.strokeStyle = "#d33";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(cx - 40, px + ph * 0.72);
  ctx.lineTo(cx, px + ph * 0.9);
  ctx.lineTo(cx + 40, px + ph * 0.72);
  ctx.stroke();
  ctx.fillStyle = "#fff";
  ctx.fillRect(cx - 26, px + ph * 0.87, 52, 34);
  ctx.fillStyle = "#222";
  ctx.font = `700 ${h * 0.022}px ${NOIR_FONTS.type}`;
  ctx.textAlign = "center";
  ctx.fillText("INTERN", cx, px + ph * 0.87 + 22);
  // head
  ctx.fillStyle = "#e9b98f";
  ctx.beginPath();
  ctx.ellipse(cx, px + ph * 0.45, pw * 0.2, ph * 0.21, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#3a2618";
  ctx.beginPath();
  ctx.ellipse(cx, px + ph * 0.3, pw * 0.22, ph * 0.1, 0, Math.PI, 0);
  ctx.fill();
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.ellipse(cx - pw * 0.18 + i * pw * 0.07, px + ph * 0.27, 14, 22, 0.4 * (i - 2.5), 0, Math.PI * 2);
    ctx.fill();
  }
  // nervous face
  ctx.fillStyle = "#1a1a1a";
  ctx.beginPath();
  ctx.arc(cx - 26, px + ph * 0.45, 7, 0, Math.PI * 2);
  ctx.arc(cx + 26, px + ph * 0.45, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 4;
  ctx.beginPath();
  for (let i = 0; i <= 6; i++) ctx.lineTo(cx - 24 + i * 8, px + ph * 0.56 + (i % 2 ? 4 : -2));
  ctx.stroke();
  ctx.fillStyle = "rgba(120,190,255,0.8)";
  ctx.beginPath();
  ctx.ellipse(cx + pw * 0.17, px + ph * 0.36, 6, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  placard(ctx, cx - pw * 0.25, px + ph * 0.62, pw * 0.5, "README.md", "NO. 1");
  ctx.fillStyle = "#222";
  ctx.font = `400 ${h * 0.075}px ${NOIR_FONTS.type}`;
  ctx.textAlign = "center";
  ctx.fillText("THE INTERN", w / 2, h * 0.9);
  ctx.textAlign = "left";
};

const paintCache = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
  const { px, pw, ph } = mugshotBack(ctx, w, h);
  const cx = px + pw / 2;
  // a stack of disks with a confused face
  for (let i = 2; i >= 0; i--) {
    const y = px + ph * (0.38 + i * 0.16);
    ctx.fillStyle = "#8e9aa6";
    ctx.fillRect(cx - pw * 0.26, y, pw * 0.52, ph * 0.16);
    ctx.fillStyle = "#b9c4ce";
    ctx.beginPath();
    ctx.ellipse(cx, y, pw * 0.26, ph * 0.05, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#6f7b86";
    ctx.beginPath();
    ctx.ellipse(cx, y + ph * 0.16, pw * 0.26, ph * 0.05, 0, 0, Math.PI);
    ctx.fill();
  }
  ctx.fillStyle = "#1a1a1a";
  ctx.beginPath();
  ctx.arc(cx - 28, px + ph * 0.5, 9, 0, Math.PI * 2);
  ctx.arc(cx + 28, px + ph * 0.5, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(cx, px + ph * 0.64, 14, Math.PI * 1.15, Math.PI * 1.85);
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = `700 ${h * 0.12}px ${NOIR_FONTS.serif}`;
  ctx.fillText("?", cx + pw * 0.22, px + ph * 0.3);
  ctx.fillText("?", cx - pw * 0.36, px + ph * 0.24);
  placard(ctx, cx - pw * 0.25, px + ph * 0.78, pw * 0.5, "TTL: 0", "NO. 2");
  ctx.fillStyle = "#222";
  ctx.font = `400 ${h * 0.075}px ${NOIR_FONTS.type}`;
  ctx.textAlign = "center";
  ctx.fillText("THE CACHE", w / 2, h * 0.9);
  ctx.textAlign = "left";
};

const paintDns = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
  const { px, pw, ph } = mugshotBack(ctx, w, h);
  const cx = px + pw / 2;
  // trench collar
  ctx.fillStyle = "#7a6a4e";
  ctx.beginPath();
  ctx.moveTo(cx - pw * 0.42, px + ph);
  ctx.lineTo(cx - pw * 0.12, px + ph * 0.7);
  ctx.lineTo(cx, px + ph * 0.86);
  ctx.lineTo(cx + pw * 0.12, px + ph * 0.7);
  ctx.lineTo(cx + pw * 0.42, px + ph);
  ctx.fill();
  // a globe in shades
  const gy = px + ph * 0.42;
  const gr = pw * 0.24;
  ctx.fillStyle = "#3f7fb8";
  ctx.beginPath();
  ctx.arc(cx, gy, gr, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#5aa86a";
  ctx.beginPath();
  ctx.ellipse(cx - gr * 0.3, gy - gr * 0.2, gr * 0.35, gr * 0.5, 0.4, 0, Math.PI * 2);
  ctx.ellipse(cx + gr * 0.45, gy + gr * 0.3, gr * 0.25, gr * 0.3, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(cx, gy, gr * 0.45, gr, 0, 0, Math.PI * 2);
  ctx.moveTo(cx - gr, gy);
  ctx.lineTo(cx + gr, gy);
  ctx.stroke();
  ctx.fillStyle = "#0b0b0b";
  ctx.beginPath();
  ctx.ellipse(cx - gr * 0.38, gy - gr * 0.08, gr * 0.3, gr * 0.17, 0.08, 0, Math.PI * 2);
  ctx.ellipse(cx + gr * 0.38, gy - gr * 0.08, gr * 0.3, gr * 0.17, -0.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(cx - gr * 0.1, gy - gr * 0.12, gr * 0.2, gr * 0.06);
  ctx.strokeStyle = "#0b0b0b";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(cx - gr * 0.25, gy + gr * 0.45);
  ctx.lineTo(cx + gr * 0.2, gy + gr * 0.4);
  ctx.stroke();
  placard(ctx, cx - pw * 0.25, px + ph * 0.74, pw * 0.5, "1.1.1.1", "NO. 3");
  ctx.fillStyle = "#222";
  ctx.font = `400 ${h * 0.085}px ${NOIR_FONTS.type}`;
  ctx.textAlign = "center";
  ctx.fillText("DNS", w / 2, h * 0.9);
  ctx.textAlign = "left";
};

const PAINT_SUSPECT: Record<string, (ctx: CanvasRenderingContext2D, w: number, h: number) => void> = { intern: paintIntern, cache: paintCache, dns: paintDns };

const paintStamp = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(-0.22);
  ctx.strokeStyle = "rgba(196,20,32,0.92)";
  ctx.fillStyle = "rgba(196,20,32,0.92)";
  ctx.lineWidth = 10;
  ctx.strokeRect(-w * 0.42, -h * 0.2, w * 0.84, h * 0.4);
  ctx.font = `400 ${h * 0.27}px ${NOIR_FONTS.type}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("CLEARED", 0, 4);
  ctx.restore();
  // ink wear
  ctx.globalCompositeOperation = "destination-out";
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = `rgba(0,0,0,${0.5 + 0.5 * hash(i * 1.1)})`;
    ctx.fillRect(hash(i * 2.3) * w, hash(i * 4.7) * h, 2 + 5 * hash(i), 2 + 4 * hash(i * 3.3));
  }
  ctx.globalCompositeOperation = "source-over";
};

const paintNote = (text: string, color: string) => (ctx: CanvasRenderingContext2D, w: number, h: number) => {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "rgba(0,0,0,0.08)";
  ctx.fillRect(0, 0, w, h * 0.12);
  ctx.fillStyle = "#1c1a16";
  ctx.textAlign = "center";
  const lines = text.split("\n");
  ctx.font = `400 ${h * (lines.length > 1 ? 0.2 : 0.42)}px ${NOIR_FONTS.type}`;
  lines.forEach((l, i) => ctx.fillText(l, w / 2, h * (lines.length > 1 ? 0.42 + i * 0.26 : 0.66)));
};

const paintNews = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
  ctx.fillStyle = "#d9d0b8";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#1b1814";
  ctx.font = `400 ${h * 0.07}px ${NOIR_FONTS.type}`;
  ctx.fillText("THE DAILY STACK  ·  2:14 A.M. EDITION", w * 0.05, h * 0.1);
  ctx.font = `900 ${h * 0.2}px ${NOIR_FONTS.serif}`;
  ctx.fillText("LOGIN FOUND", w * 0.05, h * 0.34);
  ctx.fillText("DEAD IN PROD", w * 0.05, h * 0.55);
  ctx.fillStyle = "rgba(27,24,20,0.6)";
  for (let i = 0; i < 9; i++) ctx.fillRect(w * 0.05, h * (0.64 + i * 0.035), w * (0.4 + 0.45 * hash(i)), h * 0.014);
  ctx.fillStyle = "#3a3630";
  ctx.fillRect(w * 0.62, h * 0.64, w * 0.33, h * 0.3);
};

const paintTrace = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
  ctx.fillStyle = "#e9e5d8";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#9b1c1c";
  ctx.font = `700 ${h * 0.07}px ${NOIR_FONTS.type}`;
  ctx.fillText("500 Internal Error", w * 0.06, h * 0.1);
  ctx.fillStyle = "#333";
  ctx.font = `400 ${h * 0.04}px ${NOIR_FONTS.type}`;
  ["at login (auth/login.ts:42)", "at handler (api.ts:17)", "at Router.dispatch", "at process.tick", "session = undefined"].forEach((l, i) => ctx.fillText(l, w * 0.06, h * (0.22 + i * 0.07)));
  ctx.strokeStyle = "rgba(160,20,20,0.8)";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.ellipse(w * 0.45, h * 0.215, w * 0.43, h * 0.06, 0, 0, Math.PI * 2);
  ctx.stroke();
};

const Pin: React.FC<{ p: V3 }> = ({ p }) => (
  <mesh position={p} castShadow>
    <sphereGeometry args={[0.012, 10, 8]} />
    <meshStandardMaterial color="#c8102e" roughness={0.35} />
  </mesh>
);

/** A string between two points (board-local), sagging a little. */
const StringSpan: React.FC<{ a: V3; b: V3; sag?: number }> = ({ a, b, sag = 0.02 }) => {
  const geo = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 8; i++) {
      const u = i / 8;
      pts.push(new THREE.Vector3(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u - sag * 4 * u * (1 - u), a[2] + (b[2] - a[2]) * u));
    }
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.003, 5, false);
  }, [a, b, sag]);
  return (
    <mesh geometry={geo}>
      <meshStandardMaterial color="#c8102e" emissive="#6a0814" emissiveIntensity={0.7} roughness={0.6} />
    </mesh>
  );
};

const NotePlane: React.FC<{ p: V3; w: number; h: number; rot: number; paint: (ctx: CanvasRenderingContext2D, w: number, h: number) => void; k: string }> = ({ p, w, h, rot, paint, k }) => {
  const tex = useStaticTexture(Math.round(512 * (w / Math.max(w, h))), Math.round(512 * (h / Math.max(w, h))), paint, k);
  return (
    <mesh position={p} rotation={[0, 0, rot]} receiveShadow>
      <planeGeometry args={[w, h]} />
      <meshStandardMaterial map={tex} roughness={0.85} />
    </mesh>
  );
};

const SuspectCard: React.FC<{ s: (typeof SUSPECTS)[number] }> = ({ s }) => {
  const photo = useStaticTexture(512, 614, PAINT_SUSPECT[s.id], `mug-${s.id}`);
  const stampTex = useStaticTexture(512, 300, paintStamp, "stamp");
  const flashEv = useEvent(`flash-${s.id}`);
  const stampEv = useEvent(`stamp-${s.id}`);
  const { t } = useEpisode();
  const flash = flashEv.started ? Math.exp(-flashEv.local / 0.12) : 0;
  const slam = stampEv.started ? 1 + 0.9 * Math.max(0, 1 - stampEv.local / 0.1) ** 2 : 0;
  return (
    <group position={[s.x, s.y, 0.034]} rotation={[0, 0, s.rot]}>
      <mesh receiveShadow>
        <planeGeometry args={[s.w, s.h]} />
        <meshStandardMaterial map={photo} roughness={0.55} emissiveMap={photo} emissive="#ffffff" emissiveIntensity={0.05 + 1.6 * flash} />
      </mesh>
      {s.id === "dns" ? (
        // still propagating: a little spinner on the photo
        <group position={[s.w * 0.28, s.h * 0.3, 0.003]} rotation={[0, 0, -t * 5]}>
          <mesh>
            <ringGeometry args={[0.018, 0.026, 20, 1, 0, Math.PI * 1.4]} />
            <meshBasicMaterial color={[2, 2, 2]} toneMapped={false} />
          </mesh>
        </group>
      ) : null}
      {stampEv.started ? (
        <mesh position={[0, -0.01, 0.006]} scale={slam}>
          <planeGeometry args={[s.w * 1.05, s.w * 0.62]} />
          <meshBasicMaterial map={stampTex} transparent depthWrite={false} toneMapped={false} color={[1.25, 1.25, 1.25]} />
        </mesh>
      ) : null}
      <Pin p={[0, s.h / 2 - 0.02, 0.012]} />
    </group>
  );
};

export const EvidenceBoard: React.FC<PropViewProps> = () => {
  const cork = useStaticTexture(1024, 700, paintCork, "cork");
  const frame = "#2a1d15";
  const z = 0.045;
  const hub: V3 = [HUB.x, HUB.y, z];
  return (
    <group>
      <mesh position={[BOARD.cx, BOARD.cy, 0.015]} receiveShadow castShadow>
        <boxGeometry args={[BOARD.w, BOARD.h, 0.03]} />
        <meshStandardMaterial map={cork} roughness={0.95} />
      </mesh>
      <Box p={[BOARD.cx, BOARD.cy + BOARD.h / 2 + 0.025, 0.02]} s={[BOARD.w + 0.1, 0.05, 0.05]} color={frame} rough={0.6} />
      <Box p={[BOARD.cx, BOARD.cy - BOARD.h / 2 - 0.025, 0.02]} s={[BOARD.w + 0.1, 0.05, 0.05]} color={frame} rough={0.6} />
      <Box p={[BOARD.cx - BOARD.w / 2 - 0.025, BOARD.cy, 0.02]} s={[0.05, BOARD.h, 0.05]} color={frame} rough={0.6} />
      <Box p={[BOARD.cx + BOARD.w / 2 + 0.025, BOARD.cy, 0.02]} s={[0.05, BOARD.h, 0.05]} color={frame} rough={0.6} />
      <NotePlane p={[0.02, 1.98, 0.033]} w={0.42} h={0.24} rot={-0.02} paint={paintNews} k="news" />
      <NotePlane p={[0.56, 1.3, 0.033]} w={0.22} h={0.28} rot={0.05} paint={paintTrace} k="trace" />
      <NotePlane p={[-0.66, 1.3, 0.033]} w={0.17} h={0.17} rot={-0.08} paint={paintNote("WHAT\nCHANGED?", "#e9d76a")} k="note-changed" />
      <NotePlane p={[HUB.x, HUB.y - 0.03, 0.034]} w={0.13} h={0.13} rot={0.06} paint={paintNote("?", "#f2c94c")} k="note-hub" />
      {SUSPECTS.map((s) => (
        <SuspectCard key={s.id} s={s} />
      ))}
      <Pin p={[0.02, 2.08, z]} />
      <Pin p={[0.56, 1.42, z]} />
      <Pin p={[-0.66, 1.37, z]} />
      <Pin p={hub} />
      {SUSPECTS.map((s) => (
        <StringSpan key={s.id} a={[s.x, s.y + s.h / 2 - 0.02, z]} b={hub} sag={0.03} />
      ))}
      <StringSpan a={[-0.66, 1.37, z]} b={hub} sag={0.01} />
    </group>
  );
};

/** The loose end: from the board's "?" pin, across the corner, to the CRT on the desk (world coordinates). */
export const RedString: React.FC<PropViewProps> = () => {
  const geo = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    const P = STRING_PATH;
    for (let s = 0; s < P.length - 1; s++) {
      const a = P[s];
      const b = P[s + 1];
      for (let i = 0; i < 12; i++) {
        const u = i / 12;
        pts.push(new THREE.Vector3(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u - 0.05 * 4 * u * (1 - u), a[2] + (b[2] - a[2]) * u));
      }
    }
    pts.push(new THREE.Vector3(...P[P.length - 1]));
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 80, 0.0035, 5, false);
  }, []);
  return (
    <mesh geometry={geo}>
      <meshStandardMaterial color="#c8102e" emissive="#7a0a1a" emissiveIntensity={0.9} roughness={0.6} />
    </mesh>
  );
};

export const BoardLight: React.FC = () => {
  // A dim picture light on the board, plus a pop on each mugshot flash.
  const flashes = ["intern", "cache", "dns"].map((id) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const e = useEvent(`flash-${id}`);
    return e.started ? Math.exp(-e.local / 0.1) : 0;
  });
  const pop = Math.max(...flashes);
  const target = useMemo(() => new THREE.Object3D(), []);
  return (
    <group>
      <primitive object={target} position={[ROOM.left, 1.6, -0.45]} />
      <spotLight position={[-1.2, 2.9, -0.2]} target={target} color="#ffd9a0" intensity={4.5 + 30 * pop} distance={4} angle={0.55} penumbra={0.8} decay={1.6} />
    </group>
  );
};

export const lerpColor = (a: string, b: string, u: number) => `#${new THREE.Color(a).lerp(new THREE.Color(b), clamp01(u)).getHexString()}`;
export { smooth };
