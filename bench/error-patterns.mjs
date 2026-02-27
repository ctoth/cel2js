// Error Handling Pattern Benchmarks for CEL-to-JS Codegen Strategy
// Run: node bench/error-patterns.mjs
// Or:  node --max-opt bench/error-patterns.mjs (for aggressive V8 optimization)

// ============================================================================
// Benchmark infrastructure
// ============================================================================

function benchmark(name, fn, iterations = 10_000_000) {
  // Warmup - enough iterations for V8 to optimize
  for (let i = 0; i < 10_000; i++) fn();

  const start = performance.now();
  for (let i = 0; i < iterations; i++) fn();
  const elapsed = performance.now() - start;

  const opsPerSec = Math.round(iterations / elapsed * 1000);
  return { name, opsPerSec, elapsed };
}

function runBenchmark(name, fn, iterations = 10_000_000, runs = 5) {
  const results = [];
  for (let r = 0; r < runs; r++) {
    results.push(benchmark(name, fn, iterations));
  }
  // Sort by opsPerSec, take median
  results.sort((a, b) => a.opsPerSec - b.opsPerSec);
  const median = results[Math.floor(results.length / 2)];
  console.log(`  ${name}: ${median.opsPerSec.toLocaleString()} ops/sec (${median.elapsed.toFixed(1)}ms)`);
  return median;
}

// ============================================================================
// Test data
// ============================================================================

// Good object: all fields present, result is true
const goodObj = { auth: { valid: true }, method: "GET" };

// Null auth object: auth.valid would throw
const nullObj = { auth: null, method: "GET" };

// Short-circuit: auth.valid = false, so false && anything = false
const falseObj = { auth: { valid: false }, method: "GET" };

// Error absorbed: auth is null (error on .valid), but method != GET so second operand is false
// In CEL: error && false = false (absorbed)
const errorAbsorbedObj = { auth: null, method: "POST" };

// Pre-populated versions (nulls replaced with {})
const nullObjPrePopulated = { auth: {}, method: "GET" };
const errorAbsorbedObjPrePopulated = { auth: {}, method: "POST" };

// Deep objects for property access benchmarks
const deepGood = { a: { b: { c: { d: 42 } } } };
const deepMissingL2 = { a: { b: null } };
const deepMissingL2PrePop = { a: { b: { c: { } } } };

// ============================================================================
// Pattern A: try/catch per operand
// ============================================================================

function patternA_tryCatch_happy(request) {
  let a, b, aErr = false, bErr = false;
  try { a = request.auth.valid; } catch { aErr = true; }
  try { b = request.method === "GET"; } catch { bErr = true; }
  if (a === false || b === false) return false;
  if (aErr) throw new Error("no_such_field");
  if (bErr) throw new Error("no_such_field");
  return a && b;
}

function patternA_tryCatch_shortCircuit(request) {
  let a, b, aErr = false, bErr = false;
  try { a = request.auth.valid; } catch { aErr = true; }
  try { b = request.method === "GET"; } catch { bErr = true; }
  if (a === false || b === false) return false;
  if (aErr) throw new Error("no_such_field");
  if (bErr) throw new Error("no_such_field");
  return a && b;
}

function patternA_tryCatch_errorAbsorbed(request) {
  let a, b, aErr = false, bErr = false;
  try { a = request.auth.valid; } catch { aErr = true; }
  try { b = request.method === "GET"; } catch { bErr = true; }
  if (a === false || b === false) return false;
  if (aErr) throw new Error("no_such_field");
  if (bErr) throw new Error("no_such_field");
  return a && b;
}

// ============================================================================
// Pattern B: undefined sentinel via optional chaining
// ============================================================================

function patternB_undefined_happy(request) {
  const a = request?.auth?.valid;
  const b = request?.method === "GET";
  if (a === false || b === false) return false;
  if (a === undefined) throw new Error("no_such_field");
  return a && b;
}

function patternB_undefined_shortCircuit(request) {
  const a = request?.auth?.valid;
  const b = request?.method === "GET";
  if (a === false || b === false) return false;
  if (a === undefined) throw new Error("no_such_field");
  return a && b;
}

