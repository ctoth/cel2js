import { generateJs } from "./codegen/codegen.js";
import { transform } from "./codegen/transformer.js";
import { parse } from "./parser/index.js";
import { createRuntime } from "./runtime/helpers.js";

export interface CompileResult {
  /** The compiled evaluation function */
  evaluate: (bindings?: Record<string, unknown>) => unknown;
  /** The generated JavaScript source code */
  source: string;
}

export interface CompileOptions {
  /** Disable macro expansion */
  disableMacros?: boolean;
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
export function compile(cel: string, _options?: CompileOptions): CompileResult {
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
  const runtime = createRuntime();
  const bindingNames = result.bindings;

  const evaluate = (bindings?: Record<string, unknown>): unknown => {
    const args: unknown[] = [runtime];
    for (const name of bindingNames) {
      args.push(bindings?.[name]);
    }
    return compiledFn(...args);
  };

  return { evaluate, source: fnSource };
}
