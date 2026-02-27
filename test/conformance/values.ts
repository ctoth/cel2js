import {
  int32_ext,
  nested_enum_ext,
  nested_ext,
  Proto2ExtensionScopedMessage_int64_ext,
  Proto2ExtensionScopedMessage_message_scoped_nested_ext,
  Proto2ExtensionScopedMessage_message_scoped_repeated_test_all_types,
  Proto2ExtensionScopedMessage_nested_enum_ext,
  repeated_test_all_types,
  test_all_types_ext,
} from "@bufbuild/cel-spec/cel/expr/conformance/proto2/test_all_types_extensions_pb.js";
import {
  TestAllTypes_NestedMessageSchema as Proto2NestedMessageSchema,
  TestAllTypesSchema as Proto2TestAllTypesSchema,
} from "@bufbuild/cel-spec/cel/expr/conformance/proto2/test_all_types_pb.js";
import {
  TestAllTypes_NestedMessageSchema as Proto3NestedMessageSchema,
  TestAllTypesSchema as Proto3TestAllTypesSchema,
} from "@bufbuild/cel-spec/cel/expr/conformance/proto3/test_all_types_pb.js";
import type { ExprValue } from "@bufbuild/cel-spec/cel/expr/eval_pb.js";
import type { Value } from "@bufbuild/cel-spec/cel/expr/value_pb.js";
import type { DescField, DescMessage, GenExtension } from "@bufbuild/protobuf";
import { fromBinary, getExtension, hasExtension, isFieldSet } from "@bufbuild/protobuf";
import {
  AnySchema,
  BoolValueSchema,
  BytesValueSchema,
  DoubleValueSchema,
  type Duration,
  DurationSchema,
  FloatValueSchema,
  Int32ValueSchema,
  Int64ValueSchema,
  ListValueSchema,
  StringValueSchema,
  StructSchema,
  type Timestamp,
  TimestampSchema,
  UInt32ValueSchema,
  UInt64ValueSchema,
  ValueSchema,
} from "@bufbuild/protobuf/wkt";
import {
  CelDuration,
  CelTimestamp,
  celMakeStruct,
  PROTO_EXTENSIONS,
} from "../../src/runtime/helpers.js";
import type { CelValue } from "../../src/runtime/types.js";
import { CelType, CelUint } from "../../src/runtime/types.js";

/**
 * Map of proto type URLs to their corresponding schemas for deserialization.
 */
const PROTO_SCHEMAS: Record<string, DescMessage> = {
  "type.googleapis.com/cel.expr.conformance.proto2.TestAllTypes": Proto2TestAllTypesSchema,
  "type.googleapis.com/cel.expr.conformance.proto2.TestAllTypes.NestedMessage":
    Proto2NestedMessageSchema,
  "type.googleapis.com/cel.expr.conformance.proto3.TestAllTypes": Proto3TestAllTypesSchema,
  "type.googleapis.com/cel.expr.conformance.proto3.TestAllTypes.NestedMessage":
    Proto3NestedMessageSchema,
};

/**
 * Registry of proto2 extension field descriptors, keyed by their qualified typeName.
 * Used to decode extension data from raw proto messages.
 */
// biome-ignore lint/suspicious/noExplicitAny: extension descriptors have varied value types
const PROTO2_EXTENSIONS: Record<string, GenExtension<any, any>> = {
  "cel.expr.conformance.proto2.int32_ext": int32_ext,
  "cel.expr.conformance.proto2.nested_ext": nested_ext,
  "cel.expr.conformance.proto2.test_all_types_ext": test_all_types_ext,
  "cel.expr.conformance.proto2.nested_enum_ext": nested_enum_ext,
  "cel.expr.conformance.proto2.repeated_test_all_types": repeated_test_all_types,
  "cel.expr.conformance.proto2.Proto2ExtensionScopedMessage.int64_ext":
    Proto2ExtensionScopedMessage_int64_ext,
  "cel.expr.conformance.proto2.Proto2ExtensionScopedMessage.message_scoped_nested_ext":
    Proto2ExtensionScopedMessage_message_scoped_nested_ext,
  "cel.expr.conformance.proto2.Proto2ExtensionScopedMessage.nested_enum_ext":
    Proto2ExtensionScopedMessage_nested_enum_ext,
  "cel.expr.conformance.proto2.Proto2ExtensionScopedMessage.message_scoped_repeated_test_all_types":
    Proto2ExtensionScopedMessage_message_scoped_repeated_test_all_types,
};

