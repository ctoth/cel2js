// CEL Peggy grammar — produces CelExpr AST nodes.
// Adapted from cel-es (Apache-2.0) by Dan Hudlow / Buf Technologies.

{{
  /* ── helpers ────────────────────────────────────────────── */
  const ACCU = "__result__";
  const encoder = new TextEncoder();

  function call(fn, args, target) {
    const node = { kind: "Call", fn, args };
    if (target !== undefined) node.target = target;
    return node;
  }

  function ident(name) {
    return { kind: "Ident", name };
  }

  function boolLit(v) {
    return { kind: "BoolLiteral", value: v };
  }

  function intLit(v) {
    return { kind: "IntLiteral", value: v };
  }

  function listExpr(elements) {
    return { kind: "CreateList", elements };
  }

  /* balanced binary tree for && / || */
  function balanced(fn, terms) {
    if (terms.length === 1) return terms[0];
    const mid = Math.floor(terms.length / 2);
    return call(fn, [
      balanced(fn, terms.slice(0, mid)),
      balanced(fn, terms.slice(mid)),
    ]);
  }

  /* ── macro expanders ───────────────────────────────────── */

  function expandHas(selectExpr) {
    return {
      kind: "Select",
      operand: selectExpr.operand,
      field: selectExpr.field,
      testOnly: true,
    };
  }

  function boolMacro(iterRange, iterVar, init, loopStep, loopCondition, iterVar2) {
    const node = {
      kind: "Comprehension",
      iterVar,
      iterRange,
      accuVar: ACCU,
      accuInit: boolLit(init),
      loopCondition,
      loopStep,
      result: ident(ACCU),
    };
    if (iterVar2 !== undefined) node.iterVar2 = iterVar2;
    return node;
  }

  function listMacro(iterRange, iterVar, loopStep, iterVar2) {
    const node = {
      kind: "Comprehension",
      iterVar,
      iterRange,
      accuVar: ACCU,
      accuInit: listExpr([]),
      loopCondition: boolLit(true),
      loopStep,
      result: ident(ACCU),
    };
    if (iterVar2 !== undefined) node.iterVar2 = iterVar2;
    return node;
  }

  function expandExists(target, x, test) {
    return boolMacro(
      target, x, false,
      call("_||_", [ident(ACCU), test]),
      call("@not_strictly_false", [call("!_", [ident(ACCU)])]),
    );
  }

  function expandAll(target, x, test) {
    return boolMacro(
      target, x, true,
      call("_&&_", [ident(ACCU), test]),
      call("@not_strictly_false", [ident(ACCU)]),
    );
  }

  function expandMap(target, x, step) {
    return listMacro(
      target, x,
      call("_+_", [ident(ACCU), listExpr([step])]),
    );
  }

  function expandMapFilter(target, x, test, step) {
    return listMacro(
      target, x,
      call("_?_:_", [
        test,
        call("_+_", [ident(ACCU), listExpr([step])]),
        ident(ACCU),
      ]),
    );
  }

  function expandFilter(target, x, test) {
    return listMacro(
      target, x,
      call("_?_:_", [
        test,
        call("_+_", [ident(ACCU), listExpr([ident(x)])]),
        ident(ACCU),
      ]),
    );
  }

  function expandExistsOne(target, x, step, x2) {
    const node = {
      kind: "Comprehension",
      iterVar: x,
      iterRange: target,
      accuVar: ACCU,
      accuInit: intLit(0n),
      loopCondition: boolLit(true),
      loopStep: call("_?_:_", [
        step,
        call("_+_", [ident(ACCU), intLit(1n)]),
        ident(ACCU),
      ]),
      result: call("_==_", [ident(ACCU), intLit(1n)]),
    };
    if (x2 !== undefined) node.iterVar2 = x2;
    return node;
  }

  /* Two-variable exists: exists(i, v, pred) */
  function expandExists2(target, i, v, test) {
    return boolMacro(
      target, i, false,
      call("_||_", [ident(ACCU), test]),
      call("@not_strictly_false", [call("!_", [ident(ACCU)])]),
      v,
    );
  }

  /* Two-variable all: all(i, v, pred) */
  function expandAll2(target, i, v, test) {
    return boolMacro(
      target, i, true,
      call("_&&_", [ident(ACCU), test]),
      call("@not_strictly_false", [ident(ACCU)]),
      v,
    );
  }

  /* transformList(i, v, expr) — maps list values using index + value */
  function expandTransformList(target, i, v, step) {
    return listMacro(
      target, i,
      call("_+_", [ident(ACCU), listExpr([step])]),
      v,
    );
  }

  /* transformList(i, v, pred, expr) — filter+map with two variables */
  function expandTransformListFilter(target, i, v, test, step) {
    return listMacro(
      target, i,
      call("_?_:_", [
        test,
        call("_+_", [ident(ACCU), listExpr([step])]),
        ident(ACCU),
      ]),
      v,
    );
  }

  /* transformMap(k, v, expr) — transform map values */
  function expandTransformMap(target, k, v, step) {
    const node = {
      kind: "Comprehension",
      iterVar: k,
      iterVar2: v,
      iterRange: target,
      accuVar: ACCU,
      accuInit: { kind: "CreateMap", entries: [] },
      loopCondition: boolLit(true),
      loopStep: call("@mapInsert", [ident(ACCU), ident(k), step]),
      result: ident(ACCU),
    };
    return node;
  }

  /* transformMap(k, v, pred, expr) — filter+transform map values */
  function expandTransformMapFilter(target, k, v, test, step) {
    const node = {
      kind: "Comprehension",
      iterVar: k,
      iterVar2: v,
      iterRange: target,
      accuVar: ACCU,
      accuInit: { kind: "CreateMap", entries: [] },
      loopCondition: boolLit(true),
      loopStep: call("_?_:_", [
        test,
        call("@mapInsert", [ident(ACCU), ident(k), step]),
        ident(ACCU),
      ]),
      result: ident(ACCU),
    };
    return node;
  }

  /**
   * Extract a variable name from either an Ident node or a cel.iterVar(depth, id) call.
   * cel.iterVar(depth, id) → synthetic Ident name "@iv_<depth>_<id>"
   * Returns undefined if the node is not a valid variable reference.
   */
  function extractVarName(node) {
    if (node.kind === "Ident") return node.name;
    if (
      node.kind === "Call" &&
      node.fn === "iterVar" &&
      node.target !== undefined &&
      node.target.kind === "Ident" &&
      node.target.name === "cel" &&
      node.args.length === 2 &&
      node.args[0].kind === "IntLiteral" &&
      node.args[1].kind === "IntLiteral"
    ) {
      return `_iv_${node.args[0].value}_${node.args[1].value}`;
    }
    return undefined;
  }

  function maybeExpand(target, funcName, args) {
    // cel.iterVar(depth, id) → synthetic Ident node
    if (
      target !== undefined &&
      target.kind === "Ident" &&
      target.name === "cel" &&
      funcName === "iterVar" &&
      args.length === 2 &&
      args[0].kind === "IntLiteral" &&
      args[1].kind === "IntLiteral"
    ) {
      return ident(`_iv_${args[0].value}_${args[1].value}`);
    }

    // cel.index(n) → synthetic Ident node for block bindings
    if (
      target !== undefined &&
      target.kind === "Ident" &&
      target.name === "cel" &&
      funcName === "index" &&
      args.length === 1 &&
      args[0].kind === "IntLiteral"
    ) {
      return ident(`_bi${args[0].value}`);
    }

    // Macro expansion for member-call forms: target.func(iterVar, expr)
    const varName0 = args.length >= 2 ? extractVarName(args[0]) : undefined;
    if (varName0 !== undefined) {
      const varName = varName0;
      // Two-arg macros: target.func(var, expr)
      if (args.length === 2) {
        switch (funcName) {
          case "exists":     return expandExists(target, varName, args[1]);
          case "all":        return expandAll(target, varName, args[1]);
          case "map":        return expandMap(target, varName, args[1]);
          case "filter":     return expandFilter(target, varName, args[1]);
          case "exists_one":
          case "existsOne":  return expandExistsOne(target, varName, args[1]);
        }
      }
      // Three-arg macros: target.func(var1, var2, expr) or target.map(var, pred, expr)
      const varName1_3 = args.length === 3 ? extractVarName(args[1]) : undefined;
      if (
        args.length === 3 &&
        varName1_3 !== undefined
      ) {
        const var2Name = varName1_3;
        switch (funcName) {
          case "exists":     return expandExists2(target, varName, var2Name, args[2]);
          case "all":        return expandAll2(target, varName, var2Name, args[2]);
          case "exists_one":
          case "existsOne":  return expandExistsOne(target, varName, args[2], var2Name);
          case "transformList": return expandTransformList(target, varName, var2Name, args[2]);
          case "transformMap":  return expandTransformMap(target, varName, var2Name, args[2]);
        }
      }
      if (args.length === 3 && funcName === "map") {
        return expandMapFilter(target, varName, args[1], args[2]);
      }
      // Four-arg macros: target.func(var1, var2, pred, expr)
      const varName1_4 = args.length === 4 ? extractVarName(args[1]) : undefined;
      if (
        args.length === 4 &&
        varName1_4 !== undefined
      ) {
        const var2Name = varName1_4;
        switch (funcName) {
          case "transformList": return expandTransformListFilter(target, varName, var2Name, args[2], args[3]);
          case "transformMap":  return expandTransformMapFilter(target, varName, var2Name, args[2], args[3]);
        }
      }
    }
    return call(funcName, args, target);
  }
}}

