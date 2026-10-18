// TEMPORARY Phase 0 spike: proves R3F + postprocessing + canvas screens + audio render
// correctly and deterministically in Remotion exports. Deleted once the engine exists.
import { ThreeCanvas } from "@remotion/three";
import {
  AbsoluteFill,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Audio } from "@remotion/media";
import {
  ContactShadows,
  Environment,
  Lightformer,
  PerspectiveCamera,
  RoundedBox,
} from "@react-three/drei";
import {
  Bloom,
  DepthOfField,
  EffectComposer,
  SMAA,
  ToneMapping,
  Vignette,
} from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import * as THREE from "three";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useThree } from "@react-three/fiber";
import { useDelayRender } from "remotion";
import { createHighlighterCoreSync } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import tsLang from "shiki/langs/typescript.mjs";
import darkTheme from "shiki/themes/github-dark.mjs";

const fontFamily = "Consolas, 'Courier New', monospace";

const highlighter = createHighlighterCoreSync({
  themes: [darkTheme],
  langs: [tsLang],
  engine: createJavaScriptRegexEngine(),
});

const CODE = `export async function deploy() {
  const ok = await runTests();
  if (!ok) throw new Error("nope");
  return ship("prod");
}`;

const tokens = highlighter.codeToTokensBase(CODE, {
  lang: "typescript",
  theme: "github-dark",
});

const Screen: React.FC<{ t: number }> = ({ t }) => {
  const canvas = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 1024;
    c.height = 640;
    return c;
  }, []);
  const texture = useMemo(() => {
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return tex;
  }, [canvas]);

  useLayoutEffect(() => {
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#0d1117";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = `30px ${fontFamily}`;
    const visible = Math.floor(t * 40);
    let shown = 0;
    tokens.forEach((line, li) => {
      let x = 40;
      for (const tok of line) {
        const remaining = visible - shown;
        if (remaining <= 0) break;
        const text = tok.content.slice(0, remaining);
        shown += text.length;
        ctx.fillStyle = tok.color ?? "#ddd";
        ctx.fillText(text, x, 70 + li * 44);
        x += ctx.measureText(text).width;
      }
    });
    texture.needsUpdate = true;
  }, [t, canvas, texture]);

  return (
    <mesh position={[0, 1.15, -0.25]}>
      <planeGeometry args={[1.0, 0.625]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  );
};


// Holds the frame until EffectComposer has built its passes for the current camera, then renders.
const ComposerGate: React.FC<{ composer: React.RefObject<any> }> = ({ composer }) => {
  const frame = useCurrentFrame();
  const advance = useThree((s) => s.advance);
  const camera = useThree((s) => s.camera);
  const { delayRender, continueRender } = useDelayRender();
  useLayoutEffect(() => {
    const ready = () => { const c = composer.current; return !!c && c.passes.length >= 2 && c.passes[0].camera === camera; };
    if (ready()) return;
    const handle = delayRender("Waiting for postprocessing passes");
    let raf = 0; let tries = 0; let done = false;
    const poll = () => {
      if (ready() || tries++ > 600) { advance(performance.now()); done = true; continueRender(handle); return; }
      raf = requestAnimationFrame(poll);
    };
    raf = requestAnimationFrame(poll);
    return () => { cancelAnimationFrame(raf); if (!done) continueRender(handle); };
  }, [frame, camera, advance, composer, delayRender, continueRender]);
  return null;
};

export const Spike: React.FC<{ fx?: string[] }> = ({ fx = ["dof", "bloom", "vignette", "tone", "smaa"] }) => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const t = frame / fps;
  const ready = true;
  const composerRef = useRef<any>(null);

  const camZ = interpolate(frame, [0, 90], [3.2, 2.2], {
    extrapolateRight: "clamp",
  });
  const camPos: [number, number, number] = [0.6, 1.25, camZ];
  const subject = new THREE.Vector3(0, 0.9, 0.4);
  const focusDistance = subject.distanceTo(new THREE.Vector3(...camPos));

  return (
    <AbsoluteFill style={{ backgroundColor: "#101018" }}>
      {ready ? (
        <ThreeCanvas width={width} height={height} shadows dpr={1} gl={{ preserveDrawingBuffer: true, antialias: false }}>
          <color attach="background" args={["#141824"]} />
          <PerspectiveCamera
            makeDefault
            position={camPos}
            fov={40}
            near={0.05}
            far={50}
            onUpdate={(c) => c.lookAt(subject)}
          />
          <ambientLight intensity={0.25} />
          <directionalLight
            position={[2, 4, 3]}
            intensity={2.2}
            castShadow
            shadow-mapSize={[2048, 2048]}
          />
          <Environment resolution={256}>
            <Lightformer
              form="rect"
              intensity={2}
              position={[0, 3, 2]}
              scale={[4, 2, 1]}
              color="#ffd9b0"
            />
            <Lightformer
              form="rect"
              intensity={1}
              position={[-3, 1, -2]}
              scale={[2, 2, 1]}
              color="#7aa7ff"
            />
          </Environment>
          {/* faceted "actor" stand-in, animated from frame */}
          <mesh
            position={[0, 0.9 + Math.sin(t * 2.4) * 0.02, 0.4]}
            rotation={[0, t * 0.8, 0]}
            castShadow
          >
            <icosahedronGeometry args={[0.32, 1]} />
            <meshStandardMaterial color="#e56b3e" flatShading roughness={0.65} />
          </mesh>
          {/* desk + far background objects to show DOF blur */}
          <RoundedBox args={[1.6, 0.06, 0.8]} radius={0.02} position={[0, 0.72, -0.1]} castShadow receiveShadow>
            <meshStandardMaterial color="#8a6a4a" />
          </RoundedBox>
          <Screen t={t} />
          {[-2, -1, 0, 1, 2].map((x) => (
            <mesh key={x} position={[x * 0.9, 1.2, -3]} castShadow>
              <boxGeometry args={[0.5, 2.4, 0.5]} />
              <meshStandardMaterial color="#38bdf8" emissive="#0284c7" emissiveIntensity={x === 0 ? 2.5 : 0.2} />
            </mesh>
          ))}
          <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <planeGeometry args={[20, 20]} />
            <meshStandardMaterial color="#2a2f3d" />
          </mesh>
          <ContactShadows position={[0, 0.001, 0]} opacity={0.6} scale={6} blur={2} far={2} />
          {fx.length ? (
          <EffectComposer multisampling={0} ref={composerRef}>
            {fx.includes("dof") ? <DepthOfField focusDistance={focusDistance} focusRange={0.6} bokehScale={6} /> : <></>}
            {fx.includes("bloom") ? <Bloom luminanceThreshold={1} intensity={0.8} mipmapBlur /> : <></>}
            {fx.includes("vignette") ? <Vignette offset={0.3} darkness={0.6} /> : <></>}
            {fx.includes("tone") ? <ToneMapping mode={ToneMappingMode.AGX} /> : <></>}
            {fx.includes("smaa") ? <SMAA /> : <></>}
          </EffectComposer>) : null}
          <ComposerGate composer={composerRef} />
        </ThreeCanvas>
      ) : null}
      <Audio src={staticFile("spike/hello.wav")} />
      <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 60 }}>
        <div style={{ fontFamily, fontSize: 44, color: "white", background: "rgba(0,0,0,0.55)", padding: "8px 18px", borderRadius: 10 }}>
          {t < 1.5 ? "Okay." : t < 3 ? "Final deploy." : "What could possibly go wrong?"}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
