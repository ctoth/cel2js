import type { IncrementalTest } from "@bufbuild/cel-spec/testdata/tests.js";
import { compile } from "../../src/transpiler.js";
import { protoValueToJS, protoBindingsToJS } from "./values.js";
import { celDeepEqual } from "./compare.js";

/**
 * Execute a single conformance test case.
 *
 * 1. Transpile the CEL expression to JS (currently throws "not implemented")
 * 2. Convert proto bindings to JS values
 * 3. Evaluate and compare based on the result matcher type
 */
export function runSimpleTest(test: IncrementalTest): void {
  const { expr, bindings, resultMatcher, disableMacros } = test.original;

  // Transpile CEL to JS
  const compiled = compile(expr, { disableMacros: disableMacros || undefined });

  // Convert bindings from proto to JS
  const jsBindings = protoBindingsToJS(bindings);

  // Execute based on expected result type
  switch (resultMatcher.case) {
    case "value": {
      const result = compiled.evaluate(jsBindings);
      const expected = protoValueToJS(resultMatcher.value);
      if (!celDeepEqual(result, expected)) {
        throw new Error(
          `Value mismatch for "${expr}":\n` +
            `  expected: ${formatValue(expected)}\n` +
            `  actual:   ${formatValue(result)}`,
        );
      }
      break;
    }
    case "evalError":
    case "anyEvalErrors": {
      let threw = false;
      try {
        compiled.evaluate(jsBindings);
      } catch {
        threw = true;
      }
      if (!threw) {
        throw new Error(`Expected error for "${expr}" but got a result`);
      }
      break;
    }
    case "typedResult": {
      // For now, only check the value part if present
      if (resultMatcher.value.result) {
        const result = compiled.evaluate(jsBindings);
        const expected = protoValueToJS(resultMatcher.value.result);
        if (!celDeepEqual(result, expected)) {
          throw new Error(
            `TypedResult value mismatch for "${expr}":\n` +
              `  expected: ${formatValue(expected)}\n` +
              `  actual:   ${formatValue(result)}`,
          );
        }
      }
      break;
    }
    case undefined: {
      // Default: expect true
      const result = compiled.evaluate(jsBindings);
      if (result !== true) {
        throw new Error(`Expected true for "${expr}" but got ${formatValue(result)}`);
      }
      break;
    }
    default:
      throw new Error(
        `Unsupported result matcher: ${(resultMatcher as { case: string }).case}`,
      );
  }
}

/** Format a value for error messages */
function formatValue(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "bigint") return `${value}n`;
  if (value instanceof Uint8Array) {
    return `Uint8Array[${Array.from(value).join(", ")}]`;
  }
  if (value instanceof Map) {
    const entries = Array.from(value.entries())
      .map(([k, v]) => `${formatValue(k)}: ${formatValue(v)}`)
      .join(", ");
    return `Map{${entries}}`;
  }
  if (Array.isArray(value)) {
    return `[${value.map(formatValue).join(", ")}]`;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