function patternB_undefined_errorAbsorbed(request) {
  const a = request?.auth?.valid;
  const b = request?.method === "GET";
  if (a === false || b === false) return false;
  if (a === undefined) throw new Error("no_such_field");
  return a && b;
}

// ============================================================================
// Pattern C: Pre-populated empty objects (no optional chaining needed)
// ============================================================================

function patternC_emptyObj_happy(request) {
  const a = request.auth.valid;
  const b = request.method === "GET";
  if (a === false || b === false) return false;
  if (a === undefined) throw new Error("no_such_field");
  return a && b;
}

function patternC_emptyObj_shortCircuit(request) {
  const a = request.auth.valid;
  const b = request.method === "GET";
  if (a === false || b === false) return false;
  if (a === undefined) throw new Error("no_such_field");
  return a && b;
}

function patternC_emptyObj_errorAbsorbed(request) {
  // With pre-populated objects, auth is {} so auth.valid = undefined (no throw)
  // method is "POST" so b is false, absorbed
  const a = request.auth.valid;
  const b = request.method === "GET";
  if (a === false || b === false) return false;
  if (a === undefined) throw new Error("no_such_field");
  return a && b;
}

// ============================================================================
// Pattern D: Static analysis (no error handling)
// ============================================================================

function patternD_static(x, y) {
  return x > 5 && y > 3;
}

// ============================================================================
// Pattern E: Symbol sentinel
// ============================================================================

const CEL_ERROR = Symbol('cel_error');

function patternE_symbol_happy(request) {
  const a = request?.auth?.valid ?? CEL_ERROR;
  const b = request?.method === "GET";
  if (a === false || b === false) return false;
  if (a === CEL_ERROR) throw new Error("no_such_field");
  return a && b;
}

function patternE_symbol_shortCircuit(request) {
  const a = request?.auth?.valid ?? CEL_ERROR;
  const b = request?.method === "GET";
  if (a === false || b === false) return false;
  if (a === CEL_ERROR) throw new Error("no_such_field");
  return a && b;
}

function patternE_symbol_errorAbsorbed(request) {
  const a = request?.auth?.valid ?? CEL_ERROR;
  const b = request?.method === "GET";
  if (a === false || b === false) return false;
  if (a === CEL_ERROR) throw new Error("no_such_field");
  return a && b;
}

// ============================================================================
// Pattern F: Pre-evaluate into array
// ============================================================================

function patternF_array_happy(request) {
  const r = [request?.auth?.valid, request?.method === "GET"];
  if (r[0] === false || r[1] === false) return false;
  if (r[0] === undefined) throw new Error("no_such_field");
  return r[0] && r[1];
}

function patternF_array_shortCircuit(request) {
  const r = [request?.auth?.valid, request?.method === "GET"];
  if (r[0] === false || r[1] === false) return false;
  if (r[0] === undefined) throw new Error("no_such_field");
  return r[0] && r[1];
}

function patternF_array_errorAbsorbed(request) {
  const r = [request?.auth?.valid, request?.method === "GET"];
  if (r[0] === false || r[1] === false) return false;
  if (r[0] === undefined) throw new Error("no_such_field");
  return r[0] && r[1];
}

// ============================================================================
// Property Access Patterns (separate from error absorption)
// ============================================================================

function propAccess_direct(obj) {
  return obj.a.b.c.d;
}

function propAccess_optionalChain(obj) {
  return obj?.a?.b?.c?.d;
}

function propAccess_emptyObj(obj) {
  return obj.a.b.c.d;
}

// ============================================================================
// Run benchmarks
// ============================================================================

const allResults = {};

function section(title) {
  console.log(`\n${"=".repeat(70)}`);
  console.log(`  ${title}`);
  console.log(`${"=".repeat(70)}`);
}

// --- Error Absorption: Happy Path ---
section("PATTERN COMPARISON: Happy Path (goodObj, both operands true)");

