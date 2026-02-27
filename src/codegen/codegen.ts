// ESTree AST → JavaScript source code generation.
// Wraps astring with custom handling for BigInt literals.

import { GENERATOR, generate } from "astring";
import type { Program } from "./estree-types.js";

// astring does not handle BigInt literals out of the box.
// We extend the base generator to support the `bigint` field on Literal nodes.
const customGenerator = {
  ...GENERATOR,
  Literal(
    node: { type: string; value: unknown; bigint?: string; raw?: string },
    state: { write: (s: string) => void },
  ) {
    if (node.bigint !== undefined) {
      state.write(`${node.bigint}n`);
      return;
    }
    // Delegate to base generator for all other literals
    GENERATOR.Literal(node as never, state as never);
  },
};

/**
 * Generate JavaScript source code from an ESTree Program.
 */
export function generateJs(ast: Program): string {
  return generate(ast as never, {
    generator: customGenerator as never,
  });
}
