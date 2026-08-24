'use server';

import { prisma } from '@/lib/prisma';
import {
  findDuplicateVlans,
  findHierarchyMismatches,
  findIpsOutOfRange,
  findIpStatusMismatches,
  findNetworkOverlaps,
  findParentCycles,
  type IntegrityIssue,
  type NetworkRow,
} from '@/lib/data-integrity-utils';

export type IntegrityReport = {
  issues: IntegrityIssue[];
  networksScanned: number;
  ipAddressesScanned: number;
  overlapCheckSkipped: boolean;
};

// Read-only, no permission gate here — same convention as other list
// getters (e.g. getUsersAndRoles in users/actions.ts). The page itself
// redirects non-admins before this is ever called.
//
// Exactly two queries, both narrow selects — kept deliberately lean given
// lib/prisma.ts's connection_limit=1 (see the comment on getDashboardData()
// in app/(app)/actions.ts for why that matters). All the actual analysis
// happens in memory in lib/data-integrity-utils.ts.
export async function getIntegrityIssues(): Promise<IntegrityReport> {
  const [networks, ipAddresses] = await Promise.all([
    prisma.network.findMany({
      select: {
        id: true,
        cidr: true,
        name: true,
        vlanId: true,
        parentId: true,
      },
    }),
    prisma.ipAddress.findMany({
      select: {
        id: true,
        address: true,
        networkId: true,
        status: true,
        assignedAt: true,
      },
    }),
  ]);

  const networksById = new Map<string, NetworkRow>();
  for (const n of networks) networksById.set(n.id, n);

  const overlapResult = findNetworkOverlaps(networks);

  const issues: IntegrityIssue[] = [
    ...findIpsOutOfRange(ipAddresses, networksById),
    ...findHierarchyMismatches(networks),
    ...findParentCycles(networks),
    ...overlapResult.issues,
    ...findDuplicateVlans(networks),
    ...findIpStatusMismatches(ipAddresses),
  ];

  return {
    issues,
    networksScanned: networks.length,
    ipAddressesScanned: ipAddresses.length,
    overlapCheckSkipped: overlapResult.skipped,
  };
}
