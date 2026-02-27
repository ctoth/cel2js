import { describe, expect, it } from "vitest";
import { CelError, compile } from "../../src/transpiler.js";

/** Evaluate a CEL expression and return the result */
function ev(expr: string, bindings?: Record<string, unknown>): unknown {
  return compile(expr).evaluate(bindings);
}

/** Expect a CEL expression to throw a CelError */
function expectError(expr: string, bindings?: Record<string, unknown>): void {
  expect(() => compile(expr).evaluate(bindings)).toThrow(CelError);
}

// ── ip_type: Parsing and validating IP addresses ──────────────────────────

describe("network_ext", () => {
  describe("ip_type", () => {
    it("parse_ipv4", () => {
      expect(ev("string(ip('192.168.0.1'))")).toBe("192.168.0.1");
    });

    it("parse_invalid_ipv4", () => {
      expectError("ip('192.168.0.1.0')");
    });

    it("is_ip_valid_ipv4", () => {
      expect(ev("isIP('192.168.0.1')")).toBe(true);
    });

    it("is_ip_invalid_ipv4", () => {
      expect(ev("isIP('192.168.0.1.0')")).toBe(false);
    });

    it("ip_is_canonical_valid_ipv4", () => {
      expect(ev("ip.isCanonical('127.0.0.1')")).toBe(true);
    });

    it("ip_is_canonical_invalid_ipv4", () => {
      expectError("ip.isCanonical('127.0.0.1.0')");
    });

    it("ip_is_canonical_non_canonical_ipv6", () => {
      expect(ev("ip.isCanonical('2001:DB8::68')")).toBe(false);
    });

    it("parse_ipv6", () => {
      expect(ev("string(ip('2001:db8::68'))")).toBe("2001:db8::68");
    });

    it("parse_invalid_ipv6", () => {
      expectError("ip('2001:db8:::68')");
    });

    it("parse_invalid_ipv6_with_zone", () => {
      expectError("ip('fe80::1%en0')");
    });

    it("parse_invalid_ipv4_in_ipv6", () => {
      expectError("ip('::ffff:192.168.0.1')");
    });

    it("ip_to_string", () => {
      expect(ev("string(ip('192.168.0.1'))")).toBe("192.168.0.1");
    });

    it("ip_type", () => {
      expect(ev("type(ip('192.168.0.1')) == net.IP")).toBe(true);
    });
  });

  // ── ipv4: Properties and methods of IPv4 addresses ────────────────────

  describe("ipv4", () => {
    it("ipv4_family", () => {
      expect(ev("ip('192.168.0.1').family()")).toBe(4n);
    });

    it("ipv4_is_unspecified_true", () => {
      expect(ev("ip('0.0.0.0').isUnspecified()")).toBe(true);
    });

    it("ipv4_is_unspecified_false", () => {
      expect(ev("ip('127.0.0.1').isUnspecified()")).toBe(false);
    });

    it("ipv4_is_loopback_true", () => {
      expect(ev("ip('127.0.0.1').isLoopback()")).toBe(true);
    });

    it("ipv4_is_loopback_false", () => {
      expect(ev("ip('1.2.3.4').isLoopback()")).toBe(false);
    });

    it("ipv4_is_global_unicast_true", () => {
      expect(ev("ip('192.168.0.1').isGlobalUnicast()")).toBe(true);
    });

    it("ipv4_is_global_unicast_false", () => {
      expect(ev("ip('255.255.255.255').isGlobalUnicast()")).toBe(false);
    });

    it("is_link_local_multicast_true", () => {
      expect(ev("ip('224.0.0.1').isLinkLocalMulticast()")).toBe(true);
    });

    it("is_link_local_multicast_false", () => {
      expect(ev("ip('224.0.1.1').isLinkLocalMulticast()")).toBe(false);
    });

    it("is_link_local_unicast_true", () => {
      expect(ev("ip('169.254.169.254').isLinkLocalUnicast()")).toBe(true);
    });

    it("is_link_local_unicast_false", () => {
      expect(ev("ip('192.168.0.1').isLinkLocalUnicast()")).toBe(false);
    });

    it("ipv4_equals", () => {
      expect(ev("ip('127.0.0.1') == ip('127.0.0.1')")).toBe(true);
    });

    it("ipv4_not_equals", () => {
      expect(ev("ip('127.0.0.1') == ip('10.0.0.1')")).toBe(false);
    });

    it("ipv4_equals_ipv6", () => {
      expect(ev("ip('::ffff:c0a8:1') == ip('192.168.0.1')")).toBe(true);
    });

    it("ipv4_not_equals_ipv6", () => {
      expect(ev("ip('::ffff:c0a8:1') == ip('192.168.10.1')")).toBe(false);
    });
  });

  // ── ipv6: Properties and methods of IPv6 addresses ────────────────────

  describe("ipv6", () => {
    it("family", () => {
      expect(ev("ip('2001:db8::68').family()")).toBe(6n);
    });

    it("is_unspecified_true", () => {
      expect(ev("ip('::').isUnspecified()")).toBe(true);
    });

    it("is_loopback_true", () => {
      expect(ev("ip('::1').isLoopback()")).toBe(true);
    });

    it("is_global_unicast_true", () => {
      expect(ev("ip('2001:db8::abcd').isGlobalUnicast()")).toBe(true);
    });

    it("is_global_unicast_false", () => {
      expect(ev("ip('ff00::1').isGlobalUnicast()")).toBe(false);
    });

    it("is_link_local_multicast_true", () => {
      expect(ev("ip('ff02::1').isLinkLocalMulticast()")).toBe(true);
    });

    it("is_link_local_multicast_false", () => {
      expect(ev("ip('fd00::1').isLinkLocalMulticast()")).toBe(false);
    });

    it("is_link_local_unicast_true", () => {
      expect(ev("ip('fe80::1').isLinkLocalUnicast()")).toBe(true);
    });

    it("is_link_local_unicast_false", () => {
      expect(ev("ip('fd80::1').isLinkLocalUnicast()")).toBe(false);
    });

    it("ipv6_equals", () => {
      expect(ev("ip('2001:db8::1') == ip('2001:DB8::1')")).toBe(true);
    });

    it("ipv6_not_equals", () => {
      expect(ev("ip('::') == ip('::ffff')")).toBe(false);
    });
  });

  // ── cidr: CIDR parsing and range checking ─────────────────────────────

  describe("cidr", () => {
    it("parse_cidr_ipv4", () => {
      expect(ev("type(cidr('192.168.0.0/24')) == net.CIDR")).toBe(true);
    });

    it("parse_invalid_cidr_ipv4", () => {
      expectError("cidr('192.168.0.0/')");
    });

    it("parse_invalid_cidr_with_zone", () => {
      expectError("cidr('fe80::1%en0/24')");
    });

    it("parse_invalid_cidr_ipv4_in_ipv6", () => {
      expectError("cidr('::ffff:192.168.0.1/24')");
    });

    it("cidr_equals", () => {
      expect(ev("cidr('127.0.0.1/24') == cidr('127.0.0.1/24')")).toBe(true);
    });

    it("cidr_not_equals", () => {
      expect(ev("cidr('192.0.0.1/32') == cidr('10.0.0.1/8')")).toBe(false);
    });

    it("cidr_not_equals_ipv4_ipv6", () => {
      expect(ev("cidr('2001:db8::/32') == cidr('10.0.0.1/32')")).toBe(false);
    });

    it("cidr_contains_ip_ipv4_object", () => {
      expect(ev("cidr('192.168.0.0/24').containsIP(ip('192.168.0.1'))")).toBe(true);
    });

    it("cidr_does_not_contain_ip_ipv4_object", () => {
      expect(ev("cidr('192.168.0.0/24').containsIP(ip('192.168.1.1'))")).toBe(false);
    });

    it("cidr_contains_ip_ipv4_string", () => {
      expect(ev("cidr('192.168.0.0/24').containsIP('192.168.0.1')")).toBe(true);
    });

    it("cidr_does_not_contain_ip_ipv4_string", () => {
      expect(ev("cidr('192.168.0.0/24').containsIP('192.168.1.1')")).toBe(false);
    });

    it("cidr_contains_cidr_ipv4_object", () => {
      expect(ev("cidr('192.168.0.0/24').containsCIDR(cidr('192.168.0.0/25'))")).toBe(true);
    });

    it("cidr_contains_cidr_ipv4_object_32", () => {
      expect(ev("cidr('192.168.0.0/24').containsCIDR(cidr('192.168.0.1/32'))")).toBe(true);
    });

    it("cidr_not_contains_cidr_ipv4_object", () => {
      expect(ev("cidr('192.168.0.0/24').containsCIDR(cidr('192.168.0.0/23'))")).toBe(false);
    });

    it("cidr_contains_cidr_ipv4_string", () => {
      expect(ev("cidr('192.168.0.0/24').containsCIDR('192.168.0.0/25')")).toBe(true);
    });

    it("cidr_contains_cidr", () => {
      expect(ev("cidr('10.0.0.0/8').containsCIDR(cidr('10.0.0.0/8'))")).toBe(true);
    });

    it("cidr_contains_cidr_ipv4_exact", () => {
      expect(ev("cidr('10.0.0.0/8').containsCIDR('10.0.0.0/8')")).toBe(true);
    });

    it("cidr_ipv6_not_contains_ip_ipv4_object", () => {
      expect(ev("cidr('2001:db8::/32').containsIP(ip('192.168.1.1'))")).toBe(false);
    });

    it("cidr_ipv4_not_contains_ip_ipv6_object", () => {
      expect(ev("cidr('192.168.1.1/32').containsIP(ip('2001:db8::1'))")).toBe(false);
    });

    it("cidr_get_ip_ipv4", () => {
      expect(ev("cidr('192.168.0.0/24').ip() == ip('192.168.0.0')")).toBe(true);
    });

    it("cidr_masked_ipv4", () => {
      expect(ev("cidr('192.168.0.1/24').masked() == cidr('192.168.0.0/24')")).toBe(true);
    });

    it("cidr_prefix_length_ipv4", () => {
      expect(ev("cidr('192.168.0.0/24').prefixLength()")).toBe(24n);
    });

    it("parse_cidr_ipv6", () => {
      expect(ev("string(cidr('2001:db8::/32'))")).toBe("2001:db8::/32");
    });

    it("cidr_contains_ip_ipv6_object", () => {
      expect(ev("cidr('2001:db8::/32').containsIP(ip('2001:db8::1'))")).toBe(true);
    });

    it("cidr_contains_cidr_ipv6_object", () => {
      expect(ev("cidr('2001:db8::/32').containsCIDR(cidr('2001:db8::/33'))")).toBe(true);
    });

    it("cidr_get_ip_ipv6", () => {
      expect(ev("cidr('2001:db8::/32').ip() == ip('2001:db8::')")).toBe(true);
    });

    it("cidr_prefix_length_ipv6", () => {
      expect(ev("cidr('2001:db8::/32').prefixLength()")).toBe(32n);
    });

    it("cidr_to_string", () => {
      expect(ev("string(cidr('192.168.0.0/24'))")).toBe("192.168.0.0/24");
    });

    it("cidr_type", () => {
      expect(ev("type(cidr('192.168.0.0/24')) == net.CIDR")).toBe(true);
    });
  });
});
