'use server';

import { prisma } from '@/lib/prisma';
import { getNetworkCapacity } from '@/lib/cidr-utils';

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

export type DashboardAlert = {
  id: string;
  severity: 'warning' | 'critical';
  message: string;
  href: string;
};

const CAPACITY_WARNING_THRESHOLD = 0.9;

// Computed, not stored — recalculated from current data every time the
// dashboard loads rather than persisted as notification rows. Covers three
// things worth a heads-up: leaf networks running low on free addresses,
// locations nobody has attached a network to yet, and networks with no
// location on file.
export async function getDashboardAlerts(): Promise<DashboardAlert[]> {
  const [leafNetworks, locations, networksWithoutLocation] = await Promise.all([
    prisma.network.findMany({
      where: { children: { none: {} } },
      select: {
        id: true,
        cidr: true,
        name: true,
        _count: { select: { ipAddresses: true } },
      },
    }),
    prisma.location.findMany({
      select: {
        id: true,
        name: true,
        code: true,
        _count: { select: { networks: true } },
      },
    }),
    prisma.network.count({ where: { locationId: null } }),
  ]);

  const alerts: DashboardAlert[] = [];

  for (const n of leafNetworks) {
    const capacity = getNetworkCapacity(n.cidr);
    if (capacity === null || capacity <= 0) continue;

    const used = n._count.ipAddresses;
    const percent = used / capacity;
    if (percent < CAPACITY_WARNING_THRESHOLD) continue;

    alerts.push({
      id: `network-capacity-${n.id}`,
      severity: percent >= 1 ? 'critical' : 'warning',
      message:
        percent >= 1
          ? `${n.cidr} (${n.name}) is fully allocated — ${used}/${capacity} addresses used`
          : `${n.cidr} (${n.name}) is at ${Math.round(percent * 100)}% capacity — ${used}/${capacity} addresses used`,
      href: `/networks?q=${encodeURIComponent(n.cidr)}`,
    });
  }

  for (const l of locations) {
    if (l._count.networks > 0) continue;
    alerts.push({
      id: `location-empty-${l.id}`,
      severity: 'warning',
      message: `Location "${l.name}" (${l.code}) has no networks assigned`,
      href: `/locations?q=${encodeURIComponent(l.code)}`,
    });
  }

  if (networksWithoutLocation > 0) {
    alerts.push({
      id: 'networks-without-location',
      severity: 'warning',
      message: `${networksWithoutLocation} network${networksWithoutLocation === 1 ? '' : 's'} — no location assigned`,
      href: '/networks',
    });
  }

  alerts.sort((a, b) => {
    if (a.severity === b.severity) return 0;
    return a.severity === 'critical' ? -1 : 1;
  });

  return alerts;
}
