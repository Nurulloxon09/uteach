import { cpSync } from "node:fs";
import { defineConfig } from "tsup";

// Bundle workspace packages (they ship TypeScript source); keep real npm deps external.
// The receipt renderer finds its fonts at `new URL("../fonts/…", import.meta.url)`; bundled into dist/index.js
// that is apps/worker/fonts, so the build copies them there.
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  platform: "node",
  target: "node22",
  clean: true,
  noExternal: [/^@uteach\//],
  onSuccess: async () => {
    cpSync("../../packages/receipts/fonts", "fonts", { recursive: true });
  },
});
