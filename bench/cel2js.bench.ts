/**
 * cel2js transpiler benchmarks.
 *
 * Since the transpiler is not yet implemented, these benchmarks will
 * gracefully skip. Once compile() is functional, they will automatically
 * activate and measure our transpiler's performance against competitors
 * and the native baseline.
 */
import { bench, describe } from "vitest";
import { compile } from "../src/transpiler.js";
import { BENCHMARK_CASES } from "./shared.js";

describe("cel2js", () => {
  for (const tc of BENCHMARK_CASES) {
    // Try to compile -- if the transpiler isn't implemented, skip gracefully
    let compiled: ReturnType<typeof compile> | null = null;
    try {
      compiled = compile(tc.cel);
    } catch {
      // Transpiler not implemented yet
    }

    if (compiled) {
      // Cold benchmark: compile + eval every time
      bench(`cold ${tc.name}: ${tc.cel}`, () => {
        const result = compile(tc.cel);
        result.evaluate(tc.context);
      });

      // Hot benchmark: pre-compiled eval
      const fn = compiled.evaluate;
      bench(`hot ${tc.name}: ${tc.cel}`, () => {
        fn(tc.context);
      });
    }
  }

  // If nothing compiled, add a single informational benchmark that does nothing
  // so the describe block isn't empty
  let anyCompiled = false;
  for (const tc of BENCHMARK_CASES) {
    try {
      compile(tc.cel);
      anyCompiled = true;
      break;
    } catch {
      // expected
    }
  }

  if (!anyCompiled) {
    bench("(transpiler not implemented -- all benchmarks skipped)", () => {
      // no-op placeholder
    });
  }
});
