// CEL AST -> ESTree AST transformer.
// Walks the CelExpr discriminated union and produces ESTree nodes.

import type { CelExpr } from "../parser/ast.js";
import {
  arrayExpr,
  arrowFn,
  assignExpr,
  bigintLiteral,
  binaryExpr,
  blockStatement,
  conditional,
  exprStatement,
  identifier,
  literal,
  logicalExpr,
  memberExpr,
  newExpr,
  program,
  returnStatement,
  rtCall,
  sequenceExpr,
  varDecl,
} from "./estree-builders.js";
import type { Expression, Program, Statement } from "./estree-types.js";

// ---------------------------------------------------------------------------
// Temp variable allocator for logical AND/OR error absorption
// ---------------------------------------------------------------------------

class TempAllocator {
  private counter = 0;
  private readonly used: string[] = [];

  next(): string {
    const n = this.counter;
    // _a.._z, then _aa, _ab, ... for overflow
    let name: string;
    if (n < 26) {
      name = `_${String.fromCharCode(97 + n)}`;
    } else {
      // Multi-char: _aa, _ab, ..., _az, _ba, ...
      const hi = Math.floor(n / 26) - 1;
      const lo = n % 26;
      name =
        (hi < 26 ? `_${String.fromCharCode(97 + hi)}` : `_${hi.toString(36)}`) +
        String.fromCharCode(97 + lo);
    }
    this.counter++;
    this.used.push(name);
    return name;
  }

  getUsed(): readonly string[] {
    return this.used;
  }
}

// ---------------------------------------------------------------------------
// Transformer
// ---------------------------------------------------------------------------

export interface TransformResult {
  /** The ESTree program wrapping the expression in an arrow function */
  program: Program;
  /** The generated temp variable names that need `let` declarations */
  temps: readonly string[];
  /** Binding variable names discovered during transformation */
  bindings: readonly string[];
}

/**
 * Transform a CEL AST into a complete ESTree Program.
 *
 * The generated program has the shape:
 * ```
 * (_rt, binding1, binding2, ...) => {
 *   let _a, _b, ...;
 *   return <expr>;
 * }
 * ```
 */
export function transform(celAst: CelExpr): TransformResult {
  const temps = new TempAllocator();
  const bindingSet = new Set<string>();

  const expr = transformExpr(celAst, temps, bindingSet);

  const usedTemps = temps.getUsed();
  const body: Statement[] = [];

  // Declare temp variables if any were used
  for (const tmp of usedTemps) {
    body.push(varDecl("let", tmp, identifier("undefined")));
  }

  body.push(returnStatement(expr));

  const bindings = [...bindingSet];

  const prog = program([
    exprStatement(
      arrowFn(
        [identifier("_rt"), identifier("_qb"), ...bindings.map((b) => identifier(b))],
        blockStatement(body),
        false, // block body, not expression
      ),
    ),
  ]);

  return { program: prog, temps: usedTemps, bindings };
}

// ---------------------------------------------------------------------------
// Core recursive transform
// ---------------------------------------------------------------------------

const UNDEF = identifier("undefined");

/** CEL type constant names — these resolve to CelType values, not bindings. */
const CEL_TYPE_CONSTANTS = new Set([
  "bool",
  "int",
  "uint",
  "double",
  "string",
  "bytes",
  "list",
  "map",
  "type",
  "null_type",
]);

/** Safe array index — asserts element exists (length already validated by caller). */
function at<T>(arr: readonly T[], i: number): T {
  const v = arr[i];
  if (v === undefined) throw new Error(`Expected element at index ${i}`);
  return v;
}

/**
 * Collect a chain of Select nodes from an Ident root.
 * For `Select(Select(Ident("a"), "b"), "c")` returns `["a", "b", "c"]`.
 * Returns undefined if the chain does not bottom out at an Ident.
 */
function collectSelectChain(node: CelExpr): string[] | undefined {
  if (node.kind === "Ident") return [node.name];
  if (node.kind === "Select" && !node.testOnly) {
    const parent = collectSelectChain(node.operand);
    if (parent !== undefined) return [...parent, node.field];
  }
  return undefined;
}

