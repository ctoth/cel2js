import type { ExprValue } from "@bufbuild/cel-spec/cel/expr/eval_pb.js";
import type { Value } from "@bufbuild/cel-spec/cel/expr/value_pb.js";
import { CelType, CelUint } from "../../src/runtime/types.js";

/**
 * Convert a proto Value to a JavaScript value suitable for comparison.
 *
 * Mapping:
 *   nullValue   -> null
 *   boolValue   -> boolean
 *   int64Value  -> bigint
 *   uint64Value -> CelUint (wraps bigint, distinguishes from int)
 *   doubleValue -> number
 *   stringValue -> string
 *   bytesValue  -> Uint8Array
 *   listValue   -> recursively converted array
 *   mapValue    -> Map with recursively converted keys and values
 *   typeValue   -> CelType
 *   enumValue   -> bigint (the numeric value)
 *   objectValue -> throws (proto Any, not supported yet)
 */
export function protoValueToJS(value: Value): unknown {
  switch (value.kind.case) {
    case "nullValue":
      return null;
    case "boolValue":
      return value.kind.value;
    case "int64Value":
      return value.kind.value; // bigint
    case "uint64Value":
      return new CelUint(value.kind.value); // bigint wrapped in CelUint
    case "doubleValue":
      return value.kind.value; // number
    case "stringValue":
      return value.kind.value; // string
    case "bytesValue":
      return value.kind.value; // Uint8Array
    case "listValue": {
      const list = value.kind.value;
      return list.values.map((v) => protoValueToJS(v));
    }
    case "mapValue": {
      const map = value.kind.value;
      const result = new Map<unknown, unknown>();
      for (const entry of map.entries) {
        if (!entry.key || !entry.value) {
          throw new Error("Map entry missing key or value");
        }
        result.set(protoValueToJS(entry.key), protoValueToJS(entry.value));
      }
      return result;
    }
    case "typeValue":
      return new CelType(value.kind.value);
    case "enumValue":
      return BigInt(value.kind.value.value);
    case "objectValue":
      throw new Error(`objectValue (proto Any) not supported yet: ${value.kind.value.typeUrl}`);
    case undefined:
      throw new Error("Value has undefined kind");
    default:
      throw new Error(`Unsupported value kind: ${(value.kind as { case: string }).case}`);
  }
}

/**
 * Convert proto ExprValue bindings map to a plain JS bindings object.
 * Only "value"-case bindings are supported (matching cel-es behavior).
 */
export function protoBindingsToJS(bindings: { [key: string]: ExprValue }): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, exprValue] of Object.entries(bindings)) {
    if (exprValue.kind.case !== "value") {
      throw new Error(`Unsupported binding kind for "${key}": ${exprValue.kind.case}`);
    }
    if (!exprValue.kind.value) {
      throw new Error(`Binding "${key}" has value case but no value`);
    }
    result[key] = protoValueToJS(exprValue.kind.value);
  }
  return result;
}
