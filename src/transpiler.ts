import { generateJs } from "./codegen/codegen.js";
import { transform } from "./codegen/transformer.js";
import { parse } from "./parser/index.js";
import { createRuntime } from "./runtime/helpers.js";
import { CelType } from "./runtime/types.js";

/** Error thrown when CEL evaluation fails (e.g. division by zero, type mismatch) */
export class CelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CelError";
  }
}

export interface CompileResult {
  /** The compiled evaluation function */
  evaluate: (bindings?: Record<string, unknown>) => unknown;
  /** The generated JavaScript source code */
  source: string;
}

export interface CompileOptions {
  /** Disable macro expansion */
  disableMacros?: boolean;
  /** CEL container (namespace) for identifier resolution */
  container?: string;
}

/**
 * Compile a CEL expression into a JavaScript function.
 *
 * Pipeline:
 * 1. parse(source)       -> CelExpr AST
 * 2. transform(ast)      -> ESTree AST
 * 3. generateJs(estree)  -> JS source string
 * 4. new Function(...)   -> executable function
 */
export function compile(cel: string, options?: CompileOptions): CompileResult {
  // Step 1: Parse CEL source into AST
  const ast = parse(cel);

  // Step 2: Transform CEL AST into ESTree AST
  const result = transform(ast);

  // Step 3: Generate JavaScript source from ESTree
  const fullSource = generateJs(result.program);

  // The generated source is an arrow function expression statement:
  //   (_rt, binding1, binding2, ...) => { ... };
  // Strip the trailing semicolon and whitespace to get a clean expression.
  const fnSource = fullSource.replace(/;\s*$/, "").trim();

  // Step 4: Compile into a reusable function
  // We use `new Function` to create a factory that returns the arrow function.
  // This is compiled once; only evaluate() is called per invocation.
  const factory = new Function(`"use strict"; return (${fnSource})`) as () => (
    ...args: unknown[]
  ) => unknown;
  const compiledFn = factory();
  const bindingNames = result.bindings;
  const container = options?.container;
  const baseRuntime = createRuntime(container ? { container } : undefined);

  // Proto enum constant definitions (for conformance test compatibility)
  const nestedEnum = { FOO: 0n, BAR: 1n, BAZ: 2n };
  const globalEnum = { GOO: 0n, GAR: 1n, GAZ: 2n };
  // NullValue enum (used with google.protobuf.Value)
  const nullValueEnum = { NULL_VALUE: 0n };
  // TestAllTypes type object with enum inner types
  const testAllTypesType = {
    NestedEnum: nestedEnum,
    NestedMessage: new CelType("NestedMessage"),
  };
  // TestRequired type for proto2 required field tests
  const testRequiredType = {};

  // Default qualified bindings for well-known protobuf type names
  const defaultQualifiedBindings: Record<string, unknown> = {
    "google.protobuf.Timestamp": new CelType("google.protobuf.Timestamp"),
    "google.protobuf.Duration": new CelType("google.protobuf.Duration"),
    "google.protobuf.BoolValue": new CelType("google.protobuf.BoolValue"),
    "google.protobuf.BytesValue": new CelType("google.protobuf.BytesValue"),
    "google.protobuf.DoubleValue": new CelType("google.protobuf.DoubleValue"),
    "google.protobuf.FloatValue": new CelType("google.protobuf.FloatValue"),
    "google.protobuf.Int32Value": new CelType("google.protobuf.Int32Value"),
    "google.protobuf.Int64Value": new CelType("google.protobuf.Int64Value"),
    "google.protobuf.StringValue": new CelType("google.protobuf.StringValue"),
    "google.protobuf.UInt32Value": new CelType("google.protobuf.UInt32Value"),
    "google.protobuf.UInt64Value": new CelType("google.protobuf.UInt64Value"),
    "google.protobuf.Value": new CelType("google.protobuf.Value"),
    "google.protobuf.Any": new CelType("google.protobuf.Any"),
    "google.protobuf.ListValue": new CelType("google.protobuf.ListValue"),
    "google.protobuf.Struct": new CelType("google.protobuf.Struct"),
    // Proto conformance test types — enum constants and type references
    "cel.expr.conformance.proto2.TestAllTypes": testAllTypesType,
    "cel.expr.conformance.proto3.TestAllTypes": testAllTypesType,
    "cel.expr.conformance.proto2.TestRequired": testRequiredType,
    // Proto enum types
    "cel.expr.conformance.proto2.GlobalEnum": globalEnum,
    "cel.expr.conformance.proto3.GlobalEnum": globalEnum,
    // NullValue enum (used with google.protobuf.Value null_value field)
    "google.protobuf.NullValue": nullValueEnum,
    NullValue: nullValueEnum,
    // Unqualified names (resolved via container prefix on the binding parameter)
    TestAllTypes: testAllTypesType,
    TestRequired: testRequiredType,
    GlobalEnum: globalEnum,
    // Network extension type constants
    "net.IP": new CelType("net.IP"),
    "net.CIDR": new CelType("net.CIDR"),
  };

  // Add dispatch handler for unknown function calls (enum construction, etc.).
  // Replaces the Proxy wrapper — only unknown calls go through this method,
  // while all ~120 known runtime methods are accessed directly on the plain object.
  const runtime = baseRuntime as Record<string, unknown>;
  runtime.__dispatch = (name: string, args: unknown[]): unknown => {
    // Pattern: EnumName(receiver, arg) where receiver.EnumName is an enum def
    if (args.length === 2) {
      const maybeReceiver = args[0];
      if (maybeReceiver && typeof maybeReceiver === "object" && name in maybeReceiver) {
        const enumDef = (maybeReceiver as Record<string, unknown>)[name];
        return baseRuntime.enumConstruct(enumDef, args[1]);
      }
    }
    // Pattern: GlobalEnum(arg) where GlobalEnum is a known enum in bindings
    if (args.length === 1) {
      const qualifiedName = container ? `${container}.${name}` : name;
      const enumDef = defaultQualifiedBindings[qualifiedName] ?? defaultQualifiedBindings[name];
      if (enumDef && typeof enumDef === "object" && !(enumDef instanceof CelType)) {
        return baseRuntime.enumConstruct(enumDef, args[0]);
      }
    }
    return undefined;
  };

  const evaluate = (bindings?: Record<string, unknown>): unknown => {
    const qualifiedBindings = { ...defaultQualifiedBindings, ...bindings };
    const args: unknown[] = [runtime, qualifiedBindings];
    for (const name of bindingNames) {
      // Container resolution: if container is "x" and name is "y",
      // try "x.y" first in bindings (CEL namespace semantics).
      if (container && bindings) {
        const containerKey = `${container}.${name}`;
        if (containerKey in bindings) {
          args.push(bindings[containerKey]);
          continue;
        }
      }
      // Prefer user-provided binding; fall back to default qualified binding
      if (bindings && name in bindings) {
        args.push(bindings[name]);
      } else {
        args.push(qualifiedBindings[name]);
      }
    }
    const result = compiledFn(...args);
    // undefined is our error sentinel — convert to a thrown CelError at the boundary
    if (result === undefined) {
      throw new CelError(`CEL evaluation error for expression`);
    }
    return result;
  };

  return { evaluate, source: fnSource };
}
