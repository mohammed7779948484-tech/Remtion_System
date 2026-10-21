// 2D layer: noir captions (typewriter for the narrator, serif for spoken lines), film grain, end card.
import { useMemo } from "react";
import { AbsoluteFill, interpolate, useVideoConfig } from "remotion";
import { captionIndexAt, captionPages, useEpisode, useEvent } from "../../src/engine";
import { clamp01, NOIR_FONTS } from "./lib";

/** Caption block geometry (shared with the NOTES/QA reasoning): bottom edge 20 % above the frame bottom. */
export const CAPTION_BOTTOM = 0.2;

const SPEAKER_STYLE: Record<string, { font: string; size: number; color: string; weight: number; spacing: number; italic?: boolean }> = {
  narrator: { font: NOIR_FONTS.type, size: 54, color: "#f1e4c6", weight: 400, spacing: 0.5 },
  claude: { font: NOIR_FONTS.serif, size: 60, color: "#ffc7a3", weight: 700, spacing: 0.2 },
  rayan: { font: NOIR_FONTS.serif, size: 60, color: "#ffffff", weight: 700, spacing: 0.2 },
};

const NoirCaptions: React.FC = () => {
  const { resolved, t } = useEpisode();
  const { width, height } = useVideoConfig();
  const pages = useMemo(() => captionPages(resolved), [resolved]);
  const end = useEvent("endcard");
  if (end.started) return null;
  const ms = t * 1000;
  const page = pages[captionIndexAt(pages, ms)];
  if (!page) return null;
  const st = SPEAKER_STYLE[page.speaker] ?? SPEAKER_STYLE.rayan;
  const u = width / 1080;
  const appear = interpolate(ms - page.startMs, [0, 140], [0, 1], { extrapolateRight: "clamp" });
  const fade = interpolate(page.endMs - ms, [0, 120], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: height * CAPTION_BOTTOM }}>
      <div
        style={{
          maxWidth: width * 0.84,
          textAlign: "center",
          fontFamily: st.font,
          fontSize: st.size * u,
          fontWeight: st.weight,
          letterSpacing: st.spacing * u,
          lineHeight: 1.18,
          whiteSpace: "pre-wrap",
          opacity: appear * fade,
          translate: `0 ${(1 - appear) * 10 * u}px`,
          padding: `${10 * u}px ${26 * u}px`,
          borderRadius: 18 * u,
          background: "radial-gradient(ellipse at center, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.38) 55%, rgba(0,0,0,0) 100%)",
          textShadow: `0 ${3 * u}px ${10 * u}px rgba(0,0,0,0.95), 0 0 ${2 * u}px rgba(0,0,0,0.9)`,
        }}
      >
        {page.tokens.map((tok, i) => (
          <span key={i} style={{ color: st.color, opacity: ms >= tok.fromMs ? 1 : 0.42 }}>
            {tok.text}
          </span>
        ))}
      </div>
    </AbsoluteFill>
  );
};

/** Animated film grain: an SVG turbulence whose seed is the frame number (deterministic). */
const Grain: React.FC = () => {
  const { frame } = useEpisode();
  const id = `grain-${frame}`;
  return (
    <AbsoluteFill style={{ pointerEvents: "none", mixBlendMode: "overlay", opacity: 0.16 }}>
      <svg width="100%" height="100%" preserveAspectRatio="none">
        <filter id={id} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} seed={frame % 997} stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter={`url(#${id})`} />
      </svg>
    </AbsoluteFill>
  );
};

const EndCard: React.FC = () => {
  const end = useEvent("endcard");
  const { width } = useVideoConfig();
  if (!end.started) return null;
  const u = width / 1080;
  const l = end.local;
  const black = clamp01(l / 0.35);
  const title = clamp01((l - 0.3) / 0.35);
  // a neon-like stutter as the title lights up
  const stutter = l > 0.3 && l < 0.75 ? (Math.floor(l * 30) % 3 === 0 ? 0.35 : 1) : 1;
  const sub = clamp01((l - 0.85) / 0.4);
  const credit = clamp01((l - 1.2) / 0.4);
  return (
    <AbsoluteFill style={{ background: `rgba(4,4,6,${0.94 * black})`, justifyContent: "center", alignItems: "center" }}>
      <div style={{ transform: `translateY(${-90 * u}px)`, display: "flex", flexDirection: "column", alignItems: "center", gap: 26 * u }}>
        <div style={{ fontFamily: NOIR_FONTS.type, fontSize: 34 * u, color: "#c9b48a", letterSpacing: 10 * u, opacity: sub }}>CASE FILE № 214</div>
        <div
          style={{
            fontFamily: NOIR_FONTS.serif,
            fontWeight: 900,
            fontSize: 168 * u,
            letterSpacing: 6 * u,
            color: "#f4efe6",
            opacity: title * stutter,
            textShadow: `0 0 ${30 * u}px rgba(255,90,110,0.45), 0 ${6 * u}px ${18 * u}px rgba(0,0,0,0.9)`,
            lineHeight: 1,
          }}
        >
          git blame
        </div>
        <div style={{ width: 520 * u * title, height: 4 * u, background: "#c8102e", boxShadow: `0 0 ${14 * u}px #c8102e` }} />
        <div style={{ fontFamily: NOIR_FONTS.type, fontSize: 48 * u, color: "#f1e4c6", opacity: sub }}>a Claude P.I. mystery</div>
      </div>
      <div style={{ position: "absolute", top: "71%", width: "100%", textAlign: "center", fontFamily: NOIR_FONTS.type, fontSize: 25 * u, lineHeight: 1.5, color: "rgba(241,228,198,0.72)", opacity: credit }}>
        voices: elevenlabs.io
        <br />
        music: Kevin MacLeod (incompetech.com) · CC BY 4.0
      </div>
    </AbsoluteFill>
  );
};

export const Overlay: React.FC = () => (
  <>
    <NoirCaptions />
    <EndCard />
    <Grain />
  </>
);
