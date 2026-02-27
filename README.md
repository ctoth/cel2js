# cel2js

CEL ([Common Expression Language](https://github.com/google/cel-spec)) to JavaScript transpiler. Compiles CEL expressions into JavaScript functions.

```typescript
import { compile } from "cel2js";

const { evaluate } = compile('name.startsWith("J") && age > 21');

evaluate({ name: "Jane", age: 30n }); // true
evaluate({ name: "Bob", age: 25n });  // false
```

## Install

```
npm install cel2js
```

## How it works

cel2js is a transpiler, not an interpreter. The pipeline:

```
CEL source --> Peggy parser --> CelExpr AST --> ESTree transformer --> astring --> JS source --> new Function()
```

Once compiled, `evaluate()` is a direct function call with no AST walking, no interpretation loop, no overhead beyond the generated code itself. The generated code calls runtime helpers for type-safe operations (overflow checks, cross-type comparison, error handling).

## Performance

Hot path (pre-compiled, evaluate only):

| Expression | ops/sec | % of native |
|------------|---------|-------------|
| `true` | 15.5M | 97% |
| `x + y * 2` | 7.6M | 49% |
| `name.startsWith("J") && name.size() > 3` | 8.8M | 57% |
| `x > 0 ? x * 2 : -x` | 9.4M | 60% |
| `[1,2,3,4,5].filter(x, x > 2)` | 8.0M | 68% |
| `request.auth.claims.email.endsWith("@example.com") && request.method == "GET"` | 4.8M | 41% |

"Native" baseline is a hand-written `new Function()` doing the equivalent work.

Cold path (compile + evaluate): 22K-94K ops/sec depending on expression complexity.

vs other CEL implementations (hot path):

| | cel2js | @marcbachmann/cel-js | @bufbuild/cel | cel-js |
|---|--------|---------------------|---------------|--------|
| `x + y * 2` | 7.6M | 4.3M | 2.6M | 600K |
| `[1,2,3,4,5].filter(x, x > 2)` | 8.0M | 2.3M | 238K | -- |
| real-world field access | 4.8M | 2.2M | 376K | -- |

## Conformance

3,119 tests passing. Zero failures.

- 2,344 tests from the [cel-spec](https://github.com/google/cel-spec) conformance suite (28 suites)
- 664 supplementary tests harvested from existing JS implementations
- 43 parser unit tests
- 19 individual conformance tests skipped -- all require proto binary deserialization or schema-level type info not available at JS runtime (e.g., `google.protobuf.Any` unpacking, strong enum `type()`)

## API

### `compile(cel, options?)`

```typescript
function compile(cel: string, options?: CompileOptions): CompileResult;

interface CompileOptions {
  disableMacros?: boolean;  // Disable macro expansion (has, all, exists, exists_one, map, filter)
  container?: string;       // CEL container (namespace) for identifier resolution
}

interface CompileResult {
  evaluate: (bindings?: Record<string, unknown>) => unknown;
  source: string;  // The generated JavaScript source
}
```

`evaluate()` throws `CelError` (extends `Error`, `name === "CelError"`) on runtime errors: division by zero, type mismatch, overflow, missing field.

### Type exports

```typescript
import { CelUint, celUint, isCelUint, CelType, isCelType } from "cel2js";
import type { CelValue, CompileOptions, CompileResult } from "cel2js";
```

## Types

CEL int64 maps to JavaScript BigInt. Pass integers as BigInt literals:

```typescript
evaluate({ age: 30n });     // correct
evaluate({ age: 30 });      // wrong -- 30 is a double in CEL, not an integer
```

For unsigned integers, wrap with `CelUint`:

```typescript
import { celUint } from "cel2js";
evaluate({ port: celUint(8080n) });
```

Overflow is checked: int64 results outside [-2^63, 2^63-1] and uint64 results outside [0, 2^64-1] produce errors.

## Generated code

`compile()` returns the generated JavaScript source in `source`. For `x + y * 2`:

```javascript
((_rt, _qb, x, y) => {
  return _rt.add(x, _rt.mul(y, 2n));
})
```

For `name.startsWith("J") && age > 21`:

```javascript
((_rt, _qb, name, age) => {
  let _a = undefined;
  let _b = undefined;
  return (_a = _rt.startsWith(name, "J"), _b = _rt.gt(age, 21n),
    _a === false ? false : _b === false ? false :
    _a === true && _b === true ? true : undefined);
})
```

`_rt` is the runtime helpers object. `_qb` is reserved for qualified bindings. All CEL operations route through runtime helpers for type safety and overflow checking. Logical AND/OR evaluate both sides and use commutative error absorption (false wins over error for AND, true wins over error for OR) -- no try/catch anywhere in generated code.

## Compatibility

Pure ESM, ES2022 target. No Node-specific APIs -- works in any environment that supports ES2022 and `new Function()` (will not work in CSP-restricted environments that block dynamic code generation).

## Dependencies

One runtime dependency: [astring](https://github.com/nicolo-ribaudo/astring) (ESTree-to-JS code generator, zero transitive dependencies).

## License

MIT
