import { defineConfig } from "tsup";

// Bundle workspace packages (they ship TypeScript source); keep real npm deps external.
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  platform: "node",
  target: "node22",
  clean: true,
  noExternal: [/^@uteach\//],
});