/**
 * Build an ESTree expression for qualified identifier resolution.
 * Tries longest prefix first from the `_b` (bindings) parameter.
 *
 * For segments ["a", "b", "c"], generates:
 *   "a.b.c" in _b ? _b["a.b.c"] :
 *   "a.b" in _b ? _rt.select(_b["a.b"], "c") :
 *   _rt.select(_rt.select(a, "b"), "c")
 *
 * The final fallback uses the simple binding parameter `a` (looked up normally).
 */
function buildQualifiedResolution(
  segments: string[],
  _temps: TempAllocator,
  bindings: Set<string>,
): Expression {
  const _b = identifier("_qb");

  // Build from longest prefix to shortest
  // Longest: all segments joined -> direct lookup from _b
  // Shortest: first segment as simple binding, rest as selects
  const levels: { prefix: string; remaining: string[] }[] = [];
  for (let i = segments.length; i >= 1; i--) {
    levels.push({
      prefix: segments.slice(0, i).join("."),
      remaining: segments.slice(i),
    });
  }

  // Build the fallback (shortest prefix = simple binding)
  const rootName = segments[0] as string;
  // Don't add the root name to bindings if a qualified name covers it,
  // because the root may not exist as a standalone binding.
  // We still need the root as a parameter for the fallback case.
  bindings.add(rootName);

  let fallback: Expression = identifier(rootName);
  for (let i = 1; i < segments.length; i++) {
    fallback = rtCall("select", [fallback, literal(segments[i] as string)]);
  }

  // Build conditional chain from shortest prefix up to longest.
  // We iterate from shortest to longest so the longest ends up as the
  // outermost test (checked first at runtime), matching CEL's
  // longest-prefix-wins semantics.
  let result: Expression = fallback;
  for (let i = levels.length - 2; i >= 0; i--) {
    const level = levels[i] as { prefix: string; remaining: string[] };
    const key = level.prefix;
    const lookupExpr: Expression = memberExpr(_b, literal(key), true);

    // Apply remaining selects
    let selected: Expression = lookupExpr;
    for (const field of level.remaining) {
      selected = rtCall("select", [selected, literal(field)]);
    }

    // "key" in _b ? _b["key"] (+ selects) : <next>
    result = conditional(binaryExpr("in", literal(key), _b), selected, result);
  }

  return result;
}

/**
 * Build an ESTree expression for qualified has() resolution.
 * Like buildQualifiedResolution but for has() on qualified paths.
 *
 * For segments ["a", "b", "c"] with testOnly (has), generates:
 *   "a.b.c" in _b ? true :
 *   "a.b" in _b ? _rt.has(_b["a.b"], "c") :
 *   _rt.has(_rt.select(a, "b"), "c")
 */
function buildQualifiedHas(
  segments: string[],
  field: string,
  _temps: TempAllocator,
  bindings: Set<string>,
): Expression {
  const _b = identifier("_qb");
  const fullPath = [...segments, field];

  const levels: { prefix: string; remaining: string[] }[] = [];
  for (let i = fullPath.length; i >= 1; i--) {
    levels.push({
      prefix: fullPath.slice(0, i).join("."),
      remaining: fullPath.slice(i),
    });
  }

  // Fallback: root as simple binding, then selects, then has
  const rootName = segments[0] as string;
  bindings.add(rootName);

  let fallbackBase: Expression = identifier(rootName);
  for (let i = 1; i < segments.length; i++) {
    fallbackBase = rtCall("select", [fallbackBase, literal(segments[i] as string)]);
  }
  const fallback: Expression = rtCall("has", [fallbackBase, literal(field)]);

  // Build from shortest to longest so the longest prefix is the outermost
  // test (checked first at runtime), matching CEL longest-prefix-wins.
  let result: Expression = fallback;
  for (let i = levels.length - 2; i >= 0; i--) {
    const level = levels[i] as { prefix: string; remaining: string[] };
    const key = level.prefix;

    if (level.remaining.length === 0) {
      // Entire path is in _b -> has = true (key exists in bindings)
      result = conditional(binaryExpr("in", literal(key), _b), literal(true), result);
    } else {
      // Partial path in _b, remaining fields need has/select
      const lookupExpr: Expression = memberExpr(_b, literal(key), true);
      const remainingFields = level.remaining;
      let base: Expression = lookupExpr;
      for (let j = 0; j < remainingFields.length - 1; j++) {
        base = rtCall("select", [base, literal(remainingFields[j] as string)]);
      }
      const hasExpr = rtCall("has", [
        base,
        literal(remainingFields[remainingFields.length - 1] as string),
      ]);
      result = conditional(binaryExpr("in", literal(key), _b), hasExpr, result);
    }
  }

  return result;
}

