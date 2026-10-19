// Dialogue captions from word timings. Pages come from @remotion/captions; the current page and
// word are computed from the frame (pure), so captions are exact on any frame.
import { createTikTokStyleCaptions, type TikTokPage } from "@remotion/captions";
import { useMemo } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { ResolvedEpisode } from "../core/timeline";
import { FONTS } from "../fonts";
import { lineCaptions } from "./speech";

type Page = TikTokPage & { speaker: string; endMs: number };

/**
 * Caption pages for all lines in time order. A line's last page lingers 0.2 s, but never past the
 * start of the next page, so a following line's first words are never hidden.
 */
export const captionPages = (resolved: Pick<ResolvedEpisode, "lines" | "captions">): Page[] => {
  const out: Page[] = [];
  for (const l of resolved.lines) {
    const { pages: ps } = createTikTokStyleCaptions({ captions: lineCaptions(l.words, l.start), combineTokensWithinMilliseconds: resolved.captions.pageSeconds * 1000 });
    ps.forEach((p, i) => out.push({ ...p, speaker: l.speaker, endMs: i < ps.length - 1 ? ps[i + 1].startMs : Math.round((l.end + 0.2) * 1000) }));
  }
  out.sort((a, b) => a.startMs - b.startMs);
  for (let i = 0; i < out.length - 1; i++) out[i].endMs = Math.min(out[i].endMs, out[i + 1].startMs);
  return out;
};

export const Captions: React.FC<{ resolved: ResolvedEpisode }> = ({ resolved }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const pages = useMemo(() => captionPages(resolved), [resolved]);

  const style = resolved.captions.style;
  if (style === "none") return null;
  const ms = (frame / fps) * 1000;
  const page = pages.find((p) => ms >= p.startMs && ms < p.endMs);
  if (!page) return null;
  const actor = resolved.actors.find((a) => a.id === page.speaker);
  const portrait = height > width;
  const unit = Math.min(width, height) / 1080;
  const appear = interpolate(ms - page.startMs, [0, 120], [0, 1], { extrapolateRight: "clamp" });

  if (style === "pop") {
    return (
      <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: height * (portrait ? 0.24 : 0.12) }}>
        <div style={{ fontFamily: FONTS.display, fontSize: 78 * unit, fontWeight: 900, textAlign: "center", whiteSpace: "pre-wrap", maxWidth: width * 0.86, lineHeight: 1.1, scale: String(0.9 + 0.1 * appear), textShadow: `0 ${6 * unit}px 0 rgba(0,0,0,0.65)`, WebkitTextStroke: `${3 * unit}px rgba(0,0,0,0.85)` }}>
          {page.tokens.map((tok, i) => {
            const active = ms >= tok.fromMs && ms < tok.toMs;
            return (
              <span key={i} style={{ color: active ? actor?.color ?? "#ffd166" : "#ffffff" }}>
                {tok.text.toUpperCase()}
              </span>
            );
          })}
        </div>
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: height * (portrait ? 0.2 : 0.07) }}>
      <div style={{ opacity: appear, display: "flex", flexDirection: "column", alignItems: "center", gap: 10 * unit, maxWidth: width * 0.8 }}>
        <div style={{ fontFamily: FONTS.ui, fontSize: 26 * unit, fontWeight: 700, letterSpacing: 1, color: "#111", background: actor?.color ?? "#fff", padding: `${3 * unit}px ${14 * unit}px`, borderRadius: 999 }}>
          {(actor?.name ?? page.speaker).toUpperCase()}
        </div>
        <div style={{ fontFamily: FONTS.ui, fontSize: 46 * unit, fontWeight: 600, color: "#fff", background: "rgba(8,10,18,0.72)", padding: `${10 * unit}px ${24 * unit}px`, borderRadius: 14 * unit, textAlign: "center", whiteSpace: "pre-wrap", lineHeight: 1.25 }}>
          {page.tokens.map((tok, i) => (
            <span key={i} style={{ color: ms >= tok.fromMs ? "#ffffff" : "rgba(255,255,255,0.55)" }}>
              {tok.text}
            </span>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};
