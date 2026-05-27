import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  esbuild: {
    // Automatic JSX runtime so test files don't need `import React from 'react'`
    jsx: "automatic",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
  },
});
