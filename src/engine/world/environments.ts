// Pure environment registry (Node-safe). Videos can bring their own via video.data.ts.
import type { EnvironmentDef } from "./layout";
import { devOffice } from "./dev-office/devOffice.data";

export const ENVIRONMENTS: Record<string, EnvironmentDef> = {
  "dev-office": devOffice,
};
