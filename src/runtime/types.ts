/** Marker class for CEL uint values (distinguishes from int which is also bigint) */
export class CelUint {
  constructor(public readonly value: bigint) {}
}

/** Create a CEL uint value */
export function celUint(value: bigint): CelUint {
  return new CelUint(value);
}

/** Check if a value is a CelUint */
export function isCelUint(value: unknown): value is CelUint {
  return value instanceof CelUint;
}

/** CEL type value */
export class CelType {
  constructor(public readonly name: string) {}
}

/** Check if a value is a CelType */
export function isCelType(value: unknown): value is CelType {
  return value instanceof CelType;
}

/** CEL optional value — wraps a value that may or may not be present */
export class CelOptional {
  private readonly _value: unknown;
  private readonly _hasValue: boolean;

  private constructor(value: unknown, hasValue: boolean) {
    this._value = value;
    this._hasValue = hasValue;
  }

  static none(): CelOptional {
    return new CelOptional(undefined, false);
  }

  static of(value: unknown): CelOptional {
    return new CelOptional(value, true);
  }

  hasValue(): boolean {
    return this._hasValue;
  }

  value(): unknown {
    if (!this._hasValue) return undefined; // error sentinel
    return this._value;
  }
}

/** Check if a value is a CelOptional */
export function isCelOptional(value: unknown): value is CelOptional {
  return value instanceof CelOptional;
}

/** CEL value types that our transpiler can produce */
export type CelValue =
  | null
  | boolean
  | bigint // int
  | CelUint // uint
  | number // double
  | string
  | Uint8Array // bytes
  | CelValue[] // list
  | Map<CelValue, CelValue> // map
  | CelType // type value
  | CelOptional; // optional value