/**
 * Operator function name -> _rt method name.
 * These match the property names on the object returned by createRuntime().
 */
const OPERATOR_TO_RT: Record<string, string> = {
  "_+_": "add",
  "_-_": "sub",
  "_*_": "mul",
  "_/_": "div",
  "_%_": "mod",
  "-_": "neg",
  "_<_": "lt",
  "_<=_": "le",
  "_>_": "gt",
  "_>=_": "ge",
  "_==_": "eq",
  "_!=_": "ne",
  "_[_]": "index",
  "@in": "in",
};

/** Known global functions -> _rt method names */
const GLOBAL_FUNC_TO_RT: Record<string, string> = {
  size: "size",
  contains: "contains",
  startsWith: "startsWith",
  endsWith: "endsWith",
  matches: "matches",
  int: "toInt",
  uint: "toUint",
  double: "toDouble",
  string: "toString",
  bool: "toBool",
  bytes: "toBytes",
  type: "type",
  duration: "duration",
  timestamp: "timestamp",
  dyn: "dyn",
};

/** Known member functions -> _rt method names (receiver becomes first arg) */
const MEMBER_FUNC_TO_RT: Record<string, string> = {
  contains: "contains",
  startsWith: "startsWith",
  endsWith: "endsWith",
  matches: "matches",
  size: "size",
  exists: "exists",
  all: "all",
  exists_one: "existsOne",
  filter: "filter",
  map: "map",
};

function transformExpr(node: CelExpr, temps: TempAllocator, bindings: Set<string>): Expression {
  switch (node.kind) {
    // -- Literals -------------------------------------------------------

    case "IntLiteral":
      return bigintLiteral(node.value);

    case "UintLiteral":
      return rtCall("celUint", [bigintLiteral(node.value)]);

    case "DoubleLiteral":
      return literal(node.value);

    case "StringLiteral":
      return literal(node.value);

    case "BoolLiteral":
      return literal(node.value);

    case "NullLiteral":
      return literal(null);

    case "BytesLiteral":
      return newExpr(identifier("Uint8Array"), [arrayExpr([...node.value].map((b) => literal(b)))]);

    // -- Ident ----------------------------------------------------------

    case "Ident":
      // CEL type constants resolve to CelType values, not bindings
      if (CEL_TYPE_CONSTANTS.has(node.name)) {
        return newExpr(memberExpr(identifier("_rt"), identifier("CelType")), [literal(node.name)]);
      }
      bindings.add(node.name);
      return identifier(node.name);

    // -- Select ---------------------------------------------------------

    case "Select": {
      // Check for qualified identifier chain: a.b.c -> Select(Select(Ident("a"), "b"), "c")
      const chain = collectSelectChain(node);
      if (chain !== undefined && chain.length > 1) {
        if (node.testOnly) {
          // has() on a qualified chain
          const parentChain = chain.slice(0, -1);
          return buildQualifiedHas(parentChain, chain[chain.length - 1] as string, temps, bindings);
        }
        return buildQualifiedResolution(chain, temps, bindings);
      }

      if (node.testOnly) {
        // has() macro: check if field is defined
        const operand = transformExpr(node.operand, temps, bindings);
        return rtCall("has", [operand, literal(node.field)]);
      }
      const operand = transformExpr(node.operand, temps, bindings);
      return rtCall("select", [operand, literal(node.field)]);
    }

    // -- Call -----------------------------------------------------------

    case "Call":
      return transformCall(node.fn, node.target, node.args, temps, bindings);

    // -- CreateList -----------------------------------------------------

    case "CreateList":
      return rtCall("makeList", [
        arrayExpr(node.elements.map((e) => transformExpr(e, temps, bindings))),
      ]);

    // -- CreateMap ------------------------------------------------------

    case "CreateMap":
      return rtCall("makeMap", [
        arrayExpr(
          node.entries.map((entry) =>
            arrayExpr([
              transformExpr(entry.key, temps, bindings),
              transformExpr(entry.value, temps, bindings),
            ]),
          ),
        ),
      ]);

    // -- CreateStruct ---------------------------------------------------

    case "CreateStruct":
      return rtCall("makeStruct", [
        literal(node.messageName),
        arrayExpr(
          node.entries.map((entry) =>
            arrayExpr([literal(entry.field), transformExpr(entry.value, temps, bindings)]),
          ),
        ),
      ]);

    // -- Comprehension --------------------------------------------------

    case "Comprehension":
      return transformComprehension(node, temps, bindings);
  }
}

