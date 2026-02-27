# Benchmark Harness Report

## Files Created/Modified

### New files:
- `bench/shared.ts` -- Shared benchmark case definitions (6 expression categories with typed contexts for each library)
- `bench/native.bench.ts` -- Native `new Function()` baseline benchmarks
- `bench/competitors.bench.ts` -- Benchmarks for @marcbachmann/cel-js, @bufbuild/cel, and cel-js
- `bench/cel2js.bench.ts` -- Transpiler benchmarks (stub, gracefully skips since transpiler is not implemented)

### Modified files:
- `package.json` -- Added `bench` and `bench:run` scripts; added competitor packages as devDependencies
- `package-lock.json` -- Updated lockfile
- `vitest.config.ts` -- Added `benchmark.include` configuration for `bench/**/*.bench.ts`

## Dependencies Added (devDependencies)
- `@marcbachmann/cel-js` ^7.5.1
- `@bufbuild/cel` ^0.4.0
- `cel-js` ^0.8.2

## Library API Notes

### Type handling
Both `@marcbachmann/cel-js` and `@bufbuild/cel` are strict about CEL types. JS `number` values are treated as `double`, and CEL integer literals (`2`) are `int`. Since `double * int` has no overload in CEL, integer contexts must use `BigInt`. The `BenchmarkCase` interface provides both `context` (plain JS numbers for cel-js and native) and `contextBigInt` (BigInt values for the two strict libraries).

### Expression support by library

| Expression | @marcbachmann/cel-js | @bufbuild/cel | cel-js |
|---|---|---|---|
| `true` | works | works | works |
| `x + y * 2` | works (BigInt) | works (BigInt) | works |
| `name.startsWith("J") && name.size() > 3` | works | works | FAILS (no startsWith) |
| `x > 0 ? x * 2 : -x` | works (BigInt) | works (BigInt) | works |
| `[1,2,3,4,5].filter(x, x > 2)` | works | works | FAILS (parse error) |
| `request.auth...endsWith(...)` | works | works | FAILS (no endsWith) |

## Benchmark Results

All benchmarks run on Node.js v22.18.0, Windows (MSYS_NT-10.0-26200), vitest 3.2.4.

### Native Baseline (new Function -- theoretical ceiling)

| Expression | ops/sec |
|---|---|
| `true` | 14,883,470 |
| `x + y * 2` | 13,680,937 |
| `name.startsWith("J") && name.size() > 3` | 14,006,281 |
| `x > 0 ? x * 2 : -x` | 14,563,349 |
| `[1,2,3,4,5].filter(x, x > 2)` | 11,471,306 |
| `request...endsWith(...) && ...` | 10,368,444 |

### @marcbachmann/cel-js

| Expression | Cold (parse+eval) | Hot (pre-parsed) |
|---|---|---|
| `true` | 2,141,238 | 16,201,331 |
| `x + y * 2` | 770,432 | 3,936,566 |
| `name.startsWith("J") && name.size() > 3` | 421,128 | 2,647,353 |
| `x > 0 ? x * 2 : -x` | 569,535 | 4,056,184 |
| `[1,2,3,4,5].filter(x, x > 2)` | 327,266 | 2,078,702 |
| `request...endsWith(...) && ...` | 339,610 | 1,931,722 |

### @bufbuild/cel

| Expression | Cold (parse+eval) | Hot (pre-planned) |
|---|---|---|
| `true` | 33,607 | 14,417,732 |
| `x + y * 2` | 23,574 | 2,344,677 |
| `name.startsWith("J") && name.size() > 3` | 13,368 | 1,759,201 |
| `x > 0 ? x * 2 : -x` | 14,808 | 2,279,624 |
| `[1,2,3,4,5].filter(x, x > 2)` | 10,939 | 214,717 |
| `request...endsWith(...) && ...` | 9,987 | 344,817 |

### cel-js

| Expression | Cold (parse+eval) | Hot (pre-parsed) |
|---|---|---|
| `true` | 343,985 | 846,620 |
| `x + y * 2` | 194,201 | 532,750 |
| `x > 0 ? x * 2 : -x` | 105,799 | 436,453 |

(cel-js failed on string_ops, comprehension, and real_world expressions)

### cel2js (transpiler stub)

All benchmarks skipped -- transpiler not yet implemented. The placeholder benchmark ran at ~17M ops/sec (no-op baseline).

## Key Observations

1. **@marcbachmann/cel-js remains the fastest existing CEL library** for hot evaluation: 2-16M ops/sec depending on expression complexity.

2. **@bufbuild/cel hot eval for `true` matches native speed** (14.4M vs 14.9M ops/sec), but its cold path is extremely expensive (33K ops/sec due to parse+plan overhead).

3. **Native `new Function()` baseline ranges from 10-15M ops/sec** across all expressions, confirming tight overhead once compiled.

4. **The opportunity for cel2js is clear**: if we transpile to native JS, our hot path should match native baseline (10-15M ops/sec), while competitors peak at 3-4M ops/sec for non-trivial expressions (marcbachmann) or 2M ops/sec (bufbuild).

5. **cel-js is incomplete**: it fails on `startsWith`, `endsWith`, `filter`, making it not viable for real-world CEL usage.

## Commands

```bash
npm run bench       # Watch mode
npm run bench:run   # Single run
```

## Commit Hash

`51e6434` -- "Add benchmark harness comparing cel2js against 3 competitors and native baseline"