allResults['A_happy'] = runBenchmark('A: try/catch', () => patternA_tryCatch_happy(goodObj));
allResults['B_happy'] = runBenchmark('B: optional chain + undefined', () => patternB_undefined_happy(goodObj));
allResults['C_happy'] = runBenchmark('C: empty objects + direct', () => patternC_emptyObj_happy(goodObj));
allResults['D_happy'] = runBenchmark('D: static (no error handling)', () => patternD_static(10, 7));
allResults['E_happy'] = runBenchmark('E: symbol sentinel', () => patternE_symbol_happy(goodObj));
allResults['F_happy'] = runBenchmark('F: array pre-eval', () => patternF_array_happy(goodObj));

// --- Error Absorption: Short-Circuit Path ---
section("PATTERN COMPARISON: Short-Circuit (falseObj, first operand false)");

allResults['A_short'] = runBenchmark('A: try/catch', () => patternA_tryCatch_shortCircuit(falseObj));
allResults['B_short'] = runBenchmark('B: optional chain + undefined', () => patternB_undefined_shortCircuit(falseObj));
allResults['C_short'] = runBenchmark('C: empty objects + direct', () => patternC_emptyObj_shortCircuit(falseObj));
allResults['D_short'] = runBenchmark('D: static (no error handling)', () => patternD_static(3, 7));
allResults['E_short'] = runBenchmark('E: symbol sentinel', () => patternE_symbol_shortCircuit(falseObj));
allResults['F_short'] = runBenchmark('F: array pre-eval', () => patternF_array_shortCircuit(falseObj));

// --- Error Absorption: Error Absorbed ---
section("PATTERN COMPARISON: Error Absorbed (error && false = false)");
// Pattern A: nullObj causes catch, but method=POST so b=false, absorbed
allResults['A_absorbed'] = runBenchmark('A: try/catch', () => patternA_tryCatch_errorAbsorbed(errorAbsorbedObj));
// Pattern B: nullObj causes ?. to return undefined, method=POST so b=false, absorbed
allResults['B_absorbed'] = runBenchmark('B: optional chain + undefined', () => patternB_undefined_errorAbsorbed(errorAbsorbedObj));
// Pattern C: pre-populated, auth={}, auth.valid=undefined, method=POST so b=false, absorbed
allResults['C_absorbed'] = runBenchmark('C: empty objects + direct', () => patternC_emptyObj_errorAbsorbed(errorAbsorbedObjPrePopulated));
// Pattern D: no error case possible
allResults['D_absorbed'] = { name: 'D: static (N/A)', opsPerSec: 0, elapsed: 0 };
console.log('  D: static (N/A) — no error case');
// Pattern E: nullObj, ?. returns undefined, ?? gives CEL_ERROR, method=POST so b=false, absorbed
allResults['E_absorbed'] = runBenchmark('E: symbol sentinel', () => patternE_symbol_errorAbsorbed(errorAbsorbedObj));
// Pattern F: nullObj, ?. returns undefined, method=POST so b=false, absorbed
allResults['F_absorbed'] = runBenchmark('F: array pre-eval', () => patternF_array_errorAbsorbed(errorAbsorbedObj));

// --- Deep Property Access ---
section("PROPERTY ACCESS: Deep (4 levels, all fields present)");

allResults['prop_direct_good'] = runBenchmark('Direct: obj.a.b.c.d', () => propAccess_direct(deepGood));
allResults['prop_optional_good'] = runBenchmark('Optional: obj?.a?.b?.c?.d', () => propAccess_optionalChain(deepGood));
allResults['prop_emptyObj_good'] = runBenchmark('EmptyObj: obj.a.b.c.d (prepop)', () => propAccess_emptyObj(deepGood));

section("PROPERTY ACCESS: Shallow miss (missing at level 2)");

allResults['prop_optional_miss'] = runBenchmark('Optional: obj?.a?.b?.c?.d (miss)', () => propAccess_optionalChain(deepMissingL2));
allResults['prop_emptyObj_miss'] = runBenchmark('EmptyObj: obj.a.b.c.d (prepop miss)', () => propAccess_emptyObj(deepMissingL2PrePop));

