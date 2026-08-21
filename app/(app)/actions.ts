'use server';

import { prisma } from '@/lib/prisma';

// Everything the dashboard needs in one round trip: headline counts, the
// IP status breakdown, and the most recent audit log entries across the
// whole app (networks, IPs, users, auth events).
export async function getDashboardData() {
  const [totalNetworks, totalIps, statusCounts, recentActivity] =
    await Promise.all([
      prisma.network.count(),
      prisma.ipAddress.count(),
      prisma.ipAddress.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      prisma.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 8,
        include: { user: { select: { email: true } } },
      }),
    ]);

  const statusMap: Record<
    'AVAILABLE' | 'ASSIGNED' | 'RESERVED' | 'BLOCKED',
    number
  > = {
    AVAILABLE: 0,
    ASSIGNED: 0,
    RESERVED: 0,
    BLOCKED: 0,
  };
  for (const row of statusCounts) {
    statusMap[row.status] = row._count._all;
  }

  return { totalNetworks, totalIps, statusMap, recentActivity };
}
