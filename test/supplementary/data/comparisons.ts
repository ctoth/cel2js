import type { SupplementaryTest } from "../types.js";

const C = "comparisons";

export const comparisonTests: SupplementaryTest[] = [
  // === Equality ===
  { name: "equal numbers", expr: "1 == 1", expected: true, category: C },
  { name: "unequal numbers", expr: "1 == 2", expected: false, category: C },
  { name: "equal strings", expr: '"hello" == "hello"', expected: true, category: C },
  { name: "unequal strings", expr: '"hello" == "world"', expected: false, category: C },
  { name: "equal booleans", expr: "true == true", expected: true, category: C },
  { name: "unequal booleans", expr: "true == false", expected: false, category: C },

  // === Inequality ===
  { name: "not-equal numbers true", expr: "1 != 2", expected: true, category: C },
  { name: "not-equal numbers false", expr: "1 != 1", expected: false, category: C },

  // === Cross-type equality errors (strict typing) ===
  { name: "reject bool == null", expr: "true == null", expectError: true, category: C },
  { name: "reject false == null", expr: "false == null", expectError: true, category: C },
  { name: "reject double == null", expr: "1.0 == null", expectError: true, category: C },
  { name: "reject int == null", expr: "1 == null", expectError: true, category: C },
  { name: "reject bool == int", expr: "true == 1", expectError: true, category: C },
  { name: "reject double == int eq", expr: "1.0 == 0", expectError: true, category: C },
  { name: "reject double != int", expr: "1.0 != 0", expectError: true, category: C },
  { name: "reject bool != null", expr: "true != null", expectError: true, category: C },

  // === Less than ===
  // booleans
  { name: "true < false", expr: "true < false", expected: false, category: C },
  { name: "false < true", expr: "false < true", expected: true, category: C },
  { name: "true < true", expr: "true < true", expected: false, category: C },
  // integers
  { name: "1 < 2", expr: "1 < 2", expected: true, category: C },
  { name: "2 < 2", expr: "2 < 2", expected: false, category: C },
  { name: "3 < 2", expr: "3 < 2", expected: false, category: C },
  { name: "-5 < -3", expr: "-5 < -3", expected: true, category: C },
  {
    name: "int64 max boundary <",
    expr: "9223372036854775806 < 9223372036854775807",
    expected: true,
    category: C,
  },
  // unsigned integers
  { name: "uint(1) < uint(2)", expr: "uint(1) < uint(2)", expected: true, category: C },
  { name: "uint(2) < uint(2)", expr: "uint(2) < uint(2)", expected: false, category: C },
  // doubles
  { name: "1.0 < 2.0", expr: "1.0 < 2.0", expected: true, category: C },
  { name: "2.0 < 2.0", expr: "2.0 < 2.0", expected: false, category: C },
  { name: "-5.5 < -3.3", expr: "-5.5 < -3.3", expected: true, category: C },
  // strings
  { name: '"a" < "b"', expr: '"a" < "b"', expected: true, category: C },
  { name: '"b" < "a"', expr: '"b" < "a"', expected: false, category: C },
  { name: '"abc" < "abcd"', expr: '"abc" < "abcd"', expected: true, category: C },
  { name: 'empty < "a"', expr: '"" < "a"', expected: true, category: C },
  { name: '"A" < "a"', expr: '"A" < "a"', expected: true, category: C },
  // timestamps
  {
    name: "timestamp <",
    expr: 'timestamp("2024-01-01T00:00:00Z") < timestamp("2024-01-02T00:00:00Z")',
    expected: true,
    category: C,
  },
  {
    name: "timestamp < equal",
    expr: 'timestamp("2024-01-01T00:00:00Z") < timestamp("2024-01-01T00:00:00Z")',
    expected: false,
    category: C,
  },
  // durations
  { name: "duration <", expr: 'duration("1h") < duration("2h")', expected: true, category: C },
  {
    name: "duration < equal",
    expr: 'duration("1h") < duration("1h")',
    expected: false,
    category: C,
  },
  // cross-type int/double
  { name: "1 < 1.5", expr: "1 < 1.5", expected: true, category: C },
  { name: "2 < 1.5", expr: "2 < 1.5", expected: false, category: C },
  { name: "1 < 1.0", expr: "1 < 1.0", expected: false, category: C },
  { name: "1.5 < 2", expr: "1.5 < 2", expected: true, category: C },
  // cross-type int/uint
  { name: "1 < uint(2)", expr: "1 < uint(2)", expected: true, category: C },
  { name: "2 < uint(1)", expr: "2 < uint(1)", expected: false, category: C },
  { name: "uint(1) < 2", expr: "uint(1) < 2", expected: true, category: C },
  // cross-type double/uint
  { name: "1.5 < uint(2)", expr: "1.5 < uint(2)", expected: true, category: C },
  { name: "uint(1) < 2.5", expr: "uint(1) < 2.5", expected: true, category: C },

  // === Less than or equal ===
  { name: "1 <= 2", expr: "1 <= 2", expected: true, category: C },
  { name: "2 <= 2", expr: "2 <= 2", expected: true, category: C },
  { name: "3 <= 2", expr: "3 <= 2", expected: false, category: C },
  { name: "true <= true", expr: "true <= true", expected: true, category: C },
  { name: "true <= false", expr: "true <= false", expected: false, category: C },

  // === Greater than ===
  { name: "2 > 1", expr: "2 > 1", expected: true, category: C },
  { name: "2 > 2", expr: "2 > 2", expected: false, category: C },
  { name: "1 > 2", expr: "1 > 2", expected: false, category: C },
  {
    name: "int64 max boundary >",
    expr: "9223372036854775807 > 9223372036854775806",
    expected: true,
    category: C,
  },
  { name: '"b" > "a"', expr: '"b" > "a"', expected: true, category: C },
  { name: '"abcd" > "abc"', expr: '"abcd" > "abc"', expected: true, category: C },
  {
    name: "timestamp >",
    expr: 'timestamp("2024-01-02T00:00:00Z") > timestamp("2024-01-01T00:00:00Z")',
    expected: true,
    category: C,
  },
  { name: "duration >", expr: 'duration("2h") > duration("1h")', expected: true, category: C },
  { name: "cross-type 2 > 1.5", expr: "2 > 1.5", expected: true, category: C },

  // === Greater than or equal ===
  { name: "2 >= 1", expr: "2 >= 1", expected: true, category: C },
  { name: "2 >= 2", expr: "2 >= 2", expected: true, category: C },
  { name: "1 >= 2", expr: "1 >= 2", expected: false, category: C },

  // === Type mismatches ===
  { name: 'reject "a" < 1', expr: '"a" < 1', expectError: true, category: C },
  { name: 'reject 1 < "a"', expr: '1 < "a"', expectError: true, category: C },
  { name: "reject true < 1", expr: "true < 1", expectError: true, category: C },
  { name: 'reject true < "a"', expr: 'true < "a"', expectError: true, category: C },
  { name: "reject [] < []", expr: "[] < []", expectError: true, category: C },
  { name: "reject {} < {}", expr: "{} < {}", expectError: true, category: C },

  // === NaN comparisons ===
  {
    name: "NaN == NaN is false",
    expr: 'double("NaN") == double("NaN")',
    expected: false,
    category: C,
  },
  {
    name: "NaN != NaN is true",
    expr: 'double("NaN") != double("NaN")',
    expected: true,
    category: C,
  },
  { name: "NaN > 0 is false", expr: 'double("NaN") > 0', expected: false, category: C },
  { name: "NaN < 0 is false", expr: 'double("NaN") < 0', expected: false, category: C },

  // === Dynamic comparisons ===
  { name: "dyn int == int", expr: "dyn(1.0) == 1", expected: true, category: C },
  { name: "int == dyn double", expr: "1 == dyn(1.0)", expected: true, category: C },
  { name: "dyn double == uint", expr: "dyn(1.0) == 1u", expected: true, category: C },
  { name: "dyn double != int", expr: "dyn(1.0) != 2", expected: true, category: C },

  // === Reject double comparison against string ===
  { name: "reject double > string", expr: '1.0 > "1"', expectError: true, category: C },
  { name: "reject double < string", expr: '1.0 < "1"', expectError: true, category: C },

  // === Integer/double comparison (relational ok, equality error) ===
  { name: "1.1 >= 1 (cross-type relational)", expr: "1.1 >= 1", expected: true, category: C },
  { name: "1.0 >= 1 (cross-type relational)", expr: "1.0 >= 1", expected: true, category: C },
  { name: "1.0 <= 1 (cross-type relational)", expr: "1.0 <= 1", expected: true, category: C },
  { name: "0.9 <= 1 (cross-type relational)", expr: "0.9 <= 1", expected: true, category: C },
  { name: "2 > 1.0 (cross-type relational)", expr: "2 > 1.0", expected: true, category: C },

  // === Double comparison ===
  { name: "0.5 < 0.6", expr: "0.5 < 0.6", expected: true, category: C },
  { name: "0.5 <= 0.5", expr: "0.5 <= 0.5", expected: true, category: C },
  { name: "0.9 > 0.3", expr: "0.9 > 0.3", expected: true, category: C },
  { name: "1.0 >= 1.0", expr: "1.0 >= 1.0", expected: true, category: C },

  // === Reject double equality without dyn ===
  { name: "reject 1.0 == 1 (eq)", expr: "1.0 == 1", expectError: true, category: C },
  { name: "reject 1.0 != 1 (ne)", expr: "1.0 != 1", expectError: true, category: C },
  { name: "reject 1.0 == 1u (eq)", expr: "1.0 == 1u", expectError: true, category: C },
  { name: "reject 1.0 != 1u (ne)", expr: "1.0 != 1u", expectError: true, category: C },

  // === Null comparison ===
  { name: "null == null", expr: "null == null", expected: true, category: C },
  { name: "null != null", expr: "null != null", expected: false, category: C },
];
