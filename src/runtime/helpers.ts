import type { CelValue } from "./types.js";
import { CelType, CelUint, isCelType, isCelUint } from "./types.js";

// ── Constants ──────────────────────────────────────────────────────────────

const INT64_MIN = -(2n ** 63n);
const INT64_MAX = 2n ** 63n - 1n;
const UINT64_MAX = 2n ** 64n - 1n;

// ── Internal helpers ───────────────────────────────────────────────────────

/** Check if a bigint is within int64 range */
function inInt64Range(v: bigint): boolean {
  return v >= INT64_MIN && v <= INT64_MAX;
}

/** Check if a bigint is within uint64 range */
function inUint64Range(v: bigint): boolean {
  return v >= 0n && v <= UINT64_MAX;
}

/** Check if a value is a plain bigint (int, not CelUint) */
function isInt(v: unknown): v is bigint {
  return typeof v === "bigint";
}

/** Check if a value is a double (JS number) */
function isDouble(v: unknown): v is number {
  return typeof v === "number";
}

/** Check if a value is a string */
function isStr(v: unknown): v is string {
  return typeof v === "string";
}

/** Check if a value is a boolean */
function isBool(v: unknown): v is boolean {
  return typeof v === "boolean";
}

/** Check if a value is a Uint8Array (bytes) */
function isBytes(v: unknown): v is Uint8Array {
  return v instanceof Uint8Array;
}

/** Check if a value is a list (Array) */
function isList(v: unknown): v is CelValue[] {
  return Array.isArray(v);
}

/** Check if a value is a map (Map) */
function isMap(v: unknown): v is Map<CelValue, CelValue> {
  return v instanceof Map;
}

/** Check if a value is a struct (plain object with __type marker) */
function isStruct(v: unknown): v is Record<string, CelValue> & { __type: string } {
  return (
    v !== null &&
    typeof v === "object" &&
    !Array.isArray(v) &&
    !(v instanceof Map) &&
    !(v instanceof Uint8Array) &&
    !(v instanceof Date) &&
    "__type" in v &&
    typeof (v as Record<string, unknown>).__type === "string"
  );
}

/** Check if a value is numeric (int, uint, or double) */
function isNumeric(v: unknown): boolean {
  return isInt(v) || isCelUint(v) || isDouble(v);
}

/** Convert any numeric CEL value to a JS number for comparison */
function toNumber(v: bigint | CelUint | number): number {
  if (isInt(v)) return Number(v);
  if (isCelUint(v)) return Number(v.value);
  return v;
}

// ── Arithmetic Helpers ─────────────────────────────────────────────────────

export function celAdd(a: unknown, b: unknown): CelValue | undefined {
  // int + int
  if (isInt(a) && isInt(b)) {
    const r = a + b;
    return inInt64Range(r) ? r : undefined;
  }
  // uint + uint
  if (isCelUint(a) && isCelUint(b)) {
    const r = a.value + b.value;
    return inUint64Range(r) ? new CelUint(r) : undefined;
  }
  // double + double
  if (isDouble(a) && isDouble(b)) return a + b;
  // string + string
  if (isStr(a) && isStr(b)) return a + b;
  // list + list
  if (isList(a) && isList(b)) return [...a, ...b];
  // bytes + bytes
  if (isBytes(a) && isBytes(b)) {
    const r = new Uint8Array(a.length + b.length);
    r.set(a, 0);
    r.set(b, a.length);
    return r;
  }
  return undefined;
}

export function celSub(a: unknown, b: unknown): CelValue | undefined {
  if (isInt(a) && isInt(b)) {
    const r = a - b;
    return inInt64Range(r) ? r : undefined;
  }
  if (isCelUint(a) && isCelUint(b)) {
    const r = a.value - b.value;
    return inUint64Range(r) ? new CelUint(r) : undefined;
  }
  if (isDouble(a) && isDouble(b)) return a - b;
  return undefined;
}

