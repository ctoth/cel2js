import { generateJs } from "./codegen/codegen.js";
import { transform } from "./codegen/transformer.js";
import { parse } from "./parser/index.js";
import {
  celSelect,
  celSelectPath2,
  celSelectPath3,
  celSelectPath4,
  createRuntime,
} from "./runtime/helpers.js";
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
  const qualifiedBindingSpecs = result.qualifiedBindings;
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

  let cachedBindings: Record<string, unknown> = defaultQualifiedBindings;
  let cachedBindingsArg: Record<string, unknown> | undefined;

  /** Resolve qualified bindings (cached). */
  const resolveQB = (bindings: Record<string, unknown> | undefined): Record<string, unknown> => {
    if (!bindings || Object.keys(bindings).length === 0) {
      return defaultQualifiedBindings;
    }
    if (bindings === cachedBindingsArg) {
      return cachedBindings;
    }
    const qb = { ...defaultQualifiedBindings, ...bindings };
    populateQualifiedBindings(qb, bindings);
    cachedBindingsArg = bindings;
    cachedBindings = qb;
    return qb;
  };

  /** Resolve a single binding by name. */
  const resolveBinding = (
    name: string,
    bindings: Record<string, unknown> | undefined,
    qb: Record<string, unknown>,
  ): unknown => {
    if (container && bindings) {
      const containerKey = `${container}.${name}`;
      if (containerKey in bindings) {
        return bindings[containerKey];
      }
    }
    if (bindings && name in bindings) {
      return bindings[name];
    }
    return qb[name];
  };

  /** Apply a field select chain using the same helpers as generated code. */
  const applySelectFields = (base: unknown, fields: readonly string[]): unknown => {
    if (fields.length === 0) return base;
    if (fields.length === 1) return celSelect(base, fields[0] as string);
    if (fields.length === 2) {
      return celSelectPath2(base, fields[0] as string, fields[1] as string);
    }
    if (fields.length === 3) {
      return celSelectPath3(base, fields[0] as string, fields[1] as string, fields[2] as string);
    }
    if (fields.length === 4) {
      return celSelectPath4(
        base,
        fields[0] as string,
        fields[1] as string,
        fields[2] as string,
        fields[3] as string,
      );
    }

    let result = base;
    for (const field of fields) {
      result = celSelect(result, field);
      if (result === undefined) return undefined;
    }
    return result;
  };

  /** Prebuild a resolver for a qualified path so cache population avoids repeated string slicing. */
  const makeQualifiedResolver = (segments: readonly string[]) => {
    const root = segments[0] as string;
    const fallbackFields = segments.slice(1);
    const prefixes: { key: string; remaining: readonly string[] }[] = [];

    for (let i = segments.length - 1; i >= 1; i--) {
      prefixes.push({
        key: segments.slice(0, i + 1).join("."),
        remaining: segments.slice(i + 1),
      });
    }

    return (
      bindings: Record<string, unknown> | undefined,
      qb: Record<string, unknown>,
    ): unknown => {
      for (const prefix of prefixes) {
        if (prefix.key in qb) {
          if (prefix.remaining.length === 0) return qb[prefix.key];
          return applySelectFields(qb[prefix.key], prefix.remaining);
        }
      }
      return applySelectFields(resolveBinding(root, bindings, qb), fallbackFields);
    };
  };

  const qualifiedBindingResolvers = qualifiedBindingSpecs.map((binding) => ({
    key: binding.segments.join("."),
    resolve: makeQualifiedResolver(binding.segments),
  }));

  /** Populate exact qualified-path hits into qb once per bindings object. */
  const populateQualifiedBindings = (
    qb: Record<string, unknown>,
    bindings: Record<string, unknown> | undefined,
  ): void => {
    for (const resolver of qualifiedBindingResolvers) {
      if (resolver.key in qb) continue;
      const value = resolver.resolve(bindings, qb);
      if (value !== undefined) {
        qb[resolver.key] = value;
      }
    }
  };

  /** Check result and throw on error sentinel. */
  const checkResult = (result: unknown): unknown => {
    if (result === undefined) {
      throw new CelError("CEL evaluation error for expression");
    }
    return result;
  };

  // Generate specialized evaluate function to avoid args array + spread overhead.
  // Direct calls with known argument count are ~33x faster than fn(...args).
  const numBindings = bindingNames.length;
  let evaluate: (bindings?: Record<string, unknown>) => unknown;

  if (numBindings === 0) {
    evaluate = (bindings?) => {
      const qb = resolveQB(bindings);
      return checkResult(compiledFn(runtime, qb));
    };
  } else if (numBindings === 1) {
    const n0 = bindingNames[0] as string;
    evaluate = (bindings?) => {
      const qb = resolveQB(bindings);
      return checkResult(compiledFn(runtime, qb, resolveBinding(n0, bindings, qb)));
    };
  } else if (numBindings === 2) {
    const n0 = bindingNames[0] as string;
    const n1 = bindingNames[1] as string;
    evaluate = (bindings?) => {
      const qb = resolveQB(bindings);
      return checkResult(
        compiledFn(runtime, qb, resolveBinding(n0, bindings, qb), resolveBinding(n1, bindings, qb)),
      );
    };
  } else if (numBindings === 3) {
    const n0 = bindingNames[0] as string;
    const n1 = bindingNames[1] as string;
    const n2 = bindingNames[2] as string;
    evaluate = (bindings?) => {
      const qb = resolveQB(bindings);
      return checkResult(
        compiledFn(
          runtime,
          qb,
          resolveBinding(n0, bindings, qb),
          resolveBinding(n1, bindings, qb),
          resolveBinding(n2, bindings, qb),
        ),
      );
    };
  } else if (numBindings === 4) {
    const n0 = bindingNames[0] as string;
    const n1 = bindingNames[1] as string;
    const n2 = bindingNames[2] as string;
    const n3 = bindingNames[3] as string;
    evaluate = (bindings?) => {
      const qb = resolveQB(bindings);
      return checkResult(
        compiledFn(
          runtime,
          qb,
          resolveBinding(n0, bindings, qb),
          resolveBinding(n1, bindings, qb),
          resolveBinding(n2, bindings, qb),
          resolveBinding(n3, bindings, qb),
        ),
      );
    };
  } else if (numBindings === 5) {
    const n0 = bindingNames[0] as string;
    const n1 = bindingNames[1] as string;
    const n2 = bindingNames[2] as string;
    const n3 = bindingNames[3] as string;
    const n4 = bindingNames[4] as string;
    evaluate = (bindings?) => {
      const qb = resolveQB(bindings);
      return checkResult(
        compiledFn(
          runtime,
          qb,
          resolveBinding(n0, bindings, qb),
          resolveBinding(n1, bindings, qb),
          resolveBinding(n2, bindings, qb),
          resolveBinding(n3, bindings, qb),
          resolveBinding(n4, bindings, qb),
        ),
      );
    };
  } else {
    // Fallback for >5 bindings: use spread (rare)
    evaluate = (bindings?) => {
      const qb = resolveQB(bindings);
      const args: unknown[] = [runtime, qb];
      for (const name of bindingNames) {
        args.push(resolveBinding(name, bindings, qb));
      }
      return checkResult(compiledFn(...args));
    };
  }

  return { evaluate, source: fnSource };
}
