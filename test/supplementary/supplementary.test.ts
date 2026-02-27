/**
 * Supplementary test suite harvested from cel-js-marcbachmann.
 *
 * Tests are expected to PASS by default. Tests in the SKIP_NAMES set
 * use the "negative skip" pattern: we expect them to fail. If a skipped
 * test starts passing, vitest flags it so we can remove it from the list.
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
import { SUPPLEMENTARY_SKIP_NAMES } from "./skip-list.js";
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
 * Throws if the test fails (result doesn't match expectations).
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
        const skipKey = `${category} > ${test.name}`;
        const isSkipped = SUPPLEMENTARY_SKIP_NAMES.has(skipKey);

        if (isSkipped) {
          // NEGATIVE SKIP: test is expected to fail.
          // If it starts passing, throw so we can remove it from the skip list.
          it(test.name, () => {
            try {
              runTest(test);
            } catch {
              // Expected to fail - this is fine
              return;
            }
            expect.unreachable(
              `Test "${test.name}" passed unexpectedly! ` + `Expression: ${test.expr}`,
            );
          });
        } else {
          // Normal test: expected to pass
          it(test.name, () => {
            runTest(test);
          });
        }
      }
    });
  }
});
