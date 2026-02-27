/**
 * Skip list for conformance tests.
 *
 * EVERYTHING is skipped initially — there is no transpiler yet.
 * Each entry is a path prefix. Any test whose full path starts with
 * this prefix will be run with the "negative skip" pattern: we expect
 * it to fail (because the transpiler throws "not implemented").
 *
 * As the transpiler is built out, entries are REMOVED from this list.
 * If a skipped test starts passing, the runner will throw an error
 * telling us to remove it from the skip list.
 */
export const SKIP_PATHS: string[][] = [
  // ===== ALL TESTS SKIPPED — No transpiler implemented yet =====

  // Core language
  // ["basic"],  -- enabled: literals, variables, functions
  // ["comparisons"],  -- enabled: comparison operations
  // Skip: proto Any unpacking requires proto deserialization
  ["comparisons", "eq_wrapper", "eq_proto2_any_unpack_equal"],
  ["comparisons", "eq_wrapper", "eq_proto3_any_unpack_equal"],
  ["comparisons", "ne_literal", "ne_proto2_any_unpack"],
  ["comparisons", "ne_literal", "ne_proto3_any_unpack"],
  ["conversions"],
  // ["integer_math"],  -- enabled: arithmetic operations
  // ["fp_math"],  -- enabled: floating-point math
  // ["logic"],  -- enabled: logic operations
  // ["string"],  -- enabled: string operations
  // ["lists"],  -- enabled: list operations
  ["parse"],
  // ["plumbing"],  -- enabled: minimal programs, eval results, check inputs
  ["namespace"],
  ["type_deductions"],
  // ["unknowns"],  -- empty suite (0 tests, 0 sub-suites), skipped by runner
  ["fields"],
  ["timestamps"],

  // Macros
  ["macros"],
  ["macros2"],

  // Proto integration
  ["proto2"],
  ["proto3"],
  ["dynamic"],
  ["enums"],
  ["wrappers"],
  ["proto2_ext"],

  // Extensions
  ["string_ext"],
  ["math_ext"],
  ["network_ext"],
  ["bindings_ext"],
  ["encoders_ext"],
  ["block_ext"],
  ["optionals"],
];
