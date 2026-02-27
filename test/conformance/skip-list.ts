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
  // Skip: proto objectValue (Any) not supported in test infra
  ["parse", "struct_field_names"],
  // ["plumbing"],  -- enabled: minimal programs, eval results, check inputs
  // ["namespace"],  -- enabled: namespace resolution
  ["type_deductions"],
  // ["unknowns"],  -- empty suite (0 tests, 0 sub-suites), skipped by runner
  // ["fields"],  -- enabled: field selection, map fields, has(), qualified identifiers
  // Skip: float/null map keys and duplicate key detection require runtime makeMap changes
  ["fields", "qualified_identifier_resolution", "map_key_float"],
  ["fields", "qualified_identifier_resolution", "map_key_null"],
  ["fields", "qualified_identifier_resolution", "map_value_repeat_key"],
  ["fields", "qualified_identifier_resolution", "map_value_repeat_key_heterogeneous"],
  // ["timestamps"],  -- enabled: timestamp and duration operations

  // Macros
  // ["macros"],  -- enabled: macro operations
  // ["macros2"],  -- enabled: macro operations (v2)

  // Proto integration
  // ["proto2"],  -- enabled: proto2 basics (162/183 passing)
  // ["proto3"],  -- enabled: proto3 basics (all passing)
  // Skip: google.protobuf.Struct field values are doubles in proto but BigInts in CEL integer literals
  ["proto2", "literal_wellknown", "struct"],
  ["proto3", "literal_wellknown", "struct"],
  // Skip: proto2 explicit default values require schema-level default info (e.g. single_int32 defaults to -32)
  ["proto2", "empty_field", "scalar_with_default"],
  // Skip: proto2 extensions require full extension registry infrastructure
  ["proto2", "extensions_has"],
  ["proto2", "extensions_get"],
  // ["dynamic"],  -- enabled: dynamic dispatch / dyn()
  // Skip: CelUint.value property leaks through wrapper type unwrapping
  ["dynamic", "uint32", "literal_no_field_access"],
  ["dynamic", "uint64", "literal_no_field_access"],
  // Skip: Array.prototype.values leaks through ListValue unwrapping
  ["dynamic", "list", "literal_no_field_access"],
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
  // ["string_ext"],  -- enabling: string extension functions
  // ["math_ext"],  -- enabling: math extension functions
  ["network_ext"],
  // ["bindings_ext"],  -- enabling: bindings extension
  // ["encoders_ext"],  -- enabling: encoder extension functions
  ["block_ext"],
  // ["optionals"],  -- enabling: optional values extension
  // Skip: proto map<string,string> field type semantics differ from CEL map zero-value
  ["optionals", "optionals", "struct_optional_ofNonZeroValue_map_optindex_field"],
];
