import { describe, expect, it } from 'vitest';

import {
  ipAddressSchema,
  loginSchema,
  locationSchema,
  networkSchema,
} from './validations';

describe('loginSchema', () => {
  it('accepts a valid email and an 8+ character password', () => {
    const result = loginSchema.safeParse({
      email: 'admin@example.com',
      password: 'longenough',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid email', () => {
    const result = loginSchema.safeParse({
      email: 'not-an-email',
      password: 'longenough',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a password shorter than 8 characters', () => {
    const result = loginSchema.safeParse({
      email: 'admin@example.com',
      password: 'short',
    });
    expect(result.success).toBe(false);
  });
});

describe('networkSchema', () => {
  const base = {
    name: 'Corporate LAN',
    cidr: '10.0.0.0/24',
    status: 'ACTIVE' as const,
  };

  it('accepts a minimal valid network', () => {
    const result = networkSchema.safeParse(base);
    expect(result.success).toBe(true);
  });

  it('rejects a malformed CIDR', () => {
    const result = networkSchema.safeParse({ ...base, cidr: '10.0.0.0' });
    expect(result.success).toBe(false);
  });

  it('rejects a CIDR with an out-of-range octet', () => {
    const result = networkSchema.safeParse({
      ...base,
      cidr: '10.0.0.999/24',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a VLAN ID outside 1-4094', () => {
    expect(networkSchema.safeParse({ ...base, vlanId: 0 }).success).toBe(false);
    expect(networkSchema.safeParse({ ...base, vlanId: 4095 }).success).toBe(
      false,
    );
  });

  it('accepts a VLAN ID within range', () => {
    const result = networkSchema.safeParse({ ...base, vlanId: 100 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.vlanId).toBe(100);
    }
  });

  it('treats an empty-string VLAN as unset', () => {
    const result = networkSchema.safeParse({ ...base, vlanId: '' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.vlanId).toBeUndefined();
    }
  });

  it('requires a non-empty name', () => {
    const result = networkSchema.safeParse({ ...base, name: '' });
    expect(result.success).toBe(false);
  });
});

describe('locationSchema', () => {
  const base = { name: 'Main DC', code: 'DC-01' };

  it('accepts a minimal valid location', () => {
    expect(locationSchema.safeParse(base).success).toBe(true);
  });

  it('rejects a code with spaces or symbols', () => {
    expect(locationSchema.safeParse({ ...base, code: 'DC 01' }).success).toBe(
      false,
    );
    expect(locationSchema.safeParse({ ...base, code: 'DC_01' }).success).toBe(
      false,
    );
  });

  it('accepts a code with letters, numbers, and hyphens', () => {
    expect(locationSchema.safeParse({ ...base, code: 'DC-01-A' }).success).toBe(
      true,
    );
  });

  it('rejects latitude/longitude out of range', () => {
    expect(locationSchema.safeParse({ ...base, latitude: 91 }).success).toBe(
      false,
    );
    expect(locationSchema.safeParse({ ...base, longitude: -181 }).success).toBe(
      false,
    );
  });

  it('accepts latitude/longitude within range', () => {
    const result = locationSchema.safeParse({
      ...base,
      latitude: 43.238949,
      longitude: 76.889709,
    });
    expect(result.success).toBe(true);
  });

  it('treats empty-string coordinates as unset', () => {
    const result = locationSchema.safeParse({
      ...base,
      latitude: '',
      longitude: '',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.latitude).toBeUndefined();
      expect(result.data.longitude).toBeUndefined();
    }
  });
});

describe('ipAddressSchema', () => {
  const base = { address: '10.0.0.5', networkId: 'some-id' };

  it('accepts a valid IPv4 address', () => {
    expect(ipAddressSchema.safeParse(base).success).toBe(true);
  });

  it('rejects a malformed IPv4 address', () => {
    expect(
      ipAddressSchema.safeParse({ ...base, address: '10.0.0.999' }).success,
    ).toBe(false);
    expect(
      ipAddressSchema.safeParse({ ...base, address: 'not-an-ip' }).success,
    ).toBe(false);
  });

  it('accepts a valid MAC address in colon or hyphen form', () => {
    expect(
      ipAddressSchema.safeParse({ ...base, macAddress: '00:1A:2B:3C:4D:5E' })
        .success,
    ).toBe(true);
    expect(
      ipAddressSchema.safeParse({ ...base, macAddress: '00-1A-2B-3C-4D-5E' })
        .success,
    ).toBe(true);
  });

  it('rejects a malformed MAC address', () => {
    expect(
      ipAddressSchema.safeParse({ ...base, macAddress: '00:1A:2B' }).success,
    ).toBe(false);
  });

  it('treats an empty-string MAC address as unset', () => {
    const result = ipAddressSchema.safeParse({ ...base, macAddress: '' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.macAddress).toBeUndefined();
    }
  });

  it('requires a networkId', () => {
    expect(
      ipAddressSchema.safeParse({ address: '10.0.0.5', networkId: '' }).success,
    ).toBe(false);
  });
});
