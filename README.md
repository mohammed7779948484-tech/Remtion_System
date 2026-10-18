# Remotion_System

Code-first studio for stylized low-poly 3D videos with AI coding agents — Remotion + React Three Fiber.

- **Make a video**: see [CLAUDE.md](CLAUDE.md) (workflow + rules) and [docs/ENGINE.md](docs/ENGINE.md) (reference).
- **Discover capabilities**: `npm run cli -- list`, `catalog/*.json`.
- **Videos**: `videos/<slug>/` — `it-works-on-my-machine` (16:9 skit in the shared office set) and `launch-promo` (9:16 promo on a custom stage defined in its own folder).
- **Status / decisions**: [PROGRESS.md](PROGRESS.md).

```
npm install
npm run dev                                   # Remotion Studio
npm run cli -- validate it-works-on-my-machine
npm run cli -- render it-works-on-my-machine  # → out/it-works-on-my-machine.mp4
npm test
```

ElevenLabs voices: copy `.env.example` to `.env`, set `ELEVENLABS_API_KEY`, run
`npm run cli -- voice <slug> --provider elevenlabs`.
