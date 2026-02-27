/**
 * Skip list for supplementary tests.
 *
 * Tests listed here are expected to fail (negative skip pattern).
 * Each entry is "category > test name" matching the test's category and name fields.
 *
 * As the transpiler improves, entries are REMOVED from this set.
 * If a skipped test starts passing, the runner throws an error
 * telling us to remove it from the skip list.
 *
 * Categories of failures:
 * - CEL spec vs cel-js-marcbachmann semantics differences (cross-type errors, map representation)
 * - Unimplemented features (bytes methods, prototype pollution guards)
 * - Binding type mismatches (JS number vs BigInt expectations)
 */
export const SUPPLEMENTARY_SKIP_NAMES: Set<string> = new Set([
  // === arithmetic: cross-type errors (CEL spec allows cross-type comparison but not arithmetic) ===
  // cel2js returns undefined (error) for these but the test framework catches compile/evaluate errors
  "arithmetic > reject int*double",
  "arithmetic > reject double%double",
  "arithmetic > reject int%double",
  "arithmetic > reject double+int",
  "arithmetic > reject double-uint",
  "arithmetic > reject double*int",
  "arithmetic > reject double/uint",

  // === arithmetic: 0X uppercase hex not supported in parser ===
  "arithmetic > hex uppercase X",

  // === arithmetic: parse errors expected ===
  "arithmetic > reject empty hex 0x",
  "arithmetic > reject empty hex 0X",
  "arithmetic > reject invalid hex 0xg",

  // === arithmetic: overflow errors ===
  "arithmetic > int overflow max+1",
  "arithmetic > int overflow min-1",
  "arithmetic > int overflow mul",

  // === arithmetic: uint operations ===
  "arithmetic > uint addition",
  "arithmetic > uint subtraction",
  "arithmetic > uint hex add",
  "arithmetic > uint hex mul",
  "arithmetic > uint64 max",
  "arithmetic > uint overflow 0u-1u",
  "arithmetic > uint negate -1u",
  "arithmetic > uint overflow max+1",
  "arithmetic > uint overflow mul",
  "arithmetic > reject float uint 0.1u",
  "arithmetic > reject float uint 1.5u",

  // === arithmetic: unary plus / double plus errors ===
  "arithmetic > reject unary plus",
  "arithmetic > reject unary plus group",
  "arithmetic > reject double plus",

  // === arithmetic: integer division by zero ===
  "arithmetic > int division by zero throws",

  // === strings: parse/compile errors expected ===
  "strings > reject invalid escape \\s",
  "strings > reject unterminated string",
  "strings > reject invalid unicode \\uZZZZ",
  "strings > reject invalid \\U over max",
  "strings > reject \\U surrogate",

  // === strings: type error expected ===
  "strings > reject string + null",
  "strings > reject string + int",
  "strings > reject string in string",

  // === strings: split with no args ===
  "strings > split no args error",

  // === strings: bytes methods not implemented ===
  "strings > bytes string method",
  "strings > bytes hex method",
  "strings > bytes base64 method",
  "strings > bytes at 0",
  "strings > bytes at 4",
  "strings > bytes at out of range",

  // === strings: bytes escape/index errors ===
  "strings > reject \\U in bytes",
  "strings > reject bytes index",

  // === strings: type errors on string functions ===
  "strings > reject startsWith on int",
  "strings > reject startsWith with int arg",
  "strings > reject startsWith with bool arg",
  "strings > reject startsWith with null arg",
  "strings > reject size on int",
  "strings > reject size on bool",
  "strings > reject size on null",

  // === strings: comment parsing ===
  "strings > comment at end",

  // === comparisons: cross-type equality errors ===
  "comparisons > reject bool == null",
  "comparisons > reject false == null",
  "comparisons > reject double == null",
  "comparisons > reject int == null",
  "comparisons > reject bool == int",
  "comparisons > reject double == int eq",
  "comparisons > reject double != int",
  "comparisons > reject bool != null",

  // === comparisons: cross-type relational errors ===
  'comparisons > reject "a" < 1',
  'comparisons > reject 1 < "a"',
  "comparisons > reject true < 1",
  'comparisons > reject true < "a"',
  "comparisons > reject [] < []",
  "comparisons > reject {} < {}",
  "comparisons > reject double > string",
  "comparisons > reject double < string",

  // === comparisons: cross-type equality without dyn ===
  "comparisons > reject 1.0 == 1 (eq)",
  "comparisons > reject 1.0 != 1 (ne)",
  "comparisons > reject 1.0 == 1u (eq)",
  "comparisons > reject 1.0 != 1u (ne)",

  // === collections: type errors expected ===
  "collections > reject mixed type list",
  "collections > reject mixed int/string list",
  "collections > reject string index on list",
  "collections > reject negative index",
  "collections > reject out of bounds",
  "collections > reject far out of bounds",
  "collections > reject mixed type concat",
  "collections > reject int in string list",
  "collections > reject int in double list",
  "collections > reject bool in double list",
  "collections > reject int in string-keyed map",

  // === collections: maps return Map objects, not plain objects ===
  "collections > simple map",
  "collections > multi-property map",
  "collections > map with int keys",
  "collections > map with computed key",
  "collections > nested map",
  "collections > deeply nested map",
  "collections > map with array values",
  "collections > dyn allows mixed values",
  "collections > reject mixed value types",
  "collections > reject mixed key types",

  // === collections: map/field access errors ===
  "collections > bracket notation access",
  "collections > throw on missing field",

  // === collections: cross-type comparison returns false in CEL spec, test expects error ===
  "collections > reject map == list",
  "collections > reject int-key map == string-key map",

  // === collections: cross-type list equality ===
  "collections > reject list == list cross-type",

  // === collections: dynamic key access with binding types ===
  "collections > dynamic key access",

  // === collections: prototype pollution (not guarded) ===
  "collections > reject __proto__ access",
  "collections > reject __proto__ bracket",
  "collections > reject constructor access",
  "collections > reject toString access",

  // === functions: type errors expected ===
  "functions > reject type > type",
  "functions > reject type + type",
  "functions > reject int(inf) overflow",
  "functions > reject int(-inf) overflow",
  "functions > reject int(nan) overflow",
  "functions > reject int overflow string",
  "functions > reject int hex string",
  "functions > reject int sci notation",
  "functions > reject int float string",
  'functions > reject double("")',
  'functions > reject double("abc")',
  'functions > reject double(" 1")',
  "functions > reject double(true)",
  "functions > reject double(null)",
  "functions > reject double()",
  "functions > reject double(1,2)",
  'functions > reject bool("T")',
  'functions > reject bool("yes")',
  'functions > reject bool("")',
  "functions > reject bool(1)",
  "functions > reject bool(null)",
  "functions > reject bool([])",
  "functions > reject too-large timestamp",

  // === macros: error expected ===
  "macros > has mid-path missing throws",
  "macros > has() no args",
  "macros > has() two args",
  "macros > has() on identifier",
  "macros > has() on string literal",
  "macros > has() on array literal",
  "macros > has() on bool literal",
  "macros > has() on number literal",
  "macros > has() on bracket access",
  "macros > has() unknown var",
  "macros > all no args error",
  "macros > all one arg error",
  "macros > all on non-list",
  "macros > all on string",
  "macros > all non-receiver call",
  "macros > all must return bool",
  "macros > exists must return bool",
  "macros > exists no args error",
  "macros > exists non-receiver call",
  "macros > exists_one must return bool",
  "macros > exists_one no args error",
  "macros > exists_one non-receiver call",

  // === macros: map/filter on objects (not standard CEL) ===
  "macros > map on object keys",
  "macros > map no args error",
  "macros > map one arg error",
  "macros > map non-receiver call",
  "macros > map filter must be bool",
  "macros > filter map keys",
  "macros > filter must return bool",
  "macros > filter no args error",
  "macros > filter non-receiver call",

  // === macros: error propagation in quantifiers ===
  "macros > all invalid var in predicate",
  "macros > filter type error in predicate",
  "macros > exists throws when none match",
  "macros > all throws when none match",

  // === macros: iteration on map keys (binding type issues) ===
  "macros > all on map keys",
  "macros > exists on map keys",
  "macros > filter on map keys",

  // === logic: type errors expected ===
  'logic > reject !""',
  "logic > reject !1",
  "logic > reject ![]",
  "logic > reject !{}",
  "logic > reject string condition",
  "logic > reject int condition",
  "logic > reject null condition",

  // === logic: ternary associativity parse issue ===
  "logic > ternary right-associative",

  // === logic: error propagation ===
  "logic > true AND div/0 throws",
  "logic > false OR div/0 throws",

  // === logic: field/variable access errors ===
  "logic > index notation",
  "logic > mixed dot and bracket",
  "logic > unknown variable throws",
  "logic > missing subprop throws",

  // === logic: reserved word errors ===
  "logic > reject reserved: package",
  "logic > reject reserved: var",

  // === conversions: double("Inf") short form ===
  'conversions > double("Inf") from string',

  // === conversions: error expected ===
  'conversions > reject double("")',
  'conversions > reject double(" 1")',
  'conversions > reject double("abc")',
  "conversions > reject int(inf) overflow",
  "conversions > reject int(nan) overflow",
  "conversions > reject int('0x01')",
  'conversions > reject bool("T")',
  'conversions > reject bool("yes")',
  'conversions > reject bool("")',
  "conversions > reject bool(1)",

  // "conversions > bytes("hello") size",  -- now passing
  // "conversions > int addition from context",  -- now passing
  // "conversions > bigint addition from string",  -- now passing
]);
