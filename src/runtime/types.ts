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

// ---------------------------------------------------------------------------
// Network extension types: IP addresses and CIDR ranges
// ---------------------------------------------------------------------------

/**
 * CEL IP address value.
 * Stores the IP as a Uint8Array of 4 bytes (IPv4) or 16 bytes (IPv6).
 */
export class CelIP {
  /** Raw bytes: 4 for IPv4, 16 for IPv6 */
  readonly bytes: Uint8Array;
  /** Original string representation (canonical form) */
  readonly _str: string;

  constructor(bytes: Uint8Array, str: string) {
    this.bytes = bytes;
    this._str = str;
  }

  /** Returns 4 for IPv4, 6 for IPv6 */
  family(): 4 | 6 {
    return this.bytes.length === 4 ? 4 : 6;
  }
}

/** Check if a value is a CelIP */
export function isCelIP(value: unknown): value is CelIP {
  return value instanceof CelIP;
}

/**
 * CEL CIDR range value.
 * Stores the IP address and prefix length.
 */
export class CelCIDR {
  readonly ip: CelIP;
  readonly prefix: number;
  readonly _str: string;

  constructor(ip: CelIP, prefix: number, str: string) {
    this.ip = ip;
    this.prefix = prefix;
    this._str = str;
  }
}

/** Check if a value is a CelCIDR */
export function isCelCIDR(value: unknown): value is CelCIDR {
  return value instanceof CelCIDR;
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
  | CelOptional // optional value
  | CelIP // IP address
  | CelCIDR; // CIDR range