// Direct access on missing throws, so we measure try/catch for it
function propAccess_direct_tryCatch(obj) {
  try { return obj.a.b.c.d; } catch { return undefined; }
}
allResults['prop_direct_miss'] = runBenchmark('Direct+try/catch: obj.a.b.c.d (miss)', () => propAccess_direct_tryCatch(deepMissingL2));

// --- Two boolean variables (static case) ---
section("SIMPLE CASE: Two boolean variables (no property access)");

const boolTrue1 = true, boolTrue2 = true;
const boolFalse1 = false;

function simpleBoolAnd(a, b) {
  return a && b;
}

function simpleBoolAndWithUndefinedCheck(a, b) {
  if (a === false || b === false) return false;
  if (a === undefined || b === undefined) throw new Error("error");
  return a && b;
}

allResults['simple_and'] = runBenchmark('Plain: a && b (both true)', () => simpleBoolAnd(boolTrue1, boolTrue2));
allResults['simple_and_check'] = runBenchmark('With undefined check (both true)', () => simpleBoolAndWithUndefinedCheck(boolTrue1, boolTrue2));
allResults['simple_and_false'] = runBenchmark('Plain: a && b (a=false)', () => simpleBoolAnd(boolFalse1, boolTrue2));
allResults['simple_and_check_false'] = runBenchmark('With undefined check (a=false)', () => simpleBoolAndWithUndefinedCheck(boolFalse1, boolTrue2));

// ============================================================================
// Summary Table
// ============================================================================

section("SUMMARY TABLE");

function formatOps(ops) {
  if (ops === 0) return 'N/A';
  if (ops >= 1_000_000_000) return `${(ops / 1_000_000_000).toFixed(2)}B`;
  if (ops >= 1_000_000) return `${(ops / 1_000_000).toFixed(1)}M`;
  if (ops >= 1_000) return `${(ops / 1_000).toFixed(1)}K`;
  return `${ops}`;
}

console.log('\n--- Error Absorption Patterns ---');
console.log(`${'Pattern'.padEnd(35)} ${'Happy'.padStart(12)} ${'ShortCirc'.padStart(12)} ${'ErrAbsorb'.padStart(12)}`);
console.log('-'.repeat(71));
for (const prefix of ['A', 'B', 'C', 'D', 'E', 'F']) {
  const happy = allResults[`${prefix}_happy`];
  const short = allResults[`${prefix}_short`];
  const absorbed = allResults[`${prefix}_absorbed`];
  const name = happy?.name || absorbed?.name || `${prefix}: ???`;
  console.log(
    `${name.padEnd(35)} ${formatOps(happy?.opsPerSec || 0).padStart(12)} ${formatOps(short?.opsPerSec || 0).padStart(12)} ${formatOps(absorbed?.opsPerSec || 0).padStart(12)}`
  );
}

console.log('\n--- Property Access Patterns ---');
console.log(`${'Pattern'.padEnd(45)} ${'ops/sec'.padStart(12)}`);
console.log('-'.repeat(57));
for (const key of ['prop_direct_good', 'prop_optional_good', 'prop_emptyObj_good', 'prop_optional_miss', 'prop_emptyObj_miss', 'prop_direct_miss']) {
  const r = allResults[key];
  if (r) console.log(`${r.name.padEnd(45)} ${formatOps(r.opsPerSec).padStart(12)}`);
}

console.log('\n--- Simple Boolean (baseline) ---');
console.log(`${'Pattern'.padEnd(45)} ${'ops/sec'.padStart(12)}`);
console.log('-'.repeat(57));
for (const key of ['simple_and', 'simple_and_check', 'simple_and_false', 'simple_and_check_false']) {
  const r = allResults[key];
  if (r) console.log(`${r.name.padEnd(45)} ${formatOps(r.opsPerSec).padStart(12)}`);
}

// Output JSON for report processing
console.log('\n\n--- RAW JSON ---');
console.log(JSON.stringify(allResults, null, 2));