/* ── top-level ──────────────────────────────────────────────── */

Expr
  = or:ConditionalOr S tail:TernaryTail?
    {
      if (tail === null) return or;
      return call("_?_:_", [or, ...tail]);
    }

TernaryTail
  = "?" t:ConditionalOr S ":" f:Expr S
    { return [t, f]; }

/* ── logical ────────────────────────────────────────────────── */

ConditionalOr
  = terms:ConditionalAnd|1.., $(S "||")|
    {
      if (terms.length === 1) return terms[0];
      return balanced("_||_", terms);
    }

ConditionalAnd
  = terms:Relation|1.., $(S "&&")|
    {
      if (terms.length === 1) return terms[0];
      return balanced("_&&_", terms);
    }

/* ── relational ─────────────────────────────────────────────── */

Relation
  = head:Addition tail:RelationTail?
    {
      if (tail === null) return head;
      return tail.reduce((expr, op) => op(expr), head);
    }

RelationTail
  = (
      S operator:Relop next:Addition
      { return (prev) => call(operator, [prev, next]); }
    )+

Relop "relational operator"
  = operator:$("<=" / "<" / ">=" / ">" / "==" / "!=")
    { return `_${operator}_`; }
  / "in" { return "@in"; }

/* ── arithmetic ─────────────────────────────────────────────── */

