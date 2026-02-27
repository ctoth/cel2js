import type { SupplementaryTest } from "../types.js";

const C = "collections";

export const collectionTests: SupplementaryTest[] = [
  // === List literals ===
  { name: "empty list", expr: "[]", expected: [], category: C },
  { name: "single element list", expr: "[1]", expected: [1n], category: C },
  { name: "multi element list", expr: "[1, 2, 3]", expected: [1n, 2n, 3n], category: C },
  { name: "nested list", expr: "[[1]]", expected: [[1n]], category: C },
  { name: "empty + non-empty nested", expr: "[[], [1]]", expected: [[], [1n]], category: C },
  {
    name: "multi nested lists",
    expr: "[[1], [2], [3]]",
    expected: [[1n], [2n], [3n]],
    category: C,
  },
  { name: "reject mixed type list", expr: "[1, 1.0]", expectError: true, category: C },
  {
    name: "reject mixed int/string list",
    expr: '[1, "hello", true, null]',
    expectError: true,
    category: C,
  },
  {
    name: "dyn allows mixed list",
    expr: '[dyn(1), dyn("hello"), dyn(true), dyn(null)]',
    expected: [1n, "hello", true, null],
    category: C,
  },

  // === List index access ===
  { name: "list index 0", expr: "[7, 8, 9][0]", expected: 7n, category: C },
  { name: "list index 1", expr: "[1, 5678, 3][1]", expected: 5678n, category: C },
  { name: "list index last", expr: "[7, 8, 9][2]", expected: 9n, category: C },
  { name: "list singleton", expr: '["foo"][0]', expected: "foo", category: C },
  { name: "list middle index", expr: "[0, 1, 1, 2, 3, 5, 8, 13][4]", expected: 3n, category: C },
  { name: "reject string index on list", expr: '[1, 2, 3]["0"]', expectError: true, category: C },
  { name: "reject negative index", expr: "[1, 2, 3][-1]", expectError: true, category: C },
  { name: "reject out of bounds", expr: "[1][1]", expectError: true, category: C },
  { name: "reject far out of bounds", expr: "[1][5]", expectError: true, category: C },

  // === List concatenation ===
  { name: "list concat", expr: "[1, 2] + [3, 4]", expected: [1n, 2n, 3n, 4n], category: C },
  { name: "list concat same element", expr: "[2] + [2]", expected: [2n, 2n], category: C },
  { name: "empty + empty", expr: "[] + []", expected: [], category: C },
  { name: "empty + non-empty", expr: "[] + [1, 2]", expected: [1n, 2n], category: C },
  { name: "non-empty + empty", expr: "[1, 2] + []", expected: [1n, 2n], category: C },
  { name: "reject mixed type concat", expr: "[1] + [1.0]", expectError: true, category: C },

  // === in operator on lists ===
  { name: "int in list true", expr: "1 in [1, 2, 3]", expected: true, category: C },
  { name: "int in list false", expr: "4 in [1, 2, 3]", expected: false, category: C },
  { name: "string in list", expr: '"hello" in ["hello", "world"]', expected: true, category: C },
  { name: "in empty list", expr: "1 in []", expected: false, category: C },
  { name: "complex left in", expr: "(1 + 1) in [1, 2, 3]", expected: true, category: C },
  { name: "complex right in", expr: "2 in ([1] + [2, 3])", expected: true, category: C },
  { name: "nested list in", expr: "[1, 2] in [[1, 2], [3, 4]]", expected: true, category: C },
  { name: "nested list in false", expr: "[1] in [[1, 2], [3, 4]]", expected: false, category: C },
  { name: "null in list", expr: "null in [null]", expected: true, category: C },
  { name: "bool in list", expr: "true in [true, false]", expected: true, category: C },
  {
    name: "reject int in string list",
    expr: '1 in ["pro", "enterprise"]',
    expectError: true,
    category: C,
  },
  { name: "reject int in double list", expr: "1 in [1.0, 1.2]", expectError: true, category: C },
  {
    name: "reject bool in double list",
    expr: "true in [1.0, 1.2]",
    expectError: true,
    category: C,
  },
  {
    name: "dyn in list true",
    expr: 'dyn("apple") in ["apple", "banana"]',
    expected: true,
    category: C,
    bindings: {},
  },
  {
    name: "dyn int not in string list",
    expr: 'dyn(1) in ["pro", "enterprise"]',
    expected: false,
    category: C,
  },
  { name: "dyn double in int list", expr: "dyn(2.0) in [1, 2, 3]", expected: true, category: C },
  {
    name: "timestamp in list",
    expr: 'timestamp("2024-01-01T00:00:00Z") in [timestamp("2024-01-01T00:00:00Z")]',
    expected: true,
    category: C,
  },

  // === in operator on maps ===
  {
    name: "key in map true",
    expr: '"name" in {"name": "John", "age": "30"}',
    expected: true,
    category: C,
  },
  { name: "key in map false", expr: '"address" in {"name": "John"}', expected: false, category: C },
  { name: "key in empty map", expr: '"key" in {}', expected: false, category: C },
  { name: "int key in map", expr: '1 in {1: "one", 2: "two"}', expected: true, category: C },
  {
    name: "reject int in string-keyed map",
    expr: '1 in {"a": 1, "b": 2}',
    expectError: true,
    category: C,
  },

  // === Map literals ===
  { name: "empty map", expr: "{}", expected: {}, category: C },
  { name: "simple map", expr: '{"key": "value"}', expected: { key: "value" }, category: C },
  {
    name: "multi-property map",
    expr: '{"first": "John", "last": "Doe"}',
    expected: { first: "John", last: "Doe" },
    category: C,
  },
  {
    name: "map with int keys",
    expr: '{1: "one", 2: "two"}',
    expected: { 1: "one", 2: "two" },
    category: C,
  },
  {
    name: "map with computed key",
    expr: '{("key" + "1"): "value1"}',
    expected: { key1: "value1" },
    category: C,
  },
  {
    name: "nested map",
    expr: '{"user": {"first": "John", "last": "Doe"}}',
    expected: { user: { first: "John", last: "Doe" } },
    category: C,
  },
  {
    name: "deeply nested map",
    expr: '{"a": {"b": {"c": "deep"}}}',
    expected: { a: { b: { c: "deep" } } },
    category: C,
  },
  {
    name: "map with array values",
    expr: '{"items": [1, 2, 3]}',
    expected: { items: [1n, 2n, 3n] },
    category: C,
  },
  {
    name: "dyn allows mixed values",
    expr: '{"name": dyn("John"), "age": dyn(30), "active": dyn(true)}',
    expected: { name: "John", age: 30n, active: true },
    category: C,
  },
  {
    name: "reject mixed value types",
    expr: '{"name": "John", "age": 30, "active": true}',
    expectError: true,
    category: C,
  },
  {
    name: "reject mixed key types",
    expr: '{"name": "John", 1: "duplicate"}',
    expectError: true,
    category: C,
  },

  // === Map equality ===
  {
    name: "map == map true",
    expr: '{"foo": "bar"} == {"foo": "bar"}',
    expected: true,
    category: C,
  },
  {
    name: "map == map false",
    expr: '{"foo": "bar"} == {"foo": "hello"}',
    expected: false,
    category: C,
  },
  {
    name: "map != map false",
    expr: '{"foo": "bar"} != {"foo": "bar"}',
    expected: false,
    category: C,
  },
  {
    name: "map != map true",
    expr: '{"foo": "bar"} != {"foo": "hello"}',
    expected: true,
    category: C,
  },
  {
    name: "reject map == list",
    expr: '{"foo": "bar"} == ["foo", "bar"]',
    expectError: true,
    category: C,
  },
  {
    name: "reject int-key map == string-key map",
    expr: '{1: "foo"} == {"foo": "bar"}',
    expectError: true,
    category: C,
  },

  // === Map property access ===
  {
    name: "dot notation access",
    expr: "obj.name",
    expected: "John",
    bindings: { obj: { name: "John" } },
    category: C,
  },
  {
    name: "bracket notation access",
    expr: 'obj["name"]',
    expected: "John",
    bindings: { obj: { name: "John" } },
    category: C,
  },
  {
    name: "nested property access",
    expr: "user.profile.name",
    expected: "Alice",
    bindings: { user: { profile: { name: "Alice" } } },
    category: C,
  },
  {
    name: "map in list dot access",
    expr: '[{"name": "John"}, {"name": "Jane"}][0].name',
    expected: "John",
    category: C,
  },
  { name: "throw on missing field", expr: '{"foo": "bar"}.hello', expectError: true, category: C },

  // === List equality ===
  { name: "reject list == list cross-type", expr: "[1] == [1.0]", expectError: true, category: C },

  // === Size function on collections ===
  { name: "size empty list", expr: "size([])", expected: 0n, category: C },
  { name: "size list 1", expr: "size([1])", expected: 1n, category: C },
  { name: "size list 3", expr: "size([1, 2, 3])", expected: 3n, category: C },
  { name: "size empty map", expr: "size({})", expected: 0n, category: C },
  { name: "size map 1", expr: 'size({"a": 1})', expected: 1n, category: C },
  { name: "size map 3", expr: 'size({"a": 1, "b": 2, "c": 3})', expected: 3n, category: C },

  // === Dynamic property access ===
  {
    name: "dynamic key access",
    expr: "obj[key]",
    expected: "bar",
    bindings: { obj: { foo: "bar" }, key: "foo" },
    category: C,
  },
  {
    name: "variable index on list",
    expr: "items[index]",
    expected: "b",
    bindings: { items: ["a", "b", "c"], index: 1 },
    category: C,
  },

  // === Prototype pollution hardening ===
  {
    name: "reject __proto__ access",
    expr: "data.__proto__",
    expectError: true,
    bindings: { data: {} },
    category: C,
  },
  {
    name: "reject __proto__ bracket",
    expr: 'data["__proto__"]',
    expectError: true,
    bindings: { data: {} },
    category: C,
  },
  {
    name: "reject constructor access",
    expr: "data.constructor",
    expectError: true,
    bindings: { data: {} },
    category: C,
  },
  {
    name: "reject toString access",
    expr: "data.toString",
    expectError: true,
    bindings: { data: {} },
    category: C,
  },
];
