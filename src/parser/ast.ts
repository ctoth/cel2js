// CEL AST types — discriminated union for all CEL expression nodes.

// ── Literal nodes ──────────────────────────────────────────────────

export interface IntLiteral {
  readonly kind: "IntLiteral";
  readonly value: bigint;
}

export interface UintLiteral {
  readonly kind: "UintLiteral";
  readonly value: bigint;
}

export interface DoubleLiteral {
  readonly kind: "DoubleLiteral";
  readonly value: number;
}

export interface StringLiteral {
  readonly kind: "StringLiteral";
  readonly value: string;
}

export interface BytesLiteral {
  readonly kind: "BytesLiteral";
  readonly value: Uint8Array;
}

export interface BoolLiteral {
  readonly kind: "BoolLiteral";
  readonly value: boolean;
}

export interface NullLiteral {
  readonly kind: "NullLiteral";
}

// ── Structural nodes ───────────────────────────────────────────────

export interface Ident {
  readonly kind: "Ident";
  readonly name: string;
}

export interface Select {
  readonly kind: "Select";
  readonly operand: CelExpr;
  readonly field: string;
  /** true when produced by the `has()` macro */
  readonly testOnly: boolean;
}

export interface Call {
  readonly kind: "Call";
  /** operator name, e.g. "_+_", "@in", "size", or method name */
  readonly fn: string;
  /** receiver for member calls, undefined for global calls */
  readonly target?: CelExpr | undefined;
  readonly args: readonly CelExpr[];
}

export interface CreateList {
  readonly kind: "CreateList";
  readonly elements: readonly CelExpr[];
  /** Indices of elements that are optional (prefixed with ?) */
  readonly optionalIndices?: readonly number[] | undefined;
}

export interface MapEntry {
  readonly key: CelExpr;
  readonly value: CelExpr;
  readonly optional?: boolean | undefined;
}

export interface CreateMap {
  readonly kind: "CreateMap";
  readonly entries: readonly MapEntry[];
}

export interface StructFieldEntry {
  readonly field: string;
  readonly value: CelExpr;
  readonly optional?: boolean | undefined;
}

export interface CreateStruct {
  readonly kind: "CreateStruct";
  readonly messageName: string;
  readonly entries: readonly StructFieldEntry[];
}

export interface Comprehension {
  readonly kind: "Comprehension";
  readonly iterVar: string;
  /** Second iteration variable for two-variable macros (index/key for lists, value for maps) */
  readonly iterVar2?: string | undefined;
  readonly iterRange: CelExpr;
  readonly accuVar: string;
  readonly accuInit: CelExpr;
  readonly loopCondition: CelExpr;
  readonly loopStep: CelExpr;
  readonly result: CelExpr;
}

// ── Union ──────────────────────────────────────────────────────────

export type CelExpr =
  | IntLiteral
  | UintLiteral
  | DoubleLiteral
  | StringLiteral
  | BytesLiteral
  | BoolLiteral
  | NullLiteral
  | Ident
  | Select
  | Call
  | CreateList
  | CreateMap
  | CreateStruct
  | Comprehension;