// ---------------------------------------------------------------------------
// Call transformations
// ---------------------------------------------------------------------------

function transformCall(
  fn: string,
  target: CelExpr | undefined,
  args: readonly CelExpr[],
  temps: TempAllocator,
  bindings: Set<string>,
): Expression {
  // -- Logical AND with error absorption --------------------------------
  if (fn === "_&&_" && args.length === 2) {
    return transformLogicalAnd(at(args, 0), at(args, 1), temps, bindings);
  }

  // -- Logical OR with error absorption ---------------------------------
  if (fn === "_||_" && args.length === 2) {
    return transformLogicalOr(at(args, 0), at(args, 1), temps, bindings);
  }

  // -- Logical NOT ------------------------------------------------------
  if (fn === "!_" && args.length === 1) {
    const arg = transformExpr(at(args, 0), temps, bindings);
    // arg === false ? true : arg === true ? false : undefined
    return conditional(
      binaryExpr("===", arg, literal(false)),
      literal(true),
      conditional(binaryExpr("===", arg, literal(true)), literal(false), UNDEF),
    );
  }

  // -- @not_strictly_false (used in comprehension loop conditions) -------
  if (fn === "@not_strictly_false" && args.length === 1) {
    const arg = transformExpr(at(args, 0), temps, bindings);
    // @not_strictly_false(x) = x !== false
    return binaryExpr("!==", arg, literal(false));
  }

  // -- @mapInsert (used in transformMap comprehension step) ---------------
  if (fn === "@mapInsert" && args.length === 3) {
    const map = transformExpr(at(args, 0), temps, bindings);
    const key = transformExpr(at(args, 1), temps, bindings);
    const value = transformExpr(at(args, 2), temps, bindings);
    return rtCall("mapInsert", [map, key, value]);
  }

  // -- Ternary ----------------------------------------------------------
  if (fn === "_?_:_" && args.length === 3) {
    const cond = transformExpr(at(args, 0), temps, bindings);
    const consequent = transformExpr(at(args, 1), temps, bindings);
    const alternate = transformExpr(at(args, 2), temps, bindings);
    // cond === true ? consequent : cond === false ? alternate : undefined
    return conditional(
      binaryExpr("===", cond, literal(true)),
      consequent,
      conditional(binaryExpr("===", cond, literal(false)), alternate, UNDEF),
    );
  }

  // -- Operator functions (arithmetic, comparison, index, in) -----------
  const rtMethod = OPERATOR_TO_RT[fn];
  if (rtMethod !== undefined) {
    const transformedArgs = args.map((a) => transformExpr(a, temps, bindings));
    return rtCall(rtMethod, transformedArgs);
  }

  // -- Member method call: obj.method(args) -> _rt.method(obj, ...args) -
  if (target !== undefined) {
    const receiver = transformExpr(target, temps, bindings);
    const transformedArgs = args.map((a) => transformExpr(a, temps, bindings));
    const memberMethod = MEMBER_FUNC_TO_RT[fn];
    if (memberMethod !== undefined) {
      return rtCall(memberMethod, [receiver, ...transformedArgs]);
    }
    // Unknown member method: still route through runtime
    return rtCall(fn, [receiver, ...transformedArgs]);
  }

  // -- Global function call: f(args) -> _rt.f(args) --------------------
  const transformedArgs = args.map((a) => transformExpr(a, temps, bindings));
  const globalMethod = GLOBAL_FUNC_TO_RT[fn];
  if (globalMethod !== undefined) {
    return rtCall(globalMethod, transformedArgs);
  }

  // Fallback: call through runtime with original function name
  return rtCall(fn, transformedArgs);
}

// ---------------------------------------------------------------------------
// Logical AND/OR with commutative error absorption
// ---------------------------------------------------------------------------