export function celMul(a: unknown, b: unknown): CelValue | undefined {
  if (isInt(a) && isInt(b)) {
    const r = a * b;
    return inInt64Range(r) ? r : undefined;
  }
  if (isCelUint(a) && isCelUint(b)) {
    const r = a.value * b.value;
    return inUint64Range(r) ? new CelUint(r) : undefined;
  }
  if (isDouble(a) && isDouble(b)) return a * b;
  return undefined;
}

export function celDiv(a: unknown, b: unknown): CelValue | undefined {
  if (isInt(a) && isInt(b)) {
    if (b === 0n) return undefined;
    // Handle int64 overflow: -2^63 / -1 overflows
    if (a === INT64_MIN && b === -1n) return undefined;
    // BigInt division truncates toward zero (which is what CEL wants)
    return a / b;
  }
  if (isCelUint(a) && isCelUint(b)) {
    if (b.value === 0n) return undefined;
    return new CelUint(a.value / b.value);
  }
  if (isDouble(a) && isDouble(b)) {
    // IEEE 754: double division by zero yields Infinity/-Infinity/NaN, not an error
    return a / b;
  }
  return undefined;
}

export function celMod(a: unknown, b: unknown): CelValue | undefined {
  if (isInt(a) && isInt(b)) {
    if (b === 0n) return undefined;
    return a % b;
  }
  if (isCelUint(a) && isCelUint(b)) {
    if (b.value === 0n) return undefined;
    return new CelUint(a.value % b.value);
  }
  return undefined;
}

export function celNeg(a: unknown): CelValue | undefined {
  if (isInt(a)) {
    const r = -a;
    return inInt64Range(r) ? r : undefined;
  }
  if (isDouble(a)) return -a;
  // uint negation is not allowed in CEL
  return undefined;
}

// ── Comparison Helpers ─────────────────────────────────────────────────────

/**
 * Deep equality for CEL values. Supports cross-numeric comparison.
 */
