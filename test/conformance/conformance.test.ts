import { getConformanceSuite } from "@bufbuild/cel-spec/testdata/tests.js";
import { runSimpleTest } from "./execute.js";
import { runTestSuite } from "./runner.js";
import { SKIP_PATHS } from "./skip-list.js";

/**
 * Check if a test path should be skipped.
 *
 * A test is skipped if its path starts with any entry in the SKIP_PATHS list.
 * For example, SKIP_PATHS entry ["basic"] skips all tests under the "basic" suite.
 */
function shouldSkip(path: string[]): boolean {
  const pathStr = `${path.join("/")}/`;
  return SKIP_PATHS.some((skip) => pathStr.startsWith(`${skip.join("/")}/`));
}

/**
 * Parse the SUITE environment variable into a set of suite names.
 * Supports comma-separated values: SUITE=logic,comparisons
 * Returns undefined if SUITE is not set (run all suites).
 */
function getSuiteFilter(): Set<string> | undefined {
  const raw = process.env.SUITE;
  if (!raw) return undefined;
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

const suiteFilter = getSuiteFilter();
const fullSuite = getConformanceSuite();

if (suiteFilter) {
  // Filter: only run conformance suites whose name matches the filter
  const filtered = {
    ...fullSuite,
    suites: fullSuite.suites.filter((s) => suiteFilter.has(s.name)),
  };
  runTestSuite(filtered, runSimpleTest, [], shouldSkip);
} else {
  runTestSuite(fullSuite, runSimpleTest, [], shouldSkip);
}
