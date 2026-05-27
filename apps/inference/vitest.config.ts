import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@secondseat/db": resolve(__dirname, "../../packages/db/src/index.ts"),
      "@secondseat/embedding": resolve(__dirname, "../../packages/embedding/src/index.ts"),
    },
  },
  test: {
    environment: "node",
    coverage: {
      include: ["src/services/**"],
      thresholds: {
        lines: 80,
        functions: 80,
      },
    },
  },
});
