/**
 * Competitor library benchmarks.
 *
 * Benchmarks @marcbachmann/cel-js, @bufbuild/cel, and cel-js against
 * the same set of expressions. Each library has different API shapes
 * and type requirements, handled per-library below.
 *
 * Both "cold" (parse+eval) and "hot" (pre-parsed eval) paths are measured.
 */
import { bench, describe } from "vitest";
import { BENCHMARK_CASES, type BenchmarkCase } from "./shared.js";

// ─── @marcbachmann/cel-js ───────────────────────────────────────────

import {
  evaluate as marcEvaluate,
  parse as marcParse,
} from "@marcbachmann/cel-js";

describe("@marcbachmann/cel-js", () => {
  for (const tc of BENCHMARK_CASES) {
    // Cold: parse + eval every time
    let coldWorks = true;
    try {
      marcEvaluate(tc.cel, tc.contextBigInt);
    } catch {
      coldWorks = false;
    }

    if (coldWorks) {
      bench(`cold ${tc.name}: ${tc.cel}`, () => {
        marcEvaluate(tc.cel, tc.contextBigInt);
      });
    }

    // Hot: parse once, eval many times
    let marcFn: ReturnType<typeof marcParse> | null = null;
    try {
      marcFn = marcParse(tc.cel);
      // Verify it works
      marcFn(tc.contextBigInt);
    } catch {
      marcFn = null;
    }

    if (marcFn) {
      const fn = marcFn;
      bench(`hot ${tc.name}: ${tc.cel}`, () => {
        fn(tc.contextBigInt);
      });
    }
  }
});

// ─── @bufbuild/cel ──────────────────────────────────────────────────

import {
  run as bufRun,
  parse as bufParse,
  plan as bufPlan,
  celEnv,
} from "@bufbuild/cel";

describe("@bufbuild/cel", () => {
  for (const tc of BENCHMARK_CASES) {
    // Cold: run() does parse + plan + eval every time
    let coldWorks = true;
    try {
      bufRun(tc.cel, tc.contextBigInt);
    } catch {
      coldWorks = false;
    }

    if (coldWorks) {
      bench(`cold ${tc.name}: ${tc.cel}`, () => {
        bufRun(tc.cel, tc.contextBigInt);
      });
    }

    // Hot: parse + plan once, eval many times
    let bufFn: ReturnType<typeof bufPlan> | null = null;
    try {
      const ast = bufParse(tc.cel);
      const env = celEnv();
      bufFn = bufPlan(env, ast);
      // Verify it works
      bufFn(tc.contextBigInt);
    } catch {
      bufFn = null;
    }

    if (bufFn) {
      const fn = bufFn;
      bench(`hot ${tc.name}: ${tc.cel}`, () => {
        fn(tc.contextBigInt);
      });
    }
  }
});

// ─── cel-js ─────────────────────────────────────────────────────────

import { evaluate as celjsEvaluate, parse as celjsParse } from "cel-js";

describe("cel-js", () => {
  for (const tc of BENCHMARK_CASES) {
    // Cold: evaluate with string expression
    let coldWorks = true;
    try {
      celjsEvaluate(tc.cel, tc.context);
    } catch {
      coldWorks = false;
    }

    if (coldWorks) {
      bench(`cold ${tc.name}: ${tc.cel}`, () => {
        celjsEvaluate(tc.cel, tc.context);
      });
    }

    // Hot: parse once, evaluate with CST
    let cst: unknown = null;
    try {
      const parsed = celjsParse(tc.cel);
      if (parsed.cst) {
        // Verify evaluation with CST works
        celjsEvaluate(parsed.cst, tc.context);
        cst = parsed.cst;
      }
    } catch {
      cst = null;
    }

    if (cst) {
      const parsedCst = cst;
      bench(`hot ${tc.name}: ${tc.cel}`, () => {
        celjsEvaluate(parsedCst as Parameters<typeof celjsEvaluate>[0], tc.context);
      });
    }
  }
});
