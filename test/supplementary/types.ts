/**
 * Declarative test case format for supplementary tests harvested from
 * cel-js-marcbachmann and adapted for cel2js.
 */
export interface SupplementaryTest {
  /** Short descriptive name */
  name: string;
  /** CEL expression to evaluate */
  expr: string;
  /** Expected result (the JS value). Ignored when expectError is true. */
  expected?: unknown;
  /** If true, expect an error/throw during compile or evaluate */
  expectError?: boolean;
  /** Variable bindings for the expression */
  bindings?: Record<string, unknown>;
  /** Category for grouping */
  category: string;
}
