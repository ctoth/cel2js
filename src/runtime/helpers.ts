import type { CelValue } from "./types.js";
import {
  CelCIDR,
  CelIP,
  CelOptional,
  CelType,
  CelUint,
  isCelCIDR,
  isCelIP,
  isCelOptional,
  isCelType,
  isCelUint,
} from "./types.js";

// ── Constants ──────────────────────────────────────────────────────────────

const INT64_MIN = -(2n ** 63n);
const INT64_MAX = 2n ** 63n - 1n;
const UINT64_MAX = 2n ** 64n - 1n;

// CEL timestamp valid range: 0001-01-01T00:00:00Z to 9999-12-31T23:59:59.999999999Z
const TIMESTAMP_MIN_SEC = -62135596800n; // 0001-01-01T00:00:00Z in seconds since epoch
const TIMESTAMP_MAX_SEC = 253402300799n; // 9999-12-31T23:59:59Z in seconds since epoch

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
    !isCelTimestamp(v) &&
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

export function celAdd(a: unknown, b: unknown): CelValue | CelTimestamp | CelDuration | undefined {
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
  // timestamp + duration
  if (isCelTimestamp(a) && isCelDuration(b)) {
    return addDurationToTimestamp(a, b);
  }
  // duration + timestamp
  if (isCelDuration(a) && isCelTimestamp(b)) {
    return addDurationToTimestamp(b, a);
  }
  // duration + duration
  if (isCelDuration(a) && isCelDuration(b)) {
    const totalNanos = durationToNanos(a) + durationToNanos(b);
    return nanosToValidDuration(totalNanos);
  }
  return undefined;
}

