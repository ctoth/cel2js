/**
 * Shared benchmark case definitions for cel2js benchmarks.
 *
 * Each case specifies the CEL expression, context bindings (in various
 * type formats needed by different libraries), expected result, and a
 * hand-written native JS equivalent for baseline comparison.
 */

export interface BenchmarkCase {
  name: string;
  cel: string;
  /** Context using plain JS numbers (for cel-js and native baseline) */
  context: Record<string, unknown>;
  /** Context using BigInt for integer values (for @marcbachmann/cel-js and @bufbuild/cel) */
  contextBigInt: Record<string, unknown>;
  /** Expected result (JS number form) */
  expected: unknown;
  /** Hand-written JS equivalent for native new Function() baseline */
  nativeJs: string;
  /** Argument names for new Function() */
  nativeArgs: string[];
}

export const BENCHMARK_CASES: BenchmarkCase[] = [
  {
    name: "trivial",
    cel: "true",
    context: {},
    contextBigInt: {},
    expected: true,
    nativeJs: "return true",
    nativeArgs: [],
  },
  {
    name: "arithmetic",
    cel: "x + y * 2",
    context: { x: 10, y: 20 },
    contextBigInt: { x: 10n, y: 20n },
    expected: 50,
    nativeJs: "return x + y * 2",
    nativeArgs: ["x", "y"],
  },
  {
    name: "string_ops",
    cel: 'name.startsWith("J") && name.size() > 3',
    context: { name: "John" },
    contextBigInt: { name: "John" },
    expected: true,
    nativeJs: 'return name.startsWith("J") && name.length > 3',
    nativeArgs: ["name"],
  },
  {
    name: "ternary",
    cel: "x > 0 ? x * 2 : -x",
    context: { x: 5 },
    contextBigInt: { x: 5n },
    expected: 10,
    nativeJs: "return x > 0 ? x * 2 : -x",
    nativeArgs: ["x"],
  },
  {
    name: "comprehension",
    cel: "[1, 2, 3, 4, 5].filter(x, x > 2)",
    context: {},
    contextBigInt: {},
    expected: [3, 4, 5],
    nativeJs: "return [1, 2, 3, 4, 5].filter(x => x > 2)",
    nativeArgs: [],
  },
  {
    name: "real_world",
    cel: 'request.auth.claims.email.endsWith("@example.com") && request.method == "GET"',
    context: {
      request: {
        auth: { claims: { email: "user@example.com" } },
        method: "GET",
      },
    },
    contextBigInt: {
      request: {
        auth: { claims: { email: "user@example.com" } },
        method: "GET",
      },
    },
    expected: true,
    nativeJs:
      'return request.auth.claims.email.endsWith("@example.com") && request.method === "GET"',
    nativeArgs: ["request"],
  },
];