Addition
  = head:Multiplication tail:AdditionTail?
    {
      if (tail === null) return head;
      return tail.reduce((expr, op) => op(expr), head);
    }

AdditionTail
  = (
      S operator:( o:[+-] { return `_${o}_`; } ) next:Multiplication
      { return (prev) => call(operator, [prev, next]); }
    )+

Multiplication
  = head:Unary tail:MultiplicationTail?
    {
      if (tail === null) return head;
      return tail.reduce((expr, op) => op(expr), head);
    }

MultiplicationTail
  = (
      S operator:( o:[*/%] { return `_${o}_`; } ) next:Unary
      { return (prev) => call(operator, [prev, next]); }
    )+

/* ── unary ──────────────────────────────────────────────────── */

Unary
  = Member
  / S ops:$( "!"+ / "-"+ ) expr:Member
    {
      if (ops.length % 2 === 0) return expr;
      return call(`${ops[0]}_`, [expr]);
    }

/* ── member access ──────────────────────────────────────────── */

Member
  = S primary:Primary tail:MemberTail
    {
      if (tail.length === 0) return primary;
      return tail.reduce((expr, op) => op(expr), primary);
    }

MemberTail
  = (S @Access)*

Access
  = ".?" S field:Selector S ![(]
    {
      return (prev) => call("_?._", [prev, { kind: "StringLiteral", value: field }]);
    }
  / "." S field:Selector S ![(]
    {
      return (prev) => ({
        kind: "Select",
        operand: prev,
        field,
        testOnly: false,
      });
    }
  / "." S func:Selector S "(" args:ExprList ")"
    {
      return (prev) => maybeExpand(prev, func, args);
    }
  / "[?" index:Expr "]"
    {
      return (prev) => call("_[?_]", [prev, index]);
    }
  / "[" index:Expr "]"
    {
      return (prev) => call("_[_]", [prev, index]);
    }

/* ── primary ────────────────────────────────────────────────── */

Primary
  = Literal
  / "."? S identifier:Identifier S "(" args:ExprList ")"
    {
      // has() macro
      if (
        identifier === "has" &&
        args.length === 1 &&
        args[0].kind === "Select"
      ) {
        return expandHas(args[0]);
      }
      return call(identifier, args);
    }
  / dot:"."? S name:Selector|1.., S "." S| S "{" entries:FieldInits ","? S "}"
    {
      return {
        kind: "CreateStruct",
        messageName: (dot !== null ? dot : "") + name.join("."),
        entries,
      };
    }
  / "."? S name:Selector
    { return ident(name); }
  / "(" @Expr ")"
  / "[" elements:OptExprList ","? S "]"
    {
      const hasOptional = elements.some(e => e.optional);
      if (hasOptional) {
        return { kind: "CreateList", elements: elements.map(e => e.expr), optionalIndices: elements.reduce((acc, e, i) => { if (e.optional) acc.push(i); return acc; }, []) };
      }
      return listExpr(elements.map(e => e.expr));
    }
  / "{" entries:MapInits ","? S "}"
    {
      return { kind: "CreateMap", entries };
    }

/* ── lists ──────────────────────────────────────────────────── */

ExprList
  = Expr|0.., ","|

OptExprList
  = (
      S opt:"?"? expr:Expr
      { return { expr, optional: opt !== null }; }
    )|0.., ","|

FieldInits
  = (
      S opt:"?"? key:Selector $(S ":") value:Expr
      { return { field: key, value, optional: opt !== null }; }
    )|0.., ","|

MapInits
  = (
      S opt:"?"? key:Expr ":" value:Expr
      { return { key, value, optional: opt !== null }; }
    )|0.., ","|

/* ── identifiers ────────────────────────────────────────────── */

Identifier "identifier"
  = id:$([_a-zA-Z][_a-zA-Z0-9]*)
    {
      if ([
        "true", "false", "null", "in", "as", "break", "const", "continue",
        "else", "for", "function", "if", "import", "let", "loop", "package",
        "namespace", "return", "var", "void", "while"
      ].includes(id)) {
        error("reserved identifier");
      }
      return id;
    }

Selector "selector"
  = selector:$([_a-zA-Z][_a-zA-Z0-9]*)
    &{
      return selector !== "true" && selector !== "false" && selector !== "null" && selector !== "in";
    }
    { return selector; }
  / "`" chars:$([^`]*) "`"
    { return chars; }

/* ── literals ───────────────────────────────────────────────── */

Literal
  = FloatLiteral
  / UnsignedIntLiteral
  / IntLiteral
  / StringLiteral
  / BytesLiteral
  / BooleanLiteral
  / NullLiteral

IntLiteral "integer literal"
  = digits:$("-"? ("0x" HexDigit+ / Digit+))
    { return { kind: "IntLiteral", value: digits[0] === "-" ? -BigInt(digits.slice(1)) : BigInt(digits) }; }

UnsignedIntLiteral "unsigned integer literal"
  = digits:$("0x" HexDigit+ / Digit+) [uU]
    { return { kind: "UintLiteral", value: BigInt(digits) }; }

FloatLiteral "float literal"
  = digits:$("-"? Digit* "." Digit+ Exponent? / "-"? Digit+ Exponent)
    { return { kind: "DoubleLiteral", value: parseFloat(digits) }; }

Digit "digit"
  = [0-9]

HexDigit "hex digit"
  = [0-9abcdefABCDEF]

Exponent "exponent"
  = [eE] [+-]? Digit+

StringLiteral "string literal"
  = bytes:CharacterSequence
    {
      return {
        kind: "StringLiteral",
        value: bytes.reduce((s, chunk) => {
          if (typeof chunk !== "string") return s + String.fromCodePoint(...chunk);
          return s + chunk;
        }, ""),
      };
    }

BytesLiteral "bytes literal"
  = [bB] bytes:CharacterSequence
    {
      const chunks = [];
      let totalSize = 0;
      for (const raw of bytes) {
        const chunk = typeof raw === "string" ? encoder.encode(raw) : raw;
        chunks.push(chunk);
        totalSize += chunk.length;
      }
      const value = new Uint8Array(totalSize);
      let off = 0;
      for (const chunk of chunks) {
        value.set(chunk, off);
        off += chunk.length;
      }
      return { kind: "BytesLiteral", value };
    }

CharacterSequence "quoted character sequence"
  = [rR] @( '"""'  @(!'"""' @.)*                  '"""'
  / "'''"  @(!"'''" @.)*                          "'''"
  / '"'    @(!( '"' / NewLine ) @.)*              '"'
  / "'"    @(!( "'" / NewLine ) @.)*              "'")
  /       ( '"""'  @(Escape / $(!'"""' @.))*      '"""'
  / "'''"  @(Escape / $(!"'''" @.))*              "'''"
  / '"'    @(Escape / $(!( '"' / NewLine ) @.))*  '"'
  / "'"    @(Escape / $(!( "'" / NewLine ) @.))*  "'")

Escape "escaped character"
  = ByteSequence
  / "\\" value:[abfnrtv]
    {
      switch (value) {
        case "a": return "\x07";
        case "b": return "\b";
        case "f": return "\f";
        case "n": return "\n";
        case "r": return "\r";
        case "t": return "\t";
        case "v": return "\v";
      }
      throw new Error();
    }
  / "\\" @$[\"\'\`\\?]

ByteSequence "byte sequence"
  = Bytes+

Bytes "escaped bytes"
  = "\\" [xX] value:$Byte|1|        { return parseInt(value, 16); }
  / "\\u" value:$Byte|2|            { return parseInt(value, 16); }
  / "\\U" value:$Byte|4|            { return parseInt(value, 16); }
  / "\\" value:$([0-3] [0-7] [0-7]) { return parseInt(value, 8); }

Byte "byte value"
  = $(HexDigit HexDigit)

NewLine "new line"
  = [\r\n]+

BooleanLiteral "boolean literal"
  = keyword:("true" / "false")
    { return { kind: "BoolLiteral", value: keyword === "true" }; }

NullLiteral "null literal"
  = "null" ![_a-zA-Z0-9]
    { return { kind: "NullLiteral" }; }

/* ── whitespace / comments ──────────────────────────────────── */

S
  = WhiteSpace? Comment? WhiteSpace?

WhiteSpace "whitespace"
  = $([\t\n\f\r ]+)

Comment "comment"
  = '//' [^\r\n]* NewLine