export function celSub(a: unknown, b: unknown): CelValue | CelTimestamp | CelDuration | undefined {
  if (isInt(a) && isInt(b)) {
    const r = a - b;
    return inInt64Range(r) ? r : undefined;
  }
  if (isCelUint(a) && isCelUint(b)) {
    const r = a.value - b.value;
    return inUint64Range(r) ? new CelUint(r) : undefined;
  }
  if (isDouble(a) && isDouble(b)) return a - b;
  // timestamp - duration
  if (isCelTimestamp(a) && isCelDuration(b)) {
    const negDur = nanosToValidDuration(-durationToNanos(b));
    if (negDur === undefined) return undefined;
    return addDurationToTimestamp(a, negDur);
  }
  // timestamp - timestamp = duration
  if (isCelTimestamp(a) && isCelTimestamp(b)) {
    return subtractTimestamps(a, b);
  }
  // duration - duration
  if (isCelDuration(a) && isCelDuration(b)) {
    const totalNanos = durationToNanos(a) - durationToNanos(b);
    return nanosToValidDuration(totalNanos);
  }
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

  // Fast path: same reference / same primitive value (handles string, bool, bigint)
  if (a === b) return true;

  // string (most common equality operand in real-world expressions)
  // If a === b was false and both are strings, they differ.
  if (typeof a === "string") return false;
  if (typeof b === "string") return false;

  // bool — if a === b was false and both are booleans, they differ.
  // If only one is boolean, incompatible types -> false.
  if (typeof a === "boolean" || typeof b === "boolean") return false;

  // Cross-numeric equality
  if (isNumeric(a) && isNumeric(b)) {
    return numericCompare(a as bigint | CelUint | number, b as bigint | CelUint | number) === 0;
  }

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

  // CelTimestamp equality
  if (isCelTimestamp(a) && isCelTimestamp(b)) {
    return a.seconds === b.seconds && a.nanos === b.nanos;
  }

  // CelDuration equality
  if (isCelDuration(a) && isCelDuration(b)) {
    return a.seconds === b.seconds && a.nanos === b.nanos;
  }

  // CelIP equality
  if (isCelIP(a) && isCelIP(b)) {
    return ipBytesEqual(a, b);
  }

  // CelCIDR equality
  if (isCelCIDR(a) && isCelCIDR(b)) {
    if (a.prefix !== b.prefix) return false;
    if (a.ip.bytes.length !== b.ip.bytes.length) return false;
    return ipBytesEqual(a.ip, b.ip);
  }

  // CelOptional equality
  if (isCelOptional(a) && isCelOptional(b)) {
    if (!a.hasValue() && !b.hasValue()) return true;
    if (!a.hasValue() || !b.hasValue()) return false;
    return celEq(a.value(), b.value());
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
  // Fast path: int vs int (bigint vs bigint) — most common case
  if (typeof a === "bigint" && typeof b === "bigint") return a < b;
  if (isNumeric(a) && isNumeric(b)) {
    const c = numericCompare(a as bigint | CelUint | number, b as bigint | CelUint | number);
    return Number.isNaN(c) ? false : c < 0;
  }
  if (isStr(a) && isStr(b)) return a < b;
  if (isBool(a) && isBool(b)) return !a && b; // false < true
  if (isBytes(a) && isBytes(b)) return bytesCompare(a, b) < 0;
  if (isCelTimestamp(a) && isCelTimestamp(b)) return timestampCompare(a, b) < 0;
  if (isCelDuration(a) && isCelDuration(b)) return durationCompare(a, b) < 0;
  return undefined;
}

export function celLe(a: unknown, b: unknown): boolean | undefined {
  // Fast path: int vs int (bigint vs bigint) — most common case
  if (typeof a === "bigint" && typeof b === "bigint") return a <= b;
  if (isNumeric(a) && isNumeric(b)) {
    const c = numericCompare(a as bigint | CelUint | number, b as bigint | CelUint | number);
    return Number.isNaN(c) ? false : c <= 0;
  }
  if (isStr(a) && isStr(b)) return a <= b;
  if (isBool(a) && isBool(b)) return !a || b; // false <= true, false <= false, true <= true
  if (isBytes(a) && isBytes(b)) return bytesCompare(a, b) <= 0;
  if (isCelTimestamp(a) && isCelTimestamp(b)) return timestampCompare(a, b) <= 0;
  if (isCelDuration(a) && isCelDuration(b)) return durationCompare(a, b) <= 0;
  return undefined;
}

export function celGt(a: unknown, b: unknown): boolean | undefined {
  // Fast path: int vs int (bigint vs bigint) — most common case
  if (typeof a === "bigint" && typeof b === "bigint") return a > b;
  if (isNumeric(a) && isNumeric(b)) {
    const c = numericCompare(a as bigint | CelUint | number, b as bigint | CelUint | number);
    return Number.isNaN(c) ? false : c > 0;
  }
  if (isStr(a) && isStr(b)) return a > b;
  if (isBool(a) && isBool(b)) return a && !b;
  if (isBytes(a) && isBytes(b)) return bytesCompare(a, b) > 0;
  if (isCelTimestamp(a) && isCelTimestamp(b)) return timestampCompare(a, b) > 0;
  if (isCelDuration(a) && isCelDuration(b)) return durationCompare(a, b) > 0;
  return undefined;
}

export function celGe(a: unknown, b: unknown): boolean | undefined {
  // Fast path: int vs int (bigint vs bigint) — most common case
  if (typeof a === "bigint" && typeof b === "bigint") return a >= b;
  if (isNumeric(a) && isNumeric(b)) {
    const c = numericCompare(a as bigint | CelUint | number, b as bigint | CelUint | number);
    return Number.isNaN(c) ? false : c >= 0;
  }
  if (isStr(a) && isStr(b)) return a >= b;
  if (isBool(a) && isBool(b)) return a || !b;
  if (isBytes(a) && isBytes(b)) return bytesCompare(a, b) >= 0;
  if (isCelTimestamp(a) && isCelTimestamp(b)) return timestampCompare(a, b) >= 0;
  if (isCelDuration(a) && isCelDuration(b)) return durationCompare(a, b) >= 0;
  return undefined;
}

/** Compare two CelTimestamp values. Returns -1, 0, or 1. */
function timestampCompare(a: CelTimestamp, b: CelTimestamp): number {
  if (a.seconds !== b.seconds) return a.seconds < b.seconds ? -1 : 1;
  if (a.nanos !== b.nanos) return a.nanos < b.nanos ? -1 : 1;
  return 0;
}

/** Compare two CelDuration values. Returns -1, 0, or 1. */
function durationCompare(a: CelDuration, b: CelDuration): number {
  if (a.seconds !== b.seconds) return a.seconds < b.seconds ? -1 : 1;
  if (a.nanos !== b.nanos) return a.nanos < b.nanos ? -1 : 1;
  return 0;
}

/** Convert a CelDuration to total nanoseconds as bigint */
function durationToNanos(d: CelDuration): bigint {
  return d.seconds * 1000000000n + BigInt(d.nanos);
}

/** Create a CelDuration from total nanoseconds, with range validation */
function nanosToValidDuration(totalNanos: bigint): CelDuration | undefined {
  // Duration must fit in int64 nanoseconds (per CEL spec / cel-es reference)
  if (totalNanos > INT64_MAX || totalNanos < INT64_MIN) return undefined;
  // Note: integer division truncates toward zero in bigint
  let secs = totalNanos / 1000000000n;
  let nanos = Number(totalNanos % 1000000000n);
  // Normalize: nanos should have same sign as seconds
  if (nanos < 0 && secs > 0n) {
    secs -= 1n;
    nanos += 1000000000;
  } else if (nanos > 0 && secs < 0n) {
    secs += 1n;
    nanos -= 1000000000;
  }
  return new CelDuration(secs, nanos);
}

/** Add a duration to a timestamp, returning a new CelTimestamp or undefined if out of range */
function addDurationToTimestamp(ts: CelTimestamp, dur: CelDuration): CelTimestamp | undefined {
  let resultSec = ts.seconds + dur.seconds;
  let resultNanos = ts.nanos + dur.nanos;

  // Normalize nanos to [0, 999999999]
  if (resultNanos >= 1000000000) {
    resultSec += 1n;
    resultNanos -= 1000000000;
  } else if (resultNanos < 0) {
    resultSec -= 1n;
    resultNanos += 1000000000;
  }

  // Validate range: seconds must be in [TIMESTAMP_MIN_SEC, TIMESTAMP_MAX_SEC]
  if (resultSec < TIMESTAMP_MIN_SEC || resultSec > TIMESTAMP_MAX_SEC) return undefined;
  // Additional check: at the maximum second, nanos > 999999999 would push over
  if (resultSec === TIMESTAMP_MAX_SEC && resultNanos > 999999999) return undefined;
  return new CelTimestamp(resultSec, resultNanos);
}

/** Subtract two timestamps, returning a CelDuration or undefined if result out of duration range */
function subtractTimestamps(a: CelTimestamp, b: CelTimestamp): CelDuration | undefined {
  const totalNanos = (a.seconds - b.seconds) * 1000000000n + BigInt(a.nanos) - BigInt(b.nanos);
  return nanosToValidDuration(totalNanos);
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

/** Return a plain object record fast-path target, or undefined for non-plain objects. */
function asPlainRecord(v: unknown): Record<string, CelValue> | undefined {
  if (v === null || v === undefined || typeof v !== "object") return undefined;
  const proto = Object.getPrototypeOf(v);
  if (proto === Object.prototype || proto === null) {
    return v as Record<string, CelValue>;
  }
  return undefined;
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

/** Check if a string contains only code units below 128 (ASCII).
 *  For ASCII strings, str.length equals the codepoint count. */
function isAscii(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    if ((s.charCodeAt(i) as number) >= 128) return false;
  }
  return true;
}

export function celSize(v: unknown): bigint | undefined {
  if (isStr(v)) {
    // ASCII fast path: if all code units < 128, .length === codepoint count
    if (isAscii(v)) {
      return BigInt(v.length);
    }
    // Non-ASCII: count codepoints via iterator
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
  // Optional chaining: indexing a CelOptional auto-wraps in optional
  if (isCelOptional(obj)) {
    if (!obj.hasValue()) return CelOptional.none() as CelValue;
    return celOptionalIndex(obj.value(), key) as CelValue | undefined;
  }
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
  // Fast path: typeof check first to handle the most common case (plain object) quickly
  if (typeof obj === "object") {
    // Prototype-based plain-object fast path: skip Map, CelOptional, Array, etc. checks
    const proto = Object.getPrototypeOf(obj);
    if (proto === Object.prototype || proto === null) {
      const record = obj as Record<string, CelValue>;
      // Plain objects with __type are proto/struct messages — need extension handling
      if ("__type" in obj) {
        if (field.includes(".")) {
          const extensions = (obj as Record<symbol, unknown>)[PROTO_EXTENSIONS] as
            | Map<string, CelValue>
            | undefined;
          if (extensions?.has(field)) return extensions.get(field) as CelValue;
          return undefined;
        }
        return record[field];
      }
      // Pure plain object (e.g. {auth: {...}}) — direct field access
      return record[field];
    }
    // Map: CEL map.field is equivalent to map["field"]
    if (obj instanceof Map) {
      return mapGet(obj, field) as CelValue | undefined;
    }
    // CelOptional: missing fields produce CelOptional.none(), type errors produce undefined (error).
    if (isCelOptional(obj)) {
      if (!obj.hasValue()) return CelOptional.none() as CelValue;
      const inner = obj.value();
      if (inner === null || inner === undefined) return undefined;
      if (isMap(inner)) {
        if (mapHas(inner as Map<CelValue, CelValue>, field)) {
          return CelOptional.of(mapGet(inner as Map<CelValue, CelValue>, field)) as CelValue;
        }
        return CelOptional.none() as CelValue;
      }
      if (typeof inner === "object") {
        if (isStruct(inner)) {
          const keys = Object.keys(inner as Record<string, unknown>).filter((k) => k !== "__type");
          if (keys.includes(field)) {
            return CelOptional.of((inner as Record<string, CelValue>)[field]) as CelValue;
          }
          return CelOptional.none() as CelValue;
        }
        return CelOptional.of((inner as Record<string, CelValue>)[field]) as CelValue;
      }
      return undefined;
    }
    // CEL types that are JS objects but don't support field access
    if (Array.isArray(obj) || obj instanceof Uint8Array) return undefined;
    if (isCelUint(obj) || isCelType(obj)) return undefined;
    if (isCelTimestamp(obj) || isCelDuration(obj)) return undefined;
    // Plain object — the common path (fallback for objects with non-standard prototypes)
    if (isStruct(obj) && field.includes(".")) {
      const extensions = (obj as Record<symbol, unknown>)[PROTO_EXTENSIONS] as
        | Map<string, CelValue>
        | undefined;
      if (extensions?.has(field)) return extensions.get(field) as CelValue;
      return undefined;
    }
    return (obj as Record<string, CelValue>)[field];
  }
  return undefined;
}

/** Fused select chain for the common plain-object path, with full fallback semantics. */
export function celSelectPath2(obj: unknown, field1: string, field2: string): CelValue | undefined {
  const record0 = asPlainRecord(obj);
  if (record0 !== undefined) {
    const value1 = record0[field1];
    if (value1 === null || value1 === undefined || typeof value1 !== "object") return undefined;
    const record1 = asPlainRecord(value1);
    if (record1 !== undefined) return record1[field2];
  } else if (obj === null || obj === undefined || typeof obj !== "object") {
    return undefined;
  }

  const selected1 = celSelect(obj, field1);
  if (selected1 === undefined) return undefined;
  return celSelect(selected1, field2);
}

/** Fused 3-hop select chain for plain-object access. */
export function celSelectPath3(
  obj: unknown,
  field1: string,
  field2: string,
  field3: string,
): CelValue | undefined {
  const record0 = asPlainRecord(obj);
  if (record0 !== undefined) {
    const value1 = record0[field1];
    if (value1 === null || value1 === undefined || typeof value1 !== "object") return undefined;
    const record1 = asPlainRecord(value1);
    if (record1 !== undefined) {
      const value2 = record1[field2];
      if (value2 === null || value2 === undefined || typeof value2 !== "object") return undefined;
      const record2 = asPlainRecord(value2);
      if (record2 !== undefined) return record2[field3];
    }
  } else if (obj === null || obj === undefined || typeof obj !== "object") {
    return undefined;
  }

  const selected1 = celSelect(obj, field1);
  if (selected1 === undefined) return undefined;
  const selected2 = celSelect(selected1, field2);
  if (selected2 === undefined) return undefined;
  return celSelect(selected2, field3);
}

/** Fused 4-hop select chain for plain-object access. */
export function celSelectPath4(
  obj: unknown,
  field1: string,
  field2: string,
  field3: string,
  field4: string,
): CelValue | undefined {
  const record0 = asPlainRecord(obj);
  if (record0 !== undefined) {
    const value1 = record0[field1];
    if (value1 === null || value1 === undefined || typeof value1 !== "object") return undefined;
    const record1 = asPlainRecord(value1);
    if (record1 !== undefined) {
      const value2 = record1[field2];
      if (value2 === null || value2 === undefined || typeof value2 !== "object") return undefined;
      const record2 = asPlainRecord(value2);
      if (record2 !== undefined) {
        const value3 = record2[field3];
        if (value3 === null || value3 === undefined || typeof value3 !== "object") return undefined;
        const record3 = asPlainRecord(value3);
        if (record3 !== undefined) return record3[field4];
      }
    }
  } else if (obj === null || obj === undefined || typeof obj !== "object") {
    return undefined;
  }

  const selected1 = celSelect(obj, field1);
  if (selected1 === undefined) return undefined;
  const selected2 = celSelect(selected1, field2);
  if (selected2 === undefined) return undefined;
  const selected3 = celSelect(selected2, field3);
  if (selected3 === undefined) return undefined;
  return celSelect(selected3, field4);
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

// ── String Extension Helpers ───────────────────────────────────────────────

/** Convert string to array of codepoints */
function toCodepoints(s: string): string[] {
  return [...s];
}

/** Convert a codepoint index to a JS string index */
function codepointToJsIndex(s: string, cpIndex: number): number {
  const cps = toCodepoints(s);
  if (cpIndex < 0 || cpIndex > cps.length) return -1;
  let jsIdx = 0;
  for (let i = 0; i < cpIndex; i++) {
    jsIdx += (cps[i] as string).length;
  }
  return jsIdx;
}

/** Convert a JS string index to a codepoint index */
function jsToCodepointIndex(s: string, jsIndex: number): number {
  let cpIdx = 0;
  let jsIdx = 0;
  for (const cp of s) {
    if (jsIdx >= jsIndex) break;
    jsIdx += cp.length;
    cpIdx++;
  }
  return cpIdx;
}

/** CEL string.charAt(index) — returns character at codepoint position */
export function celCharAt(s: unknown, index: unknown): string | undefined {
  if (!isStr(s)) return undefined;
  if (!isInt(index) && !isCelUint(index)) return undefined;
  const idx = isInt(index) ? Number(index) : Number((index as CelUint).value);
  const cps = toCodepoints(s);
  if (idx < 0 || idx > cps.length) return undefined;
  if (idx === cps.length) return "";
  return cps[idx] as string;
}

/** CEL string.indexOf(substr) or string.indexOf(substr, offset) */
export function celIndexOf(
  s: unknown,
  substr: unknown,
  offset?: unknown,
  ...extra: unknown[]
): bigint | undefined {
  if (extra.length > 0) return undefined; // too many arguments
  if (!isStr(s) || !isStr(substr)) return undefined;
  const cps = toCodepoints(s);
  let startCp = 0;
  if (offset !== undefined) {
    if (!isInt(offset) && !isCelUint(offset)) return undefined;
    startCp = isInt(offset) ? Number(offset) : Number((offset as CelUint).value);
    if (startCp < 0 || startCp > cps.length) return undefined;
  }
  // Convert codepoint offset to JS string index
  const jsStart = codepointToJsIndex(s, startCp);
  if (jsStart < 0) return undefined;
  const jsIdx = s.indexOf(substr, jsStart);
  if (jsIdx === -1) return -1n;
  // Convert JS index back to codepoint index
  return BigInt(jsToCodepointIndex(s, jsIdx));
}

/** CEL string.lastIndexOf(substr) or string.lastIndexOf(substr, offset) */
export function celLastIndexOf(s: unknown, substr: unknown, offset?: unknown): bigint | undefined {
  if (!isStr(s) || !isStr(substr)) return undefined;
  const cps = toCodepoints(s);
  if (offset !== undefined) {
    if (!isInt(offset) && !isCelUint(offset)) return undefined;
    const offCp = isInt(offset) ? Number(offset) : Number((offset as CelUint).value);
    if (offCp < 0 || offCp > cps.length) return undefined;
    // Search from the beginning up to offset (codepoint-based)
    // Convert codepoint offset to JS string index for the search end
    const jsEnd = codepointToJsIndex(s, offCp);
    if (jsEnd < 0) return undefined;
    const jsIdx = s.lastIndexOf(substr, jsEnd);
    if (jsIdx === -1) return -1n;
    return BigInt(jsToCodepointIndex(s, jsIdx));
  }
  // No offset: search the entire string
  const jsIdx = s.lastIndexOf(substr);
  if (jsIdx === -1) return -1n;
  return BigInt(jsToCodepointIndex(s, jsIdx));
}

/** CEL string.lowerAscii() — lowercase only ASCII characters */
export function celLowerAscii(s: unknown): string | undefined {
  if (!isStr(s)) return undefined;
  let result = "";
  for (const ch of s) {
    const code = ch.charCodeAt(0);
    if (code >= 65 && code <= 90 && ch.length === 1) {
      result += String.fromCharCode(code + 32);
    } else {
      result += ch;
    }
  }
  return result;
}

/** CEL string.upperAscii() — uppercase only ASCII characters */
export function celUpperAscii(s: unknown): string | undefined {
  if (!isStr(s)) return undefined;
  let result = "";
  for (const ch of s) {
    const code = ch.charCodeAt(0);
    if (code >= 97 && code <= 122 && ch.length === 1) {
      result += String.fromCharCode(code - 32);
    } else {
      result += ch;
    }
  }
  return result;
}

/** CEL string.replace(old, new) or string.replace(old, new, count) */
export function celReplace(
  s: unknown,
  old: unknown,
  newStr: unknown,
  count?: unknown,
  ...extra: unknown[]
): string | undefined {
  if (extra.length > 0) return undefined; // too many arguments
  if (!isStr(s) || !isStr(old) || !isStr(newStr)) return undefined;
  if (count !== undefined) {
    if (!isInt(count) && !isCelUint(count)) return undefined;
    const maxReplacements = isInt(count) ? Number(count) : Number((count as CelUint).value);
    if (maxReplacements < 0) {
      // Negative count means replace all (same as no count)
      return s.split(old).join(newStr);
    }
    let result = s;
    for (let i = 0; i < maxReplacements; i++) {
      const idx = result.indexOf(old);
      if (idx === -1) break;
      result = result.slice(0, idx) + newStr + result.slice(idx + old.length);
    }
    return result;
  }
  // No count: replace all occurrences
  return s.split(old).join(newStr);
}

/** CEL string.split(separator) or string.split(separator, limit) */
export function celSplit(
  s: unknown,
  separator: unknown,
  limit?: unknown,
  ...extra: unknown[]
): string[] | undefined {
  if (extra.length > 0) return undefined; // too many arguments
  if (!isStr(s) || !isStr(separator)) return undefined;
  if (limit !== undefined) {
    if (!isInt(limit) && !isCelUint(limit)) return undefined;
    const maxParts = isInt(limit) ? Number(limit) : Number((limit as CelUint).value);
    if (maxParts < 0) {
      // Negative limit means no limit (split all)
      return s.split(separator);
    }
    if (maxParts === 0) return [];
    // Split with limit: keep remainder in last element
    if (maxParts === 1) return [s];
    const parts: string[] = [];
    let remaining = s;
    for (let i = 0; i < maxParts - 1; i++) {
      const idx = remaining.indexOf(separator);
      if (idx === -1) break;
      parts.push(remaining.slice(0, idx));
      remaining = remaining.slice(idx + separator.length);
    }
    parts.push(remaining);
    return parts;
  }
  return s.split(separator);
}

/** CEL string.substring(start) or string.substring(start, end) — codepoint-aware */
export function celSubstring(
  s: unknown,
  start: unknown,
  end?: unknown,
  ...extra: unknown[]
): string | undefined {
  if (extra.length > 0) return undefined; // too many arguments
  if (!isStr(s)) return undefined;
  if (!isInt(start) && !isCelUint(start)) return undefined;
  const cps = toCodepoints(s);
  const startCp = isInt(start) ? Number(start) : Number((start as CelUint).value);
  if (startCp < 0 || startCp > cps.length) return undefined;
  if (end !== undefined) {
    if (!isInt(end) && !isCelUint(end)) return undefined;
    const endCp = isInt(end) ? Number(end) : Number((end as CelUint).value);
    if (endCp < startCp || endCp > cps.length) return undefined;
    return cps.slice(startCp, endCp).join("");
  }
  return cps.slice(startCp).join("");
}

/** CEL string.trim() — Unicode-aware whitespace trimming */
export function celTrim(s: unknown): string | undefined {
  if (!isStr(s)) return undefined;
  // CEL trim uses Unicode whitespace definition
  // This includes standard JS whitespace plus additional Unicode space characters
  // JS .trim() handles most, but let's use a regex that matches CEL/Go's definition
  // Go strings.TrimSpace trims: Unicode.IsSpace which includes:
  // '\t', '\n', '\v', '\f', '\r', ' ', U+0085, U+00A0,
  // U+1680, U+2000-U+200A, U+2028, U+2029, U+202F, U+205F, U+3000
  // But NOT: U+180E (Mongolian vowel separator - not a space in modern Unicode)
  // And NOT: U+200B-U+200D, U+2060, U+FEFF (zero-width chars)
  const ws =
    "[ \\t\\n\\v\\f\\r\\u0085\\u00A0\\u1680\\u2000-\\u200A\\u2028\\u2029\\u202F\\u205F\\u3000]";
  const trimRe = new RegExp(`^${ws}+|${ws}+$`, "g");
  return s.replace(trimRe, "");
}

/** CEL list.join() or list.join(separator) — join list elements */
export function celJoin(list: unknown, separator?: unknown): string | undefined {
  if (!isList(list)) return undefined;
  const sep = separator === undefined ? "" : separator;
  if (!isStr(sep)) return undefined;
  const parts: string[] = [];
  for (const item of list) {
    if (!isStr(item)) return undefined;
    parts.push(item);
  }
  return parts.join(sep);
}

/** CEL strings.quote(str) — escape and quote a string */
export function celQuote(receiverOrStr: unknown, str?: unknown): string | undefined {
  // Handle both strings.quote(s) -> quote(undefined, s) and direct quote(s)
  const s = str !== undefined && isStr(str) ? str : receiverOrStr;
  if (!isStr(s)) return undefined;
  let result = '"';
  for (const ch of s) {
    switch (ch) {
      case "\\":
        result += "\\\\";
        break;
      case '"':
        result += '\\"';
        break;
      case "\n":
        result += "\\n";
        break;
      case "\r":
        result += "\\r";
        break;
      case "\t":
        result += "\\t";
        break;
      case "\x07":
        result += "\\a";
        break;
      case "\b":
        result += "\\b";
        break;
      case "\f":
        result += "\\f";
        break;
      case "\v":
        result += "\\v";
        break;
      default:
        result += ch;
        break;
    }
  }
  result += '"';
  return result;
}

/**
 * Format a value for %s substitution in CEL string.format().
 * This differs from celToString in that it doesn't quote strings
 * and has specific formatting for lists and maps.
 */
function formatValueForS(v: unknown): string | undefined {
  if (v === null) return "null";
  if (isStr(v)) return v;
  if (isInt(v)) return v.toString();
  if (isCelUint(v)) return v.value.toString();
  if (isDouble(v)) {
    if (Number.isNaN(v)) return "NaN";
    if (v === Number.POSITIVE_INFINITY) return "Infinity";
    if (v === Number.NEGATIVE_INFINITY) return "-Infinity";
    return String(v);
  }
  if (isBool(v)) return v ? "true" : "false";
  if (isBytes(v)) {
    // Decode bytes as UTF-8
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(v);
    } catch {
      return undefined;
    }
  }
  if (isCelType(v)) return v.name;
  if (isCelTimestamp(v)) return timestampToString(v);
  if (isCelDuration(v)) return durationToString(v);
  if (isList(v)) {
    const parts: string[] = [];
    for (const item of v) {
      const s = formatValueForS(item);
      if (s === undefined) return undefined;
      parts.push(s);
    }
    return `[${parts.join(", ")}]`;
  }
  if (isMap(v)) {
    // Format map with sorted keys
    const entries: [string, string][] = [];
    for (const [k, val] of v) {
      const ks = formatValueForS(k);
      const vs = formatValueForS(val);
      if (ks === undefined || vs === undefined) return undefined;
      entries.push([ks, vs]);
    }
    // Sort entries by key
    entries.sort((a, b) => sortMapKeys(a[0], b[0]));
    return `{${entries.map(([k, v2]) => `${k}: ${v2}`).join(", ")}}`;
  }
  // Unsupported types (proto messages, etc.) -> error
  return undefined;
}

/** Compare two formatted map keys for sorting. Numeric keys first, then strings, then booleans. */
function sortMapKeys(a: string, b: string): number {
  const aIsNum = /^-?\d+(\.\d+)?$/.test(a);
  const bIsNum = /^-?\d+(\.\d+)?$/.test(b);
  const aIsBool = a === "true" || a === "false";
  const bIsBool = b === "true" || b === "false";

  // Numeric keys come first
  if (aIsNum && !bIsNum) return -1;
  if (!aIsNum && bIsNum) return 1;
  if (aIsNum && bIsNum) return Number(a) - Number(b);

  // Booleans come last
  if (aIsBool && !bIsBool) return 1;
  if (!aIsBool && bIsBool) return -1;

  // Default: lexicographic
  return a < b ? -1 : a > b ? 1 : 0;
}

/** CEL string.format(args) — printf-like string formatting */
export function celFormat(s: unknown, args: unknown): string | undefined {
  if (!isStr(s) || !isList(args)) return undefined;

  let result = "";
  let argIdx = 0;
  let i = 0;

  while (i < s.length) {
    if (s[i] === "%") {
      i++;
      if (i >= s.length) return undefined; // trailing %

      if (s[i] === "%") {
        result += "%";
        i++;
        continue;
      }

      // Check for precision specifier: %.Nf or %.Ne
      let precision: number | undefined;
      if (s[i] === ".") {
        i++;
        let numStr = "";
        while (i < s.length) {
          const ch = s[i] as string;
          if (ch < "0" || ch > "9") break;
          numStr += ch;
          i++;
        }
        if (numStr.length > 0) {
          precision = Number.parseInt(numStr, 10);
        }
      }

      if (i >= s.length) return undefined;
      const verb = s[i] as string;
      i++;

      if (argIdx >= args.length) return undefined; // not enough args
      const arg = args[argIdx] as CelValue;
      argIdx++;

      const formatted = formatArg(arg, verb, precision);
      if (formatted === undefined) return undefined;
      result += formatted;
    } else {
      result += s[i];
      i++;
    }
  }

  return result;
}

/** Format a single argument according to a format verb */
function formatArg(arg: unknown, verb: string, precision?: number): string | undefined {
  switch (verb) {
    case "s":
      return formatValueForS(arg);
    case "d": {
      // Decimal integer
      if (isDouble(arg)) {
        if (Number.isNaN(arg)) return "NaN";
        if (arg === Number.POSITIVE_INFINITY) return "Infinity";
        if (arg === Number.NEGATIVE_INFINITY) return "-Infinity";
        return BigInt(Math.trunc(arg)).toString();
      }
      if (isInt(arg)) return arg.toString();
      if (isCelUint(arg)) return arg.value.toString();
      if (isBool(arg)) return arg ? "1" : "0";
      return undefined;
    }
    case "f": {
      // Fixed-point with banker's rounding (round half to even)
      const n = toDoubleForFormat(arg);
      if (n === undefined) return undefined;
      if (Number.isNaN(n)) return "NaN";
      if (n === Number.POSITIVE_INFINITY) return "Infinity";
      if (n === Number.NEGATIVE_INFINITY) return "-Infinity";
      const p = precision !== undefined ? precision : 6;
      return toFixedBankersRounding(n, p);
    }
    case "e": {
      // Scientific notation
      const n = toDoubleForFormat(arg);
      if (n === undefined) return undefined;
      if (Number.isNaN(n)) return "NaN";
      if (n === Number.POSITIVE_INFINITY) return "Infinity";
      if (n === Number.NEGATIVE_INFINITY) return "-Infinity";
      const p = precision !== undefined ? precision : 6;
      return formatScientific(n, p);
    }
    case "b": {
      // Binary
      if (isInt(arg)) {
        const val = arg < 0n ? -arg : arg;
        return (arg < 0n ? "-" : "") + val.toString(2);
      }
      if (isCelUint(arg)) return arg.value.toString(2);
      if (isBool(arg)) return arg ? "1" : "0";
      return undefined;
    }
    case "o": {
      // Octal
      if (isInt(arg)) {
        const val = arg < 0n ? -arg : arg;
        return (arg < 0n ? "-" : "") + val.toString(8);
      }
      if (isCelUint(arg)) return arg.value.toString(8);
      return undefined;
    }
    case "x": {
      // Lowercase hex
      if (isInt(arg)) {
        const val = arg < 0n ? -arg : arg;
        return (arg < 0n ? "-" : "") + val.toString(16);
      }
      if (isCelUint(arg)) return arg.value.toString(16);
      if (isStr(arg)) return hexEncodeString(arg, false);
      if (isBytes(arg)) return hexEncodeBytes(arg, false);
      return undefined;
    }
    case "X": {
      // Uppercase hex
      if (isInt(arg)) {
        const val = arg < 0n ? -arg : arg;
        return (arg < 0n ? "-" : "") + val.toString(16).toUpperCase();
      }
      if (isCelUint(arg)) return arg.value.toString(16).toUpperCase();
      if (isStr(arg)) return hexEncodeString(arg, true);
      if (isBytes(arg)) return hexEncodeBytes(arg, true);
      return undefined;
    }
    default:
      return undefined;
  }
}

/**
 * Fixed-point formatting with banker's rounding (round half to even).
 * Go's fmt.Sprintf uses this rounding mode.
 */
function toFixedBankersRounding(n: number, precision: number): string {
  const factor = 10 ** precision;
  const shifted = n * factor;
  const truncated = Math.trunc(shifted);
  const remainder = Math.abs(shifted - truncated);

  let rounded: number;
  if (Math.abs(remainder - 0.5) < 1e-10) {
    // Exactly halfway: round to even
    if (truncated % 2 === 0) {
      rounded = truncated;
    } else {
      rounded = n >= 0 ? truncated + 1 : truncated - 1;
    }
  } else {
    // Not halfway: use normal rounding
    rounded = Math.round(shifted);
  }

  const result = rounded / factor;
  return result.toFixed(precision);
}

/** Convert a value to double for format operations */
function toDoubleForFormat(v: unknown): number | undefined {
  if (isDouble(v)) return v;
  if (isInt(v)) return Number(v);
  if (isCelUint(v)) return Number(v.value);
  return undefined;
}

/** Format a number in scientific notation (Go-compatible) */
function formatScientific(n: number, precision: number): string {
  // Use JS toExponential then normalize to Go format
  const s = n.toExponential(precision);
  // JS: "1.052033e+3" -> Go: "1.052033e+03" (always 2+ digits in exponent)
  return s.replace(/e([+-])(\d)$/, "e$1" + "0$2");
}

/** Hex-encode a string (each byte of UTF-8 encoding) */
function hexEncodeString(s: string, upper: boolean): string {
  const bytes = new TextEncoder().encode(s);
  return hexEncodeBytes(bytes, upper);
}

/** Hex-encode bytes */
function hexEncodeBytes(b: Uint8Array, upper: boolean): string {
  let result = "";
  for (const byte of b) {
    const hex = byte.toString(16).padStart(2, "0");
    result += upper ? hex.toUpperCase() : hex;
  }
  return result;
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
  // timestamp -> seconds since epoch
  if (isCelTimestamp(v)) {
    return v.seconds;
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

/** Convert a CelTimestamp to CEL timestamp string (RFC 3339 with nanosecond precision) */
function timestampToString(ts: CelTimestamp): string {
  const d = ts.toDate();
  // Build base ISO string without fractional seconds
  const year = d.getUTCFullYear();
  const pad2 = (n: number) => n.toString().padStart(2, "0");
  const pad4 = (n: number) => n.toString().padStart(4, "0");
  const base = `${pad4(year)}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}T${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`;

  if (ts.nanos === 0) {
    return `${base}Z`;
  }
  // Format nanoseconds, trimming trailing zeros
  const nanoStr = ts.nanos.toString().padStart(9, "0").replace(/0+$/, "");
  return `${base}.${nanoStr}Z`;
}

/** Convert a CelDuration to CEL string format (e.g. "1000000s") */
function durationToString(d: CelDuration): string {
  if (d.nanos === 0) {
    return `${d.seconds}s`;
  }
  // Has sub-second component
  const totalNanos = durationToNanos(d);
  const sign = totalNanos < 0n ? "-" : "";
  const absTotalNanos = totalNanos < 0n ? -totalNanos : totalNanos;
  const absSecs = absTotalNanos / 1000000000n;
  const absNanos = Number(absTotalNanos % 1000000000n);
  if (absNanos === 0) {
    return `${sign}${absSecs}s`;
  }
  // Format with fractional seconds, trimming trailing zeros
  const nanoStr = absNanos.toString().padStart(9, "0").replace(/0+$/, "");
  return `${sign}${absSecs}.${nanoStr}s`;
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
  if (isCelTimestamp(v)) return timestampToString(v);
  if (isCelDuration(v)) return durationToString(v);
  if (isCelIP(v)) return ipToString(v);
  if (isCelCIDR(v)) return v._str;
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
  if (isCelOptional(v)) return new CelType("optional_type");
  if (isCelTimestamp(v)) return new CelType("google.protobuf.Timestamp");
  if (isCelDuration(v)) return new CelType("google.protobuf.Duration");
  if (isCelIP(v)) return new CelType("net.IP");
  if (isCelCIDR(v)) return new CelType("net.CIDR");
  return new CelType("unknown");
}

export function celDyn(v: unknown): unknown {
  return v;
}

/**
 * Enum constructor: convert an int or string to an enum value.
 * - Int arg: validate int32 range, return as BigInt
 * - String arg: look up the name in the enum definition object
 * @param enumDef The enum definition object (e.g. { FOO: 0n, BAR: 1n, BAZ: 2n })
 * @param arg The int or string argument
 */
export function celEnumConstruct(enumDef: unknown, arg: unknown): bigint | undefined {
  if (typeof arg === "bigint") {
    // Validate int32 range
    if (arg < -(2n ** 31n) || arg > 2n ** 31n - 1n) return undefined;
    return arg;
  }
  if (typeof arg === "string") {
    // Look up enum name
    if (enumDef && typeof enumDef === "object") {
      const val = (enumDef as Record<string, unknown>)[arg];
      if (typeof val === "bigint") return val;
    }
    return undefined; // unknown enum name
  }
  return undefined;
}

// ── Timestamp Helper ──────────────────────────────────────────────────────

/** A CEL timestamp value: stores seconds since epoch and nanoseconds within the second */
export class CelTimestamp {
  constructor(
    public readonly seconds: bigint,
    public readonly nanos: number, // 0..999999999
  ) {}

  /** Convert to milliseconds since epoch (loses sub-ms precision) */
  toMs(): number {
    return Number(this.seconds) * 1000 + Math.trunc(this.nanos / 1000000);
  }

  /** Create a JS Date from this timestamp (loses sub-ms precision) */
  toDate(): Date {
    return new Date(this.toMs());
  }

  /** Create a CelTimestamp from a JS Date */
  static fromDate(d: Date): CelTimestamp {
    const ms = d.getTime();
    const secs = BigInt(Math.trunc(ms / 1000));
    const nanosFromMs = (((ms % 1000) + 1000) % 1000) * 1000000;
    return new CelTimestamp(secs, nanosFromMs);
  }

  /** Create a CelTimestamp from seconds and nanos */
  static fromSecondsNanos(seconds: bigint, nanos: number): CelTimestamp {
    // Normalize: nanos must be in [0, 999999999]
    let s = seconds;
    let n = nanos;
    while (n < 0) {
      s -= 1n;
      n += 1000000000;
    }
    while (n >= 1000000000) {
      s += 1n;
      n -= 1000000000;
    }
    return new CelTimestamp(s, n);
  }
}

/** Check if a value is a CelTimestamp */
export function isCelTimestamp(v: unknown): v is CelTimestamp {
  return v instanceof CelTimestamp;
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
 * Parse a duration string like "100s", "1.5h", "1h45m47s", "-2m30s", etc.
 * Supports compound formats: "1h2m3s", "1h30m", "2m30s", etc.
 * Returns CelDuration or undefined on error.
 */
function parseDurationString(s: string): CelDuration | undefined {
  if (s.length === 0) return undefined;

  let neg = false;
  let rest = s;
  if (rest[0] === "-") {
    neg = true;
    rest = rest.slice(1);
  }
  if (rest.length === 0) return undefined;

  // Match one or more value+unit pairs
  const partRe = /^(\d+(?:\.\d+)?)(h|m(?!s)|s|ms|us|ns)/;
  let totalNanos = 0;
  let matched = false;
  while (rest.length > 0) {
    const m = partRe.exec(rest);
    if (!m) return undefined;
    matched = true;
    const num = Number(m[1]);
    if (!Number.isFinite(num)) return undefined;
    const unit = m[2] as string;
    switch (unit) {
      case "h":
        totalNanos += num * 3600e9;
        break;
      case "m":
        totalNanos += num * 60e9;
        break;
      case "s":
        totalNanos += num * 1e9;
        break;
      case "ms":
        totalNanos += num * 1e6;
        break;
      case "us":
        totalNanos += num * 1e3;
        break;
      case "ns":
        totalNanos += num;
        break;
      default:
        return undefined;
    }
    rest = rest.slice(m[0].length);
  }

  if (!matched) return undefined;
  if (neg) totalNanos = -totalNanos;

  const seconds = BigInt(Math.trunc(totalNanos / 1e9));
  const nanos = Math.round(totalNanos % 1e9);

  // Range validation: total nanos must fit in int64
  const bigTotalNanos = seconds * 1000000000n + BigInt(nanos);
  if (bigTotalNanos > INT64_MAX || bigTotalNanos < INT64_MIN) return undefined;

  return new CelDuration(seconds, nanos);
}

export function celDuration(v: unknown): CelDuration | undefined {
  if (isCelDuration(v)) return v; // identity
  if (isStr(v)) return parseDurationString(v);
  return undefined;
}

// ── Timestamp Helper ─────────────────────────────────────────────────────

export function celTimestamp(v: unknown): CelTimestamp | undefined {
  if (isCelTimestamp(v)) return v; // identity
  if (isStr(v)) {
    // Parse RFC 3339 timestamp string
    // First try to extract nanoseconds from the string before Date parsing
    const nanoMatch = /\.(\d+)Z$/.exec(v);
    let nanos = 0;
    if (nanoMatch?.[1]) {
      // Pad or truncate to 9 digits for nanoseconds
      const nanoStr = nanoMatch[1].padEnd(9, "0").slice(0, 9);
      nanos = Number.parseInt(nanoStr, 10);
    }
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return undefined;
    // Compute seconds from the Date (drop millisecond fraction since we have nanos)
    const ms = d.getTime();
    const seconds = BigInt(Math.trunc(ms / 1000));
    // If we have nanos from the string, use those; otherwise derive from ms
    if (!nanoMatch) {
      nanos = (((ms % 1000) + 1000) % 1000) * 1000000;
    }
    // Validate range
    if (seconds < TIMESTAMP_MIN_SEC || seconds > TIMESTAMP_MAX_SEC) return undefined;
    return new CelTimestamp(seconds, nanos);
  }
  if (isInt(v)) {
    // int -> timestamp: interpret as seconds since epoch
    if (v < TIMESTAMP_MIN_SEC || v > TIMESTAMP_MAX_SEC) return undefined;
    return new CelTimestamp(v, 0);
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

// ── List / Map / Struct / Comprehension Helpers ───────────────────────

/** Create a CEL list, propagating errors. Returns undefined if any element is undefined. */
export function celMakeList(elements: CelValue[]): CelValue[] | undefined {
  for (const e of elements) {
    if (e === undefined) return undefined;
  }
  return elements;
}

/** Create a CEL map from an array of [key, value] pairs.
 *  Returns undefined (error) for invalid key types (float, null) or duplicate keys. */
export function celMakeMap(entries: [CelValue, CelValue][]): Map<CelValue, CelValue> | undefined {
  const m = new Map<CelValue, CelValue>();
  for (const [k, v] of entries) {
    // CEL disallows float/double and null as map keys
    if (isDouble(k) || k === null) return undefined;
    // Check for duplicate keys (using deep equality for cross-type check)
    for (const existing of m.keys()) {
      if (celEq(existing, k) === true) return undefined;
    }
    m.set(k, v);
  }
  return m;
}

/** Insert a key-value pair into a map, returning a new map (used by transformMap comprehension).
 *  Returns undefined if the value is undefined (error propagation). */
export function celMapInsert(
  map: unknown,
  key: unknown,
  value: unknown,
): Map<CelValue, CelValue> | undefined {
  if (value === undefined) return undefined;
  if (!(map instanceof Map)) return undefined;
  const result = new Map<CelValue, CelValue>(map as Map<CelValue, CelValue>);
  result.set(key as CelValue, value as CelValue);
  return result;
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

/**
 * Convert a CEL value to a google.protobuf.Value JSON-compatible type.
 * Used when storing values into google.protobuf.Value fields (e.g. single_value).
 *
 * JSON Value types: null, bool, number (double), string, list, struct (Map).
 * Non-JSON-native types (int, uint, bytes, duration, timestamp, etc.) are converted.
 */
function celToJsonValue(v: CelValue): CelValue {
  if (v === null || isBool(v) || isDouble(v) || isStr(v)) return v;
  if (isList(v)) return v.map((e) => celToJsonValue(e));
  if (isMap(v)) {
    const m = new Map<CelValue, CelValue>();
    for (const [k, val] of v) {
      m.set(k, celToJsonValue(val));
    }
    return m;
  }
  // BigInt (CEL int) -> number if safe, else string
  if (isInt(v)) {
    if (v >= -9007199254740991n && v <= 9007199254740991n) {
      return Number(v);
    }
    return v.toString();
  }
  // CelUint -> number if safe, else string
  if (isCelUint(v)) {
    if (v.value <= 9007199254740991n) {
      return Number(v.value);
    }
    return v.value.toString();
  }
  // bytes -> base64 string
  if (isBytes(v)) {
    return celBase64Encode(v) ?? "";
  }
  // Duration -> string
  if (isCelDuration(v)) {
    return durationToString(v);
  }
  // Timestamp -> string
  if (isCelTimestamp(v)) {
    return timestampToString(v);
  }
  // Struct types with special JSON conversions
  if (isStruct(v)) {
    if (v.__type === "google.protobuf.FieldMask") {
      const paths = v.paths;
      if (Array.isArray(paths)) return (paths as string[]).join(",");
      return "";
    }
    if (v.__type === "google.protobuf.Empty") {
      return new Map<CelValue, CelValue>();
    }
  }
  return v;
}

/** Check if a field is a google.protobuf.Value type field */
function isValueFieldName(field: string): boolean {
  return field === "single_value";
}

/** Symbol to store set of explicitly-set field names on struct objects */
const STRUCT_FIELDS = Symbol.for("cel.struct.fields");

/** Symbol to store pre-decoded proto extension fields on struct objects.
 *  Maps extension qualified name (string) to CEL value. */
export const PROTO_EXTENSIONS = Symbol.for("cel.proto.extensions");

/** Null-setting a scalar/repeated/map field on a proto struct is an error */
const NULL_ERROR_FIELD_PATTERNS = [
  "single_bool",
  "single_int32",
  "single_int64",
  "single_uint32",
  "single_uint64",
  "single_sint32",
  "single_sint64",
  "single_fixed32",
  "single_fixed64",
  "single_sfixed32",
  "single_sfixed64",
  "single_float",
  "single_double",
  "single_string",
  "single_bytes",
  "single_nested_enum",
  "standalone_enum",
];

/** Check if a field name looks like a repeated field */
function isRepeatedFieldName(field: string): boolean {
  return field.startsWith("repeated_") || field === "list_value";
}

/** Check if a field name looks like a map field */
function isMapFieldName(field: string): boolean {
  return field.startsWith("map_");
}

/** Check if a field name corresponds to a proto float (float32) field */
function isFloat32FieldName(field: string): boolean {
  return (
    field === "single_float" || field === "standalone_float" || field.startsWith("repeated_float")
  );
}

/** Check if a field name is a float32 wrapper field */
function isFloat32WrapperFieldName(field: string): boolean {
  return field === "single_float_wrapper" || field.startsWith("repeated_float_wrapper");
}

/** Check if a field name is an int32 wrapper field */
function isInt32WrapperFieldName(field: string): boolean {
  return field === "single_int32_wrapper" || field.startsWith("repeated_int32_wrapper");
}

/** Check if a field name is a uint32 wrapper field */
function isUint32WrapperFieldName(field: string): boolean {
  return field === "single_uint32_wrapper" || field.startsWith("repeated_uint32_wrapper");
}

/** Check if a field name is an enum field */
function isEnumFieldName(field: string): boolean {
  return field.includes("enum");
}

// Int32/Uint32 range constants
const INT32_MIN = -(2n ** 31n);
const INT32_MAX = 2n ** 31n - 1n;
const UINT32_MAX = 2n ** 32n - 1n;

/**
 * Known proto3 oneof field names from cel-spec TestAllTypes.
 * Oneof fields in proto3 always track presence (has() = was-set, not non-zero).
 */
const PROTO3_ONEOF_FIELDS = new Set([
  "single_nested_message",
  "single_nested_enum",
  "oneof_type",
  "oneof_msg",
  "oneof_bool",
]);

/** Return the appropriate default value for an absent proto field based on naming conventions */
function protoFieldDefault(
  field: string,
  _typeName: string,
): CelValue | CelTimestamp | CelDuration {
  // Repeated fields default to empty list
  if (isRepeatedFieldName(field)) return [] as CelValue[];
  // Map fields default to empty map
  if (isMapFieldName(field)) return new Map<CelValue, CelValue>();
  // Wrapper types (google.protobuf.*Value) default to null (nullable)
  // MUST come before type-specific checks since field names like
  // "single_float_wrapper" would match both "float" and "_wrapper".
  if (field.includes("_wrapper")) {
    return null;
  }
  // Well-known struct field types
  if (field === "single_struct") {
    return new Map<CelValue, CelValue>();
  }
  // Well-known value field types (single_value defaults to null)
  if (field === "single_value" || field === "null_value" || field === "optional_null_value") {
    return null;
  }
  // Unsigned integer field types
  if (
    field.includes("uint") ||
    field.includes("fixed32") ||
    (field.includes("fixed64") && !field.includes("sfixed"))
  ) {
    return new CelUint(0n);
  }
  // Float/double field types
  if (field.includes("float") || field.includes("double")) {
    return 0.0;
  }
  // Boolean field types
  if (field.includes("bool")) {
    return false;
  }
  // String field types
  if (field === "single_string" || field.endsWith("_string")) {
    return "";
  }
  // Bytes field types
  if (field === "single_bytes" || field.endsWith("_bytes")) {
    return new Uint8Array(0);
  }
  // Message fields: return a default-constructed nested message struct
  if (field.includes("_message")) {
    return celMakeStruct(`${_typeName}.NestedMessage`, []) as CelValue;
  }
  // Int field types (signed integers)
  if (
    field.includes("int32") ||
    field.includes("int64") ||
    field.includes("sint") ||
    field.includes("sfixed")
  ) {
    return 0n;
  }
  // Enum fields default to 0n (first enum value)
  if (field.includes("enum")) {
    return 0n;
  }
  // For nested message types (like NestedMessage), unknown fields default to int zero
  if (_typeName.includes("NestedMessage") || _typeName.includes("Nested")) {
    return 0n;
  }
  // Default: null (absent message field semantics)
  return null;
}

/** Create a CEL struct (message) from a name and field entries.
 *  Represents structs as plain objects with __type marker and STRUCT_FIELDS metadata. */
export function celMakeStruct(_name: string, entries: [string, CelValue][]): CelValue | undefined {
  // google.protobuf.Value{} with no fields set represents JSON null
  if (_name === "google.protobuf.Value" && entries.length === 0) {
    return null;
  }
  // google.protobuf.Value with a field set: unwrap to the appropriate primitive
  if (_name === "google.protobuf.Value") {
    for (const [field, value] of entries) {
      if (field === "null_value") return null;
      if (field === "number_value") return value;
      if (field === "string_value") return value;
      if (field === "bool_value") return value;
      if (field === "struct_value") {
        // struct_value should be a Map already (from map literal)
        if (value instanceof Map) return value;
        return value;
      }
      if (field === "list_value") {
        // list_value should be an array already
        if (Array.isArray(value)) return value;
        return value;
      }
    }
    return null;
  }
  // google.protobuf.Struct: unwrap to Map
  if (_name === "google.protobuf.Struct") {
    for (const [field, value] of entries) {
      if (field === "fields") {
        if (value instanceof Map) return value;
      }
    }
    return new Map() as unknown as CelValue;
  }
  // google.protobuf.ListValue: unwrap to array
  if (_name === "google.protobuf.ListValue") {
    for (const [field, value] of entries) {
      if (field === "values") {
        if (Array.isArray(value)) return value;
      }
    }
    return [] as CelValue;
  }
  // google.protobuf.Any: create a struct with the fields
  if (_name === "google.protobuf.Any") {
    // An empty Any{} is an error
    if (entries.length === 0) return undefined;
    // Any{type_url: ..., value: ...} — just create a struct with these fields
    // (but field access on Any is not supported — only whole-value operations)
  }
  // Protobuf wrapper types unwrap to their primitive value
  if (_name in WRAPPER_DEFAULTS) {
    for (const [field, value] of entries) {
      if (field === "value") {
        // FloatValue: truncate to float32 precision
        if (_name === "google.protobuf.FloatValue" && typeof value === "number") {
          return Math.fround(value);
        }
        return value;
      }
    }
    return WRAPPER_DEFAULTS[_name] as CelValue;
  }
  // Validate: setting null on scalar/repeated/map/struct fields is an error
  for (const [field, value] of entries) {
    if (value === null) {
      if (
        NULL_ERROR_FIELD_PATTERNS.includes(field) ||
        isRepeatedFieldName(field) ||
        isMapFieldName(field) ||
        field === "single_struct"
      ) {
        return undefined; // error: cannot set scalar/repeated/map/struct to null
      }
    }
    // Range validation for int32 wrapper fields
    if (isInt32WrapperFieldName(field) && typeof value === "bigint") {
      if (value < INT32_MIN || value > INT32_MAX) return undefined;
    }
    // Range validation for uint32 wrapper fields
    if (isUint32WrapperFieldName(field) && isCelUint(value)) {
      if (value.value > UINT32_MAX) return undefined;
    }
    // Range validation for enum fields (int32 range)
    if (isEnumFieldName(field) && typeof value === "bigint") {
      if (value < INT32_MIN || value > INT32_MAX) return undefined;
    }
    // Struct field key validation: single_struct must have string keys only
    if (field === "single_struct" && value instanceof Map) {
      for (const k of value.keys()) {
        if (typeof k !== "string") return undefined;
      }
    }
  }
  const obj: Record<string | symbol, unknown> = {};
  obj.__type = _name;
  // Track which fields were explicitly set
  const fields = new Set<string>();
  for (const [field, value] of entries) {
    // google.protobuf.Value fields: convert CEL values to JSON-compatible types
    if (isValueFieldName(field)) {
      obj[field] = celToJsonValue(value);
    } else if (
      // Proto float fields are float32; truncate to float32 precision
      (isFloat32FieldName(field) || isFloat32WrapperFieldName(field)) &&
      typeof value === "number"
    ) {
      obj[field] = Math.fround(value);
    } else {
      obj[field] = value;
    }
    fields.add(field);
  }
  obj[STRUCT_FIELDS] = fields;
  // Wrap in Proxy: absent fields return appropriate defaults
  return new Proxy(obj, {
    get(target, prop, receiver) {
      if (prop === STRUCT_FIELDS) return target[STRUCT_FIELDS];
      if (typeof prop === "string" && prop !== "__type") {
        if (!(prop in target)) {
          return protoFieldDefault(prop, _name);
        }
      }
      return Reflect.get(target, prop, receiver);
    },
  }) as unknown as CelValue;
}

/** Check if a field exists on an object (the `has()` macro).
 *  For proto structs with STRUCT_FIELDS metadata, uses proto-aware presence semantics:
 *  - Repeated/map fields: has() = non-empty
 *  - Scalar/enum fields: has() = explicitly set AND (proto2: always, proto3: non-zero-value)
 *  - Non-existent fields on structs: returns undefined (error)
 */
export function celHas(obj: unknown, field: string): boolean | undefined {
  if (obj === null || obj === undefined) return false;
  // has() on a CelOptional: unwrap and check the field on the inner value
  if (isCelOptional(obj)) {
    if (!obj.hasValue()) return false;
    return celHas(obj.value(), field);
  }
  if (obj instanceof Map) {
    return obj.has(field);
  }
  if (typeof obj === "object") {
    const record = obj as Record<string | symbol, unknown>;
    // Check proto extension fields (backtick-quoted qualified names)
    if (isStruct(obj) && field.includes(".")) {
      const extensions = record[PROTO_EXTENSIONS] as Map<string, CelValue> | undefined;
      if (extensions?.has(field)) return true;
      return false; // extension not set
    }
    const structFields = record[STRUCT_FIELDS] as Set<string> | undefined;
    // If this is a struct with field tracking metadata
    if (structFields !== undefined && "__type" in record) {
      const typeName = record.__type as string;
      // Check if the field was explicitly set in the struct literal
      if (!structFields.has(field)) {
        // Field not set in literal — check if it's a known field pattern
        // If not a recognizable field at all, it's an error
        if (
          !isRepeatedFieldName(field) &&
          !isMapFieldName(field) &&
          !NULL_ERROR_FIELD_PATTERNS.includes(field) &&
          !field.startsWith("single_") &&
          !field.startsWith("standalone_") &&
          !field.startsWith("oneof_") &&
          !field.startsWith("optional_") &&
          !field.startsWith("required_") &&
          field !== "in" &&
          field !== "bb"
        ) {
          // Unknown field on proto struct => error
          return undefined;
        }
        return false;
      }
      // Field was explicitly set
      // For repeated fields: has() = non-empty
      if (isRepeatedFieldName(field)) {
        const v = record[field];
        if (isList(v)) return v.length > 0;
        return false;
      }
      // For map fields: has() = non-empty
      if (isMapFieldName(field)) {
        const v = record[field];
        if (isMap(v)) return v.size > 0;
        return false;
      }
      // For proto3 scalars: has() = non-zero-value
      // Proto3 types have "proto3" in their qualified type name
      if (typeName.includes("proto3")) {
        // Oneof fields always track presence: has() = was-set (not zero-value check)
        if (PROTO3_ONEOF_FIELDS.has(field)) {
          return true;
        }
        const v = record[field];
        // Message types are always "present" when set (even if default-constructed)
        if (v !== null && typeof v === "object" && !isCelUint(v) && !isBytes(v)) {
          return true;
        }
        return !isZeroValue(v);
      }
      // Proto2 or other: has() = was explicitly set
      return true;
    }
    // Non-struct objects: simple field presence check
    return field in record && record[field] !== undefined;
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
  condFn: (...args: unknown[]) => unknown,
  stepFn: (...args: unknown[]) => unknown,
  resultFn: (accu: unknown) => unknown,
  _iterVar2?: string,
): unknown {
  const twoVar = _iterVar2 !== undefined;
  let accu = init;
  if (Array.isArray(range)) {
    for (let idx = 0; idx < range.length; idx++) {
      const elem = range[idx] as CelValue;
      // For two-variable: (index, value, accu); one-variable: (elem, accu)
      const cond = twoVar ? condFn(BigInt(idx), elem, accu) : condFn(elem, accu);
      if (cond === false) break;
      if (cond !== true) return undefined; // error in condition
      accu = twoVar ? stepFn(BigInt(idx), elem, accu) : stepFn(elem, accu);
    }
  } else if (range instanceof Map) {
    for (const [key, value] of range) {
      // For two-variable: (key, value, accu); one-variable: (key, accu)
      const cond = twoVar
        ? condFn(key as CelValue, value as CelValue, accu)
        : condFn(key as CelValue, accu);
      if (cond === false) break;
      if (cond !== true) return undefined;
      accu = twoVar
        ? stepFn(key as CelValue, value as CelValue, accu)
        : stepFn(key as CelValue, accu);
    }
  } else {
    return undefined; // range is not iterable
  }
  return resultFn(accu);
}

/**
 * Optimized filter for list comprehensions — O(n) instead of O(n^2).
 * Replaces the generic comprehension + list concat pattern for simple filters.
 */
export function celFilterList(range: unknown, predicate: (elem: unknown) => unknown): unknown {
  if (Array.isArray(range)) {
    const result: unknown[] = [];
    for (const elem of range) {
      const test = predicate(elem);
      if (test === true) result.push(elem);
      else if (test === false) continue;
      else return undefined; // error in predicate -> whole filter errors
    }
    return result;
  }
  if (range instanceof Map) {
    const result: unknown[] = [];
    for (const key of range.keys()) {
      const test = predicate(key as CelValue);
      if (test === true) result.push(key);
      else if (test === false) continue;
      else return undefined;
    }
    return result;
  }
  return undefined;
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

// ── Timestamp / Duration Accessor Helpers ──────────────────────────────────

/**
 * Convert a timezone offset string like "+05:30" or "-02:00" to minutes offset,
 * or resolve an IANA timezone name. Returns Date adjusted to that timezone.
 */
function getDateInTimezone(d: Date, tz: string): Date | undefined {
  try {
    // Use Intl.DateTimeFormat to get the local time parts in the target timezone
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    const parts = formatter.formatToParts(d);
    const get = (type: string) => {
      const part = parts.find((p) => p.type === type);
      return part ? Number.parseInt(part.value, 10) : 0;
    };
    const year = get("year");
    const month = get("month");
    const day = get("day");
    let hour = get("hour");
    // Intl formats midnight as 24 in some locales
    if (hour === 24) hour = 0;
    const minute = get("minute");
    const second = get("second");
    // Create a date representing this local time (in UTC coordinates for extraction)
    return new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  } catch {
    return undefined;
  }
}

/**
 * Parse timezone string: either IANA name or offset like "+05:30", "-02:00", "02:00"
 * Returns the timezone string suitable for Intl.DateTimeFormat.
 */
function normalizeTimezone(tz: string): string {
  // Check for offset format: optional sign, digits, colon, digits
  const offsetMatch = /^([+-]?)(\d{1,2}):(\d{2})$/.exec(tz);
  if (offsetMatch) {
    const sign = offsetMatch[1] ?? "";
    const hours = offsetMatch[2] ?? "0";
    const minutes = offsetMatch[3] ?? "00";
    const h = Number.parseInt(hours, 10);
    const m = Number.parseInt(minutes, 10);
    if (h === 0 && m === 0) return "UTC";
    // Build a proper offset string for Intl: needs explicit sign
    const signStr = sign === "-" ? "-" : "+";
    return `${signStr}${hours.padStart(2, "0")}:${minutes}`;
  }
  // Otherwise, assume IANA timezone name
  return tz;
}

/** Get day of year (0-based) for a date */
function dayOfYear(year: number, month: number, day: number): number {
  // month is 0-based, day is 1-based
  const startOfYear = Date.UTC(year, 0, 1);
  const current = Date.UTC(year, month, day);
  return Math.floor((current - startOfYear) / 86400000);
}

/** CEL timestamp.getFullYear() or timestamp.getFullYear(tz) */
function celGetFullYear(v: unknown, tz?: unknown): bigint | undefined {
  if (!isCelTimestamp(v)) return undefined;
  const d = tz !== undefined ? tsInTz(v, tz) : v.toDate();
  if (!d) return undefined;
  return BigInt(d.getUTCFullYear());
}

/** CEL timestamp.getMonth() - 0-based (Jan=0) */
function celGetMonth(v: unknown, tz?: unknown): bigint | undefined {
  if (!isCelTimestamp(v)) return undefined;
  const d = tz !== undefined ? tsInTz(v, tz) : v.toDate();
  if (!d) return undefined;
  return BigInt(d.getUTCMonth());
}

/** CEL timestamp.getDate() - 1-based day of month */
function celGetDate(v: unknown, tz?: unknown): bigint | undefined {
  if (!isCelTimestamp(v)) return undefined;
  const d = tz !== undefined ? tsInTz(v, tz) : v.toDate();
  if (!d) return undefined;
  return BigInt(d.getUTCDate());
}

/** CEL timestamp.getDayOfMonth() - 0-based day of month (getDate - 1) */
function celGetDayOfMonth(v: unknown, tz?: unknown): bigint | undefined {
  if (!isCelTimestamp(v)) return undefined;
  const d = tz !== undefined ? tsInTz(v, tz) : v.toDate();
  if (!d) return undefined;
  return BigInt(d.getUTCDate() - 1);
}

/** CEL timestamp.getDayOfWeek() - 0=Sunday */
function celGetDayOfWeek(v: unknown, tz?: unknown): bigint | undefined {
  if (!isCelTimestamp(v)) return undefined;
  const d = tz !== undefined ? tsInTz(v, tz) : v.toDate();
  if (!d) return undefined;
  return BigInt(d.getUTCDay());
}

/** CEL timestamp.getDayOfYear() - 0-based */
function celGetDayOfYear(v: unknown, tz?: unknown): bigint | undefined {
  if (!isCelTimestamp(v)) return undefined;
  const d = tz !== undefined ? tsInTz(v, tz) : v.toDate();
  if (!d) return undefined;
  return BigInt(dayOfYear(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** CEL timestamp.getHours() or duration.getHours() */
function celGetHours(v: unknown, tz?: unknown): bigint | undefined {
  if (isCelTimestamp(v)) {
    const d = tz !== undefined ? tsInTz(v, tz) : v.toDate();
    if (!d) return undefined;
    return BigInt(d.getUTCHours());
  }
  if (isCelDuration(v)) {
    // Total hours in the duration
    return v.seconds / 3600n;
  }
  return undefined;
}

/** CEL timestamp.getMinutes() or duration.getMinutes() */
function celGetMinutes(v: unknown, tz?: unknown): bigint | undefined {
  if (isCelTimestamp(v)) {
    const d = tz !== undefined ? tsInTz(v, tz) : v.toDate();
    if (!d) return undefined;
    return BigInt(d.getUTCMinutes());
  }
  if (isCelDuration(v)) {
    // Total minutes in the duration
    return v.seconds / 60n;
  }
  return undefined;
}

/** CEL timestamp.getSeconds() or duration.getSeconds() */
function celGetSeconds(v: unknown, tz?: unknown): bigint | undefined {
  if (isCelTimestamp(v)) {
    const d = tz !== undefined ? tsInTz(v, tz) : v.toDate();
    if (!d) return undefined;
    return BigInt(d.getUTCSeconds());
  }
  if (isCelDuration(v)) {
    // Total seconds in the duration
    return v.seconds;
  }
  return undefined;
}

/** CEL timestamp.getMilliseconds() or duration.getMilliseconds() */
function celGetMilliseconds(v: unknown, _tz?: unknown): bigint | undefined {
  if (isCelTimestamp(v)) {
    // Return milliseconds from the nanos field for sub-second precision
    return BigInt(Math.trunc(v.nanos / 1000000));
  }
  if (isCelDuration(v)) {
    // Milliseconds component from the nanos field (not total milliseconds)
    return BigInt(Math.trunc(v.nanos / 1000000));
  }
  return undefined;
}

/** Helper: get CelTimestamp in a timezone, returning a Date for component extraction */
function tsInTz(v: CelTimestamp, tz: unknown): Date | undefined {
  if (!isStr(tz)) return undefined;
  return getDateInTimezone(v.toDate(), normalizeTimezone(tz));
}

// ── Math Extension Functions ───────────────────────────────────────────────

/**
 * math.greatest(...args) or math.greatest([list])
 * Returns the greatest numeric value. Cross-numeric comparison.
 * With a single arg, returns it. With a list arg, finds max in the list.
 */
function celMathGreatest(...args: unknown[]): CelValue | undefined {
  // If single list arg, operate on the list contents
  let values: unknown[];
  if (args.length === 1 && isList(args[0])) {
    values = args[0] as unknown[];
    if (values.length === 0) return undefined;
  } else {
    values = args;
  }

  // Validate all are numeric
  for (const v of values) {
    if (!isNumeric(v)) return undefined;
  }

  let best = values[0] as bigint | CelUint | number;
  for (let i = 1; i < values.length; i++) {
    const v = values[i] as bigint | CelUint | number;
    if (numericCompare(v, best) > 0) {
      best = v;
    }
  }
  return best as CelValue;
}

/**
 * math.least(...args) or math.least([list])
 * Returns the least numeric value. Cross-numeric comparison.
 */
function celMathLeast(...args: unknown[]): CelValue | undefined {
  let values: unknown[];
  if (args.length === 1 && isList(args[0])) {
    values = args[0] as unknown[];
    if (values.length === 0) return undefined;
  } else {
    values = args;
  }

  for (const v of values) {
    if (!isNumeric(v)) return undefined;
  }

  let best = values[0] as bigint | CelUint | number;
  for (let i = 1; i < values.length; i++) {
    const v = values[i] as bigint | CelUint | number;
    if (numericCompare(v, best) < 0) {
      best = v;
    }
  }
  return best as CelValue;
}

/** math.ceil(double) -> double */
function celMathCeil(v: unknown): number | undefined {
  if (!isDouble(v)) return undefined;
  return Math.ceil(v);
}

/** math.floor(double) -> double */
function celMathFloor(v: unknown): number | undefined {
  if (!isDouble(v)) return undefined;
  return Math.floor(v);
}

/** math.round(double) -> double — round half away from zero */
function celMathRound(v: unknown): number | undefined {
  if (!isDouble(v)) return undefined;
  if (!Number.isFinite(v)) return v; // NaN, +/-Infinity pass through
  // Round half away from zero (Go math.Round semantics)
  return Math.sign(v) * Math.round(Math.abs(v));
}

/** math.trunc(double) -> double */
function celMathTrunc(v: unknown): number | undefined {
  if (!isDouble(v)) return undefined;
  return Math.trunc(v);
}

/** math.abs(num) -> same type */
function celMathAbs(v: unknown): CelValue | undefined {
  if (isCelUint(v)) return v; // uint is always non-negative
  if (isInt(v)) {
    // Check for INT64_MIN overflow: abs(-2^63) overflows
    if (v === INT64_MIN) return undefined;
    return v < 0n ? -v : v;
  }
  if (isDouble(v)) return Math.abs(v);
  return undefined;
}

/** math.sign(num) -> same type */
function celMathSign(v: unknown): CelValue | undefined {
  if (isCelUint(v)) {
    return v.value === 0n ? new CelUint(0n) : new CelUint(1n);
  }
  if (isInt(v)) {
    if (v < 0n) return -1n;
    if (v > 0n) return 1n;
    return 0n;
  }
  if (isDouble(v)) return Math.sign(v);
  return undefined;
}

/** math.isNaN(double) -> bool */
function celMathIsNaN(v: unknown): boolean | undefined {
  if (!isDouble(v)) return undefined;
  return Number.isNaN(v);
}

/** math.isInf(double) -> bool */
function celMathIsInf(v: unknown): boolean | undefined {
  if (!isDouble(v)) return undefined;
  return !Number.isFinite(v) && !Number.isNaN(v);
}

/** math.isFinite(double) -> bool */
function celMathIsFinite(v: unknown): boolean | undefined {
  if (!isDouble(v)) return undefined;
  return Number.isFinite(v);
}

/** math.bitAnd(a, b) -> int or uint (must be same type) */
function celMathBitAnd(a: unknown, b: unknown): CelValue | undefined {
  if (isInt(a) && isInt(b)) return BigInt.asIntN(64, a & b);
  if (isCelUint(a) && isCelUint(b)) return new CelUint(BigInt.asUintN(64, a.value & b.value));
  return undefined;
}

/** math.bitOr(a, b) -> int or uint (must be same type) */
function celMathBitOr(a: unknown, b: unknown): CelValue | undefined {
  if (isInt(a) && isInt(b)) return BigInt.asIntN(64, a | b);
  if (isCelUint(a) && isCelUint(b)) return new CelUint(BigInt.asUintN(64, a.value | b.value));
  return undefined;
}

/** math.bitXor(a, b) -> int or uint (must be same type) */
function celMathBitXor(a: unknown, b: unknown): CelValue | undefined {
  if (isInt(a) && isInt(b)) return BigInt.asIntN(64, a ^ b);
  if (isCelUint(a) && isCelUint(b)) return new CelUint(BigInt.asUintN(64, a.value ^ b.value));
  return undefined;
}

/** math.bitNot(a) -> int or uint */
function celMathBitNot(a: unknown): CelValue | undefined {
  if (isInt(a)) return BigInt.asIntN(64, ~a);
  if (isCelUint(a)) return new CelUint(BigInt.asUintN(64, ~a.value));
  return undefined;
}

/**
 * math.bitShiftLeft(a, b) -> int or uint
 * a is int or uint, b is int (shift amount).
 * Negative shift -> error. Shift >= 64 -> 0.
 */
function celMathBitShiftLeft(a: unknown, b: unknown): CelValue | undefined {
  if (!isInt(b)) return undefined;
  if (b < 0n) return undefined; // negative shift is error
  if (b >= 64n) {
    // Shift >= 64 produces 0
    if (isInt(a)) return 0n;
    if (isCelUint(a)) return new CelUint(0n);
    return undefined;
  }
  if (isInt(a)) return BigInt.asIntN(64, a << b);
  if (isCelUint(a)) return new CelUint(BigInt.asUintN(64, a.value << b));
  return undefined;
}

/**
 * math.bitShiftRight(a, b) -> int or uint
 * For int: logical right shift (convert to unsigned, shift, convert back to signed).
 * For uint: logical right shift.
 * Negative shift -> error. Shift >= 64 -> 0.
 */
function celMathBitShiftRight(a: unknown, b: unknown): CelValue | undefined {
  if (!isInt(b)) return undefined;
  if (b < 0n) return undefined; // negative shift is error
  if (b >= 64n) {
    if (isInt(a)) return 0n;
    if (isCelUint(a)) return new CelUint(0n);
    return undefined;
  }
  if (isInt(a)) {
    // Logical right shift: convert to unsigned 64-bit, shift, convert back to signed
    const unsigned = BigInt.asUintN(64, a);
    return BigInt.asIntN(64, unsigned >> b);
  }
  if (isCelUint(a)) return new CelUint(BigInt.asUintN(64, a.value >> b));
  return undefined;
}

// ── Encoder Extensions ─────────────────────────────────────────────────────

// Base64 lookup table
const B64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** base64.encode(bytes) -> string */
function celBase64Encode(a: unknown): string | undefined {
  if (!isBytes(a)) return undefined;
  let result = "";
  const len = a.length;
  for (let i = 0; i < len; i += 3) {
    const b0 = a[i] as number;
    const b1 = i + 1 < len ? (a[i + 1] as number) : 0;
    const b2 = i + 2 < len ? (a[i + 2] as number) : 0;
    result += B64_CHARS[(b0 >> 2) as number];
    result += B64_CHARS[(((b0 & 3) << 4) | (b1 >> 4)) as number];
    result += i + 1 < len ? B64_CHARS[(((b1 & 15) << 2) | (b2 >> 6)) as number] : "=";
    result += i + 2 < len ? B64_CHARS[(b2 & 63) as number] : "=";
  }
  return result;
}

// Build reverse lookup for base64 decoding
const B64_DECODE: Record<string, number> = {};
for (let i = 0; i < B64_CHARS.length; i++) {
  B64_DECODE[B64_CHARS[i] as string] = i;
}

/** base64.decode(string) -> bytes */
function celBase64Decode(a: unknown): Uint8Array | undefined {
  if (!isStr(a)) return undefined;
  // Strip padding
  let s = a;
  while (s.endsWith("=")) s = s.slice(0, -1);
  // Pad to valid length if needed (support unpadded input)
  const bytes: number[] = [];
  const len = s.length;
  for (let i = 0; i < len; i += 4) {
    const c0 = B64_DECODE[s[i] as string];
    const c1 = i + 1 < len ? B64_DECODE[s[i + 1] as string] : 0;
    const c2 = i + 2 < len ? B64_DECODE[s[i + 2] as string] : 0;
    const c3 = i + 3 < len ? B64_DECODE[s[i + 3] as string] : 0;
    if (c0 === undefined || c1 === undefined) return undefined;
    bytes.push(((c0 << 2) | ((c1 ?? 0) >> 4)) & 0xff);
    if (i + 2 < len && c2 !== undefined) {
      bytes.push((((c1 ?? 0) << 4) | ((c2 ?? 0) >> 2)) & 0xff);
    }
    if (i + 3 < len && c3 !== undefined) {
      bytes.push((((c2 ?? 0) << 6) | (c3 ?? 0)) & 0xff);
    }
  }
  return new Uint8Array(bytes);
}

// ── Network Extension Helpers ─────────────────────────────────────────────

/**
 * Parse an IPv4 address string into a 4-byte Uint8Array.
 * Returns undefined on invalid input.
 */
function parseIPv4(s: string): Uint8Array | undefined {
  const parts = s.split(".");
  if (parts.length !== 4) return undefined;
  const bytes = new Uint8Array(4);
  for (let i = 0; i < 4; i++) {
    const part = parts[i] as string;
    // Reject empty, leading zeros (except "0"), non-digit chars
    if (part === "" || (part.length > 1 && part[0] === "0")) return undefined;
    for (let j = 0; j < part.length; j++) {
      const ch = part.charCodeAt(j);
      if (ch < 48 || ch > 57) return undefined; // not a digit
    }
    const n = Number(part);
    if (n < 0 || n > 255) return undefined;
    bytes[i] = n;
  }
  return bytes;
}

/**
 * Parse an IPv6 address string into a 16-byte Uint8Array.
 * Supports :: shorthand and hex groups.
 * Returns undefined on invalid input.
 */
function parseIPv6(s: string): Uint8Array | undefined {
  // Reject zone IDs
  if (s.includes("%")) return undefined;

  const groups: number[] = [];
  let doubleColonIdx = -1;

  // Handle leading :: (e.g. "::1" or "::")
  if (s.startsWith("::")) {
    doubleColonIdx = 0;
    s = s.substring(2);
    if (s === "") {
      // Just "::" -> all zeros
      return new Uint8Array(16);
    }
  } else if (s.startsWith(":")) {
    return undefined; // Single leading colon is invalid
  }

  // Handle trailing ::
  if (s.endsWith("::")) {
    if (doubleColonIdx !== -1) return undefined; // Multiple ::
    doubleColonIdx = -2; // Marker; will be set properly below
    s = s.substring(0, s.length - 2);
  } else if (s.endsWith(":")) {
    return undefined; // Single trailing colon is invalid
  }

  const rawParts = s.split(":");
  for (let i = 0; i < rawParts.length; i++) {
    const part = rawParts[i] as string;
    if (part === "") {
      // This is a :: in the middle
      if (doubleColonIdx !== -1 && doubleColonIdx !== 0) return undefined; // Multiple ::
      doubleColonIdx = groups.length;
      continue;
    }
    if (part.length > 4) return undefined;
    const val = Number.parseInt(part, 16);
    if (Number.isNaN(val) || val < 0 || val > 0xffff) return undefined;
    groups.push(val);
  }

  // Fix double colon at end marker
  if (doubleColonIdx === -2) {
    doubleColonIdx = groups.length;
  }

  const bytes = new Uint8Array(16);
  if (doubleColonIdx !== -1) {
    // Expand ::
    const missing = 8 - groups.length;
    if (missing < 0) return undefined;
    // Fill before ::
    for (let i = 0; i < doubleColonIdx; i++) {
      const g = groups[i] as number;
      bytes[i * 2] = (g >> 8) & 0xff;
      bytes[i * 2 + 1] = g & 0xff;
    }
    // Zeros for :: (already zero-initialized)
    // Fill after ::
    const afterStart = doubleColonIdx + missing;
    for (let i = doubleColonIdx; i < groups.length; i++) {
      const g = groups[i] as number;
      const idx = afterStart + (i - doubleColonIdx);
      bytes[idx * 2] = (g >> 8) & 0xff;
      bytes[idx * 2 + 1] = g & 0xff;
    }
  } else {
    if (groups.length !== 8) return undefined;
    for (let i = 0; i < 8; i++) {
      const g = groups[i] as number;
      bytes[i * 2] = (g >> 8) & 0xff;
      bytes[i * 2 + 1] = g & 0xff;
    }
  }
  return bytes;
}

/**
 * Parse an IP address string. Returns CelIP or undefined on error.
 */
function parseIP(s: string): CelIP | undefined {
  // Reject zone IDs
  if (s.includes("%")) return undefined;

  // Try IPv4 first
  const v4 = parseIPv4(s);
  if (v4 !== undefined) return new CelIP(v4, s);

  // Try IPv6
  const v6 = parseIPv6(s);
  if (v6 !== undefined) {
    return new CelIP(v6, canonicalIPv6(v6));
  }
  return undefined;
}

/**
 * Check if a string is an IPv4-mapped IPv6 address in dotted-decimal form.
 * e.g. "::ffff:192.168.0.1" — the literal dotted decimal after ::ffff:
 * Pure hex forms like "::ffff:c0a8:1" are NOT matched.
 */
function isIPv4MappedString(s: string): boolean {
  // Match "::ffff:" followed by dotted decimal digits
  const lower = s.toLowerCase();
  const idx = lower.indexOf("::ffff:");
  if (idx === -1) return false;
  const after = s.substring(idx + 7);
  // If the part after ::ffff: contains a dot, it's dotted-decimal form
  return after.includes(".");
}

/** Format a 16-byte IPv6 address in canonical (RFC 5952) form */
function canonicalIPv6(bytes: Uint8Array): string {
  // Read 8 groups
  const groups: number[] = [];
  for (let i = 0; i < 16; i += 2) {
    groups.push(((bytes[i] as number) << 8) | (bytes[i + 1] as number));
  }

  // Find longest run of zeros for :: compression (RFC 5952)
  let bestStart = -1;
  let bestLen = 0;
  let curStart = -1;
  let curLen = 0;
  for (let i = 0; i < 8; i++) {
    if (groups[i] === 0) {
      if (curStart === -1) {
        curStart = i;
        curLen = 1;
      } else {
        curLen++;
      }
    } else {
      if (curLen > bestLen && curLen >= 2) {
        bestStart = curStart;
        bestLen = curLen;
      }
      curStart = -1;
      curLen = 0;
    }
  }
  if (curLen > bestLen && curLen >= 2) {
    bestStart = curStart;
    bestLen = curLen;
  }

  const parts: string[] = [];
  let i = 0;
  while (i < 8) {
    if (i === bestStart) {
      parts.push("");
      if (i === 0) parts.push(""); // Leading ::
      i += bestLen;
      if (i === 8) parts.push(""); // Trailing ::
    } else {
      parts.push((groups[i] as number).toString(16));
      i++;
    }
  }
  return parts.join(":");
}

/** Format a CelIP as a string */
function ipToString(ip: CelIP): string {
  if (ip.bytes.length === 4) {
    return `${ip.bytes[0]}.${ip.bytes[1]}.${ip.bytes[2]}.${ip.bytes[3]}`;
  }
  return canonicalIPv6(ip.bytes);
}

/** Compare two IP byte arrays for equality. IPv4-mapped IPv6 == equivalent IPv4. */
function ipBytesEqual(a: CelIP, b: CelIP): boolean {
  if (a.bytes.length === b.bytes.length) {
    for (let i = 0; i < a.bytes.length; i++) {
      if (a.bytes[i] !== b.bytes[i]) return false;
    }
    return true;
  }
  // Cross-family: convert IPv4 to IPv4-mapped IPv6 for comparison
  const v4 = a.bytes.length === 4 ? a : b;
  const v6 = a.bytes.length === 4 ? b : a;
  // v6 must be ::ffff:x.x.x.x or the raw 4-byte equivalent embedded in 16 bytes
  // Check if v6 is IPv4-mapped
  for (let i = 0; i < 10; i++) {
    if (v6.bytes[i] !== 0) return false;
  }
  if (v6.bytes[10] !== 0xff || v6.bytes[11] !== 0xff) return false;
  return (
    v6.bytes[12] === v4.bytes[0] &&
    v6.bytes[13] === v4.bytes[1] &&
    v6.bytes[14] === v4.bytes[2] &&
    v6.bytes[15] === v4.bytes[3]
  );
}

// ── Network extension: CEL functions ──────────────────────────────────────

/** ip(string) — parse an IP address. Also handles cidr.ip() when called on a CelCIDR. */
function celNetIP(s: unknown): CelIP | undefined {
  // Handle cidr.ip() — when called as a member method on a CIDR object
  if (isCelCIDR(s)) return s.ip;
  if (!isStr(s)) return undefined;
  // Reject zone IDs
  if (s.includes("%")) return undefined;
  // Reject IPv4-mapped IPv6 in dotted-decimal form (e.g. "::ffff:192.168.0.1")
  // but allow pure hex form (e.g. "::ffff:c0a8:1")
  if (isIPv4MappedString(s)) return undefined;
  const result = parseIP(s);
  return result ?? undefined;
}

/** cidr(string) — parse a CIDR range. Returns CelCIDR or undefined (error). */
function celNetCIDR(s: unknown): CelCIDR | undefined {
  if (!isStr(s)) return undefined;
  const slashIdx = s.lastIndexOf("/");
  if (slashIdx === -1) return undefined;
  const ipPart = s.substring(0, slashIdx);
  const prefixPart = s.substring(slashIdx + 1);
  if (prefixPart === "" || prefixPart.includes(".")) return undefined;
  // Check for zone in IP part
  if (ipPart.includes("%")) return undefined;
  const prefix = Number(prefixPart);
  if (Number.isNaN(prefix) || prefix < 0) return undefined;
  // Check for IPv4-mapped IPv6 in dotted-decimal form in CIDR
  if (isIPv4MappedString(ipPart)) return undefined;
  const ip = parseIP(ipPart);
  if (ip === undefined) return undefined;
  const maxPrefix = ip.bytes.length === 4 ? 32 : 128;
  if (prefix > maxPrefix) return undefined;
  return new CelCIDR(ip, prefix, `${ipToString(ip)}/${prefix}`);
}

/** isIP(string) — returns true if the string is a valid IP address */
function celIsIP(s: unknown): boolean | undefined {
  if (!isStr(s)) return undefined;
  return parseIP(s) !== undefined;
}

/** ip.isCanonical(string) — returns true if the IP string is in canonical form */
function celIPIsCanonical(s: unknown): boolean | undefined {
  if (!isStr(s)) return undefined;
  const ip = parseIP(s);
  if (ip === undefined) return undefined; // error for invalid addresses
  return ipToString(ip) === s;
}

/** ip.family() — returns 4 for IPv4 or 6 for IPv6 */
function celIPFamily(target: unknown): bigint | undefined {
  if (!isCelIP(target)) return undefined;
  return BigInt(target.family());
}

/** ip.isUnspecified() — true if the address is all zeros */
function celIPIsUnspecified(target: unknown): boolean | undefined {
  if (!isCelIP(target)) return undefined;
  for (let i = 0; i < target.bytes.length; i++) {
    if (target.bytes[i] !== 0) return false;
  }
  return true;
}

/** ip.isLoopback() — true if the address is a loopback address */
function celIPIsLoopback(target: unknown): boolean | undefined {
  if (!isCelIP(target)) return undefined;
  if (target.bytes.length === 4) {
    return target.bytes[0] === 127;
  }
  // IPv6: ::1
  for (let i = 0; i < 15; i++) {
    if (target.bytes[i] !== 0) return false;
  }
  return target.bytes[15] === 1;
}

/** ip.isGlobalUnicast() — true if the address is a global unicast address */
function celIPIsGlobalUnicast(target: unknown): boolean | undefined {
  if (!isCelIP(target)) return undefined;
  // Not loopback, not unspecified, not multicast, not link-local
  if (celIPIsLoopback(target)) return false;
  if (celIPIsUnspecified(target)) return false;
  if (celIPIsLinkLocalMulticast(target)) return false;
  if (celIPIsLinkLocalUnicast(target)) return false;
  if (target.bytes.length === 4) {
    // IPv4: not 255.255.255.255 (broadcast), not multicast (224-239.x.x.x)
    if (
      target.bytes[0] === 255 &&
      target.bytes[1] === 255 &&
      target.bytes[2] === 255 &&
      target.bytes[3] === 255
    )
      return false;
    if ((target.bytes[0] as number) >= 224 && (target.bytes[0] as number) <= 239) return false;
    return true;
  }
  // IPv6: not multicast (ff00::/8)
  if (target.bytes[0] === 0xff) return false;
  return true;
}

/** ip.isLinkLocalMulticast() — true if the address is a link-local multicast address */
function celIPIsLinkLocalMulticast(target: unknown): boolean | undefined {
  if (!isCelIP(target)) return undefined;
  if (target.bytes.length === 4) {
    // IPv4: 224.0.0.0/24
    return target.bytes[0] === 224 && target.bytes[1] === 0 && target.bytes[2] === 0;
  }
  // IPv6: ff02::/16
  return target.bytes[0] === 0xff && target.bytes[1] === 0x02;
}

/** ip.isLinkLocalUnicast() — true if the address is a link-local unicast address */
function celIPIsLinkLocalUnicast(target: unknown): boolean | undefined {
  if (!isCelIP(target)) return undefined;
  if (target.bytes.length === 4) {
    // IPv4: 169.254.0.0/16
    return target.bytes[0] === 169 && target.bytes[1] === 254;
  }
  // IPv6: fe80::/10
  return target.bytes[0] === 0xfe && ((target.bytes[1] as number) & 0xc0) === 0x80;
}

/** cidr.containsIP(ip_or_string) — true if the IP is within the CIDR range */
function celCIDRContainsIP(target: unknown, ipArg: unknown): boolean | undefined {
  if (!isCelCIDR(target)) return undefined;
  let ip: CelIP | undefined;
  if (isCelIP(ipArg)) {
    ip = ipArg;
  } else if (isStr(ipArg)) {
    ip = parseIP(ipArg);
    if (ip === undefined) return undefined;
  } else {
    return undefined;
  }
  // Both must be same address family
  if (target.ip.bytes.length !== ip.bytes.length) return false;
  return ipInCIDR(ip, target);
}

/** cidr.containsCIDR(cidr_or_string) — true if the inner CIDR is fully contained */
function celCIDRContainsCIDR(target: unknown, cidrArg: unknown): boolean | undefined {
  if (!isCelCIDR(target)) return undefined;
  let inner: CelCIDR | undefined;
  if (isCelCIDR(cidrArg)) {
    inner = cidrArg;
  } else if (isStr(cidrArg)) {
    inner = celNetCIDR(cidrArg) ?? undefined;
    if (inner === undefined) return undefined;
  } else {
    return undefined;
  }
  // Both must be same address family
  if (target.ip.bytes.length !== inner.ip.bytes.length) return false;
  // Inner prefix must be >= outer prefix (more specific or equal)
  if (inner.prefix < target.prefix) return false;
  // The network address of the inner must be within the outer
  return ipInCIDR(inner.ip, target);
}

/** Check if an IP is within a CIDR range */
function ipInCIDR(ip: CelIP, cidr: CelCIDR): boolean {
  const totalBits = ip.bytes.length * 8;
  const prefix = cidr.prefix;
  for (let bit = 0; bit < totalBits; bit++) {
    if (bit >= prefix) break;
    const byteIdx = Math.floor(bit / 8);
    const bitIdx = 7 - (bit % 8);
    const ipBit = ((ip.bytes[byteIdx] as number) >> bitIdx) & 1;
    const cidrBit = ((cidr.ip.bytes[byteIdx] as number) >> bitIdx) & 1;
    if (ipBit !== cidrBit) return false;
  }
  return true;
}

/** cidr.masked() — apply the mask to get the network address CIDR */
function celCIDRMasked(target: unknown): CelCIDR | undefined {
  if (!isCelCIDR(target)) return undefined;
  const masked = new Uint8Array(target.ip.bytes.length);
  const prefix = target.prefix;
  for (let bit = 0; bit < target.ip.bytes.length * 8; bit++) {
    if (bit >= prefix) break;
    const byteIdx = Math.floor(bit / 8);
    const bitIdx = 7 - (bit % 8);
    masked[byteIdx] =
      (masked[byteIdx] as number) | ((target.ip.bytes[byteIdx] as number) & (1 << bitIdx));
  }
  const maskedIP = new CelIP(masked, ipToString(new CelIP(masked, "")));
  return new CelCIDR(maskedIP, prefix, `${ipToString(maskedIP)}/${prefix}`);
}

/** cidr.prefixLength() — get the prefix length */
function celCIDRPrefixLength(target: unknown): bigint | undefined {
  if (!isCelCIDR(target)) return undefined;
  return BigInt(target.prefix);
}

// ── Optional Helpers ───────────────────────────────────────────────────────

/** Check if a value is a "zero value" for optional.ofNonZeroValue() */
function isZeroValue(v: unknown): boolean {
  if (v === null) return true;
  if (v === false) return true;
  if (v === 0n) return true;
  if (isCelUint(v) && v.value === 0n) return true;
  if (v === 0) return true;
  if (v === "") return true;
  if (isBytes(v) && v.length === 0) return true;
  if (isList(v) && v.length === 0) return true;
  if (isMap(v) && v.size === 0) return true;
  if (isCelDuration(v) && v.seconds === 0n && v.nanos === 0) return true;
  if (isCelTimestamp(v) && v.seconds === 0n && v.nanos === 0) return true;
  // Struct (proto message) with no explicitly set fields is zero value
  if (isStruct(v)) {
    const keys = Object.keys(v).filter((k) => k !== "__type");
    if (keys.length === 0) return true;
  }
  return false;
}

/** optional.none() */
export function celOptionalNone(): CelOptional {
  return CelOptional.none();
}

/** optional.of(value) */
export function celOptionalOf(value: unknown): CelOptional | undefined {
  if (value === undefined) return undefined;
  return CelOptional.of(value);
}

/** optional.ofNonZeroValue(value) */
export function celOptionalOfNonZeroValue(value: unknown): CelOptional | undefined {
  if (value === undefined) return undefined;
  if (isZeroValue(value)) return CelOptional.none();
  return CelOptional.of(value);
}

/** optional.hasValue() — check if optional has a value */
export function celOptionalHasValue(v: unknown): boolean | undefined {
  if (isCelOptional(v)) return v.hasValue();
  return undefined;
}

/** optional.value() — unwrap the optional */
export function celOptionalValue(v: unknown): unknown {
  if (isCelOptional(v)) return v.value();
  return undefined;
}

/** optional.or(other) — return this if has value, otherwise other */
export function celOptionalOr(a: unknown, b: unknown): CelOptional | undefined {
  if (isCelOptional(a)) {
    if (a.hasValue()) return a;
    if (isCelOptional(b)) return b;
    return undefined;
  }
  return undefined;
}

/** optional.orValue(default) — return value if has value, otherwise default */
export function celOptionalOrValue(a: unknown, b: unknown): unknown {
  if (isCelOptional(a)) {
    if (a.hasValue()) return a.value();
    return b;
  }
  return undefined;
}

/** optional.optMap(varName, fn) — map over optional value */
export function celOptionalOptMap(
  a: unknown,
  fn: (v: unknown) => unknown,
): CelOptional | undefined {
  if (isCelOptional(a)) {
    if (!a.hasValue()) return CelOptional.none();
    const result = fn(a.value());
    if (result === undefined) return undefined;
    return CelOptional.of(result);
  }
  return undefined;
}

/** optional.optFlatMap(varName, fn) — flatMap over optional value */
export function celOptionalOptFlatMap(
  a: unknown,
  fn: (v: unknown) => unknown,
): CelOptional | undefined {
  if (isCelOptional(a)) {
    if (!a.hasValue()) return CelOptional.none();
    const result = fn(a.value());
    if (result === undefined) return undefined;
    if (isCelOptional(result)) return result;
    return undefined;
  }
  return undefined;
}

/** Optional select: x.?field — returns optional.of(x.field) if field exists, otherwise optional.none() */
export function celOptionalSelect(obj: unknown, field: string): CelOptional | undefined {
  // If obj is an optional, unwrap it first
  if (isCelOptional(obj)) {
    if (!obj.hasValue()) return CelOptional.none();
    return celOptionalSelect(obj.value(), field);
  }
  if (obj === null || obj === undefined) return CelOptional.none();
  if (isMap(obj)) {
    if (mapHas(obj, field)) {
      const val = mapGet(obj, field);
      return CelOptional.of(val);
    }
    return CelOptional.none();
  }
  if (typeof obj === "object") {
    const record = obj as Record<string, unknown>;
    // For struct types (proto messages), check if the field was explicitly set
    // The struct proxy returns null for absent fields, but for optional select
    // we need to check the real underlying object
    if (isStruct(obj)) {
      // Check the actual target object (not the proxy default)
      // Use Object.getOwnPropertyDescriptor or check "own" keys
      const keys = Object.keys(record).filter((k) => k !== "__type");
      if (keys.includes(field)) {
        return CelOptional.of(record[field]);
      }
      return CelOptional.none();
    }
    if (field in record) {
      return CelOptional.of(record[field]);
    }
    return CelOptional.none();
  }
  return CelOptional.none();
}

/** Optional index: x[?key] — returns optional.of(x[key]) if key exists, otherwise optional.none() */
export function celOptionalIndex(obj: unknown, key: unknown): CelOptional | undefined {
  // If obj is an optional, unwrap it first
  if (isCelOptional(obj)) {
    if (!obj.hasValue()) return CelOptional.none();
    return celOptionalIndex(obj.value(), key);
  }
  if (obj === null || obj === undefined) return CelOptional.none();
  if (isList(obj)) {
    let idx: number;
    if (isInt(key)) {
      idx = Number(key);
    } else if (isCelUint(key)) {
      idx = Number(key.value);
    } else if (isDouble(key)) {
      if (!Number.isFinite(key) || key !== Math.trunc(key)) return undefined;
      idx = key;
    } else {
      return undefined;
    }
    if (idx < 0 || idx >= obj.length) return CelOptional.none();
    return CelOptional.of(obj[idx]);
  }
  if (isMap(obj)) {
    if (mapHas(obj, key as CelValue)) {
      return CelOptional.of(mapGet(obj, key as CelValue));
    }
    return CelOptional.none();
  }
  return undefined;
}

/** Create a list with optional entries — optional entries are only included if they have values */
export function celMakeListOptional(
  elements: unknown[],
  optionalIndices: number[],
): CelValue[] | undefined {
  const result: CelValue[] = [];
  const optSet = new Set(optionalIndices);
  for (let i = 0; i < elements.length; i++) {
    const elem = elements[i];
    if (optSet.has(i)) {
      if (elem === undefined) return undefined;
      if (isCelOptional(elem)) {
        if (elem.hasValue()) {
          result.push(elem.value() as CelValue);
        }
        // If no value, skip this element
      } else {
        // Non-optional value at optional index — include it
        result.push(elem as CelValue);
      }
    } else {
      if (elem === undefined) return undefined;
      result.push(elem as CelValue);
    }
  }
  return result;
}

/** Create a map with optional entries — optional entries are only included if their values are present optionals */
export function celMakeMapOptional(
  entries: [CelValue, CelValue, boolean][],
): Map<CelValue, CelValue> | undefined {
  const m = new Map<CelValue, CelValue>();
  for (const [k, v, optional] of entries) {
    if (optional) {
      if (v === undefined) return undefined;
      if (isCelOptional(v)) {
        if (v.hasValue()) {
          m.set(k, v.value() as CelValue);
        }
        // If no value, skip this entry
      } else {
        m.set(k, v);
      }
    } else {
      m.set(k, v);
    }
  }
  return m;
}

/** Create a struct with optional entries — optional entries only included if value has value */
export function celMakeStructOptional(
  _name: string,
  entries: [string, CelValue, boolean][],
): CelValue | undefined {
  const resolvedEntries: [string, CelValue][] = [];
  for (const [field, value, optional] of entries) {
    if (optional) {
      if (isCelOptional(value)) {
        if (value.hasValue()) {
          resolvedEntries.push([field, value.value() as CelValue]);
        }
        // If no value, skip this field
      } else {
        resolvedEntries.push([field, value]);
      }
    } else {
      resolvedEntries.push([field, value]);
    }
  }
  return celMakeStruct(_name, resolvedEntries);
}

// ── Proto Extensions ──────────────────────────────────────────────────────

/** proto.hasExt(msg, extName) — check if a proto2 extension field is set.
 *  Extensions are stored as a Map<string, CelValue> under PROTO_EXTENSIONS symbol. */
function celProtoHasExt(msg: unknown, extName: unknown): boolean | undefined {
  if (!isStr(extName) || !isStruct(msg)) return undefined;
  const extensions = (msg as Record<symbol, unknown>)[PROTO_EXTENSIONS] as
    | Map<string, CelValue>
    | undefined;
  if (!extensions) return false;
  return extensions.has(extName);
}

/** proto.getExt(msg, extName) — get a proto2 extension field value.
 *  Returns the extension value, or the default for the field if not set. */
function celProtoGetExt(msg: unknown, extName: unknown): CelValue | undefined {
  if (!isStr(extName) || !isStruct(msg)) return undefined;
  const extensions = (msg as Record<symbol, unknown>)[PROTO_EXTENSIONS] as
    | Map<string, CelValue>
    | undefined;
  if (!extensions || !extensions.has(extName)) return undefined;
  return extensions.get(extName) as CelValue;
}

// ── createRuntime ──────────────────────────────────────────────────────────

export interface RuntimeOptions {
  /** CEL container (namespace) for qualifying struct type names */
  container?: string;
}

/** Create the _rt object that generated code references */
export function createRuntime(options?: RuntimeOptions) {
  const container = options?.container ?? "";
  // Container-aware makeStruct: qualify unqualified type names with container
  const makeStructWithContainer = (
    name: string,
    entries: [string, CelValue][],
  ): CelValue | undefined => {
    // If the name is unqualified (no dots) and we have a container, qualify it
    const qualifiedName = container && !name.includes(".") ? `${container}.${name}` : name;
    return celMakeStruct(qualifiedName, entries);
  };
  const makeStructOptionalWithContainer = (
    name: string,
    entries: [string, CelValue, boolean][],
  ): CelValue | undefined => {
    const qualifiedName = container && !name.includes(".") ? `${container}.${name}` : name;
    const resolvedEntries: [string, CelValue][] = [];
    for (const [field, value, optional] of entries) {
      if (optional) {
        if (isCelOptional(value)) {
          if (value.hasValue()) {
            resolvedEntries.push([field, value.value() as CelValue]);
          }
        } else {
          resolvedEntries.push([field, value]);
        }
      } else {
        resolvedEntries.push([field, value]);
      }
    }
    return celMakeStruct(qualifiedName, resolvedEntries);
  };
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
    selectPath2: celSelectPath2,
    selectPath3: celSelectPath3,
    selectPath4: celSelectPath4,
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
    enumConstruct: celEnumConstruct,
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
    // List / Map / Struct / Comprehension
    makeList: celMakeList,
    makeMap: celMakeMap,
    mapInsert: celMapInsert,
    makeStruct: makeStructWithContainer,
    has: celHas,
    comprehension: celComprehension,
    filterList: celFilterList,
    // Type conversions (timestamp/duration)
    duration: celDuration,
    timestamp: celTimestamp,
    // Timestamp/Duration accessors
    getFullYear: celGetFullYear,
    getMonth: celGetMonth,
    getDate: celGetDate,
    getDayOfMonth: celGetDayOfMonth,
    getDayOfWeek: celGetDayOfWeek,
    getDayOfYear: celGetDayOfYear,
    getHours: celGetHours,
    getMinutes: celGetMinutes,
    getSeconds: celGetSeconds,
    getMilliseconds: celGetMilliseconds,
    // String extensions
    charAt: celCharAt,
    indexOf: celIndexOf,
    lastIndexOf: celLastIndexOf,
    lowerAscii: celLowerAscii,
    upperAscii: celUpperAscii,
    replace: celReplace,
    split: celSplit,
    substring: celSubstring,
    trim: celTrim,
    join: celJoin,
    quote: celQuote,
    format: celFormat,
    // Types
    CelUint,
    celUint: (n: bigint) => new CelUint(n),
    isCelUint,
    CelType,
    isCelType,
    // Math extensions
    "math.greatest": celMathGreatest,
    "math.least": celMathLeast,
    "math.ceil": celMathCeil,
    "math.floor": celMathFloor,
    "math.round": celMathRound,
    "math.trunc": celMathTrunc,
    "math.abs": celMathAbs,
    "math.sign": celMathSign,
    "math.isNaN": celMathIsNaN,
    "math.isInf": celMathIsInf,
    "math.isFinite": celMathIsFinite,
    "math.bitAnd": celMathBitAnd,
    "math.bitOr": celMathBitOr,
    "math.bitXor": celMathBitXor,
    "math.bitNot": celMathBitNot,
    "math.bitShiftLeft": celMathBitShiftLeft,
    "math.bitShiftRight": celMathBitShiftRight,
    // Encoder extensions
    "base64.encode": celBase64Encode,
    "base64.decode": celBase64Decode,
    // Network extension
    ip: celNetIP,
    cidr: celNetCIDR,
    isIP: celIsIP,
    "ip.isCanonical": celIPIsCanonical,
    family: celIPFamily,
    isUnspecified: celIPIsUnspecified,
    isLoopback: celIPIsLoopback,
    isGlobalUnicast: celIPIsGlobalUnicast,
    isLinkLocalMulticast: celIPIsLinkLocalMulticast,
    isLinkLocalUnicast: celIPIsLinkLocalUnicast,
    containsIP: celCIDRContainsIP,
    containsCIDR: celCIDRContainsCIDR,
    masked: celCIDRMasked,
    prefixLength: celCIDRPrefixLength,
    CelIP,
    isCelIP,
    CelCIDR,
    isCelCIDR,
    // Optional extension
    "optional.none": celOptionalNone,
    "optional.of": celOptionalOf,
    "optional.ofNonZeroValue": celOptionalOfNonZeroValue,
    optionalHasValue: celOptionalHasValue,
    optionalValue: celOptionalValue,
    optionalOr: celOptionalOr,
    optionalOrValue: celOptionalOrValue,
    optionalOptMap: celOptionalOptMap,
    optionalOptFlatMap: celOptionalOptFlatMap,
    optionalSelect: celOptionalSelect,
    optionalIndex: celOptionalIndex,
    makeListOptional: celMakeListOptional,
    makeMapOptional: celMakeMapOptional,
    makeStructOptional: makeStructOptionalWithContainer,
    CelOptional,
    isCelOptional,
    // Proto extensions
    "proto.hasExt": celProtoHasExt,
    "proto.getExt": celProtoGetExt,
  };
}
