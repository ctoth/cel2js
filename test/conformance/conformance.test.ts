import { getConformanceSuite } from "@bufbuild/cel-spec/testdata/tests.js";
import { runTestSuite } from "./runner.js";
import { SKIP_PATHS } from "./skip-list.js";
import { runSimpleTest } from "./execute.js";

/**
 * Check if a test path should be skipped.
 *
 * A test is skipped if its path starts with any entry in the SKIP_PATHS list.
 * For example, SKIP_PATHS entry ["basic"] skips all tests under the "basic" suite.
 */
function shouldSkip(path: string[]): boolean {
  const pathStr = path.join("/") + "/";
  return SKIP_PATHS.some((skip) => pathStr.startsWith(skip.join("/") + "/"));
}

const suite = getConformanceSuite();
runTestSuite(suite, runSimpleTest, [], shouldSkip);
