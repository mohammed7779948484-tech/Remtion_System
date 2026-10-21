// Green-phosphor screens for the CRT terminal: idle (with the planted 02:12 clue), git blame, git commit.
// Pure functions of (t - since) and params.
import type { DrawFn } from "../../src/engine";
import { NOIR_FONTS } from "./lib";

const PHOSPHOR = "#7dffa8";
const DIM = "rgba(125,255,168,0.45)";
const CLAUDE = "#ff9a5c";

const crtBase = (ctx: CanvasRenderingContext2D, w: number, h: number, t: number) => {
  const g = ctx.createRadialGradient(w / 2, h / 2, h * 0.1, w / 2, h / 2, w * 0.7);
  g.addColorStop(0, "#08210f");
  g.addColorStop(1, "#010603");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // a slow refresh band rolling down
  const band = ((t * 0.35) % 1.4) * h - 0.2 * h;
  const bg = ctx.createLinearGradient(0, band, 0, band + h * 0.18);
  bg.addColorStop(0, "rgba(125,255,168,0)");
  bg.addColorStop(0.5, "rgba(125,255,168,0.05)");
  bg.addColorStop(1, "rgba(125,255,168,0)");
  ctx.fillStyle = bg;
  ctx.fillRect(0, band, w, h * 0.18);
};

const scanlines = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 2);
  const v = ctx.createRadialGradient(w / 2, h / 2, h * 0.35, w / 2, h / 2, w * 0.72);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, "rgba(0,0,0,0.65)");
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, w, h);
};

const text = (ctx: CanvasRenderingContext2D, s: string, x: number, y: number, color = PHOSPHOR, size = 64) => {
  ctx.font = `400 ${size}px ${NOIR_FONTS.crt}`;
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 14;
  ctx.fillText(s, x, y);
  ctx.shadowBlur = 0;
};

const cursorOn = (t: number) => Math.floor(t * 2.2) % 2 === 0;

/** Types `cmd` after a prompt at `cps` characters per second; returns seconds when typing ends. */
const typed = (ctx: CanvasRenderingContext2D, cmd: string, local: number, x: number, y: number, cps: number, size = 64) => {
  const n = Math.max(0, Math.min(cmd.length, Math.floor(local * cps)));
  text(ctx, `$ ${cmd.slice(0, n)}`, x, y, PHOSPHOR, size);
  const done = cmd.length / cps;
  if (local < done + 0.3 && cursorOn(local)) {
    ctx.font = `400 ${size}px ${NOIR_FONTS.crt}`;
    const wpx = ctx.measureText(`$ ${cmd.slice(0, n)}`).width;
    ctx.fillStyle = PHOSPHOR;
    ctx.fillRect(x + wpx + 4, y - size * 0.72, size * 0.42, size * 0.8);
  }
  return done;
};

export const termIdle: DrawFn = ({ ctx, w, h, t }) => {
  crtBase(ctx, w, h, t);
  const x = 56;
  text(ctx, "PROD-01 :: login.service", x, 96);
  const down = Math.floor(t * 1.6) % 2 === 0;
  text(ctx, down ? "STATUS  ██ DOWN" : "STATUS     DOWN", x, 170, "#ff6b6b");
  text(ctx, "-- activity --", x, 280, DIM, 54);
  text(ctx, "02:12  claude pushed 1 commit", x, 350, DIM, 54);
  text(ctx, "02:14  ALERT login: no response", x, 416, DIM, 54);
  text(ctx, `$ ${cursorOn(t) ? "█" : ""}`, x, 560);
  scanlines(ctx, w, h);
};

// Monospace rows (VT323 advances 0.4 em: 33 characters at 70 px ≈ 924 px of the 1024 px screen).
const BLAME: { who: string; row: string }[] = [
  { who: "rayan", row: "rayan  3w  const s = auth(u)" },
  { who: "rayan", row: "rayan  3w  if (!s) throw 401" },
  { who: "claude", row: "claude 2h  return // ✨ simplified" },
  { who: "rayan", row: "rayan  3w  return s" },
];

export const termBlame: DrawFn = ({ ctx, w, h, t, since }, params) => {
  const local = Math.max(0, t - since);
  crtBase(ctx, w, h, t);
  const x = 40;
  const done = typed(ctx, "git blame login.ts", local, x, 120, 20, 66);
  // Seconds since the highlight cue (absolute time from the props cue), or -1 before it.
  const hs = params.highlightSince === undefined ? -1 : t - Number(params.highlightSince);
  BLAME.forEach((r, i) => {
    const at = done + 0.25 + i * 0.16;
    if (local < at) return;
    const y = 262 + i * 112;
    const isClaude = r.who === "claude";
    if (isClaude && hs >= 0) {
      const k = Math.min(1, hs / 0.12);
      const pulse = 0.88 + 0.12 * Math.sin(hs * 9);
      ctx.fillStyle = `rgba(255,140,80,${0.95 * k * pulse})`;
      ctx.fillRect(x - 18, y - 64, (w - 2 * x + 36) * k, 88);
      text(ctx, r.row, x, y, "#140803", 70);
    } else {
      text(ctx, r.row.slice(0, 7), x, y, isClaude ? CLAUDE : DIM, 70);
      text(ctx, r.row.slice(7), x + 7 * 28, y, PHOSPHOR, 70);
    }
  });
  scanlines(ctx, w, h);
};

export const termCommit: DrawFn = ({ ctx, w, h, t, since }) => {
  const local = Math.max(0, t - since);
  crtBase(ctx, w, h, t);
  const x = 40;
  const done = typed(ctx, 'git commit -m "fix: DNS issue"', local, x, 150, 40, 66);
  if (local > done + 0.2) text(ctx, "[main 4e2b1d0] fix: DNS issue", x, 290, PHOSPHOR, 66);
  if (local > done + 0.4) text(ctx, " 1 file changed, 1 deletion(-)", x, 380, DIM, 62);
  if (local > done + 0.9) text(ctx, "login.service ..... UP", x, 520, PHOSPHOR, 66);
  if (local > done + 1.2) text(ctx, `$ ${cursorOn(local) ? "█" : ""}`, x, 640, PHOSPHOR, 66);
  scanlines(ctx, w, h);
};

export const SCREENS: Record<string, DrawFn> = { "term-idle": termIdle, "term-blame": termBlame, "term-commit": termCommit };
