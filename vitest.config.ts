import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    testTimeout: 30000,
    benchmark: {
      include: ["bench/**/*.bench.ts"],
    },
  },
});
