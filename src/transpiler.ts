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
  const baseRuntime = createRuntime();

  // Wrap runtime with a Proxy: unknown method calls return a function
  // that returns undefined (our error sentinel) instead of throwing TypeError.
  const runtime = new Proxy(baseRuntime, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (value !== undefined) return value;
      // Unknown property: return a function that returns undefined (CEL error)
      if (typeof prop === "string") {
        return () => undefined;
      }
      return undefined;
    },
  });

  const bindingNames = result.bindings;
  const container = options?.container;

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
      args.push(bindings?.[name]);
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
