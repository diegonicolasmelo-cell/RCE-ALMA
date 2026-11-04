import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Los tests del nucleo son puros (sin DOM, sin React): corren en node y en ms.
export default defineConfig({
  resolve: {
    alias: {
      "@core": fileURLToPath(new URL("./src/core", import.meta.url))
    }
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"]
  }
});
