import type { SupplementaryTest } from "../types.js";

const C = "conversions";

export const conversionTests: SupplementaryTest[] = [
  // === Double conversions ===
  { name: "double(42) from int", expr: "double(42)", expected: 42, category: C },
  { name: "double(42u) from uint", expr: "double(42u)", expected: 42, category: C },
  { name: "double(1.5) identity", expr: "double(1.5)", expected: 1.5, category: C },
  { name: 'double("1.25") from string', expr: 'double("1.25")', expected: 1.25, category: C },
  { name: 'double("1e3") from string', expr: 'double("1e3")', expected: 1000, category: C },
  { name: 'double("1E-3") from string', expr: 'double("1E-3")', expected: 0.001, category: C },
  {
    name: 'double("Inf") from string',
    expr: 'double("Inf")',
    expected: Number.POSITIVE_INFINITY,
    category: C,
  },
  {
    name: 'double("-Infinity") from string',
    expr: 'double("-Infinity")',
    expected: Number.NEGATIVE_INFINITY,
    category: C,
  },
  { name: 'reject double("")', expr: 'double("")', expectError: true, category: C },
  { name: 'reject double(" 1")', expr: 'double(" 1")', expectError: true, category: C },
  { name: 'reject double("abc")', expr: 'double("abc")', expectError: true, category: C },

  // === Int conversions ===
  { name: "int(42) identity", expr: "int(42)", expected: 42n, category: C },
  { name: "int(3.14) truncate", expr: "int(3.14)", expected: 3n, category: C },
  { name: "int('-5') from string", expr: "int('-5')", expected: -5n, category: C },
  { name: "int('-0') from string", expr: "int('-0')", expected: 0n, category: C },
  { name: "reject int(inf) overflow", expr: "int(double('inf'))", expectError: true, category: C },
  { name: "reject int(nan) overflow", expr: "int(double('nan'))", expectError: true, category: C },
  { name: "reject int('0x01')", expr: "int('0x01')", expectError: true, category: C },

  // === Bool conversions ===
  { name: "bool(true) identity", expr: "bool(true)", expected: true, category: C },
  { name: "bool(false) identity", expr: "bool(false)", expected: false, category: C },
  { name: 'bool("true")', expr: 'bool("true")', expected: true, category: C },
  { name: 'bool("TRUE")', expr: 'bool("TRUE")', expected: true, category: C },
  { name: 'bool("t")', expr: 'bool("t")', expected: true, category: C },
  { name: 'bool("1")', expr: 'bool("1")', expected: true, category: C },
  { name: 'bool("false")', expr: 'bool("false")', expected: false, category: C },
  { name: 'bool("FALSE")', expr: 'bool("FALSE")', expected: false, category: C },
  { name: 'bool("f")', expr: 'bool("f")', expected: false, category: C },
  { name: 'bool("0")', expr: 'bool("0")', expected: false, category: C },
  { name: 'reject bool("T")', expr: 'bool("T")', expectError: true, category: C },
  { name: 'reject bool("yes")', expr: 'bool("yes")', expectError: true, category: C },
  { name: 'reject bool("")', expr: 'bool("")', expectError: true, category: C },
  { name: "reject bool(1)", expr: "bool(1)", expectError: true, category: C },

  // === String conversions ===
  { name: 'string("hello")', expr: 'string("hello")', expected: "hello", category: C },
  { name: "string(false)", expr: "string(false)", expected: "false", category: C },
  { name: "string(true)", expr: "string(true)", expected: "true", category: C },
  { name: "string(1)", expr: "string(1)", expected: "1", category: C },
  { name: "string(1.0)", expr: "string(1.0)", expected: "1", category: C },

  // === Cross-type mixing with dyn ===
  { name: "dyn(1) == 1.0 cross-type eq", expr: "dyn(1) == 1.0", expected: true, category: C },
  { name: "dyn(1) == 1u cross-type eq", expr: "dyn(1) == 1u", expected: true, category: C },
  { name: "dyn(1.0) == 1 cross-type eq", expr: "dyn(1.0) == 1", expected: true, category: C },
  { name: "dyn(1) != 2.0 cross-type ne", expr: "dyn(1) != 2.0", expected: true, category: C },

  // === bytes() conversion ===
  { name: 'bytes("hello") size', expr: 'size(bytes("hello"))', expected: 5n, category: C },

  // === Integer with context binding ===
  {
    name: "int addition from context",
    expr: "a + b",
    expected: 3,
    bindings: { a: 1, b: 2 },
    category: C,
  },
  {
    name: "bigint addition from string",
    expr: "int('999999999999999999') + 50000000",
    expected: BigInt("1000000000049999999"),
    category: C,
  },
];
