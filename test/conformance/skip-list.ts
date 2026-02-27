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
  // ["conversions"],  -- enabled: type conversion functions
  // ["integer_math"],  -- enabled: arithmetic operations
  // ["fp_math"],  -- enabled: floating-point math
  // ["logic"],  -- enabled: logic operations
  // ["string"],  -- enabled: string operations
  // ["lists"],  -- enabled: list operations
  // ["parse"],  -- enabled: CEL parse tests
  // Skip: proto objectValue (Any) not supported in test infra
  ["parse", "nest", "message_literal"],
  // Skip: proto message default instance semantics required
  ["parse", "repeat", "select"],
  // ["plumbing"],  -- enabled: minimal programs, eval results, check inputs
  // ["namespace"],  -- enabled: namespace resolution
  // ["type_deductions"],  -- enabled: type deduction tests
  // Skip: proto3 unset message fields should return zero-value default (Duration/Timestamp), not null
  ["type_deductions", "legacy_nullable_types", "null_assignable_to_duration_parameter_candidate"],
  ["type_deductions", "legacy_nullable_types", "null_assignable_to_timestamp_parameter_candidate"],
  // ["unknowns"],  -- empty suite (0 tests, 0 sub-suites), skipped by runner
  // ["fields"],  -- enabled: field selection, map fields, has(), qualified identifiers
  // ["timestamps"],  -- enabled: timestamp and duration operations

  // Macros
  // ["macros"],  -- enabled: macro operations
  // ["macros2"],  -- enabled: macro operations (v2)

  // Proto integration
  // ["proto2"],  -- enabled: proto2 basics
  // ["proto3"],  -- enabled: proto3 basics (all passing)
  // Skip: google.protobuf.Struct field values are doubles in proto but BigInts in CEL integer literals
  ["proto2", "literal_wellknown", "struct"],
  ["proto3", "literal_wellknown", "struct"],
  // Skip: proto2 explicit default values require schema-level default info (e.g. single_int32 defaults to -32)
  ["proto2", "empty_field", "scalar_with_default"],
  // ["dynamic"],  -- enabled: dynamic dispatch / dyn()
  // Skip: google.protobuf.Any literal requires proto binary deserialization at runtime
  ["dynamic", "any", "literal"],
  // Skip: Any field access after unwrapping should error
  ["dynamic", "any", "literal_no_field_access"],
  // ["enums"],  -- enabled: protocol buffer enums
  // Skip: strong enum type() requires CelEnum wrapper type (not implemented)
  ["enums", "strong_proto2", "type_global"],
  ["enums", "strong_proto2", "type_nested"],
  ["enums", "strong_proto2", "field_type"],
  ["enums", "strong_proto3", "type_global"],
  ["enums", "strong_proto3", "type_nested"],
  ["enums", "strong_proto3", "field_type"],
  // ["wrappers"],  -- enabled: wrapper types (BoolValue, Int32Value, etc.)
  // ["proto2_ext"],  -- enabled: proto2 extension fields

  // Extensions
  // ["string_ext"],  -- enabled: string extension functions
  // ["math_ext"],  -- enabled: math extension functions
  // ["network_ext"],  -- enabled: network extension (no conformance data in cel-spec yet; tested via supplementary)
  // Skip: cel.block() and cel.index() not yet implemented in transpiler
  ["block_ext"],
  // ["bindings_ext"],  -- enabled: bindings extension
  // ["encoders_ext"],  -- enabled: encoder extension functions
  // ["optionals"],  -- enabled: optional values extension
];
