// Places dialogue clips, sound effects and an optional ducked music bed on the timeline.
import { Audio } from "@remotion/media";
import { Sequence, staticFile, useVideoConfig } from "remotion";
import type { ResolvedEpisode } from "../core/timeline";

const srcOf = (s: string) => (/^https?:\/\//.test(s) ? s : staticFile(s.replace(/^public\//, "")));

export const Soundtrack: React.FC<{ resolved: ResolvedEpisode }> = ({ resolved }) => {
  const { fps } = useVideoConfig();
  const speaking = (t: number) => resolved.lines.some((l) => l.voiced && t >= l.start - 0.15 && t <= l.end + 0.15);
  return (
    <>
      {resolved.lines.map((l) =>
        l.file ? (
          <Sequence key={l.id} from={Math.round(l.start * fps)} name={`voice ${l.id}`} layout="none">
            <Audio src={staticFile(l.file)} />
          </Sequence>
        ) : null,
      )}
      {resolved.sfx.map((s, i) => (
        <Sequence key={i} from={Math.round(s.at * fps)} name={`sfx ${i}`} layout="none">
          <Audio src={srcOf(s.src)} volume={s.volume} />
        </Sequence>
      ))}
      {resolved.music ? (
        <Audio
          src={srcOf(resolved.music.src)}
          loop
          volume={(f) => resolved.music!.volume * (speaking(f / fps) ? resolved.music!.duck : 1)}
        />
      ) : null}
    </>
  );
};
