import { Composition } from "remotion";
import { Spike } from "./spike/Spike";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="Spike"
        component={Spike}
        durationInFrames={150}
        fps={30}
        width={1280}
        height={720}
      />
    </>
  );
};