export function celEq(a: unknown, b: unknown): boolean | undefined {
  // Propagate errors (undefined is our error sentinel)
  if (a === undefined || b === undefined) return undefined;

  // null checks
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;

  // bool
  if (isBool(a) && isBool(b)) return a === b;

  // Cross-numeric equality
  if (isNumeric(a) && isNumeric(b)) {
    return numericCompare(a as bigint | CelUint | number, b as bigint | CelUint | number) === 0;
  }

  // string
  if (isStr(a) && isStr(b)) return a === b;

  // bytes
  if (isBytes(a) && isBytes(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  // list
  if (isList(a) && isList(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      const eq = celEq(a[i], b[i]);
      if (eq !== true) return eq; // propagate false or undefined
    }
    return true;
  }

  // map
  if (isMap(a) && isMap(b)) {
    if (a.size !== b.size) return false;
    for (const [k, v] of a) {
      const bv = mapGet(b, k);
      if (bv === undefined && !mapHas(b, k)) return false;
      const eq = celEq(v, bv);
      if (eq !== true) return eq;
    }
    return true;
  }

  // CelType
  if (isCelType(a) && isCelType(b)) return a.name === b.name;

  // Struct (proto message) comparison — plain objects with __type marker
  if (isStruct(a) && isStruct(b)) {
    if (a.__type !== b.__type) return false;
    // Compare all fields (excluding __type marker)
    const aKeys = Object.keys(a).filter((k) => k !== "__type");
    const bKeys = Object.keys(b).filter((k) => k !== "__type");
    const allKeys = new Set([...aKeys, ...bKeys]);
    for (const key of allKeys) {
      const av = key in a ? a[key] : null;
      const bv = key in b ? b[key] : null;
      const eq = celEq(av, bv);
      if (eq !== true) return eq;
    }
    return true;
  }

  // Date (timestamp) equality
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }

  // CelDuration equality
  if (isCelDuration(a) && isCelDuration(b)) {
    return a.seconds === b.seconds && a.nanos === b.nanos;
  }

  // CEL _==_ is defined for all types: incompatible types return false, not error
  return false;
}

export function celNe(a: unknown, b: unknown): boolean | undefined {
  const eq = celEq(a, b);
  if (eq === undefined) return undefined;
  return !eq;
}

/** Compare two numeric values. Returns -1, 0, 1, or NaN for incomparable. */
function numericCompare(a: bigint | CelUint | number, b: bigint | CelUint | number): number {
  // If both are exact integers (int or uint), compare via bigint for precision
  const aIsExactInt = isInt(a) || isCelUint(a);
  const bIsExactInt = isInt(b) || isCelUint(b);
  if (aIsExactInt && bIsExactInt) {
    const ai = isInt(a) ? a : (a as CelUint).value;
    const bi = isInt(b) ? b : (b as CelUint).value;
    return ai < bi ? -1 : ai > bi ? 1 : 0;
  }
  // At least one is double, compare as numbers
  const an = toNumber(a);
  const bn = toNumber(b);
  if (Number.isNaN(an) || Number.isNaN(bn)) return Number.NaN;
  return an < bn ? -1 : an > bn ? 1 : 0;
}

export function celLt(a: unknown, b: unknown): boolean | undefined {
  if (isNumeric(a) && isNumeric(b)) {
    const c = numericCompare(a as bigint | CelUint | number, b as bigint | CelUint | number);
    return Number.isNaN(c) ? false : c < 0;
  }
  if (isStr(a) && isStr(b)) return a < b;
  if (isBool(a) && isBool(b)) return !a && b; // false < true
  if (isBytes(a) && isBytes(b)) return bytesCompare(a, b) < 0;
  return undefined;
}

export function celLe(a: unknown, b: unknown): boolean | undefined {
  if (isNumeric(a) && isNumeric(b)) {
    const c = numericCompare(a as bigint | CelUint | number, b as bigint | CelUint | number);
    return Number.isNaN(c) ? false : c <= 0;
  }
  if (isStr(a) && isStr(b)) return a <= b;
  if (isBool(a) && isBool(b)) return !a || b; // false <= true, false <= false, true <= true
  if (isBytes(a) && isBytes(b)) return bytesCompare(a, b) <= 0;
  return undefined;
}

export function celGt(a: unknown, b: unknown): boolean | undefined {
  if (isNumeric(a) && isNumeric(b)) {
    const c = numericCompare(a as bigint | CelUint | number, b as bigint | CelUint | number);
    return Number.isNaN(c) ? false : c > 0;
  }
  if (isStr(a) && isStr(b)) return a > b;
  if (isBool(a) && isBool(b)) return a && !b;
  if (isBytes(a) && isBytes(b)) return bytesCompare(a, b) > 0;
  return undefined;
}

export function celGe(a: unknown, b: unknown): boolean | undefined {
  if (isNumeric(a) && isNumeric(b)) {
    const c = numericCompare(a as bigint | CelUint | number, b as bigint | CelUint | number);
    return Number.isNaN(c) ? false : c >= 0;
  }
  if (isStr(a) && isStr(b)) return a >= b;
  if (isBool(a) && isBool(b)) return a || !b;
  if (isBytes(a) && isBytes(b)) return bytesCompare(a, b) >= 0;
  return undefined;
}

/** Lexicographic comparison for bytes */
function bytesCompare(a: Uint8Array, b: Uint8Array): number {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const av = a[i];
    const bv = b[i];
    if (av !== undefined && bv !== undefined && av !== bv) return av < bv ? -1 : 1;
  }
  return a.length - b.length;
}

// ── Map lookup helpers (deep key matching) ─────────────────────────────────

/** Get a value from a Map using deep key equality */
function mapGet(m: Map<CelValue, CelValue>, key: CelValue): CelValue | undefined {
  // Fast path: try direct lookup first
  if (m.has(key)) return m.get(key);
  // Slow path: deep comparison for complex keys
  for (const [k, v] of m) {
    if (celEq(k, key) === true) return v;
  }
  return undefined;
}

/** Check if a Map contains a key using deep equality */
function mapHas(m: Map<CelValue, CelValue>, key: CelValue): boolean {
  if (m.has(key)) return true;
  for (const [k] of m) {
    if (celEq(k, key) === true) return true;
  }
  return false;
}

