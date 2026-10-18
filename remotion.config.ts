/**
 * Applies to `npx remotion studio|render|still`. The CLI in scripts/ spawns those
 * commands, so this file is the single place for render settings.
 * All options: https://remotion.dev/docs/config
 */
import { Config } from "@remotion/cli/config";

Config.setRspack(true);
Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
Config.setDefaultPremountInSeconds(2);
// Three.js needs a real GL backend in headless Chrome; angle uses the GPU on Windows/macOS.
Config.setChromiumOpenGlRenderer("angle");
