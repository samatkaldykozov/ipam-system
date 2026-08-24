import { describe, expect, it } from 'vitest';

import {
  findDuplicateVlans,
  findHierarchyMismatches,
  findIpsOutOfRange,
  findIpStatusMismatches,
  findNetworkOverlaps,
  findParentCycles,
  MAX_NETWORKS_FOR_OVERLAP_CHECK,
  type IpAddressRow,
  type NetworkRow,
} from './data-integrity-utils';

function net(
  overrides: Partial<NetworkRow> & { id: string; cidr: string },
): NetworkRow {
  return {
    name: overrides.id,
    vlanId: null,
    parentId: null,
    ...overrides,
  };
}

function ip(
  overrides: Partial<IpAddressRow> & {
    id: string;
    address: string;
    networkId: string;
  },
): IpAddressRow {
  return {
    status: 'ASSIGNED',
    assignedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

describe('findIpsOutOfRange', () => {
  it('flags an IP whose address falls outside its network range', () => {
    const network = net({ id: 'n1', cidr: '10.0.0.0/24' });
    const networksById = new Map([['n1', network]]);
    const issues = findIpsOutOfRange(
      [ip({ id: 'ip1', address: '10.0.1.5', networkId: 'n1' })],
      networksById,
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].category).toBe('ip-out-of-range');
    expect(issues[0].severity).toBe('critical');
  });

  it('does not flag an IP that is within its network range', () => {
    const network = net({ id: 'n1', cidr: '10.0.0.0/24' });
    const networksById = new Map([['n1', network]]);
    const issues = findIpsOutOfRange(
      [ip({ id: 'ip1', address: '10.0.0.5', networkId: 'n1' })],
      networksById,
    );
    expect(issues).toEqual([]);
  });

  it('flags an IP referencing a network that no longer exists', () => {
    const issues = findIpsOutOfRange(
      [ip({ id: 'ip1', address: '10.0.0.5', networkId: 'missing' })],
      new Map(),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].category).toBe('ip-orphaned');
  });
});

describe('findHierarchyMismatches', () => {
  it('does not flag a correctly nested child', () => {
    const parent = net({ id: 'p', cidr: '10.0.0.0/16' });
    const child = net({ id: 'c', cidr: '10.0.1.0/24', parentId: 'p' });
    expect(findHierarchyMismatches([parent, child])).toEqual([]);
  });

  it('flags a child whose range is not actually inside its declared parent', () => {
    const parent = net({ id: 'p', cidr: '10.0.0.0/24' });
    const child = net({ id: 'c', cidr: '192.168.1.0/28', parentId: 'p' });
    const issues = findHierarchyMismatches([parent, child]);
    expect(issues).toHaveLength(1);
    expect(issues[0].category).toBe('hierarchy-mismatch');
  });

  it('flags a child that is not more specific than its parent', () => {
    const parent = net({ id: 'p', cidr: '10.0.0.0/16' });
    const child = net({ id: 'c', cidr: '10.0.0.0/8', parentId: 'p' });
    const issues = findHierarchyMismatches([parent, child]);
    expect(issues).toHaveLength(1);
  });

  it('flags a network whose parent no longer exists', () => {
    const child = net({ id: 'c', cidr: '10.0.1.0/24', parentId: 'gone' });
    const issues = findHierarchyMismatches([child]);
    expect(issues).toHaveLength(1);
    expect(issues[0].id).toBe('hierarchy-missing-parent-c');
  });

  it('ignores top-level networks', () => {
    const top = net({ id: 't', cidr: '10.0.0.0/8' });
    expect(findHierarchyMismatches([top])).toEqual([]);
  });
});

describe('findParentCycles', () => {
  it('does not flag a normal chain', () => {
    const a = net({ id: 'a', cidr: '10.0.0.0/8' });
    const b = net({ id: 'b', cidr: '10.0.0.0/16', parentId: 'a' });
    const c = net({ id: 'c', cidr: '10.0.1.0/24', parentId: 'b' });
    expect(findParentCycles([a, b, c])).toEqual([]);
  });

  it('flags a two-node cycle', () => {
    const a = net({ id: 'a', cidr: '10.0.0.0/16', parentId: 'b' });
    const b = net({ id: 'b', cidr: '10.0.0.0/17', parentId: 'a' });
    const issues = findParentCycles([a, b]);
    expect(issues).toHaveLength(2);
    expect(issues.every((i) => i.category === 'parent-cycle')).toBe(true);
  });
});

