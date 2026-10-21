// "git blame" — a Claude P.I. mystery. A film-noir office built in this folder (set.tsx), green CRT screens
// (screens.ts), noir captions/end card (overlay.tsx) and an invisible narrator actor (video.data.ts).
import { useEffect, useState } from "react";
import { continueRender, delayRender } from "remotion";
import { defineVideo, type ActorViewProps, type VideoModule, type VideoProps } from "../../src/engine";
import episode from "./episode.json";
import { loadNoirFonts } from "./lib";
import { Overlay } from "./overlay";
import { SCREENS } from "./screens";
import {
  BankersLamp,
  BoardLight,
  CeilingFan,
  CoatRack,
  CrtTerminal,
  DeskClutter,
  DetectiveDesk,
  EvidenceBoard,
  Fedora,
  FilingCabinet,
  Floorboards,
  MechKeyboard,
  PiDoor,
  RedString,
  RoomWalls,
  VenetianWindow,
  WallClock,
} from "./set";
import data, { narratorDef } from "./video.data";

/** The narrator has a voice and captions but no body. */
const NarratorView: React.FC<ActorViewProps> = () => null;

const SceneExtras: React.FC = () => <BoardLight />;

const base = defineVideo({
  episode,
  ...data,
  actors: { narrator: { def: narratorDef, View: NarratorView } },
  components: {
    room_walls: RoomWalls,
    detective_desk: DetectiveDesk,
    floorboards: Floorboards,
    venetian_window: VenetianWindow,
    pi_door: PiDoor,
    bankers_lamp: BankersLamp,
    crt_terminal: CrtTerminal,
    mech_keyboard: MechKeyboard,
    desk_clutter: DeskClutter,
    ceiling_fan: CeilingFan,
    evidence_board: EvidenceBoard,
    red_string: RedString,
    wall_clock: WallClock,
    filing_cabinet: FilingCabinet,
    coat_rack: CoatRack,
    fedora: Fedora,
  },
  screens: SCREENS,
  scene: SceneExtras,
  overlay: Overlay,
});

/**
 * Mounts the player only once the bundled fonts are loaded, so canvas art (mugshots, door glass, CRT) and
 * captions are never painted with a fallback font on a tab's first frame (render-order independence).
 */
const FontGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [handle] = useState(() => delayRender("noir-git-blame fonts"));
  const [ready, setReady] = useState(false);
  useEffect(() => {
    loadNoirFonts()
      .then(() => setReady(true))
      .catch((err: unknown) => {
        console.error(err);
        setReady(true);
      });
  }, []);
  useEffect(() => {
    if (ready) continueRender(handle);
  }, [ready, handle]);
  return ready ? <>{children}</> : null;
};

const Gated: React.FC<VideoProps> = (props) => (
  <FontGate>
    <base.component {...props} />
  </FontGate>
);

const video: VideoModule = { ...base, component: Gated };
export default video;