// Proto scalar type constants (from protobuf spec)
const SCALAR_INT32 = 5;
const SCALAR_INT64 = 3;
const SCALAR_UINT32 = 13;
const SCALAR_UINT64 = 4;
const SCALAR_SINT32 = 17;
const SCALAR_SINT64 = 18;
const SCALAR_FIXED32 = 7;
const SCALAR_FIXED64 = 6;
const SCALAR_SFIXED32 = 15;
const SCALAR_SFIXED64 = 16;
const SCALAR_FLOAT = 2;
const SCALAR_DOUBLE = 1;

/** Set of proto scalar types that are unsigned integers */
const UINT_SCALARS = new Set([SCALAR_UINT32, SCALAR_UINT64, SCALAR_FIXED32, SCALAR_FIXED64]);
/** Set of proto scalar types that are signed integers */
const INT_SCALARS = new Set([
  SCALAR_INT32,
  SCALAR_INT64,
  SCALAR_SINT32,
  SCALAR_SINT64,
  SCALAR_SFIXED32,
  SCALAR_SFIXED64,
]);

/**
 * Convert a protobuf JSON Value (google.protobuf.Value) to a CEL value.
 * Handles the discriminated union format from protobuf-es.
 */
function convertProtobufJsonValue(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  // protobuf-es Value with kind discriminated union
  const val = value as { kind?: { case: string; value: unknown } };
  if (val.kind) {
    switch (val.kind.case) {
      case "nullValue":
        return null;
      case "numberValue":
        return val.kind.value as number;
      case "stringValue":
        return val.kind.value as string;
      case "boolValue":
        return val.kind.value as boolean;
      case "listValue": {
        const lv = val.kind.value as { values: unknown[] };
        return (lv.values ?? []).map((v) => convertProtobufJsonValue(v));
      }
      case "structValue": {
        const sv = val.kind.value as Record<string, unknown>;
        // Struct fields is a map of string -> Value
        const fieldsObj = (sv as { fields?: Record<string, unknown> }).fields ?? sv;
        const m = new Map<CelValue, CelValue>();
        for (const [k, v] of Object.entries(fieldsObj)) {
          m.set(k, convertProtobufJsonValue(v) as CelValue);
        }
        return m;
      }
      default:
        return null;
    }
  }
  return value;
}

/**
 * Convert a single proto field value to a CEL value, based on the field descriptor.
 */
