import { describe, expect, it } from "vitest";
import type { CelExpr } from "../../src/parser/index.js";
import { parse } from "../../src/parser/index.js";

/* helper -- cast to specific node kind and return it (or fail) */
function as<K extends CelExpr["kind"]>(
  expr: CelExpr | undefined,
  kind: K,
): Extract<CelExpr, { kind: K }> {
  expect(expr).toBeDefined();
  expect(expr?.kind).toBe(kind);
  return expr as Extract<CelExpr, { kind: K }>;
}

// -- Integer literals ---------------------------------------------------

describe("integer literals", () => {
  it("parses decimal integer", () => {
    const n = as(parse("1"), "IntLiteral");
    expect(n.value).toBe(1n);
  });

  it("parses hex integer", () => {
    const n = as(parse("0xff"), "IntLiteral");
    expect(n.value).toBe(0xffn);
  });

  it("parses negative integer", () => {
    const n = as(parse("-1"), "IntLiteral");
    expect(n.value).toBe(-1n);
  });

  it("parses zero", () => {
    const n = as(parse("0"), "IntLiteral");
    expect(n.value).toBe(0n);
  });
});

// -- Uint literals ------------------------------------------------------

describe("uint literals", () => {
  it("parses decimal uint", () => {
    const n = as(parse("1u"), "UintLiteral");
    expect(n.value).toBe(1n);
  });

  it("parses hex uint", () => {
    const n = as(parse("0xFFu"), "UintLiteral");
    expect(n.value).toBe(0xffn);
  });
});

// -- Double literals ----------------------------------------------------

describe("double literals", () => {
  it("parses simple double", () => {
    const n = as(parse("1.0"), "DoubleLiteral");
    expect(n.value).toBe(1.0);
  });

  it("parses scientific notation", () => {
    const n = as(parse("1e10"), "DoubleLiteral");
    expect(n.value).toBe(1e10);
  });

  it("parses leading dot", () => {
    const n = as(parse(".5"), "DoubleLiteral");
    expect(n.value).toBe(0.5);
  });
});

// -- String literals ----------------------------------------------------

describe("string literals", () => {
  it("parses double-quoted string", () => {
    const n = as(parse('"hello"'), "StringLiteral");
    expect(n.value).toBe("hello");
  });

  it("parses single-quoted string", () => {
    const n = as(parse("'world'"), "StringLiteral");
    expect(n.value).toBe("world");
  });

  it("parses triple-double-quoted string", () => {
    const n = as(parse('"""multi"""'), "StringLiteral");
    expect(n.value).toBe("multi");
  });

  it("parses raw string", () => {
    const n = as(parse('r"raw\\ntext"'), "StringLiteral");
    expect(n.value).toBe("raw\\ntext");
  });
});

// -- Bool literals ------------------------------------------------------

describe("bool literals", () => {
  it("parses true", () => {
    const n = as(parse("true"), "BoolLiteral");
    expect(n.value).toBe(true);
  });

  it("parses false", () => {
    const n = as(parse("false"), "BoolLiteral");
    expect(n.value).toBe(false);
  });
});

// -- Null literal -------------------------------------------------------

describe("null literal", () => {
  it("parses null", () => {
    as(parse("null"), "NullLiteral");
  });
});

// -- Identifiers --------------------------------------------------------

describe("identifiers", () => {
  it("parses simple identifier", () => {
    const n = as(parse("x"), "Ident");
    expect(n.name).toBe("x");
  });

  it("parses dotted identifier as Select", () => {
    const sel = as(parse("foo.bar"), "Select");
    expect(sel.field).toBe("bar");
    const inner = as(sel.operand, "Ident");
    expect(inner.name).toBe("foo");
  });
});

// -- Arithmetic ---------------------------------------------------------

describe("arithmetic", () => {
  it("parses addition", () => {
    const c = as(parse("1 + 2"), "Call");
    expect(c.fn).toBe("_+_");
    expect(c.args).toHaveLength(2);
    expect(as(c.args[0], "IntLiteral").value).toBe(1n);
    expect(as(c.args[1], "IntLiteral").value).toBe(2n);
  });

  it("parses multiplication", () => {
    const c = as(parse("3 * 4"), "Call");
    expect(c.fn).toBe("_*_");
  });

  it("respects operator precedence (* before +)", () => {
    // 1 + 2 * 3  ->  _+_(1, _*_(2, 3))
    const add = as(parse("1 + 2 * 3"), "Call");
    expect(add.fn).toBe("_+_");
    const mul = as(add.args[1], "Call");
    expect(mul.fn).toBe("_*_");
  });
});

// -- Comparisons --------------------------------------------------------

describe("comparisons", () => {
  it("parses ==", () => {
    const c = as(parse("a == b"), "Call");
    expect(c.fn).toBe("_==_");
  });

  it("parses <", () => {
    const c = as(parse("a < b"), "Call");
    expect(c.fn).toBe("_<_");
  });

  it("parses !=", () => {
    const c = as(parse("a != b"), "Call");
    expect(c.fn).toBe("_!=_");
  });

  it("parses >=", () => {
    const c = as(parse("a >= b"), "Call");
    expect(c.fn).toBe("_>=_");
  });
});

// -- Logic --------------------------------------------------------------

