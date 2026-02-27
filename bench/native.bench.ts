/**
 * Native new Function() baseline benchmarks.
 *
 * These represent the theoretical performance ceiling -- the best our
 * transpiler can possibly achieve, since it generates code that runs
 * through the same new Function() path.
 */
import { bench, describe } from "vitest";
import { BENCHMARK_CASES } from "./shared.js";

describe("native baseline", () => {
  for (const tc of BENCHMARK_CASES) {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const fn = new Function(...tc.nativeArgs, tc.nativeJs);
    const args = tc.nativeArgs.map((name) => tc.context[name as keyof typeof tc.context]);

    // Verify correctness before benchmarking
    const result = fn(...args);
    if (typeof tc.expected === "boolean" || typeof tc.expected === "number") {
      if (result !== tc.expected) {
        throw new Error(`native ${tc.name}: expected ${tc.expected}, got ${result}`);
      }
    }

    bench(`${tc.name}: ${tc.cel}`, () => {
      fn(...args);
    });
  }
});