// ── Collection Helpers ─────────────────────────────────────────────────────

export function celIn(elem: unknown, collection: unknown): boolean | undefined {
  if (isList(collection)) {
    for (const item of collection) {
      const eq = celEq(elem, item);
      if (eq === true) return true;
    }
    return false;
  }
  if (isMap(collection)) {
    return mapHas(collection, elem as CelValue);
  }
  return undefined;
}

export function celSize(v: unknown): bigint | undefined {
  if (isStr(v)) {
    // Unicode codepoint count using the iterator
    let count = 0n;
    for (const _ of v) {
      count++;
    }
    return count;
  }
  if (isList(v)) return BigInt(v.length);
  if (isMap(v)) return BigInt(v.size);
  if (isBytes(v)) return BigInt(v.length);
  return undefined;
}

export function celIndex(obj: unknown, key: unknown): CelValue | undefined {
  if (isList(obj)) {
    // List index: accept int, uint, or double (if double is a whole number)
    let idx: number;
    if (isInt(key)) {
      idx = Number(key);
    } else if (isCelUint(key)) {
      idx = Number(key.value);
    } else if (isDouble(key)) {
      // Only allow whole-number doubles as list indices
      if (!Number.isFinite(key) || key !== Math.trunc(key)) return undefined;
      idx = key;
    } else {
      return undefined;
    }
    if (idx < 0 || idx >= obj.length) return undefined;
    return obj[idx];
  }
  if (isMap(obj)) {
    return mapGet(obj, key as CelValue);
  }
  return undefined;
}

// ── Select Helper (field access on maps and objects) ──────────────────────

export function celSelect(obj: unknown, field: string): CelValue | undefined {
  if (obj === null || obj === undefined) return undefined;
  if (isMap(obj)) {
    // CEL: map.field is equivalent to map["field"]
    return mapGet(obj, field) as CelValue | undefined;
  }
  if (typeof obj === "object") {
    return (obj as Record<string, CelValue>)[field];
  }
  return undefined;
}

// ── String Helpers ─────────────────────────────────────────────────────────

export function celContains(s: unknown, sub: unknown): boolean | undefined {
  if (isStr(s) && isStr(sub)) return s.includes(sub);
  return undefined;
}

export function celStartsWith(s: unknown, prefix: unknown): boolean | undefined {
  if (isStr(s) && isStr(prefix)) return s.startsWith(prefix);
  return undefined;
}

export function celEndsWith(s: unknown, suffix: unknown): boolean | undefined {
  if (isStr(s) && isStr(suffix)) return s.endsWith(suffix);
  return undefined;
}