/**
 * CEL logical AND: both sides always evaluated.
 * - If either is false -> false
 * - If either is undefined -> undefined
 * - Otherwise -> true
 *
 * Generated:
 * (_a = left, _b = right,
 *   _a === false ? false :
 *   _b === false ? false :
 *   _a === undefined ? undefined :
 *   _b === undefined ? undefined :
 *   true)
 */
function transformLogicalAnd(
  left: CelExpr,
  right: CelExpr,
  temps: TempAllocator,
  bindings: Set<string>,
): Expression {
  const tmpA = temps.next();
  const tmpB = temps.next();
  const leftExpr = transformExpr(left, temps, bindings);
  const rightExpr = transformExpr(right, temps, bindings);

  const idA = identifier(tmpA);
  const idB = identifier(tmpB);

  return sequenceExpr([
    assignExpr(idA, leftExpr),
    assignExpr(idB, rightExpr),
    conditional(
      binaryExpr("===", idA, literal(false)),
      literal(false),
      conditional(
        binaryExpr("===", idB, literal(false)),
        literal(false),
        conditional(
          logicalExpr(
            "&&",
            binaryExpr("===", idA, literal(true)),
            binaryExpr("===", idB, literal(true)),
          ),
          literal(true),
          UNDEF,
        ),
      ),
    ),
  ]);
}

/**
 * CEL logical OR: both sides always evaluated.
 * - If either is true -> true
 * - If either is undefined -> undefined
 * - Otherwise -> false
 *
 * Generated:
 * (_a = left, _b = right,
 *   _a === true ? true :
 *   _b === true ? true :
 *   _a === undefined ? undefined :
 *   _b === undefined ? undefined :
 *   false)
 */
function transformLogicalOr(
  left: CelExpr,
  right: CelExpr,
  temps: TempAllocator,
  bindings: Set<string>,
): Expression {
  const tmpA = temps.next();
  const tmpB = temps.next();
  const leftExpr = transformExpr(left, temps, bindings);
  const rightExpr = transformExpr(right, temps, bindings);

  const idA = identifier(tmpA);
  const idB = identifier(tmpB);

  return sequenceExpr([
    assignExpr(idA, leftExpr),
    assignExpr(idB, rightExpr),
    conditional(
      binaryExpr("===", idA, literal(true)),
      literal(true),
      conditional(
        binaryExpr("===", idB, literal(true)),
        literal(true),
        conditional(
          logicalExpr(
            "&&",
            binaryExpr("===", idA, literal(false)),
            binaryExpr("===", idB, literal(false)),
          ),
          literal(false),
          UNDEF,
        ),
      ),
    ),
  ]);
}

// ---------------------------------------------------------------------------
// Comprehension
// ---------------------------------------------------------------------------

function transformComprehension(
  node: CelExpr & { kind: "Comprehension" },
  temps: TempAllocator,
  bindings: Set<string>,
): Expression {
  const iterRange = transformExpr(node.iterRange, temps, bindings);
  const accuInit = transformExpr(node.accuInit, temps, bindings);

  // Comprehension-local vars should not leak to outer bindings.
  // Use a separate set that inherits from the outer one.
  const innerBindings = new Set(bindings);
  innerBindings.add(node.iterVar);
  innerBindings.add(node.accuVar);
  if (node.iterVar2 !== undefined) {
    innerBindings.add(node.iterVar2);
  }

  const loopCondition = transformExpr(node.loopCondition, temps, innerBindings);
  const loopStep = transformExpr(node.loopStep, temps, innerBindings);
  const result = transformExpr(node.result, temps, innerBindings);

  // Build lambda parameters: (iterVar [, iterVar2], accuVar)
  const condParams =
    node.iterVar2 !== undefined
      ? [identifier(node.iterVar), identifier(node.iterVar2), identifier(node.accuVar)]
      : [identifier(node.iterVar), identifier(node.accuVar)];
  const stepParams = [...condParams]; // same params for step
  const resultParams = [identifier(node.accuVar)];

  const args: Expression[] = [
    iterRange,
    accuInit,
    literal(node.iterVar),
    literal(node.accuVar),
    arrowFn(condParams, loopCondition, true),
    arrowFn(stepParams, loopStep, true),
    arrowFn(resultParams, result, true),
  ];

  // Pass iterVar2 name if present (two-variable comprehension)
  if (node.iterVar2 !== undefined) {
    args.push(literal(node.iterVar2));
  }

  return rtCall("comprehension", args);
}
