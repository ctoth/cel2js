// ESTree-compatible AST type definitions for CEL-to-JS codegen.
// Follows the ESTree spec: https://github.com/estree/estree
// Only includes node types needed for CEL transpilation.

// ---------------------------------------------------------------------------
// Base
// ---------------------------------------------------------------------------

export interface SourceLocation {
  start: Position;
  end: Position;
}

export interface Position {
  line: number;
  column: number;
}

export interface BaseNode {
  type: string;
  loc?: SourceLocation | undefined;
  range?: [number, number] | undefined;
}

// ---------------------------------------------------------------------------
// Expressions
// ---------------------------------------------------------------------------

export interface Identifier extends BaseNode {
  type: "Identifier";
  name: string;
}

export interface Literal extends BaseNode {
  type: "Literal";
  value: string | number | boolean | null | RegExp;
  raw?: string | undefined;
  bigint?: string | undefined;
  regex?: { pattern: string; flags: string } | undefined;
}

export interface TemplateLiteral extends BaseNode {
  type: "TemplateLiteral";
  quasis: TemplateElement[];
  expressions: Expression[];
}

export interface TemplateElement extends BaseNode {
  type: "TemplateElement";
  value: { raw: string; cooked: string };
  tail: boolean;
}

export type UnaryOperator = "-" | "+" | "!" | "~" | "typeof" | "void" | "delete";

export interface UnaryExpression extends BaseNode {
  type: "UnaryExpression";
  operator: UnaryOperator;
  prefix: boolean;
  argument: Expression;
}

export type BinaryOperator =
  | "=="
  | "!="
  | "==="
  | "!=="
  | "<"
  | "<="
  | ">"
  | ">="
  | "+"
  | "-"
  | "*"
  | "/"
  | "%"
  | "**"
  | "|"
  | "^"
  | "&"
  | "<<"
  | ">>"
  | ">>>"
  | "in"
  | "instanceof";

export interface BinaryExpression extends BaseNode {
  type: "BinaryExpression";
  operator: BinaryOperator;
  left: Expression;
  right: Expression;
}

export type LogicalOperator = "&&" | "||" | "??";

export interface LogicalExpression extends BaseNode {
  type: "LogicalExpression";
  operator: LogicalOperator;
  left: Expression;
  right: Expression;
}

export interface ConditionalExpression extends BaseNode {
  type: "ConditionalExpression";
  test: Expression;
  consequent: Expression;
  alternate: Expression;
}

export interface CallExpression extends BaseNode {
  type: "CallExpression";
  callee: Expression;
  arguments: (Expression | SpreadElement)[];
  optional: boolean;
}

export interface MemberExpression extends BaseNode {
  type: "MemberExpression";
  object: Expression;
  property: Expression;
  computed: boolean;
  optional: boolean;
}

export interface ArrayExpression extends BaseNode {
  type: "ArrayExpression";
  elements: (Expression | SpreadElement)[];
}

export interface ObjectExpression extends BaseNode {
  type: "ObjectExpression";
  properties: Property[];
}

export interface Property extends BaseNode {
  type: "Property";
  key: Expression;
  value: Expression;
  kind: "init" | "get" | "set";
  method: boolean;
  shorthand: boolean;
  computed: boolean;
}

export interface ArrowFunctionExpression extends BaseNode {
  type: "ArrowFunctionExpression";
  params: Identifier[];
  body: Expression | BlockStatement;
  expression: boolean;
  async: boolean;
}

export type AssignmentOperator =
  | "="
  | "+="
  | "-="
  | "*="
  | "/="
  | "%="
  | "**="
  | "<<="
  | ">>="
  | ">>>="
  | "|="
  | "^="
  | "&="
  | "||="
  | "&&="
  | "??=";

export interface AssignmentExpression extends BaseNode {
  type: "AssignmentExpression";
  operator: AssignmentOperator;
  left: Identifier | MemberExpression;
  right: Expression;
}

export interface SequenceExpression extends BaseNode {
  type: "SequenceExpression";
  expressions: Expression[];
}

export interface SpreadElement extends BaseNode {
  type: "SpreadElement";
  argument: Expression;
}

export interface NewExpression extends BaseNode {
  type: "NewExpression";
  callee: Expression;
  arguments: (Expression | SpreadElement)[];
}

// ---------------------------------------------------------------------------
// Statements
// ---------------------------------------------------------------------------

export interface ExpressionStatement extends BaseNode {
  type: "ExpressionStatement";
  expression: Expression;
}

export interface ReturnStatement extends BaseNode {
  type: "ReturnStatement";
  argument: Expression | null;
}

export interface VariableDeclaration extends BaseNode {
  type: "VariableDeclaration";
  kind: "const" | "let" | "var";
  declarations: VariableDeclarator[];
}

export interface VariableDeclarator extends BaseNode {
  type: "VariableDeclarator";
  id: Identifier;
  init: Expression | null;
}

export interface BlockStatement extends BaseNode {
  type: "BlockStatement";
  body: Statement[];
}

export interface IfStatement extends BaseNode {
  type: "IfStatement";
  test: Expression;
  consequent: Statement;
  alternate: Statement | null;
}

// ---------------------------------------------------------------------------
// Top-level
// ---------------------------------------------------------------------------

export interface Program extends BaseNode {
  type: "Program";
  body: Statement[];
  sourceType: "script" | "module";
}

// ---------------------------------------------------------------------------
// Union types
// ---------------------------------------------------------------------------

export type Expression =
  | Identifier
  | Literal
  | TemplateLiteral
  | UnaryExpression
  | BinaryExpression
  | LogicalExpression
  | ConditionalExpression
  | CallExpression
  | MemberExpression
  | ArrayExpression
  | ObjectExpression
  | ArrowFunctionExpression
  | AssignmentExpression
  | SequenceExpression
  | NewExpression;

export type Statement =
  | ExpressionStatement
  | ReturnStatement
  | VariableDeclaration
  | BlockStatement
  | IfStatement;

export type ESNode =
  | Expression
  | Statement
  | Program
  | SpreadElement
  | Property
  | TemplateElement
  | VariableDeclarator;
