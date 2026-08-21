import { describe, expect, it } from 'vitest';

import { describeActivity, describeChange } from './audit-log-utils';

describe('describeChange', () => {
  it('describes auth events', () => {
    expect(
      describeChange({ action: 'LOGIN', entity: 'Auth', metadata: null }),
    ).toBe('Signed in');
    expect(
      describeChange({ action: 'LOGOUT', entity: 'Auth', metadata: null }),
    ).toBe('Signed out');
  });

  it('describes network events using cidr and name from metadata', () => {
    const metadata = { cidr: '10.0.0.0/24', name: 'Corporate LAN' };
    expect(
      describeChange({ action: 'CREATE', entity: 'Network', metadata }),
    ).toBe('Created network 10.0.0.0/24 — Corporate LAN');
    expect(
      describeChange({ action: 'UPDATE', entity: 'Network', metadata }),
    ).toBe('Updated network 10.0.0.0/24 — Corporate LAN');
    expect(
      describeChange({ action: 'DELETE', entity: 'Network', metadata }),
    ).toBe('Deleted network 10.0.0.0/24 — Corporate LAN');
  });

  it('describes IP address events using the address from metadata', () => {
    const metadata = { address: '10.0.0.5' };
    expect(
      describeChange({ action: 'CREATE', entity: 'IpAddress', metadata }),
    ).toBe('Assigned 10.0.0.5');
    expect(
      describeChange({ action: 'UPDATE', entity: 'IpAddress', metadata }),
    ).toBe('Updated 10.0.0.5');
    expect(
      describeChange({ action: 'DELETE', entity: 'IpAddress', metadata }),
    ).toBe('Removed 10.0.0.5');
  });

  it('describes location events using code and name from metadata', () => {
    const metadata = { code: 'DC-01', name: 'Main DC' };
    expect(
      describeChange({ action: 'CREATE', entity: 'Location', metadata }),
    ).toBe('Created location DC-01 — Main DC');
    expect(
      describeChange({ action: 'DELETE', entity: 'Location', metadata }),
    ).toBe('Deleted location DC-01 — Main DC');
  });

  it('describes user invite and role-change events', () => {
    expect(
      describeChange({
        action: 'CREATE',
        entity: 'User',
        metadata: { email: 'new@example.com', invitedRole: 'Viewer' },
      }),
    ).toBe('Invited new@example.com as Viewer');
    expect(
      describeChange({
        action: 'UPDATE',
        entity: 'User',
        metadata: { email: 'new@example.com', newRole: 'Admin' },
      }),
    ).toBe("Set new@example.com's role to Admin");
  });

  it('falls back to a generic sentence for unhandled entity/action combinations', () => {
    expect(
      describeChange({ action: 'CREATE', entity: 'Widget', metadata: null }),
    ).toBe('Created widget');
  });

  it('tolerates missing or non-string metadata fields', () => {
    expect(
      describeChange({ action: 'CREATE', entity: 'Network', metadata: null }),
    ).toBe('Created network ');
    expect(
      describeChange({
        action: 'CREATE',
        entity: 'Network',
        metadata: { cidr: 123 },
      }),
    ).toBe('Created network ');
  });
});

describe('describeActivity', () => {
  it('prefixes the change with the actor email, lowercasing the verb', () => {
    expect(
      describeActivity({
        action: 'CREATE',
        entity: 'Network',
        metadata: { cidr: '10.0.0.0/24', name: 'Corporate LAN' },
        user: { email: 'admin@example.com' },
      }),
    ).toBe('admin@example.com created network 10.0.0.0/24 — Corporate LAN');
  });

  it('falls back to "Someone" when there is no associated user', () => {
    expect(
      describeActivity({
        action: 'LOGIN',
        entity: 'Auth',
        metadata: null,
        user: null,
      }),
    ).toBe('Someone signed in');
  });
});