describe('findNetworkOverlaps', () => {
  it('does not flag a parent and its own child', () => {
    const parent = net({ id: 'p', cidr: '10.0.0.0/16' });
    const child = net({ id: 'c', cidr: '10.0.1.0/24', parentId: 'p' });
    const result = findNetworkOverlaps([parent, child]);
    expect(result.skipped).toBe(false);
    expect(result.issues).toEqual([]);
  });

  it('flags two unrelated networks whose ranges overlap', () => {
    const a = net({ id: 'a', cidr: '10.0.0.0/16' });
    const b = net({ id: 'b', cidr: '10.0.128.0/17' });
    const result = findNetworkOverlaps([a, b]);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].category).toBe('network-overlap');
  });

  it('does not flag disjoint networks', () => {
    const a = net({ id: 'a', cidr: '10.0.0.0/24' });
    const b = net({ id: 'b', cidr: '10.0.1.0/24' });
    expect(findNetworkOverlaps([a, b]).issues).toEqual([]);
  });

  it('excludes the ancestor/descendant pair while still flagging a real overlap elsewhere', () => {
    // parent -> child (legitimate containment, never flagged), plus an
    // unrelated "outsider" network whose range overlaps the parent but is
    // genuinely disjoint from the child's narrower slice of it.
    const parent = net({ id: 'p', cidr: '10.0.0.0/16' });
    const child = net({ id: 'c', cidr: '10.0.1.0/24', parentId: 'p' });
    const outsider = net({ id: 'o', cidr: '10.0.2.0/24' });
    const result = findNetworkOverlaps([parent, child, outsider]);

    expect(result.issues.map((i) => i.id)).toEqual(['network-overlap-p-o']);
  });

  it('skips the scan and reports skipped when there are too many networks', () => {
    const many: NetworkRow[] = [];
    for (let i = 0; i < MAX_NETWORKS_FOR_OVERLAP_CHECK + 1; i++) {
      many.push(net({ id: `n${i}`, cidr: `10.${i % 255}.0.0/24` }));
    }
    const result = findNetworkOverlaps(many);
    expect(result.skipped).toBe(true);
    expect(result.issues).toEqual([]);
  });
});

describe('findDuplicateVlans', () => {
  it('flags two top-level networks sharing a VLAN id', () => {
    const a = net({ id: 'a', cidr: '10.0.0.0/24', vlanId: 100 });
    const b = net({ id: 'b', cidr: '10.0.1.0/24', vlanId: 100 });
    const issues = findDuplicateVlans([a, b]);
    expect(issues).toHaveLength(2);
    expect(issues.every((i) => i.category === 'vlan-duplicate')).toBe(true);
  });

  it('does not flag the same VLAN id used under different parents', () => {
    const parentA = net({ id: 'pa', cidr: '10.0.0.0/16' });
    const parentB = net({ id: 'pb', cidr: '10.1.0.0/16' });
    const a = net({
      id: 'a',
      cidr: '10.0.0.0/24',
      vlanId: 100,
      parentId: 'pa',
    });
    const b = net({
      id: 'b',
      cidr: '10.1.0.0/24',
      vlanId: 100,
      parentId: 'pb',
    });
    expect(findDuplicateVlans([parentA, parentB, a, b])).toEqual([]);
  });

  it('ignores networks with no VLAN set', () => {
    const a = net({ id: 'a', cidr: '10.0.0.0/24', vlanId: null });
    const b = net({ id: 'b', cidr: '10.0.1.0/24', vlanId: null });
    expect(findDuplicateVlans([a, b])).toEqual([]);
  });

  it('does not flag a single network with a unique VLAN', () => {
    const a = net({ id: 'a', cidr: '10.0.0.0/24', vlanId: 100 });
    expect(findDuplicateVlans([a])).toEqual([]);
  });
});

describe('findIpStatusMismatches', () => {
  it('flags an Assigned IP with no assignment date', () => {
    const issues = findIpStatusMismatches([
      ip({
        id: 'i1',
        address: '10.0.0.1',
        networkId: 'n1',
        status: 'ASSIGNED',
        assignedAt: null,
      }),
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0].id).toBe('ip-status-missing-assigned-at-i1');
  });

  it('flags a non-Assigned IP that still has an assignment date', () => {
    const issues = findIpStatusMismatches([
      ip({
        id: 'i1',
        address: '10.0.0.1',
        networkId: 'n1',
        status: 'AVAILABLE',
        assignedAt: new Date('2026-01-01'),
      }),
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0].id).toBe('ip-status-stale-assigned-at-i1');
  });

  it('does not flag a consistent Assigned IP', () => {
    const issues = findIpStatusMismatches([
      ip({
        id: 'i1',
        address: '10.0.0.1',
        networkId: 'n1',
        status: 'ASSIGNED',
        assignedAt: new Date('2026-01-01'),
      }),
    ]);
    expect(issues).toEqual([]);
  });

  it('does not flag a consistent non-Assigned IP', () => {
    const issues = findIpStatusMismatches([
      ip({
        id: 'i1',
        address: '10.0.0.1',
        networkId: 'n1',
        status: 'AVAILABLE',
        assignedAt: null,
      }),
    ]);
    expect(issues).toEqual([]);
  });
});
