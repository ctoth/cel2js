import { isCelDuration, isCelTimestamp } from "../../src/runtime/helpers.js";
import { isCelType, isCelUint } from "../../src/runtime/types.js";

/**
 * Deep equality comparison for CEL values.
 *
 * Handles:
 * - NaN === NaN as true (CEL conformance requires this for test matching)
 * - CelUint comparison (compare .value fields)
 * - CelType comparison (compare .name fields)
 * - Map comparison order-independently (compare entries regardless of insertion order)
 * - Array comparison element-by-element
 * - Uint8Array byte-by-byte comparison
 * - bigint comparison
 */
export function celDeepEqual(actual: unknown, expected: unknown): boolean {
  // Identical references or primitive equality
  if (actual === expected) return true;

  // NaN handling: NaN === NaN is true for conformance
  if (
    typeof actual === "number" &&
    typeof expected === "number" &&
    Number.isNaN(actual) &&
    Number.isNaN(expected)
  ) {
    return true;
  }

  // bigint comparison
  if (typeof actual === "bigint" && typeof expected === "bigint") {
    return actual === expected;
  }

  // CelUint comparison
  if (isCelUint(actual) && isCelUint(expected)) {
    return actual.value === expected.value;
  }

  // CelType comparison
  if (isCelType(actual) && isCelType(expected)) {
    return actual.name === expected.name;
  }

  // null check (both should be null for equality, but we already handled === above)
  if (actual === null || expected === null) return false;

  // Uint8Array comparison
  if (actual instanceof Uint8Array && expected instanceof Uint8Array) {
    if (actual.length !== expected.length) return false;
    for (let i = 0; i < actual.length; i++) {
      if (actual[i] !== expected[i]) return false;
    }
    return true;
  }

  // Array comparison
  if (Array.isArray(actual) && Array.isArray(expected)) {
    if (actual.length !== expected.length) return false;
    for (let i = 0; i < actual.length; i++) {
      if (!celDeepEqual(actual[i], expected[i])) return false;
    }
    return true;
  }

  // CelTimestamp comparison
  if (isCelTimestamp(actual) && isCelTimestamp(expected)) {
    return actual.seconds === expected.seconds && actual.nanos === expected.nanos;
  }

  // CelDuration comparison
  if (isCelDuration(actual) && isCelDuration(expected)) {
    return actual.seconds === expected.seconds && actual.nanos === expected.nanos;
  }

  // Map comparison (order-independent)
  if (actual instanceof Map && expected instanceof Map) {
    if (actual.size !== expected.size) return false;
    // For each entry in expected, find a matching entry in actual
    for (const [expectedKey, expectedVal] of expected) {
      let found = false;
      for (const [actualKey, actualVal] of actual) {
        if (celDeepEqual(actualKey, expectedKey) && celDeepEqual(actualVal, expectedVal)) {
          found = true;
          break;
        }
      }
      if (!found) return false;
    }
    return true;
  }

  return false;
}
