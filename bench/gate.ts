/**
 * Benchmark gating script.
 *
 * Runs `npx vitest bench --run`, parses the output for hot-path benchmarks
 * from the cel2js suite, and compares against the saved baseline.
 *
 * Exits 1 if ANY hot-path benchmark regresses more than 5% below baseline.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const TOLERANCE = 0.95; // 5% regression tolerance

const thisDir = dirname(fileURLToPath(import.meta.url));

interface Baseline {
  [name: string]: number;
}

function loadBaseline(): Baseline {
  const baselinePath = resolve(thisDir, "baseline.json");
  const raw = readFileSync(baselinePath, "utf-8");
  return JSON.parse(raw) as Baseline;
}

/**
 * Parse vitest bench output for cel2js hot-path benchmarks.
 *
 * Lines look like:
 *   · hot arithmetic: x + y * 2    6,750,948.00  0.0001  ...  3375474
 *
 * We match lines starting with "hot " (after the · prefix) within the cel2js section,
 * and extract the benchmark short name and the ops/sec (hz) number.
 */
function parseBenchOutput(output: string): Map<string, number> {
  const results = new Map<string, number>();

  // Find lines with benchmark results inside the cel2js section.
  // The cel2js section is identified by "cel2js.bench.ts > cel2js" header.
  // Each benchmark line starts with "·" and contains the name and hz value.
  let inCel2js = false;

  for (const line of output.split("\n")) {
    // Detect cel2js section (the describe block for cel2js)
    if (line.includes("cel2js.bench.ts") && line.includes("cel2js")) {
      inCel2js = true;
      continue;
    }

    // Detect leaving cel2js section (next section header or summary)
    if (
      inCel2js &&
      (line.includes(".bench.ts") || line.includes("BENCH") || line.includes("Summary"))
    ) {
      if (!line.includes("cel2js.bench.ts")) {
        inCel2js = false;
        continue;
      }
    }

    if (!inCel2js) continue;

    // Match hot benchmark lines. The · character may be preceded by spaces.
    // After ANSI stripping, format is:
    //   · hot arithmetic: x + y * 2          6,750,948.00  0.0001  ...
    // The CEL expression may contain digits, so we first extract the
    // benchmark name, then split on 2+ spaces to isolate the hz column.
    const nameMatch = line.match(/·\s*(hot \w+):/);
    if (nameMatch) {
      const name = nameMatch[1];
      // Split on runs of 2+ spaces to get table columns
      const parts = line.split(/\s{2,}/);
      // The hz value is the first part that looks like a large number with commas
      let hz: number | undefined;
      for (const part of parts) {
        const trimmed = part.trim();
        if (/^[\d,]+\.\d+$/.test(trimmed) && trimmed.includes(",")) {
          hz = Number.parseFloat(trimmed.replace(/,/g, ""));
          break;
        }
      }
      if (name && hz !== undefined) {
        results.set(name, hz);
      }
    }
  }

  return results;
}

// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape stripping requires matching ESC control character
const ANSI_RE = /\x1b\[[0-9;]*m/g;

function stripAnsi(str: string): string {
  return str.replace(ANSI_RE, "");
}

function formatOps(n: number): string {
  return `${n.toLocaleString("en-US", { maximumFractionDigits: 0 })} ops/s`;
}

function main(): void {
  console.log("Benchmark Gate: running benchmarks...\n");

  const baseline = loadBaseline();
  const baselineNames = Object.keys(baseline);

  // Run benchmarks
  let output: string;
  try {
    output = execSync("npx vitest bench --run", {
      cwd: resolve(thisDir, ".."),
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 300_000,
    });
  } catch (err: unknown) {
    // vitest bench may exit non-zero but still produce output
    const execErr = err as { stdout?: string; stderr?: string };
    output = (execErr.stdout ?? "") + (execErr.stderr ?? "");
    if (!output) {
      console.error("Failed to run benchmarks");
      process.exit(1);
    }
  }

  const cleaned = stripAnsi(output);
  const current = parseBenchOutput(cleaned);

  // Print results table
  const colName = 28;
  const colNum = 18;
  const colChange = 10;
  const colStatus = 6;

  const header =
    "Benchmark".padEnd(colName) +
    "Baseline".padStart(colNum) +
    "Current".padStart(colNum) +
    "Change".padStart(colChange) +
    "Status".padStart(colStatus);

  const separator = "-".repeat(header.length);

  console.log(header);
  console.log(separator);

  let anyFail = false;

  for (const name of baselineNames) {
    const baselineOps = baseline[name];
    if (baselineOps === undefined) continue;

    const currentOps = current.get(name);

    if (currentOps === undefined) {
      console.log(
        `${name.padEnd(colName)}${formatOps(baselineOps).padStart(colNum)}${"MISSING".padStart(colNum)}${"N/A".padStart(colChange)}${"FAIL".padStart(colStatus)}`,
      );
      anyFail = true;
      continue;
    }

    const changePercent = ((currentOps - baselineOps) / baselineOps) * 100;
    const threshold = baselineOps * TOLERANCE;
    const passed = currentOps >= threshold;

    if (!passed) {
      anyFail = true;
    }

    const changeStr = `${changePercent >= 0 ? "+" : ""}${changePercent.toFixed(1)}%`;
    const statusStr = passed ? "PASS" : "FAIL";

    console.log(
      `${name.padEnd(colName)}${formatOps(baselineOps).padStart(colNum)}${formatOps(currentOps).padStart(colNum)}${changeStr.padStart(colChange)}${statusStr.padStart(colStatus)}`,
    );
  }

  console.log(separator);

  if (anyFail) {
    console.log("\nGATE FAILED: one or more hot-path benchmarks regressed beyond 5% tolerance.\n");
    process.exit(1);
  } else {
    console.log("\nGATE PASSED: all hot-path benchmarks within tolerance.\n");
    process.exit(0);
  }
}

main();
