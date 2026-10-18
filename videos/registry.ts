// Every video folder registers here (the CLI's `new` command appends entries).
import type { VideoModule } from "../src/engine";
import zzCheckActors from "./zz-check-actors";
import zzCheckSet from "./zz-check-set";
import zzCheckVoice from "./zz-check-voice";
import itWorksOnMyMachine from "./it-works-on-my-machine";

export const VIDEOS: VideoModule[] = [zzCheckActors, zzCheckSet, zzCheckVoice, itWorksOnMyMachine];
