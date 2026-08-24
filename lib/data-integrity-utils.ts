import { cidrsOverlap, containsCidr, getPrefixLength } from '@/lib/cidr-utils';

// Pure data-integrity checks over already-fetched rows — kept dependency-free
// from Prisma so they're easy to unit test. The server action that calls
// these (app/(app)/data-integrity/actions.ts) does exactly two queries and
// hands the results here; this file does all the actual analysis in memory.

export type IntegritySeverity = 'critical' | 'warning';

export type IntegrityIssue = {
  id: string;
  category: string;
  severity: IntegritySeverity;
  message: string;
  href: string;
};

export type NetworkRow = {
  id: string;
  cidr: string;
  name: string;
  vlanId: number | null;
  parentId: string | null;
};

export type IpAddressRow = {
  id: string;
  address: string;
  networkId: string;
  status: 'AVAILABLE' | 'ASSIGNED' | 'RESERVED' | 'BLOCKED';
  assignedAt: Date | null;
};

export const CATEGORY_LABELS: Record<string, string> = {
  'ip-out-of-range': 'IP address outside its network’s range',
  'ip-orphaned': 'IP address references a missing network',
  'hierarchy-mismatch': 'Network not actually inside its declared parent',
  'parent-cycle': 'Circular parent chain',
  'network-overlap': 'Overlapping networks (not parent/child)',
  'vlan-duplicate': 'Duplicate VLAN ID at the same hierarchy level',
  'ip-status-mismatch': 'IP status / assignment date mismatch',
};

// A few thousand networks is already a lot for a hand-run internal IPAM
// tool to pairwise-compare on every page load; beyond this cap
// findNetworkOverlaps skips the scan and says so (`skipped: true`) rather
// than silently only covering part of the data.
export const MAX_NETWORKS_FOR_OVERLAP_CHECK = 3000;

function buildNetworkMap(networks: NetworkRow[]): Map<string, NetworkRow> {
  const byId = new Map<string, NetworkRow>();
  for (const n of networks) byId.set(n.id, n);
  return byId;
}

// Walks a network's parentId chain, collecting every ancestor id. Stops and
// reports a cycle if the walk revisits a node already seen on this same
// walk (including the starting node itself) — mirrors the ancestor-guard
// pattern already used in networks/types.ts's flattenNetworkTree.
function walkAncestors(
  startId: string,
  networksById: Map<string, NetworkRow>,
): { ancestors: Set<string>; hasCycle: boolean } {
  const ancestors = new Set<string>();
  const guard = new Set<string>([startId]);
  let currentId = networksById.get(startId)?.parentId ?? null;

  while (currentId) {
    if (guard.has(currentId)) {
      return { ancestors, hasCycle: true };
    }
    guard.add(currentId);
    ancestors.add(currentId);
    currentId = networksById.get(currentId)?.parentId ?? null;
  }

  return { ancestors, hasCycle: false };
}

// IP addresses whose address falls outside their assigned network's CIDR
// range, or that reference a network id that no longer exists. Validation
// on create/update/CSV-import already prevents new rows like this — this
// catches ones that predate that validation, or came from a direct DB edit.
export function findIpsOutOfRange(
  ipAddresses: IpAddressRow[],
  networksById: Map<string, NetworkRow>,
): IntegrityIssue[] {
  const issues: IntegrityIssue[] = [];

  for (const ip of ipAddresses) {
    const network = networksById.get(ip.networkId);
    if (!network) {
      issues.push({
        id: `ip-orphaned-${ip.id}`,
        category: 'ip-orphaned',
        severity: 'critical',
        message: `${ip.address} references a network that no longer exists`,
        href: `/ip-addresses?q=${encodeURIComponent(ip.address)}`,
      });
      continue;
    }

    if (!containsCidr(network.cidr, `${ip.address}/32`)) {
      issues.push({
        id: `ip-out-of-range-${ip.id}`,
        category: 'ip-out-of-range',
        severity: 'critical',
        message: `${ip.address} is assigned to ${network.cidr} (${network.name}) but falls outside that network's range`,
        href: `/ip-addresses?q=${encodeURIComponent(ip.address)}`,
      });
    }
  }

  return issues;
}

// Networks whose declared parent either doesn't exist, isn't more specific
// than the child, or doesn't actually contain the child's range.
export function findHierarchyMismatches(
  networks: NetworkRow[],
): IntegrityIssue[] {
  const networksById = buildNetworkMap(networks);
  const issues: IntegrityIssue[] = [];

  for (const n of networks) {
    if (!n.parentId) continue;

    const parent = networksById.get(n.parentId);
    if (!parent) {
      issues.push({
        id: `hierarchy-missing-parent-${n.id}`,
        category: 'hierarchy-mismatch',
        severity: 'critical',
        message: `${n.cidr} (${n.name}) references a parent network that no longer exists`,
        href: `/networks?q=${encodeURIComponent(n.cidr)}`,
      });
      continue;
    }

    const childPrefix = getPrefixLength(n.cidr);
    const parentPrefix = getPrefixLength(parent.cidr);
    if (childPrefix === null || parentPrefix === null) continue; // malformed CIDR isn't this check's job

    if (childPrefix <= parentPrefix || !containsCidr(parent.cidr, n.cidr)) {
      issues.push({
        id: `hierarchy-mismatch-${n.id}`,
        category: 'hierarchy-mismatch',
        severity: 'critical',
        message: `${n.cidr} (${n.name}) is set as a child of ${parent.cidr} (${parent.name}), but isn't actually contained inside it`,
        href: `/networks?q=${encodeURIComponent(n.cidr)}`,
      });
    }
  }

  return issues;
}

