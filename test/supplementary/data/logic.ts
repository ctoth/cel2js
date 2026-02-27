import type { SupplementaryTest } from "../types.js";

const C = "logic";

export const logicTests: SupplementaryTest[] = [
  // === AND short-circuit ===
  { name: "true && true", expr: "true && true", expected: true, category: C },
  { name: "true && false", expr: "true && false", expected: false, category: C },
  { name: "false && true", expr: "false && true", expected: false, category: C },
  { name: "false && false", expr: "false && false", expected: false, category: C },
  { name: "triple AND true", expr: "true && true && true", expected: true, category: C },
  { name: "triple AND false mid", expr: "true && false && true", expected: false, category: C },
  {
    name: "AND short-circuits div/0",
    expr: "false && ((1 / 0) == 0)",
    expected: false,
    category: C,
  },
  { name: "AND error absorbed right", expr: "true && false", expected: false, category: C },

  // === OR short-circuit ===
  { name: "true || false", expr: "true || false", expected: true, category: C },
  { name: "false || false", expr: "false || false", expected: false, category: C },
  { name: "false || true || false", expr: "false || true || false", expected: true, category: C },
  { name: "OR short-circuits div/0", expr: "true || ((1 / 0) == 0)", expected: true, category: C },

  // === Combined logical ===
  { name: "AND then OR", expr: "true && true || false", expected: true, category: C },
  {
    name: "grouped AND/OR",
    expr: "(true || false) && (false || true)",
    expected: true,
    category: C,
  },

  // === NOT operator ===
  { name: "!false", expr: "!false", expected: true, category: C },
  { name: "!(false)", expr: "!(false)", expected: true, category: C },
  { name: "!!false", expr: "!!false", expected: false, category: C },
  { name: "!true", expr: "!true", expected: false, category: C },
  { name: "!(true)", expr: "!(true)", expected: false, category: C },
  { name: "!!true", expr: "!!true", expected: true, category: C },
  { name: "!!!true", expr: "!!!true", expected: false, category: C },
  { name: "NOT with comparison", expr: "!(1 == 1)", expected: false, category: C },
  {
    name: "NOT with variable",
    expr: "!isActive",
    expected: false,
    bindings: { isActive: true },
    category: C,
  },
  { name: 'reject !""', expr: '!""', expectError: true, category: C },
  { name: "reject !1", expr: "!1", expectError: true, category: C },
  { name: "reject ![]", expr: "![]", expectError: true, category: C },
  { name: "reject !{}", expr: "!{}", expectError: true, category: C },

  // === Logical AND/OR precedence ===
  { name: "AND higher than OR", expr: "true || false && false", expected: true, category: C },

  // === Ternary operator ===
  { name: "ternary true branch", expr: "true ? 1 : 2", expected: 1n, category: C },
  { name: "ternary false branch", expr: "false ? 1 : 2", expected: 2n, category: C },
  { name: "ternary with comparison", expr: '1 < 2 ? "yes" : "no"', expected: "yes", category: C },
  {
    name: "ternary with equality",
    expr: '1 + 1 == 2 ? "correct" : "incorrect"',
    expected: "correct",
    category: C,
  },
  {
    name: "nested ternary true-true",
    expr: "true ? (true ? 1 : 2) : 3",
    expected: 1n,
    category: C,
  },
  {
    name: "nested ternary true-false",
    expr: "true ? (false ? 1 : 2) : 3",
    expected: 2n,
    category: C,
  },
  {
    name: "nested ternary false-true",
    expr: "false ? 1 : (true ? 2 : 3)",
    expected: 2n,
    category: C,
  },
  {
    name: "nested ternary false-false",
    expr: "false ? 1 : (false ? 2 : 3)",
    expected: 3n,
    category: C,
  },
  { name: "ternary complex expr", expr: "1 + 1 == 2 ? 3 * 2 : 5 * 2", expected: 6n, category: C },
  {
    name: "ternary with variable",
    expr: 'user.admin ? "Admin" : "User"',
    expected: "Admin",
    bindings: { user: { admin: true } },
    category: C,
  },
  {
    name: "ternary with logical AND",
    expr: 'true && true ? "yes" : "no"',
    expected: "yes",
    category: C,
  },
  {
    name: "ternary with logical OR",
    expr: 'false || true ? "yes" : "no"',
    expected: "yes",
    category: C,
  },
  {
    name: "ternary null == null",
    expr: 'null == null ? "true" : "false"',
    expected: "true",
    category: C,
  },

  // === Ternary type errors ===
  {
    name: "reject string condition",
    expr: '"" ? "true" : "false"',
    expectError: true,
    category: C,
  },
  { name: "reject int condition", expr: '0 ? "true" : "false"', expectError: true, category: C },
  {
    name: "reject null condition",
    expr: 'null ? "true" : "false"',
    expectError: true,
    category: C,
  },

  // === Precedence: ternary lower than AND ===
  {
    name: "ternary lower than AND",
    expr: 'true && false ? "wrong" : "right"',
    expected: "right",
    category: C,
  },
  {
    name: "ternary lower than OR",
    expr: 'false || true ? "right" : "wrong"',
    expected: "right",
    category: C,
  },
  {
    name: "ternary right-associative",
    expr: 'a ? b ? "ab" : "a" : "none"',
    expected: "ab",
    bindings: { a: true, b: true },
    category: C,
  },
  {
    name: "arithmetic precedence in ternary",
    expr: '1 + 2 * 3 > 5 ? "big" : "small"',
    expected: "big",
    category: C,
  },

  // === Error absorption (partial state) ===
  {
    name: "false AND div/0 absorbs error",
    expr: "false && ((1 / 0) == 0)",
    expected: false,
    category: C,
  },
  {
    name: "div/0 AND false absorbs error",
    expr: "((1 / 0) == 0) && false",
    expected: false,
    category: C,
  },
  {
    name: "true OR div/0 absorbs error",
    expr: "true || ((1 / 0) == 0)",
    expected: true,
    category: C,
  },
  {
    name: "div/0 OR true absorbs error",
    expr: "((1 / 0) == 0) || true",
    expected: true,
    category: C,
  },
  { name: "true AND div/0 throws", expr: "true && ((1 / 0) == 0)", expectError: true, category: C },
  {
    name: "false OR div/0 throws",
    expr: "false || ((1 / 0) == 0)",
    expectError: true,
    category: C,
  },
  {
    name: "missing prop OR true absorbs",
    expr: "nested.different || true",
    expected: true,
    bindings: { foo: "bar", nested: { a: "b" } },
    category: C,
  },

  // === Comparison + logical combos ===
  { name: "comparison AND comparison", expr: "1 + 2 == 3 && 4 > 2", expected: true, category: C },

  // === Whitespace handling ===
  { name: "extra whitespace", expr: "  1   +   2  ", expected: 3n, category: C },
  { name: "tabs and newlines", expr: "1\t+\n2", expected: 3n, category: C },
  { name: "no whitespace", expr: "1+2*3", expected: 7n, category: C },

  // === Identifiers ===
  { name: "single identifier", expr: "a", expected: 2, bindings: { a: 2 }, category: C },
  {
    name: "nested identifier",
    expr: "a.b.c",
    expected: 2,
    bindings: { a: { b: { c: 2 } } },
    category: C,
  },
  { name: "index notation", expr: 'a["b"]', expected: 2, bindings: { a: { b: 2 } }, category: C },
  {
    name: "mixed dot and bracket",
    expr: 'a.b["c"].d',
    expected: 2,
    bindings: { a: { b: { c: { d: 2 } } } },
    category: C,
  },
  { name: "unknown variable throws", expr: "a", expectError: true, category: C },
  {
    name: "missing subprop throws",
    expr: "a.b",
    expectError: true,
    bindings: { a: {} },
    category: C,
  },
  {
    name: "reject reserved: package",
    expr: "package",
    expectError: true,
    bindings: { package: "foo" },
    category: C,
  },
  {
    name: "reject reserved: var",
    expr: "var",
    expectError: true,
    bindings: { var: "foo" },
    category: C,
  },
  {
    name: "reserved within object ok",
    expr: "obj.package",
    expected: "a",
    bindings: { obj: { package: "a" } },
    category: C,
  },

  // === Many repetitions ===
  {
    name: "32 additions",
    expr: Array.from({ length: 32 }, () => "1").join(" + "),
    expected: 32n,
    category: C,
  },
];
