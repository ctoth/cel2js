export interface CompileResult {
  /** The compiled evaluation function */
  evaluate: (bindings: Record<string, unknown>) => unknown;
  /** The generated JavaScript source code */
  source: string;
}

export interface CompileOptions {
  /** Disable macro expansion */
  disableMacros?: boolean;
}

export function compile(
  cel: string,
  _options?: CompileOptions,
): CompileResult {
  throw new Error(`cel2js: transpiler not implemented (expression: ${cel})`);
}