// Networks whose parentId chain loops back on itself. Shouldn't be
// reachable through the UI (updateNetwork rejects a network being its own
// parent, and the parent picker excludes a node's own descendants), but a
// multi-step CSV import or a direct DB edit could still produce one.
export function findParentCycles(networks: NetworkRow[]): IntegrityIssue[] {
  const networksById = buildNetworkMap(networks);
  const issues: IntegrityIssue[] = [];

  for (const n of networks) {
    const { hasCycle } = walkAncestors(n.id, networksById);
    if (hasCycle) {
      issues.push({
        id: `parent-cycle-${n.id}`,
        category: 'parent-cycle',
        severity: 'critical',
        message: `${n.cidr} (${n.name}) is part of a circular parent chain`,
        href: `/networks?q=${encodeURIComponent(n.cidr)}`,
      });
    }
  }

  return issues;
}

// Any two networks whose CIDR ranges overlap without one being an ancestor
// of the other. A parent legitimately "overlaps" its own children's address
// space — that's the whole point of nesting — so those pairs are excluded.
// What's left is either a genuine address-space collision or a network that
// should probably be nested under the other but isn't.
//
// checkSiblingOverlap (networks/actions.ts) already blocks this for two
// networks sharing the exact same parentId at create/update time; this
// catches everything else, including pairs under different parents and
// anything that predates that check.
export function findNetworkOverlaps(networks: NetworkRow[]): {
  issues: IntegrityIssue[];
  skipped: boolean;
} {
  if (networks.length > MAX_NETWORKS_FOR_OVERLAP_CHECK) {
    return { issues: [], skipped: true };
  }

  const networksById = buildNetworkMap(networks);
  const ancestorsById = new Map<string, Set<string>>();
  for (const n of networks) {
    ancestorsById.set(n.id, walkAncestors(n.id, networksById).ancestors);
  }

  const issues: IntegrityIssue[] = [];
  for (let i = 0; i < networks.length; i++) {
    for (let j = i + 1; j < networks.length; j++) {
      const a = networks[i];
      const b = networks[j];

      const aAncestors = ancestorsById.get(a.id);
      const bAncestors = ancestorsById.get(b.id);
      if (aAncestors?.has(b.id) || bAncestors?.has(a.id)) continue;

      if (cidrsOverlap(a.cidr, b.cidr)) {
        issues.push({
          id: `network-overlap-${a.id}-${b.id}`,
          category: 'network-overlap',
          severity: 'warning',
          message: `${a.cidr} (${a.name}) and ${b.cidr} (${b.name}) overlap but aren't related as parent/child`,
          href: `/networks?q=${encodeURIComponent(a.cidr)}`,
        });
      }
    }
  }

  return { issues, skipped: false };
}

// Networks sharing the same VLAN id at the same hierarchy level (same
// parent, including two top-level networks both under "no parent"). Not
// currently checked anywhere at create/update/import time.
export function findDuplicateVlans(networks: NetworkRow[]): IntegrityIssue[] {
  const groups = new Map<string, NetworkRow[]>();
  for (const n of networks) {
    if (n.vlanId === null) continue;
    const key = `${n.parentId ?? 'root'}:${n.vlanId}`;
    const existing = groups.get(key);
    if (existing) {
      existing.push(n);
    } else {
      groups.set(key, [n]);
    }
  }

  const issues: IntegrityIssue[] = [];
  for (const group of Array.from(groups.values())) {
    if (group.length < 2) continue;

    const cidrList: string[] = [];
    for (const n of group) cidrList.push(n.cidr);
    const cidrs = cidrList.join(', ');

    for (const n of group) {
      issues.push({
        id: `vlan-duplicate-${n.id}`,
        category: 'vlan-duplicate',
        severity: 'warning',
        message: `VLAN ${n.vlanId} is used by more than one network at the same hierarchy level: ${cidrs}`,
        href: `/networks?q=${encodeURIComponent(n.cidr)}`,
      });
    }
  }

  return issues;
}

// An IP marked Assigned with no assignment date, or a non-Assigned IP that
// still has one — both mean the two fields drifted out of sync, most likely
// from a direct DB edit or a data migration that touched one field but not
// the other.
export function findIpStatusMismatches(
  ipAddresses: IpAddressRow[],
): IntegrityIssue[] {
  const issues: IntegrityIssue[] = [];

  for (const ip of ipAddresses) {
    if (ip.status === 'ASSIGNED' && ip.assignedAt === null) {
      issues.push({
        id: `ip-status-missing-assigned-at-${ip.id}`,
        category: 'ip-status-mismatch',
        severity: 'warning',
        message: `${ip.address} is marked Assigned but has no assignment date`,
        href: `/ip-addresses?q=${encodeURIComponent(ip.address)}`,
      });
    } else if (ip.status !== 'ASSIGNED' && ip.assignedAt !== null) {
      issues.push({
        id: `ip-status-stale-assigned-at-${ip.id}`,
        category: 'ip-status-mismatch',
        severity: 'warning',
        message: `${ip.address} has an assignment date but its status is ${ip.status}, not Assigned`,
        href: `/ip-addresses?q=${encodeURIComponent(ip.address)}`,
      });
    }
  }

  return issues;
}
