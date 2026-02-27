import { describe, it } from "vitest";
import type {
  IncrementalTest,
  IncrementalTestSuite,
} from "@bufbuild/cel-spec/testdata/tests.js";

/**
 * Recursively walk the test suite tree, creating vitest describe/it blocks.
 *
 * Implements the "negative skip" pattern from cel-es:
 * - Tests NOT in the skip list run normally (and will fail since there's no transpiler).
 * - Tests IN the skip list still run, but we EXPECT them to fail.
 *   If a skipped test unexpectedly passes, we throw — signaling it should
 *   be removed from the skip list.
 */
export function runTestSuite(
  suite: IncrementalTestSuite,
  runner: (test: IncrementalTest) => void,
  path: string[],
  shouldSkip: (path: string[]) => boolean,
): void {
  // Skip entirely empty suites (no tests, no sub-suites) to avoid
  // vitest "No test found in suite" errors.
  if (suite.suites.length === 0 && suite.tests.length === 0) {
    return;
  }
  describe(suite.name, () => {
    for (const sub of suite.suites) {
      runTestSuite(sub, runner, [...path, sub.name], shouldSkip);
    }
    for (const t of suite.tests) {
      const testPath = [...path, t.original.name];
      if (shouldSkip(testPath)) {
        // NEGATIVE SKIP: Run anyway, expect failure
        it(t.name, () => {
          try {
            runner(t);
          } catch {
            // Expected to fail — this is fine
            return;
          }
          // If it passed unexpectedly, that's a signal to remove from skip list
          throw new Error(
            `Test [${testPath.join("/")}] passed unexpectedly! Remove from skip list.`,
          );
        });
      } else {
        it(t.name, () => runner(t));
      }
    }
  });
}