describe("logic", () => {
  it("parses &&", () => {
    const c = as(parse("a && b"), "Call");
    expect(c.fn).toBe("_&&_");
  });

  it("parses ||", () => {
    const c = as(parse("a || b"), "Call");
    expect(c.fn).toBe("_||_");
  });

  it("parses negation", () => {
    const c = as(parse("!a"), "Call");
    expect(c.fn).toBe("!_");
    expect(c.args).toHaveLength(1);
  });
});

// -- Ternary ------------------------------------------------------------

describe("ternary", () => {
  it("parses ternary expression", () => {
    const c = as(parse("a ? b : c"), "Call");
    expect(c.fn).toBe("_?_:_");
    expect(c.args).toHaveLength(3);
    expect(as(c.args[0], "Ident").name).toBe("a");
    expect(as(c.args[1], "Ident").name).toBe("b");
    expect(as(c.args[2], "Ident").name).toBe("c");
  });
});

// -- Function calls -----------------------------------------------------

describe("function calls", () => {
  it("parses global function call", () => {
    const c = as(parse("size(x)"), "Call");
    expect(c.fn).toBe("size");
    expect(c.target).toBeUndefined();
    expect(c.args).toHaveLength(1);
    expect(as(c.args[0], "Ident").name).toBe("x");
  });

  it("parses member function call", () => {
    const c = as(parse('x.contains("y")'), "Call");
    expect(c.fn).toBe("contains");
    expect(c.target).toBeDefined();
    as(c.target, "Ident");
    expect(as(c.target, "Ident").name).toBe("x");
    expect(c.args).toHaveLength(1);
    expect(as(c.args[0], "StringLiteral").value).toBe("y");
  });
});

// -- List literals ------------------------------------------------------

describe("list literals", () => {
  it("parses list", () => {
    const list = as(parse("[1, 2, 3]"), "CreateList");
    expect(list.elements).toHaveLength(3);
    expect(as(list.elements[0], "IntLiteral").value).toBe(1n);
    expect(as(list.elements[1], "IntLiteral").value).toBe(2n);
    expect(as(list.elements[2], "IntLiteral").value).toBe(3n);
  });

  it("parses empty list", () => {
    const list = as(parse("[]"), "CreateList");
    expect(list.elements).toHaveLength(0);
  });
});

// -- Map literals -------------------------------------------------------

describe("map literals", () => {
  it("parses map", () => {
    const map = as(parse('{"a": 1, "b": 2}'), "CreateMap");
    expect(map.entries).toHaveLength(2);
    const e0 = map.entries[0];
    expect(e0).toBeDefined();
    if (e0) {
      expect(as(e0.key, "StringLiteral").value).toBe("a");
      expect(as(e0.value, "IntLiteral").value).toBe(1n);
    }
    const e1 = map.entries[1];
    expect(e1).toBeDefined();
    if (e1) {
      expect(as(e1.key, "StringLiteral").value).toBe("b");
      expect(as(e1.value, "IntLiteral").value).toBe(2n);
    }
  });

  it("parses empty map", () => {
    const map = as(parse("{}"), "CreateMap");
    expect(map.entries).toHaveLength(0);
  });
});

// -- Member access ------------------------------------------------------

describe("member access", () => {
  it("parses field access", () => {
    const sel = as(parse("a.b"), "Select");
    expect(sel.field).toBe("b");
    expect(sel.testOnly).toBe(false);
    expect(as(sel.operand, "Ident").name).toBe("a");
  });

  it("parses index access", () => {
    const c = as(parse("a[0]"), "Call");
    expect(c.fn).toBe("_[_]");
    expect(c.args).toHaveLength(2);
    expect(as(c.args[0], "Ident").name).toBe("a");
    expect(as(c.args[1], "IntLiteral").value).toBe(0n);
  });
});

// -- Macros -------------------------------------------------------------

describe("macros", () => {
  it("expands has(a.b) to select with testOnly", () => {
    const sel = as(parse("has(a.b)"), "Select");
    expect(sel.field).toBe("b");
    expect(sel.testOnly).toBe(true);
    expect(as(sel.operand, "Ident").name).toBe("a");
  });

  it("expands all() to comprehension", () => {
    const comp = as(parse("[1,2,3].all(x, x > 0)"), "Comprehension");
    expect(comp.iterVar).toBe("x");
    expect(comp.accuVar).toBe("__result__");
    expect(as(comp.accuInit, "BoolLiteral").value).toBe(true);
    as(comp.iterRange, "CreateList");
  });

  it("expands exists() to comprehension", () => {
    const comp = as(parse("[1,2,3].exists(x, x > 0)"), "Comprehension");
    expect(comp.iterVar).toBe("x");
    expect(as(comp.accuInit, "BoolLiteral").value).toBe(false);
  });

  it("expands map() to comprehension", () => {
    const comp = as(parse("[1,2,3].map(x, x * 2)"), "Comprehension");
    expect(comp.iterVar).toBe("x");
    as(comp.accuInit, "CreateList");
  });

  it("expands filter() to comprehension", () => {
    const comp = as(parse("[1,2,3].filter(x, x > 1)"), "Comprehension");
    expect(comp.iterVar).toBe("x");
    as(comp.accuInit, "CreateList");
  });
});

// -- `in` operator ------------------------------------------------------

describe("in operator", () => {
  it("parses x in list", () => {
    const c = as(parse("x in [1,2,3]"), "Call");
    expect(c.fn).toBe("@in");
    expect(c.args).toHaveLength(2);
    expect(as(c.args[0], "Ident").name).toBe("x");
    as(c.args[1], "CreateList");
  });
});
