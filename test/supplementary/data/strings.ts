import type { SupplementaryTest } from "../types.js";

const C = "strings";

export const stringTests: SupplementaryTest[] = [
  // === Basic string literals ===
  { name: "double quoted string", expr: '"hello"', expected: "hello", category: C },
  { name: "single quoted string", expr: "'hello'", expected: "hello", category: C },
  { name: "empty double quoted", expr: '""', expected: "", category: C },
  { name: "empty single quoted", expr: "''", expected: "", category: C },
  { name: "double quotes inside single", expr: `'"hello"'`, expected: '"hello"', category: C },
  { name: "single quotes inside double", expr: `"'hello'"`, expected: "'hello'", category: C },

  // === Triple quoted strings ===
  { name: "triple double quoted", expr: '"""hello"""', expected: "hello", category: C },
  { name: "triple single quoted", expr: "'''hello'''", expected: "hello", category: C },
  {
    name: "triple quoted with escaped newline",
    expr: '"""hello\\nworld"""',
    expected: "hello\nworld",
    category: C,
  },
  { name: "quotes in triple quoted", expr: '"""x""x"""', expected: 'x""x', category: C },

  // === Raw strings ===
  { name: "raw string double", expr: 'r"hello\\nworld"', expected: "hello\\nworld", category: C },
  { name: "raw string single", expr: "r'hello\\nworld'", expected: "hello\\nworld", category: C },
  { name: "raw string backslashes", expr: 'r"\\\\"', expected: "\\\\", category: C },
  {
    name: "raw string uppercase R",
    expr: 'R"hello\\nworld"',
    expected: "hello\\nworld",
    category: C,
  },

  // === Escape sequences ===
  { name: "escape double quote", expr: '"\\""', expected: '"', category: C },
  { name: "escape single quote", expr: "'\\''", expected: "'", category: C },
  { name: "escape backslash", expr: '"\\\\"', expected: "\\", category: C },
  { name: "escape newline", expr: '"\\n"', expected: "\n", category: C },
  { name: "escape return", expr: '"\\r"', expected: "\r", category: C },
  { name: "escape tab", expr: '"\\t"', expected: "\t", category: C },
  { name: "escape backspace", expr: '"\\b"', expected: "\b", category: C },
  { name: "escape form feed", expr: '"\\f"', expected: "\f", category: C },
  { name: "escape vertical tab", expr: '"\\v"', expected: "\v", category: C },
  { name: "unicode escape \\u0041", expr: '"\\u0041"', expected: "A", category: C },
  { name: "unicode escape \\u00FF", expr: '"\\u00FF"', expected: "\u00FF", category: C },
  { name: "hex escape \\x41", expr: '"\\x41"', expected: "A", category: C },
  { name: "hex escape \\xFF", expr: '"\\xFF"', expected: "\u00FF", category: C },
  { name: "extended unicode \\U00000041", expr: '"\\U00000041"', expected: "A", category: C },
  { name: "extended unicode emoji", expr: '"\\U0001F600"', expected: "\u{1F600}", category: C },

  // === Invalid escape/unicode ===
  { name: "reject invalid escape \\s", expr: '"\\s"', expectError: true, category: C },
  { name: "reject unterminated string", expr: '"unterminated', expectError: true, category: C },
  { name: "reject invalid unicode \\uZZZZ", expr: '"\\uZZZZ"', expectError: true, category: C },
  { name: "reject invalid \\U over max", expr: '"\\U00110000"', expectError: true, category: C },
  { name: "reject \\U surrogate", expr: '"\\U0000D800"', expectError: true, category: C },

  // === String operations ===
  {
    name: "string concat different quotes",
    expr: "\"hello\" + ' world'",
    expected: "hello world",
    category: C,
  },
  { name: "raw + escape concat", expr: 'r"\\n" + "\\n"', expected: "\\n\n", category: C },
  { name: "reject string + null", expr: "'this is ' + null", expectError: true, category: C },
  { name: "reject string + int", expr: "'this is ' + 0", expectError: true, category: C },
  { name: "reject string in string", expr: '"ell" in "hello"', expectError: true, category: C },

  // === String functions ===
  { name: "size empty string", expr: 'size("")', expected: 0n, category: C },
  { name: "size method empty", expr: '"".size()', expected: 0n, category: C },
  { name: "size abc", expr: 'size("abc")', expected: 3n, category: C },
  { name: "size method abc", expr: '"abc".size()', expected: 3n, category: C },
  { name: "size unicode emoji", expr: 'size("hello \u{1F604}")', expected: 7n, category: C },

  {
    name: "startsWith true",
    expr: '"hello world".startsWith("hello")',
    expected: true,
    category: C,
  },
  {
    name: "startsWith false",
    expr: '"hello world".startsWith("world")',
    expected: false,
    category: C,
  },
  { name: "startsWith empty prefix", expr: '"hello".startsWith("")', expected: true, category: C },
  {
    name: "startsWith same string",
    expr: '"hello".startsWith("hello")',
    expected: true,
    category: C,
  },
  {
    name: "startsWith longer prefix",
    expr: '"hi".startsWith("hello")',
    expected: false,
    category: C,
  },
  { name: "startsWith empty on empty", expr: '"".startsWith("")', expected: true, category: C },
  {
    name: "startsWith case sensitive",
    expr: '"Hello".startsWith("hello")',
    expected: false,
    category: C,
  },
  {
    name: "startsWith unicode",
    expr: '"\u{1F604} hello".startsWith("\u{1F604}")',
    expected: true,
    category: C,
  },

  { name: "endsWith true", expr: '"hello world".endsWith("world")', expected: true, category: C },
  { name: "endsWith false", expr: '"hello world".endsWith("hello")', expected: false, category: C },

  { name: "contains true", expr: '"hello world".contains("lo wo")', expected: true, category: C },
  { name: "contains false", expr: '"hello world".contains("xyz")', expected: false, category: C },

  { name: "matches regex", expr: '"hello".matches("h.*o")', expected: true, category: C },
  { name: "matches start anchor", expr: '"hello".matches("^h")', expected: true, category: C },
  { name: "matches exact", expr: '"hello".matches("^hello$")', expected: true, category: C },
  { name: "matches case fail", expr: '"hello".matches("H.*o")', expected: false, category: C },

  { name: "trim whitespace", expr: '"  hello  ".trim()', expected: "hello", category: C },
  { name: "trim newlines", expr: '"\\n\\rhello ".trim()', expected: "hello", category: C },

  { name: "lowerAscii", expr: '"HELLO".lowerAscii()', expected: "hello", category: C },
  {
    name: "lowerAscii emoji",
    expr: '"\u{1F915} HEllo".lowerAscii()',
    expected: "\u{1F915} hello",
    category: C,
  },

  { name: "upperAscii", expr: '"hello".upperAscii()', expected: "HELLO", category: C },
  {
    name: "upperAscii emoji",
    expr: '"\u{1F915} HEllo".upperAscii()',
    expected: "\u{1F915} HELLO",
    category: C,
  },

  { name: "split by comma", expr: '"a,b,c".split(",")', expected: ["a", "b", "c"], category: C },
  { name: "split no args error", expr: '"a,b,c".split()', expectError: true, category: C },
  { name: "split with limit 0", expr: '"a,b,c".split(",", 0)', expected: [], category: C },
  {
    name: "split with limit 2",
    expr: '"a,b,c".split(",", 2)',
    expected: ["a", "b,c"],
    category: C,
  },
  {
    name: "split with limit -1",
    expr: '"a,b,c".split(",", -1)',
    expected: ["a", "b", "c"],
    category: C,
  },
  {
    name: "split empty delimiter",
    expr: '"a,b,c".split("", -1)',
    expected: ["a", ",", "b", ",", "c"],
    category: C,
  },

  { name: "join list", expr: '["1", "2", "3"].join(", ")', expected: "1, 2, 3", category: C },
  { name: "join empty list", expr: '[].join(", ")', expected: "", category: C },

  // === Bytes literals ===
  { name: "bytes size", expr: 'size(b"hello")', expected: 5n, category: C },
  { name: "bytes string method", expr: 'b"hello".string()', expected: "hello", category: C },
  { name: "bytes hex method", expr: 'b"ABC".hex()', expected: "414243", category: C },
  { name: "bytes base64 method", expr: 'b"hello".base64()', expected: "aGVsbG8=", category: C },
  { name: "bytes at 0", expr: 'b"hello".at(0)', expected: 104n, category: C },
  { name: "bytes at 4", expr: 'b"hello".at(4)', expected: 111n, category: C },
  { name: "bytes at out of range", expr: 'b"hello".at(5)', expectError: true, category: C },
  { name: "bytes equality", expr: 'b"hello" == b"hello"', expected: true, category: C },
  { name: "bytes inequality", expr: 'b"hello" == b"world"', expected: false, category: C },
  { name: "reject \\U in bytes", expr: 'b"\\U00000041"', expectError: true, category: C },
  { name: "reject bytes index", expr: 'b"hello"[0]', expectError: true, category: C },

  // === String conversions ===
  { name: "string identity", expr: 'string("something")', expected: "something", category: C },
  { name: "string from bool false", expr: "string(false)", expected: "false", category: C },
  { name: "string from bool true", expr: "string(true)", expected: "true", category: C },
  { name: "string from int", expr: "string(1)", expected: "1", category: C },
  { name: "string from double", expr: "string(1.0)", expected: "1", category: C },

  // === Error cases for string functions ===
  {
    name: "reject startsWith on int",
    expr: '(123).startsWith("1")',
    expectError: true,
    category: C,
  },
  {
    name: "reject startsWith with int arg",
    expr: '"hello".startsWith(123)',
    expectError: true,
    category: C,
  },
  {
    name: "reject startsWith with bool arg",
    expr: '"hello".startsWith(true)',
    expectError: true,
    category: C,
  },
  {
    name: "reject startsWith with null arg",
    expr: '"hello".startsWith(null)',
    expectError: true,
    category: C,
  },
  { name: "reject size on int", expr: "size(123)", expectError: true, category: C },
  { name: "reject size on bool", expr: "size(true)", expectError: true, category: C },
  { name: "reject size on null", expr: "size(null)", expectError: true, category: C },

  // === Comments in expressions ===
  { name: "comment at end", expr: "1 + 2 // comment", expected: 3n, category: C },
  { name: "comment at start", expr: "// comment\n1 + 2", expected: 3n, category: C },
  { name: "comment in middle", expr: "1 + // comment\n2", expected: 3n, category: C },
  {
    name: "string not treated as comment",
    expr: '"This // is not a comment"',
    expected: "This // is not a comment",
    category: C,
  },

  // === Null bytes in strings ===
  {
    name: "startsWith with null byte",
    expr: '"hello\\x00world".startsWith("hello")',
    expected: true,
    category: C,
  },
];
