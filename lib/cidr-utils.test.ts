import { describe, expect, it } from 'vitest';

import {
  cidrsOverlap,
  containsCidr,
  getNetworkCapacity,
  getPrefixLength,
  getUsableAddresses,
  isValidCidr,
} from './cidr-utils';

describe('isValidCidr', () => {
  it('accepts well-formed CIDR blocks', () => {
    expect(isValidCidr('10.0.0.0/24')).toBe(true);
    expect(isValidCidr('192.168.1.0/30')).toBe(true);
    expect(isValidCidr('0.0.0.0/0')).toBe(true);
    expect(isValidCidr('255.255.255.255/32')).toBe(true);
  });

  it('rejects malformed input', () => {
    expect(isValidCidr('not-a-cidr')).toBe(false);
    expect(isValidCidr('10.0.0.0')).toBe(false); // no prefix
    expect(isValidCidr('10.0.0.0/33')).toBe(false); // prefix out of range
    expect(isValidCidr('10.0.0.256/24')).toBe(false); // octet out of range
    expect(isValidCidr('')).toBe(false);
  });
});

describe('getPrefixLength', () => {
  it('extracts the prefix length', () => {
    expect(getPrefixLength('10.0.0.0/24')).toBe(24);
    expect(getPrefixLength('10.0.0.0/8')).toBe(8);
  });

  it('returns null for invalid CIDR', () => {
    expect(getPrefixLength('garbage')).toBeNull();
  });
});

describe('containsCidr', () => {
  it('is true when the child is fully inside the parent', () => {
    expect(containsCidr('10.0.0.0/16', '10.0.1.0/24')).toBe(true);
    expect(containsCidr('10.0.0.0/8', '10.255.255.0/24')).toBe(true);
  });

  it('is false when the child is outside the parent range', () => {
    expect(containsCidr('10.0.0.0/24', '10.0.1.0/24')).toBe(false);
    expect(containsCidr('10.0.0.0/16', '11.0.1.0/24')).toBe(false);
  });

  it('is false when the "child" is actually less specific (bigger) than the parent', () => {
    expect(containsCidr('10.0.0.0/24', '10.0.0.0/16')).toBe(false);
  });

  it('returns false for invalid CIDR input rather than throwing', () => {
    expect(containsCidr('nonsense', '10.0.0.0/24')).toBe(false);
    expect(containsCidr('10.0.0.0/24', 'nonsense')).toBe(false);
  });
});

describe('cidrsOverlap', () => {
  it('is true for identical ranges', () => {
    expect(cidrsOverlap('10.0.0.0/24', '10.0.0.0/24')).toBe(true);
  });

  it('is true when one range contains the other', () => {
    expect(cidrsOverlap('10.0.0.0/16', '10.0.1.0/24')).toBe(true);
    expect(cidrsOverlap('10.0.1.0/24', '10.0.0.0/16')).toBe(true);
  });

  it('is true for partially overlapping ranges', () => {
    // 10.0.0.0/23 covers 10.0.0.0–10.0.1.255; 10.0.1.0/24 sits inside that.
    expect(cidrsOverlap('10.0.0.0/23', '10.0.1.0/24')).toBe(true);
  });

  it('is false for disjoint ranges', () => {
    expect(cidrsOverlap('10.0.0.0/24', '10.0.1.0/24')).toBe(false);
    expect(cidrsOverlap('10.0.0.0/24', '192.168.0.0/24')).toBe(false);
  });
});

describe('getNetworkCapacity', () => {
  it('reserves network and broadcast addresses for /0 through /30', () => {
    expect(getNetworkCapacity('10.0.0.0/24')).toBe(254);
    expect(getNetworkCapacity('10.0.0.0/30')).toBe(2);
    expect(getNetworkCapacity('10.0.0.0/16')).toBe(65534);
  });

  it('does not reserve any addresses for /31 and /32 (RFC 3021)', () => {
    expect(getNetworkCapacity('10.0.0.0/31')).toBe(2);
    expect(getNetworkCapacity('10.0.0.0/32')).toBe(1);
  });

  it('returns null for invalid CIDR', () => {
    expect(getNetworkCapacity('garbage')).toBeNull();
  });
});

describe('getUsableAddresses', () => {
  it('excludes the network and broadcast address for a /30', () => {
    expect(getUsableAddresses('10.0.0.0/30')).toEqual(['10.0.0.1', '10.0.0.2']);
  });

  it('includes both addresses for a /31 (no network/broadcast reserved)', () => {
    expect(getUsableAddresses('10.0.0.0/31')).toEqual(['10.0.0.0', '10.0.0.1']);
  });

  it('returns a single address for a /32', () => {
    expect(getUsableAddresses('10.0.0.5/32')).toEqual(['10.0.0.5']);
  });

  it('returns a list the same length as getNetworkCapacity reports', () => {
    const addresses = getUsableAddresses('10.0.0.0/28');
    expect(addresses).not.toBeNull();
    expect(addresses?.length).toBe(getNetworkCapacity('10.0.0.0/28'));
  });

  it('returns null for invalid CIDR', () => {
    expect(getUsableAddresses('garbage')).toBeNull();
  });
});
