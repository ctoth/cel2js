// Typed builder functions for ESTree AST nodes.
// Each function returns a precisely-typed ESTree node ready for astring codegen.

import type {
  ArrayExpression,
  ArrowFunctionExpression,
  AssignmentExpression,
  BigIntLiteral,
  BinaryExpression,
  BinaryOperator,
  BlockStatement,
  ConditionalExpression,
  Expression,
  ExpressionStatement,
  Identifier,
  LogicalExpression,
  LogicalOperator,
  MemberExpression,
  NewExpression,
  Program,
  ReturnStatement,
  SequenceExpression,
  SimpleCallExpression,
  SimpleLiteral,
  SpreadElement,
  Statement,
  UnaryExpression,
  UnaryOperator,
  VariableDeclaration,
} from "estree";

// ---------------------------------------------------------------------------
// Expressions
// ---------------------------------------------------------------------------

export function identifier(name: string): Identifier {
  return { type: "Identifier", name };
}

export function literal(value: string | number | boolean | null): SimpleLiteral {
  return { type: "Literal", value };
}

export function bigintLiteral(value: bigint): BigIntLiteral {
  return {
    type: "Literal",
    value,
    bigint: value.toString(),
    raw: `${value}n`,
  };
}

export function unaryExpr(operator: UnaryOperator, argument: Expression): UnaryExpression {
  return { type: "UnaryExpression", operator, prefix: true, argument };
}

export function binaryExpr(
  operator: BinaryOperator,
  left: Expression,
  right: Expression,
): BinaryExpression {
  return { type: "BinaryExpression", operator, left, right };
}

export function logicalExpr(
  operator: LogicalOperator,
  left: Expression,
  right: Expression,
): LogicalExpression {
  return { type: "LogicalExpression", operator, left, right };
}

export function conditional(
  test: Expression,
  consequent: Expression,
  alternate: Expression,
): ConditionalExpression {
  return { type: "ConditionalExpression", test, consequent, alternate };
}

export function callExpr(
  callee: Expression,
  args: (Expression | SpreadElement)[],
  optional = false,
): SimpleCallExpression {
  return { type: "CallExpression", callee, arguments: args, optional };
}

export function memberExpr(
  object: Expression,
  property: Expression,
  computed = false,
  optional = false,
): MemberExpression {
  return { type: "MemberExpression", object, property, computed, optional };
}

export function arrayExpr(elements: (Expression | SpreadElement)[]): ArrayExpression {
  return { type: "ArrayExpression", elements };
}

export function arrowFn(
  params: Identifier[],
  body: Expression | BlockStatement,
  expression = true,
): ArrowFunctionExpression {
  return { type: "ArrowFunctionExpression", params, body, expression, async: false };
}

export function assignExpr(
  left: Identifier | MemberExpression,
  right: Expression,
): AssignmentExpression {
  return { type: "AssignmentExpression", operator: "=", left, right };
}

export function sequenceExpr(expressions: Expression[]): SequenceExpression {
  return { type: "SequenceExpression", expressions };
}

export function newExpr(callee: Expression, args: (Expression | SpreadElement)[]): NewExpression {
  return { type: "NewExpression", callee, arguments: args };
}

// ---------------------------------------------------------------------------
// Statements
// ---------------------------------------------------------------------------

export function exprStatement(expression: Expression): ExpressionStatement {
  return { type: "ExpressionStatement", expression };
}

export function returnStatement(argument: Expression | null): ReturnStatement {
  return { type: "ReturnStatement", argument };
}

export function varDecl(
  kind: "const" | "let" | "var",
  name: string,
  init: Expression,
): VariableDeclaration {
  return {
    type: "VariableDeclaration",
    kind,
    declarations: [{ type: "VariableDeclarator", id: identifier(name), init }],
  };
}

export function blockStatement(body: Statement[]): BlockStatement {
  return { type: "BlockStatement", body };
}

// ---------------------------------------------------------------------------
// Top-level
// ---------------------------------------------------------------------------

export function program(body: Statement[]): Program {
  return { type: "Program", body, sourceType: "script" };
}

// ---------------------------------------------------------------------------
// Convenience helpers
// ---------------------------------------------------------------------------

/** Shorthand for `_rt.methodName(...args)` — the most common codegen pattern.
 *  For dotted names like "math.greatest", uses computed access: `_rt["math.greatest"](...args)`. */
export function rtCall(method: string, args: (Expression | SpreadElement)[]): SimpleCallExpression {
  const prop = method.includes(".")
    ? memberExpr(identifier("_rt"), literal(method), true)
    : memberExpr(identifier("_rt"), identifier(method));
  return callExpr(prop, args);
}

/** Shorthand for `object.property` (non-computed, non-optional). */
export function dot(object: Expression, prop: string): MemberExpression {
  return memberExpr(object, identifier(prop));
}
