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
  newExpr,
  optionalDot,
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
    const name = `_${String.fromCharCode(97 + this.counter)}`; // _a, _b, _c...
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
        [identifier("_rt"), ...bindings.map((b) => identifier(b))],
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

/** Safe array index — asserts element exists (length already validated by caller). */
function at<T>(arr: readonly T[], i: number): T {
  const v = arr[i];
  if (v === undefined) throw new Error(`Expected element at index ${i}`);
  return v;
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
      bindings.add(node.name);
      return identifier(node.name);

    // -- Select ---------------------------------------------------------

    case "Select": {
      if (node.testOnly) {
        // has() macro: check if field is defined
        const operand = transformExpr(node.operand, temps, bindings);
        return rtCall("has", [operand, literal(node.field)]);
      }
      const operand = transformExpr(node.operand, temps, bindings);
      return optionalDot(operand, node.field);
    }

    // -- Call -----------------------------------------------------------

    case "Call":
      return transformCall(node.fn, node.target, node.args, temps, bindings);

    // -- CreateList -----------------------------------------------------

    case "CreateList":
      return arrayExpr(node.elements.map((e) => transformExpr(e, temps, bindings)));

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

  const loopCondition = transformExpr(node.loopCondition, temps, innerBindings);
  const loopStep = transformExpr(node.loopStep, temps, innerBindings);
  const result = transformExpr(node.result, temps, innerBindings);

  return rtCall("comprehension", [
    iterRange,
    accuInit,
    literal(node.iterVar),
    literal(node.accuVar),
    arrowFn(
      [identifier(node.iterVar), identifier(node.accuVar)],
      loopCondition,
      true, // expression body
    ),
    arrowFn([identifier(node.iterVar), identifier(node.accuVar)], loopStep, true),
    arrowFn([identifier(node.accuVar)], result, true),
  ]);
}
