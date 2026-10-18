// Every video folder registers here (the CLI's `new` command appends entries).
import type { VideoModule } from "../src/engine";
import itWorksOnMyMachine from "./it-works-on-my-machine";
import launchPromo from "./launch-promo";

export const VIDEOS: VideoModule[] = [itWorksOnMyMachine, launchPromo];
