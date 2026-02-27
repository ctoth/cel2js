/**
 * Shared test utilities for cel2js tests.
 */

/**
 * Helper to assert that a function throws an error matching a pattern.
 */
export function expectThrows(fn: () => unknown, pattern?: RegExp): void {
  let threw = false;
  let error: unknown;
  try {
    fn();
  } catch (e) {
    threw = true;
    error = e;
  }
  if (!threw) {
    throw new Error("Expected function to throw, but it did not");
  }
  if (pattern && error instanceof Error && !pattern.test(error.message)) {
    throw new Error(
      `Expected error matching ${pattern} but got: ${error.message}`,
    );
  }
}