function convertFieldValue(field: DescField, value: unknown): CelValue {
  if (field.fieldKind === "scalar") {
    if (UINT_SCALARS.has(field.scalar)) {
      return new CelUint(BigInt(value as number | bigint));
    }
    if (INT_SCALARS.has(field.scalar)) {
      return BigInt(value as number | bigint);
    }
    if (field.scalar === SCALAR_FLOAT || field.scalar === SCALAR_DOUBLE) {
      return value as number;
    }
    // BOOL, STRING, BYTES pass through
    return value as CelValue;
  }
  if (field.fieldKind === "enum") {
    return BigInt(value as number);
  }
  if (field.fieldKind === "message" && field.message) {
    const msgDesc = field.message;
    const msgTypeName = msgDesc.typeName;
    // Well-known types
    if (msgTypeName === "google.protobuf.Duration") {
      const dur = value as Duration;
      return new CelDuration(dur.seconds, dur.nanos) as unknown as CelValue;
    }
    if (msgTypeName === "google.protobuf.Timestamp") {
      const ts = value as Timestamp;
      return new CelTimestamp(ts.seconds, ts.nanos) as unknown as CelValue;
    }
    // google.protobuf.Value: JSON Value type (not a wrapper type)
    if (msgTypeName === "google.protobuf.Value") {
      const val = value as { kind: { case: string; value: unknown } };
      return convertProtobufJsonValue(val) as CelValue;
    }
    // google.protobuf.Struct: protobuf-es represents as plain JS object (JsonObject)
    // Must come before generic wrapper check since Struct doesn't end in "Value"
    if (msgTypeName === "google.protobuf.Struct") {
      const obj = value as Record<string, unknown>;
      const m = new Map<CelValue, CelValue>();
      for (const [k, v] of Object.entries(obj)) {
        m.set(k, convertProtobufJsonValue(v) as CelValue);
      }
      return m;
    }
    // google.protobuf.ListValue: protobuf-es represents as { values: Value[] }
    // Must come before generic wrapper check since "ListValue" ends with "Value"
    if (msgTypeName === "google.protobuf.ListValue") {
      const lv = value as { values: unknown[] };
      return (lv.values ?? []).map((v) => convertProtobufJsonValue(v) as CelValue);
    }
    // Wrapper types: protobuf-es already unwraps these to primitives
    if (msgTypeName.startsWith("google.protobuf.") && msgTypeName.endsWith("Value")) {
      // The value is already unwrapped by protobuf-es (bigint, number, string, etc.)
      const inner = value;
      if (
        msgTypeName === "google.protobuf.UInt32Value" ||
        msgTypeName === "google.protobuf.UInt64Value"
      ) {
        return new CelUint(BigInt(inner as number | bigint));
      }
      if (
        msgTypeName === "google.protobuf.Int32Value" ||
        msgTypeName === "google.protobuf.Int64Value"
      ) {
        return BigInt(inner as number | bigint);
      }
      if (
        msgTypeName === "google.protobuf.FloatValue" ||
        msgTypeName === "google.protobuf.DoubleValue"
      ) {
        return inner as number;
      }
      if (msgTypeName === "google.protobuf.BoolValue") {
        return inner as boolean;
      }
      if (msgTypeName === "google.protobuf.StringValue") {
        return inner as string;
      }
      if (msgTypeName === "google.protobuf.BytesValue") {
        return inner as Uint8Array;
      }
      return inner as CelValue;
    }
    // google.protobuf.Any: recursively unpack
    if (msgTypeName === "google.protobuf.Any") {
      const any = value as { typeUrl: string; value: Uint8Array };
      const schema = PROTO_SCHEMAS[any.typeUrl];
      if (schema) {
        const msg = fromBinary(schema, any.value) as unknown as Record<string, unknown>;
        return protoMessageToStruct(msg, schema);
      }
      // Unsupported Any type
      return null;
    }
    // Nested message: recursively convert to struct
    if (value != null) {
      return protoMessageToStruct(value as Record<string, unknown>, msgDesc);
    }
    return null;
  }
  return value as CelValue;
}

/**
 * Convert a deserialized proto message to the CEL struct format
 * used by celMakeStruct (plain object with __type and STRUCT_FIELDS).
 */
