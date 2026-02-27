/**
 * Supplementary test suite harvested from cel-js-marcbachmann.
 *
 * All tests use the "negative skip" pattern: every test is expected to fail
 * (since the transpiler is not yet implemented). If a test unexpectedly passes,
 * we throw so it can be moved out of the expected-fail list.
 */
import { describe, expect, it } from "vitest";
import { compile } from "../../src/transpiler.js";
import { arithmeticTests } from "./data/arithmetic.js";
import { collectionTests } from "./data/collections.js";
import { comparisonTests } from "./data/comparisons.js";
import { conversionTests } from "./data/conversions.js";
import { functionTests } from "./data/functions.js";
import { logicTests } from "./data/logic.js";
import { macroTests } from "./data/macros.js";
import { stringTests } from "./data/strings.js";
import type { SupplementaryTest } from "./types.js";

/** All supplementary tests, concatenated */
const ALL_TESTS: SupplementaryTest[] = [
  ...arithmeticTests,
  ...stringTests,
  ...comparisonTests,
  ...collectionTests,
  ...functionTests,
  ...macroTests,
  ...logicTests,
  ...conversionTests,
];

/** Group tests by category */
function groupByCategory(tests: SupplementaryTest[]): Map<string, SupplementaryTest[]> {
  const groups = new Map<string, SupplementaryTest[]>();
  for (const t of tests) {
    let group = groups.get(t.category);
    if (!group) {
      group = [];
      groups.set(t.category, group);
    }
    group.push(t);
  }
  return groups;
}

/**
 * Run a single supplementary test case.
 * Returns true if the test passed (matched expectations), false if it threw/failed.
 */
function runTest(test: SupplementaryTest): void {
  const fn = compile(test.expr);
  const result = fn.evaluate(test.bindings ?? {});

  if (test.expectError) {
    throw new Error(`Expected error for "${test.expr}" but got result: ${formatValue(result)}`);
  }

  // Compare result to expected
  if (test.expected !== undefined) {
    // Handle NaN specially
    if (typeof test.expected === "number" && Number.isNaN(test.expected)) {
      if (typeof result !== "number" || !Number.isNaN(result)) {
        throw new Error(`Expected NaN for "${test.expr}" but got: ${formatValue(result)}`);
      }
      return;
    }

    // Deep comparison for arrays/objects
    if (!deepEqual(result, test.expected)) {
      throw new Error(
        `Value mismatch for "${test.expr}":\n` +
          `  expected: ${formatValue(test.expected)}\n` +
          `  actual:   ${formatValue(result)}`,
      );
    }
  }
}

/** Format a value for error messages */
function formatValue(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "bigint") return `${value}n`;
  if (typeof value === "number" && Number.isNaN(value)) return "NaN";
  if (Array.isArray(value)) {
    return `[${value.map(formatValue).join(", ")}]`;
  }
  if (value instanceof Map) {
    const entries = Array.from(value.entries())
      .map(([k, v]) => `${formatValue(k)}: ${formatValue(v)}`)
      .join(", ");
    return `Map{${entries}}`;
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return JSON.stringify(value);
}

/** Simple deep equality comparison */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }

  if (typeof a === "object" && typeof b === "object") {
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    const aKeys = Object.keys(aObj);
    const bKeys = Object.keys(bObj);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((k) => deepEqual(aObj[k], bObj[k]));
  }

  return false;
}

// === Test registration ===
const grouped = groupByCategory(ALL_TESTS);

describe("supplementary", () => {
  for (const [category, tests] of grouped) {
    describe(category, () => {
      for (const test of tests) {
        // NEGATIVE SKIP: All tests are expected to fail right now.
        // When the transpiler is implemented, tests that pass will
        // throw "passed unexpectedly" to signal they should be promoted.
        it(test.name, () => {
          try {
            runTest(test);
          } catch {
            // Expected to fail - this is fine
            return;
          }
          // If we get here, the test passed unexpectedly
          expect.unreachable(
            `Test "${test.name}" passed unexpectedly! ` + `Expression: ${test.expr}`,
          );
        });
      }
    });
  }
});
