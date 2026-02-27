import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Reporter, TestCase, TestModule, TestSuite } from "vitest/node";

interface SuiteStats {
  pass: number;
  fail: number;
  skip: number;
}

/**
 * Custom vitest reporter that writes a per-suite summary to test-results.log.
 *
 * Registered in vitest.config.ts alongside the default reporter.
 * The log file is gitignored.
 */
export default class LogReporter implements Reporter {
  onTestRunEnd(testModules: ReadonlyArray<TestModule>): void {
    const suiteMap = new Map<string, SuiteStats>();

    for (const mod of testModules) {
      // Determine the module type from the file path
      const moduleId = mod.moduleId;

      if (moduleId.includes("conformance.test")) {
        // Conformance tests: top-level describe = suite name
        this.collectConformanceSuites(mod, suiteMap);
      } else if (moduleId.includes("supplementary.test")) {
        // Supplementary tests: count as one "supplementary" suite
        const stats = this.countTests(mod);
        suiteMap.set("supplementary", stats);
      } else if (moduleId.includes("parser.test")) {
        // Unit/parser tests
        const stats = this.countTests(mod);
        suiteMap.set("unit/parser", stats);
      } else {
        // Other test files: use a generic name
        const name = moduleId.split("/").pop()?.replace(".test.ts", "") ?? moduleId;
        const stats = this.countTests(mod);
        suiteMap.set(name, stats);
      }
    }

    this.writeLog(suiteMap);
  }

  /**
   * For conformance tests, each top-level describe block is a separate suite.
   * The structure is: TestModule > TestSuite("cel-spec-tests-...") > TestSuite("basic") > ...
   * We want the second-level suite names (basic, comparisons, logic, etc.)
   */
  private collectConformanceSuites(mod: TestModule, suiteMap: Map<string, SuiteStats>): void {
    // The conformance test file has a top-level suite wrapping all sub-suites
    for (const child of mod.children) {
      if (child.type === "suite") {
        // This is the root "cel-spec-tests-..." describe block
        // Its children are the actual conformance suites
        this.collectChildSuites(child, suiteMap);
      }
    }
  }

  private collectChildSuites(parentSuite: TestSuite, suiteMap: Map<string, SuiteStats>): void {
    for (const child of parentSuite.children) {
      if (child.type === "suite") {
        const stats = this.countTests(child);
        suiteMap.set(child.name, stats);
      } else if (child.type === "test") {
        // Direct tests under the root suite (rare but handle it)
        const existing = suiteMap.get("(root)") ?? { pass: 0, fail: 0, skip: 0 };
        this.addTestResult(child, existing);
        suiteMap.set("(root)", existing);
      }
    }
  }

  private countTests(entity: TestModule | TestSuite): SuiteStats {
    const stats: SuiteStats = { pass: 0, fail: 0, skip: 0 };
    for (const test of entity.children.allTests()) {
      this.addTestResult(test, stats);
    }
    return stats;
  }

  private addTestResult(test: TestCase, stats: SuiteStats): void {
    const result = test.result();
    switch (result.state) {
      case "passed":
        stats.pass++;
        break;
      case "failed":
        stats.fail++;
        break;
      case "skipped":
        stats.skip++;
        break;
    }
  }

  private writeLog(suiteMap: Map<string, SuiteStats>): void {
    const now = new Date().toISOString();
    const lines: string[] = [];

    lines.push(`=== Test Run: ${now} ===`);
    lines.push(
      `${"SUITE".padEnd(28)} ${"PASS".padStart(6)} ${"FAIL".padStart(6)} ${"SKIP".padStart(6)} ${"TOTAL".padStart(6)}`,
    );

    let totalPass = 0;
    let totalFail = 0;
    let totalSkip = 0;

    // Separate conformance suites from supplementary/unit
    const conformanceSuites: [string, SuiteStats][] = [];
    const otherSuites: [string, SuiteStats][] = [];

    for (const [name, stats] of suiteMap) {
      if (name === "supplementary" || name.startsWith("unit/")) {
        otherSuites.push([name, stats]);
      } else {
        conformanceSuites.push([name, stats]);
      }
    }

    // Print conformance suites
    for (const [name, stats] of conformanceSuites) {
      const total = stats.pass + stats.fail + stats.skip;
      lines.push(
        `${name.padEnd(28)} ${String(stats.pass).padStart(6)} ${String(stats.fail).padStart(6)} ${String(stats.skip).padStart(6)} ${String(total).padStart(6)}`,
      );
      totalPass += stats.pass;
      totalFail += stats.fail;
      totalSkip += stats.skip;
    }

    // Total line for conformance
    const confTotal = totalPass + totalFail + totalSkip;
    lines.push(
      `${"TOTAL".padEnd(28)} ${String(totalPass).padStart(6)} ${String(totalFail).padStart(6)} ${String(totalSkip).padStart(6)} ${String(confTotal).padStart(6)}`,
    );

    // Blank line separator before non-conformance suites
    if (otherSuites.length > 0) {
      lines.push("");
      for (const [name, stats] of otherSuites) {
        const total = stats.pass + stats.fail + stats.skip;
        lines.push(
          `${name.padEnd(28)} ${String(stats.pass).padStart(6)} ${String(stats.fail).padStart(6)} ${String(stats.skip).padStart(6)} ${String(total).padStart(6)}`,
        );
      }
    }

    lines.push("");

    const logPath = resolve(process.cwd(), "test-results.log");
    writeFileSync(logPath, `${lines.join("\n")}\n`);
  }
}