function protoMessageToStruct(msg: Record<string, unknown>, schema: DescMessage): CelValue {
  const typeName = schema.typeName;
  const entries: [string, CelValue][] = [];

  for (const field of schema.fields) {
    if (!isFieldSet(msg, field)) continue;

    const jsValue = msg[field.localName];

    if (field.fieldKind === "list") {
      // Convert repeated fields to CEL lists
      const arr = jsValue as unknown[];
      const celArr: CelValue[] = [];
      const scalarType = field.scalar ?? 0;
      const msgDesc = field.message;
      for (const elem of arr) {
        if (field.listKind === "scalar") {
          if (UINT_SCALARS.has(scalarType)) {
            celArr.push(new CelUint(BigInt(elem as number | bigint)));
          } else if (INT_SCALARS.has(scalarType)) {
            celArr.push(BigInt(elem as number | bigint));
          } else {
            celArr.push(elem as CelValue);
          }
        } else if (field.listKind === "enum") {
          celArr.push(BigInt(elem as number));
        } else if (field.listKind === "message" && msgDesc) {
          celArr.push(
            elem != null ? protoMessageToStruct(elem as Record<string, unknown>, msgDesc) : null,
          );
        }
      }
      entries.push([field.name, celArr]);
    } else if (field.fieldKind === "map") {
      // Convert map fields to CEL Maps
      const protoMap = jsValue as Record<string, unknown>;
      const celMap = new Map<CelValue, CelValue>();
      const mapScalar = field.scalar ?? 0;
      const mapMsgDesc = field.message;
      for (const [k, v] of Object.entries(protoMap)) {
        // Map keys in proto are always scalar (string, int, bool)
        let celKey: CelValue = k;
        if (field.mapKey === SCALAR_INT32 || field.mapKey === SCALAR_INT64) {
          celKey = BigInt(k);
        } else if (field.mapKey === 8) {
          // bool
          celKey = k === "true";
        }
        // Map values
        let celVal: CelValue = v as CelValue;
        if (field.mapKind === "scalar") {
          if (UINT_SCALARS.has(mapScalar)) {
            celVal = new CelUint(BigInt(v as number | bigint));
          } else if (INT_SCALARS.has(mapScalar)) {
            celVal = BigInt(v as number | bigint);
          }
        } else if (field.mapKind === "enum") {
          celVal = BigInt(v as number);
        } else if (field.mapKind === "message" && mapMsgDesc) {
          celVal =
            v != null ? protoMessageToStruct(v as Record<string, unknown>, mapMsgDesc) : null;
        }
        celMap.set(celKey, celVal);
      }
      entries.push([field.name, celMap]);
    } else {
      // Singular field (scalar, enum, message)
      entries.push([field.name, convertFieldValue(field, jsValue)]);
    }
  }

  const result = celMakeStruct(typeName, entries) as CelValue;

  // Decode proto2 extension fields from $unknown data and attach to struct
  if (
    result !== null &&
    result !== undefined &&
    typeof result === "object" &&
    (msg as Record<string, unknown>).$unknown
  ) {
    const extMap = new Map<string, CelValue>();
    for (const [extName, extDesc] of Object.entries(PROTO2_EXTENSIONS)) {
      if (hasExtension(msg, extDesc)) {
        const rawVal = getExtension(msg, extDesc);
        const celVal = convertExtensionValue(extDesc, rawVal);
        extMap.set(extName, celVal);
      }
    }
    if (extMap.size > 0) {
      (result as Record<symbol, unknown>)[PROTO_EXTENSIONS] = extMap;
    }
  }

  return result;
}

/**
 * Convert a decoded proto extension value to a CEL value based on the extension descriptor.
 */
