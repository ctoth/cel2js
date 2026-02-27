import type { CelExpr } from "./ast.js";

export interface ParseOptions {
  startRule?: string;
  tracer?: unknown;
  [key: string]: unknown;
}

export function parse(input: string, options?: ParseOptions): CelExpr;
