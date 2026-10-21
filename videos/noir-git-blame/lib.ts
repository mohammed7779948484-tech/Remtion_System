// Small helpers for this video: font loading (gated before the first frame) and canvas textures.
// Everything drawn here is a pure function of its inputs (seeded randomness, the frame time).
import { useLayoutEffect, useMemo } from "react";
import { staticFile } from "remotion";
import * as THREE from "three";

// ---------------------------------------------------------------- fonts

export const NOIR_FONTS = {
  /** Typewriter: narration captions, case-file labels, stamps. */
  type: "'Special Elite', 'Courier New', monospace",
  /** High-contrast serif: the title card and spoken captions. */
  serif: "'Playfair Display', Georgia, serif",
  /** CRT terminal. */
  crt: "'VT323', 'JetBrains Mono', 'DejaVu Sans Mono', monospace",
};

const FONT_FILES: { family: string; file: string; descriptors?: FontFaceDescriptors }[] = [
  { family: "Special Elite", file: "SpecialElite-Regular.ttf" },
  { family: "Playfair Display", file: "PlayfairDisplay.ttf", descriptors: { weight: "400 900" } },
  { family: "VT323", file: "VT323-Regular.ttf" },
];

let fontsPromise: Promise<void> | null = null;
/** Loads the bundled fonts once per tab. Canvas art and captions render only after this resolves. */
export const loadNoirFonts = (): Promise<void> => {
  if (!fontsPromise) {
    fontsPromise = Promise.all(
      FONT_FILES.map(async ({ family, file, descriptors }) => {
        const face = new FontFace(family, `url(${staticFile(`videos/noir-git-blame/fonts/${file}`)})`, descriptors);
        await face.load();
        document.fonts.add(face);
      }),
    ).then(() => undefined);
  }
  return fontsPromise;
};

// ---------------------------------------------------------------- canvas textures

export type Paint = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

const makeCanvas = (w: number, h: number) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
};

const toTexture = (c: HTMLCanvasElement) => {
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
};

/** A texture painted once (static art). `key` identifies the art (repaint when it changes). */
export const useStaticTexture = (w: number, h: number, paint: Paint, key: string, repeat?: [number, number]) =>
  useMemo(() => {
    const c = makeCanvas(w, h);
    paint(c.getContext("2d")!, w, h);
    const tex = toTexture(c);
    if (repeat) {
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(repeat[0], repeat[1]);
    }
    return tex;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w, h, key, repeat?.[0], repeat?.[1]]);

/** A texture repainted on every render (animated art). Paints in a layout effect, before the GL frame. */
export const useLiveTexture = (w: number, h: number, paint: Paint) => {
  const { c, tex } = useMemo(() => {
    const canvas = makeCanvas(w, h);
    return { c: canvas, tex: toTexture(canvas) };
  }, [w, h]);
  useLayoutEffect(() => {
    const ctx = c.getContext("2d")!;
    ctx.save();
    paint(ctx, w, h);
    ctx.restore();
    tex.needsUpdate = true;
  });
  return tex;
};

// ---------------------------------------------------------------- math

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const smooth = (x: number) => {
  const u = clamp01(x);
  return u * u * (3 - 2 * u);
};
/** Seeded hash → [0, 1). Same as remotion's random() but cheap for per-pixel loops. */
export const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};
