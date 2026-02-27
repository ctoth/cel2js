import type { SupplementaryTest } from "../types.js";

const C = "arithmetic";

export const arithmeticTests: SupplementaryTest[] = [
  // === Addition and subtraction ===
  { name: "int addition", expr: "1 + 1", expected: 2n, category: C },
  { name: "int subtraction", expr: "1 - 1", expected: 0n, category: C },
  { name: "multi-term addition", expr: "1 + 1 + 1", expected: 3n, category: C },
  { name: "mixed addition/subtraction", expr: "1 + 1 - 1", expected: 1n, category: C },
  { name: "float addition", expr: "0.333 + 0.333", expected: 0.666, category: C },
  { name: "string concatenation", expr: '"a" + "b"', expected: "ab", category: C },
  { name: "unary minus", expr: "-5", expected: -5n, category: C },
  { name: "unary minus with group", expr: "-(1 + 2)", expected: -3n, category: C },
  { name: "complex arithmetic", expr: "10 - 3 + 2", expected: 9n, category: C },

  // === Multiplication and division ===
  { name: "int multiplication", expr: "2 * 3", expected: 6n, category: C },
  { name: "int division", expr: "6 / 2", expected: 3n, category: C },
  { name: "int modulo", expr: "7 % 3", expected: 1n, category: C },
  { name: "chained multiplication", expr: "2 * 3 * 4", expected: 24n, category: C },
  { name: "operator precedence mul/add", expr: "2 + 3 * 4", expected: 14n, category: C },
  { name: "parentheses override precedence", expr: "(2 + 3) * 4", expected: 20n, category: C },
  { name: "float multiplication", expr: "2.5 * 2.0", expected: 5, category: C },
  { name: "float division", expr: "5.5 / 2.0", expected: 2.75, category: C },

  // === Cross-type arithmetic errors ===
  { name: "reject int*double", expr: "2.5 * 2", expectError: true, category: C },
  { name: "reject double%double", expr: "5.5 % 2.0", expectError: true, category: C },
  { name: "reject int%double", expr: "2 % 2.0", expectError: true, category: C },
  { name: "reject double+int", expr: "1.0 + 1", expectError: true, category: C },
  { name: "reject double-uint", expr: "1.0 - 1u", expectError: true, category: C },
  { name: "reject double*int", expr: "1.0 * 1", expectError: true, category: C },
  { name: "reject double/uint", expr: "1.0 / 1u", expectError: true, category: C },

  // === Integer literals ===
  { name: "decimal integer 42", expr: "42", expected: 42n, category: C },
  { name: "decimal integer 0", expr: "0", expected: 0n, category: C },
  { name: "large decimal integer", expr: "123456", expected: 123456n, category: C },
  { name: "negative decimal -42", expr: "-42", expected: -42n, category: C },
  { name: "negative decimal -1", expr: "-1", expected: -1n, category: C },

  // === Hex literals ===
  { name: "hex 0x0", expr: "0x0", expected: 0n, category: C },
  { name: "hex 0xa", expr: "0xa", expected: 10n, category: C },
  { name: "hex 0xff", expr: "0xff", expected: 255n, category: C },
  { name: "hex 0x100", expr: "0x100", expected: 256n, category: C },
  { name: "hex 0xdead", expr: "0xdead", expected: 57005n, category: C },
  { name: "hex 0xbeef", expr: "0xbeef", expected: 48879n, category: C },
  { name: "hex uppercase X", expr: "0XFF", expected: 255n, category: C },
  { name: "hex mixed case", expr: "0xDead", expected: 57005n, category: C },
  { name: "negative hex", expr: "-0xff", expected: -255n, category: C },
  { name: "hex == decimal", expr: "0x10 == 16", expected: true, category: C },
  { name: "hex != decimal", expr: "0xff != 254", expected: true, category: C },
  { name: "large hex 0x7fffffff", expr: "0x7fffffff", expected: 2147483647n, category: C },
  { name: "large hex 0xffffffff", expr: "0xffffffff", expected: 4294967295n, category: C },
  { name: "hex in complex expr", expr: "(0x10 + 0x20) * 2", expected: 96n, category: C },
  { name: "hex in ternary", expr: "0xff > 100 ? 0xa : 0xb", expected: 10n, category: C },
  { name: "hex in list index", expr: "[0x1, 0x2, 0x3][1]", expected: 2n, category: C },
  { name: "hex without space", expr: "0xff+1", expected: 256n, category: C },
  { name: "hex mul without space", expr: "0x10*0x2", expected: 32n, category: C },
  { name: "hex arithmetic add", expr: "0x10 + 0x20", expected: 48n, category: C },
  { name: "hex arithmetic sub", expr: "0xff - 0xf", expected: 240n, category: C },
  { name: "hex arithmetic mul", expr: "0xa * 0xb", expected: 110n, category: C },
  { name: "hex arithmetic div", expr: "0x64 / 0x4", expected: 25n, category: C },
  { name: "hex arithmetic mod", expr: "0x17 % 0x5", expected: 3n, category: C },

  // === Invalid hex ===
  { name: "reject empty hex 0x", expr: "0x", expectError: true, category: C },
  { name: "reject empty hex 0X", expr: "0X", expectError: true, category: C },
  { name: "reject invalid hex 0xg", expr: "0xg", expectError: true, category: C },

  // === Integer overflow ===
  { name: "int64 max", expr: "9223372036854775807", expected: 9223372036854775807n, category: C },
  { name: "int64 min", expr: "-9223372036854775808", expected: -9223372036854775808n, category: C },
  {
    name: "int64 max via mul",
    expr: "4611686018427387903 * 2",
    expected: 9223372036854775806n,
    category: C,
  },
  {
    name: "int64 min via mul",
    expr: "-4611686018427387904 * 2",
    expected: -9223372036854775808n,
    category: C,
  },
  { name: "int overflow max+1", expr: "9223372036854775807 + 1", expectError: true, category: C },
  { name: "int overflow min-1", expr: "-9223372036854775808 - 1", expectError: true, category: C },
  { name: "int overflow mul", expr: "4611686018427387905 * 2", expectError: true, category: C },

  // === Double literals ===
  { name: "double 0.0", expr: "0.0", expected: 0, category: C },
  { name: "double 42.5", expr: "42.5", expected: 42.5, category: C },
  { name: "double 123456.789", expr: "123456.789", expected: 123456.789, category: C },
  { name: "negative double -0.5", expr: "-0.5", expected: -0.5, category: C },
  { name: "small double", expr: "0.000001", expected: 0.000001, category: C },
  { name: "scientific 1e1", expr: "1e1", expected: 10, category: C },
  { name: "scientific 1.1e1", expr: "1.1e1", expected: 11, category: C },
  { name: "scientific 1e-2", expr: "1e-2", expected: 0.01, category: C },
  { name: "scientific 1E+2", expr: "1E+2", expected: 100, category: C },

  // === Double arithmetic ===
  { name: "double add", expr: "1.5 + 2.25", expected: 3.75, category: C },
  { name: "double subtract", expr: "1.5 - 0.75", expected: 0.75, category: C },
  { name: "double multiply", expr: "1.5 * 2.25", expected: 3.375, category: C },
  { name: "double divide", expr: "7.5 / 2.5", expected: 3, category: C },

  // === Double division by zero ===
  {
    name: "double 1.0/0.0 = +Inf",
    expr: "1.0 / 0.0",
    expected: Number.POSITIVE_INFINITY,
    category: C,
  },
  {
    name: "double -1.0/0.0 = -Inf",
    expr: "-1.0 / 0.0",
    expected: Number.NEGATIVE_INFINITY,
    category: C,
  },
  { name: "double 0.0/0.0 = NaN", expr: "0.0 / 0.0", expected: Number.NaN, category: C },

  // === Unsigned integer ===
  { name: "uint addition", expr: "10u + 20u", expected: 30n, category: C },
  { name: "uint subtraction", expr: "100u - 50u", expected: 50n, category: C },
  { name: "uint hex add", expr: "0xau + 0xbu", expected: 21n, category: C },
  { name: "uint hex mul", expr: "0xffu * 2u", expected: 510n, category: C },
  {
    name: "uint64 max",
    expr: "18446744073709551615u",
    expected: 18446744073709551615n,
    category: C,
  },
  { name: "uint overflow 0u-1u", expr: "0u - 1u", expectError: true, category: C },
  { name: "uint negate -1u", expr: "-1u", expectError: true, category: C },
  {
    name: "uint overflow max+1",
    expr: "18446744073709551615u + 1u",
    expectError: true,
    category: C,
  },
  { name: "uint overflow mul", expr: "9223372036854775808u * 2u", expectError: true, category: C },
  { name: "reject float uint 0.1u", expr: "0.1u", expectError: true, category: C },
  { name: "reject float uint 1.5u", expr: "1.5u", expectError: true, category: C },

  // === Parentheses and precedence ===
  { name: "order of operations", expr: "1 + 2 * 3 + 1", expected: 8n, category: C },
  { name: "parentheses priority", expr: "(1 + 2) * 3 + 1", expected: 10n, category: C },
  { name: "multiple groups", expr: "(1 + 2) * (3 + 1)", expected: 12n, category: C },
  { name: "nested parentheses", expr: "((1 + 2) * 3) + (4 / 2)", expected: 11n, category: C },
  {
    name: "deep nested parentheses",
    expr: "(1 + (2 * (3 + 4))) - (5 - 3)",
    expected: 13n,
    category: C,
  },
  { name: "mul before add", expr: "2 + 3 * 4", expected: 14n, category: C },
  { name: "div before sub", expr: "10 - 8 / 2", expected: 6n, category: C },

  // === Unary operators ===
  { name: "double negation", expr: "-(-5)", expected: 5n, category: C },
  { name: "double minus prefix", expr: "--5", expected: 5n, category: C },
  { name: "unary minus float", expr: "-3.14", expected: -3.14, category: C },
  { name: "reject unary plus", expr: "+2", expectError: true, category: C },
  { name: "reject unary plus group", expr: "+(1 + 2)", expectError: true, category: C },
  { name: "reject double plus", expr: "1 ++ 2", expectError: true, category: C },

  // === Integer division by zero ===
  { name: "int division by zero throws", expr: "1 / 0", expectError: true, category: C },
];