export function celMatches(s: unknown, pattern: unknown): boolean | undefined {
  if (isStr(s) && isStr(pattern)) {
    try {
      // CEL matches() uses RE2 partial-match semantics:
      // returns true if the regex matches any substring of s.
      const re = new RegExp(pattern, "v");
      return re.test(s);
    } catch {
      // If 'v' flag not supported or pattern is invalid, retry without
      try {
        const re = new RegExp(pattern);
        return re.test(s);
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

// ── Type Conversion Helpers ────────────────────────────────────────────────

export function celToInt(v: unknown): bigint | undefined {
  if (isInt(v)) return v;
  if (isCelUint(v)) {
    return inInt64Range(v.value) ? v.value : undefined;
  }
  if (isDouble(v)) {
    if (!Number.isFinite(v)) return undefined;
    // CEL spec: double must be in range (-2^63, 2^63) exclusive
    // At the boundaries, double precision can't distinguish adjacent values,
    // so we reject doubles >= 2^63 or <= -2^63 using double comparison
    if (v >= 2 ** 63 || v <= -(2 ** 63)) return undefined;
    return BigInt(Math.trunc(v));
  }
  if (isBool(v)) return v ? 1n : 0n;
  if (isStr(v)) {
    try {
      const r = BigInt(v);
      return inInt64Range(r) ? r : undefined;
    } catch {
      return undefined;
    }
  }
  // timestamp (Date) -> seconds since epoch
  if (v instanceof Date) {
    const ms = v.getTime();
    if (Number.isNaN(ms)) return undefined;
    return BigInt(Math.trunc(ms / 1000));
  }
  return undefined;
}

export function celToUint(v: unknown): CelUint | undefined {
  if (isCelUint(v)) return v;
  if (isInt(v)) {
    return inUint64Range(v) ? new CelUint(v) : undefined;
  }
  if (isDouble(v)) {
    if (!Number.isFinite(v) || v < 0) return undefined;
    const r = BigInt(Math.trunc(v));
    return inUint64Range(r) ? new CelUint(r) : undefined;
  }
  if (isBool(v)) return new CelUint(v ? 1n : 0n);
  if (isStr(v)) {
    try {
      const r = BigInt(v);
      return inUint64Range(r) ? new CelUint(r) : undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export function celToDouble(v: unknown): number | undefined {
  if (isDouble(v)) return v;
  if (isInt(v)) return Number(v);
  if (isCelUint(v)) return Number(v.value);
  if (isStr(v)) {
    const n = Number(v);
    return Number.isNaN(n) && v !== "NaN" ? undefined : n;
  }
  return undefined;
}

export function celToString(v: unknown): string | undefined {
  if (isStr(v)) return v;
  if (isInt(v)) return v.toString();
  if (isCelUint(v)) return v.value.toString();
  if (isDouble(v)) return String(v);
  if (isBool(v)) return v ? "true" : "false";
  if (v === null) return "null";
  if (isBytes(v)) {
    // Decode bytes as UTF-8
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(v);
    } catch {
      return undefined;
    }
  }
  if (isList(v)) {
    const parts: string[] = [];
    for (const item of v) {
      const s = celToString(item);
      if (s === undefined) return undefined;
      parts.push(s);
    }
    return `[${parts.join(", ")}]`;
  }
  if (isMap(v)) {
    const parts: string[] = [];
    for (const [k, val] of v) {
      const ks = celToString(k);
      const vs = celToString(val);
      if (ks === undefined || vs === undefined) return undefined;
      parts.push(`${ks}:${vs}`);
    }
    return `{${parts.join(", ")}}`;
  }
  if (isCelType(v)) return v.name;
  if (v instanceof Date) return v.toISOString();
  return undefined;
}

export function celToBool(v: unknown): boolean | undefined {
  if (isBool(v)) return v;
  if (isStr(v)) {
    // CEL follows Go strconv.ParseBool semantics
    switch (v) {
      case "1":
      case "t":
      case "T":
      case "true":
      case "TRUE":
      case "True":
        return true;
      case "0":
      case "f":
      case "F":
      case "false":
      case "FALSE":
      case "False":
        return false;
      default:
        return undefined;
    }
  }
  if (isInt(v)) return v !== 0n;
  return undefined;
}

export function celToBytes(v: unknown): Uint8Array | undefined {
  if (isBytes(v)) return v;
  if (isStr(v)) {
    return new TextEncoder().encode(v);
  }
  return undefined;
}

export function celType(v: unknown): CelType {
  if (v === null) return new CelType("null_type");
  if (isBool(v)) return new CelType("bool");
  if (isInt(v)) return new CelType("int");
  if (isCelUint(v)) return new CelType("uint");
  if (isDouble(v)) return new CelType("double");
  if (isStr(v)) return new CelType("string");
  if (isBytes(v)) return new CelType("bytes");
  if (isList(v)) return new CelType("list");
  if (isMap(v)) return new CelType("map");
  if (isCelType(v)) return new CelType("type");
  if (v instanceof Date) return new CelType("google.protobuf.Timestamp");
  if (isCelDuration(v)) return new CelType("google.protobuf.Duration");
  return new CelType("unknown");
}

export function celDyn(v: unknown): unknown {
  return v;
}

// ── Duration Helper ──────────────────────────────────────────────────────

/** A CEL duration value: stores seconds and nanoseconds */
export class CelDuration {
  constructor(
    public readonly seconds: bigint,
    public readonly nanos: number,
  ) {}
}

/** Check if a value is a CelDuration */
export function isCelDuration(v: unknown): v is CelDuration {
  return v instanceof CelDuration;
}

/**
 * Parse a duration string like "100s", "1.5h", "-2m30s", etc.
 * Returns CelDuration or undefined on error.
 */
function parseDurationString(s: string): CelDuration | undefined {
  const re = /^(-)?(\d+(?:\.\d+)?)(s|ms|us|ns|m|h)$/;
  const match = re.exec(s);
  if (!match) return undefined;
  const [, sign, numStr, unit] = match;
  const num = Number(numStr);
  if (!Number.isFinite(num)) return undefined;

  let totalNanos: number;
  switch (unit) {
    case "h":
      totalNanos = num * 3600e9;
      break;
    case "m":
      totalNanos = num * 60e9;
      break;
    case "s":
      totalNanos = num * 1e9;
      break;
    case "ms":
      totalNanos = num * 1e6;
      break;
    case "us":
      totalNanos = num * 1e3;
      break;
    case "ns":
      totalNanos = num;
      break;
    default:
      return undefined;
  }

  if (sign === "-") totalNanos = -totalNanos;

  const seconds = BigInt(Math.trunc(totalNanos / 1e9));
  const nanos = Math.round(totalNanos % 1e9);
  return new CelDuration(seconds, nanos);
}

export function celDuration(v: unknown): CelDuration | undefined {
  if (isCelDuration(v)) return v; // identity
  if (isStr(v)) return parseDurationString(v);
  return undefined;
}

// ── Timestamp Helper ─────────────────────────────────────────────────────

export function celTimestamp(v: unknown): Date | undefined {
  if (v instanceof Date) return v; // identity
  if (isStr(v)) {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return undefined;
    return d;
  }
  if (isInt(v)) {
    // int -> timestamp: interpret as seconds since epoch
    return new Date(Number(v) * 1000);
  }
  return undefined;
}

// ── Macro Helpers ──────────────────────────────────────────────────────────

export function celAll(
  list: unknown,
  predicate: (elem: CelValue, index: bigint) => unknown,
): boolean | undefined {
  if (!isList(list)) return undefined;
  let hasError = false;
  for (let i = 0; i < list.length; i++) {
    const elem = list[i] as CelValue;
    const result = predicate(elem, BigInt(i));
    if (result === false) return false; // short-circuit: false wins over error
    if (result !== true) hasError = true; // undefined (error)
  }
  return hasError ? undefined : true;
}

export function celExists(
  list: unknown,
  predicate: (elem: CelValue, index: bigint) => unknown,
): boolean | undefined {
  if (!isList(list)) return undefined;
  let hasError = false;
  for (let i = 0; i < list.length; i++) {
    const elem = list[i] as CelValue;
    const result = predicate(elem, BigInt(i));
    if (result === true) return true; // short-circuit: true wins over error
    if (result !== false) hasError = true; // undefined (error)
  }
  return hasError ? undefined : false;
}

export function celExistsOne(
  list: unknown,
  predicate: (elem: CelValue, index: bigint) => unknown,
): boolean | undefined {
  if (!isList(list)) return undefined;
  let count = 0;
  for (let i = 0; i < list.length; i++) {
    const elem = list[i] as CelValue;
    const result = predicate(elem, BigInt(i));
    if (result === undefined) return undefined;
    if (result === true) count++;
  }
  return count === 1;
}

export function celMap(
  list: unknown,
  transform: (elem: CelValue, index: bigint) => CelValue | undefined,
): CelValue[] | undefined {
  if (!isList(list)) return undefined;
  const result: CelValue[] = [];
  for (let i = 0; i < list.length; i++) {
    const elem = list[i] as CelValue;
    const mapped = transform(elem, BigInt(i));
    if (mapped === undefined) return undefined;
    result.push(mapped);
  }
  return result;
}

export function celFilter(
  list: unknown,
  predicate: (elem: CelValue, index: bigint) => unknown,
): CelValue[] | undefined {
  if (!isList(list)) return undefined;
  const result: CelValue[] = [];
  for (let i = 0; i < list.length; i++) {
    const elem = list[i] as CelValue;
    const keep = predicate(elem, BigInt(i));
    if (keep === undefined) return undefined;
    if (keep === true) result.push(elem);
  }
  return result;
}

// ── Map / Struct / Comprehension Helpers ──────────────────────────────

/** Create a CEL map from an array of [key, value] pairs */
export function celMakeMap(entries: [CelValue, CelValue][]): Map<CelValue, CelValue> {
  const m = new Map<CelValue, CelValue>();
  for (const [k, v] of entries) {
    m.set(k, v);
  }
  return m;
}

/** Default values for protobuf wrapper types when constructed with no value field */
const WRAPPER_DEFAULTS: Record<string, CelValue> = {
  "google.protobuf.BoolValue": false,
  "google.protobuf.BytesValue": new Uint8Array(0),
  "google.protobuf.DoubleValue": 0.0,
  "google.protobuf.FloatValue": 0.0,
  "google.protobuf.Int32Value": 0n,
  "google.protobuf.Int64Value": 0n,
  "google.protobuf.StringValue": "",
  "google.protobuf.UInt32Value": new CelUint(0n),
  "google.protobuf.UInt64Value": new CelUint(0n),
};

/** Create a CEL struct (message) from a name and field entries.
 *  For now, we represent structs as plain objects with a __type marker. */
export function celMakeStruct(_name: string, entries: [string, CelValue][]): CelValue {
  // google.protobuf.Value{} with no fields set represents JSON null
  if (_name === "google.protobuf.Value" && entries.length === 0) {
    return null;
  }
  // Protobuf wrapper types unwrap to their primitive value
  if (_name in WRAPPER_DEFAULTS) {
    for (const [field, value] of entries) {
      if (field === "value") return value;
    }
    return WRAPPER_DEFAULTS[_name] as CelValue;
  }
  const obj: Record<string, CelValue> = {};
  obj.__type = _name;
  for (const [field, value] of entries) {
    obj[field] = value;
  }
  // Wrap in Proxy: absent fields return null (proto absent-field semantics)
  return new Proxy(obj, {
    get(target, prop, receiver) {
      if (typeof prop === "string" && prop !== "__type") {
        if (!(prop in target)) return null;
      }
      return Reflect.get(target, prop, receiver);
    },
  }) as unknown as CelValue;
}

/** Check if a field exists on an object (the `has()` macro) */
export function celHas(obj: unknown, field: string): boolean {
  if (obj === null || obj === undefined) return false;
  if (obj instanceof Map) {
    return obj.has(field);
  }
  if (typeof obj === "object") {
    return (
      field in (obj as Record<string, unknown>) &&
      (obj as Record<string, unknown>)[field] !== undefined
    );
  }
  return false;
}

/**
 * Execute a CEL comprehension loop.
 *
 * @param range - The collection to iterate over (list or map)
 * @param init - Initial value of the accumulator
 * @param iterVar - Name of the iteration variable (informational, not used at runtime)
 * @param accuVar - Name of the accumulator variable (informational, not used at runtime)
 * @param condFn - Loop condition function (iterVar, accuVar) => bool
 * @param stepFn - Step function (iterVar, accuVar) => newAccu
 * @param resultFn - Result function (accuVar) => result
 */
export function celComprehension(
  range: unknown,
  init: unknown,
  _iterVar: string,
  _accuVar: string,
  condFn: (iter: CelValue, accu: unknown) => unknown,
  stepFn: (iter: CelValue, accu: unknown) => unknown,
  resultFn: (accu: unknown) => unknown,
): unknown {
  let accu = init;
  if (Array.isArray(range)) {
    for (const elem of range) {
      const cond = condFn(elem as CelValue, accu);
      if (cond === false) break;
      if (cond !== true) return undefined; // error in condition
      accu = stepFn(elem as CelValue, accu);
    }
  } else if (range instanceof Map) {
    for (const [key] of range) {
      const cond = condFn(key as CelValue, accu);
      if (cond === false) break;
      if (cond !== true) return undefined;
      accu = stepFn(key as CelValue, accu);
    }
  } else {
    return undefined; // range is not iterable
  }
  return resultFn(accu);
}

// ── Logical Helpers ────────────────────────────────────────────────────────

/**
 * CEL conditional (ternary) with error handling.
 * If condition is an error (undefined), propagates the error.
 */
export function celCond(
  condition: unknown,
  trueVal: () => unknown,
  falseVal: () => unknown,
): unknown {
  if (condition === undefined) return undefined;
  return condition ? trueVal() : falseVal();
}

/**
 * CEL logical NOT. Returns !bool or undefined for non-bool.
 */
export function celNot(v: unknown): boolean | undefined {
  if (isBool(v)) return !v;
  return undefined;
}

/**
 * CEL logical OR with error absorption.
 * true || error = true
 * error || true = true
 * false || error = error
 * error || false = error
 * error || error = error
 */
export function celOr(a: unknown, b: () => unknown): boolean | undefined {
  if (a === true) return true;
  const bv = b();
  if (bv === true) return true;
  if (a === false && bv === false) return false;
  return undefined;
}

/**
 * CEL logical AND with error absorption.
 * false && error = false
 * error && false = false
 * true && error = error
 * error && true = error
 * error && error = error
 */
export function celAnd(a: unknown, b: () => unknown): boolean | undefined {
  if (a === false) return false;
  const bv = b();
  if (bv === false) return false;
  if (a === true && bv === true) return true;
  return undefined;
}

/**
 * CEL logical OR for N operands (commutative error absorption).
 * Evaluates all operands eagerly.
 * true wins over error, error wins over false.
 */
export function celOrN(operands: (() => unknown)[]): boolean | undefined {
  let hasError = false;
  for (const op of operands) {
    const v = op();
    if (v === true) return true;
    if (v !== false) hasError = true;
  }
  return hasError ? undefined : false;
}

/**
 * CEL logical AND for N operands (commutative error absorption).
 * Evaluates all operands eagerly.
 * false wins over error, error wins over true.
 */
export function celAndN(operands: (() => unknown)[]): boolean | undefined {
  let hasError = false;
  for (const op of operands) {
    const v = op();
    if (v === false) return false;
    if (v !== true) hasError = true;
  }
  return hasError ? undefined : true;
}

// ── createRuntime ──────────────────────────────────────────────────────────

/** Create the _rt object that generated code references */
export function createRuntime() {
  return {
    // Arithmetic
    add: celAdd,
    sub: celSub,
    mul: celMul,
    div: celDiv,
    mod: celMod,
    neg: celNeg,
    // Comparison
    eq: celEq,
    ne: celNe,
    lt: celLt,
    le: celLe,
    gt: celGt,
    ge: celGe,
    // Collections
    in: celIn,
    size: celSize,
    index: celIndex,
    select: celSelect,
    // Strings
    contains: celContains,
    startsWith: celStartsWith,
    endsWith: celEndsWith,
    matches: celMatches,
    // Type conversions
    toInt: celToInt,
    toUint: celToUint,
    toDouble: celToDouble,
    toString: celToString,
    toBool: celToBool,
    toBytes: celToBytes,
    type: celType,
    dyn: celDyn,
    // Macros
    all: celAll,
    exists: celExists,
    existsOne: celExistsOne,
    map: celMap,
    filter: celFilter,
    // Logical
    cond: celCond,
    not: celNot,
    or: celOr,
    and: celAnd,
    orN: celOrN,
    andN: celAndN,
    // Map / Struct / Comprehension
    makeMap: celMakeMap,
    makeStruct: celMakeStruct,
    has: celHas,
    comprehension: celComprehension,
    // Type conversions (timestamp/duration)
    duration: celDuration,
    timestamp: celTimestamp,
    // Types
    CelUint,
    celUint: (n: bigint) => new CelUint(n),
    isCelUint,
    CelType,
    isCelType,
  };
}
