import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: process.env.SUITE ? ["test/conformance/conformance.test.ts"] : ["test/**/*.test.ts"],
    testTimeout: 30000,
    benchmark: {
      include: ["bench/**/*.bench.ts"],
    },
    reporters: ["default", "./test/log-reporter.ts"],
  },
});