// biome-ignore lint/suspicious/noExplicitAny: extension descriptors have varied value types
function convertExtensionValue(extDesc: GenExtension<any, any>, value: unknown): CelValue {
  if (extDesc.fieldKind === "scalar") {
    if (extDesc.scalar === SCALAR_INT32 || extDesc.scalar === SCALAR_INT64) {
      return BigInt(value as number | bigint);
    }
    if (extDesc.scalar === SCALAR_UINT32 || extDesc.scalar === SCALAR_UINT64) {
      return new CelUint(BigInt(value as number | bigint));
    }
    return value as CelValue;
  }
  if (extDesc.fieldKind === "enum") {
    return BigInt(value as number);
  }
  if (extDesc.fieldKind === "message" && extDesc.message) {
    if (value != null) {
      return protoMessageToStruct(value as Record<string, unknown>, extDesc.message as DescMessage);
    }
    return null;
  }
  if (extDesc.fieldKind === "list" && extDesc.message) {
    // Repeated message extension
    const arr = value as unknown[];
    return arr.map((elem) =>
      elem != null
        ? protoMessageToStruct(elem as Record<string, unknown>, extDesc.message as DescMessage)
        : null,
    );
  }
  return value as CelValue;
}

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
 *   objectValue -> proto message deserialized to CEL struct format
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
    case "objectValue": {
      const any = value.kind.value;
      if (any.typeUrl === "type.googleapis.com/google.protobuf.Duration") {
        const dur = fromBinary(DurationSchema, any.value);
        return new CelDuration(dur.seconds, dur.nanos);
      }
      if (any.typeUrl === "type.googleapis.com/google.protobuf.Timestamp") {
        const ts = fromBinary(TimestampSchema, any.value);
        return new CelTimestamp(ts.seconds, ts.nanos);
      }
      // Wrapper types: unpack to primitive CEL values
      if (any.typeUrl === "type.googleapis.com/google.protobuf.Int32Value") {
        const msg = fromBinary(Int32ValueSchema, any.value);
        return BigInt(msg.value);
      }
      if (any.typeUrl === "type.googleapis.com/google.protobuf.Int64Value") {
        const msg = fromBinary(Int64ValueSchema, any.value);
        return msg.value; // already bigint
      }
      if (any.typeUrl === "type.googleapis.com/google.protobuf.UInt32Value") {
        const msg = fromBinary(UInt32ValueSchema, any.value);
        return new CelUint(BigInt(msg.value));
      }
      if (any.typeUrl === "type.googleapis.com/google.protobuf.UInt64Value") {
        const msg = fromBinary(UInt64ValueSchema, any.value);
        return new CelUint(msg.value);
      }
      if (any.typeUrl === "type.googleapis.com/google.protobuf.FloatValue") {
        const msg = fromBinary(FloatValueSchema, any.value);
        return msg.value;
      }
      if (any.typeUrl === "type.googleapis.com/google.protobuf.DoubleValue") {
        const msg = fromBinary(DoubleValueSchema, any.value);
        return msg.value;
      }
      if (any.typeUrl === "type.googleapis.com/google.protobuf.BoolValue") {
        const msg = fromBinary(BoolValueSchema, any.value);
        return msg.value;
      }
      if (any.typeUrl === "type.googleapis.com/google.protobuf.StringValue") {
        const msg = fromBinary(StringValueSchema, any.value);
        return msg.value;
      }
      if (any.typeUrl === "type.googleapis.com/google.protobuf.BytesValue") {
        const msg = fromBinary(BytesValueSchema, any.value);
        return msg.value;
      }
      // google.protobuf.Value: dynamic JSON-like value
      if (any.typeUrl === "type.googleapis.com/google.protobuf.Value") {
        const msg = fromBinary(ValueSchema, any.value);
        return convertProtobufJsonValue(msg) as CelValue;
      }
      // google.protobuf.Struct: map of string -> Value
      if (any.typeUrl === "type.googleapis.com/google.protobuf.Struct") {
        const msg = fromBinary(StructSchema, any.value) as unknown as Record<string, unknown>;
        const fieldsObj = (msg as { fields?: Record<string, unknown> }).fields ?? msg;
        const m = new Map<CelValue, CelValue>();
        for (const [k, v] of Object.entries(fieldsObj)) {
          m.set(k, convertProtobufJsonValue(v) as CelValue);
        }
        return m;
      }
      // google.protobuf.ListValue: list of Values
      if (any.typeUrl === "type.googleapis.com/google.protobuf.ListValue") {
        const msg = fromBinary(ListValueSchema, any.value);
        return msg.values.map((v) => convertProtobufJsonValue(v) as CelValue);
      }
      // google.protobuf.Any: recursively unpack
      if (any.typeUrl === "type.googleapis.com/google.protobuf.Any") {
        const msg = fromBinary(AnySchema, any.value);
        // Create a synthetic Value with objectValue case and recurse
        return protoValueToJS({
          kind: { case: "objectValue", value: msg },
        } as Value);
      }
      // Proto message types (TestAllTypes, NestedMessage, etc.)
      const schema = PROTO_SCHEMAS[any.typeUrl];
      if (schema) {
        const msg = fromBinary(schema, any.value) as unknown as Record<string, unknown>;
        return protoMessageToStruct(msg, schema);
      }
      throw new Error(`objectValue (proto Any) not supported yet: ${any.typeUrl}`);
    }
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
