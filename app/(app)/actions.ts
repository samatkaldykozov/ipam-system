'use server';

import { prisma } from '@/lib/prisma';
import { getNetworkCapacity } from '@/lib/cidr-utils';
import {
  buildGrowthSeries,
  type GrowthPoint,
} from '@/lib/dashboard-chart-utils';

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

export type DashboardCharts = {
  networksByStatus: { label: string; value: number }[];
  ipsByStatus: { label: string; value: number }[];
  networkGrowth: GrowthPoint[];
  ipGrowth: GrowthPoint[];
};

// How many trailing months the growth charts cover.
const GROWTH_WINDOW_MONTHS = 12;

// Status breakdowns (for the donut charts) and monthly cumulative growth
// (for the line charts) — split out from getDashboardData() above since it
// runs two extra findMany() queries (createdAt-only, so cheap) that the
// rest of the dashboard doesn't need.
export async function getDashboardCharts(): Promise<DashboardCharts> {
  const [networkStatusCounts, ipStatusCounts, networkDates, ipDates] =
    await Promise.all([
      prisma.network.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.ipAddress.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.network.findMany({ select: { createdAt: true } }),
      prisma.ipAddress.findMany({ select: { createdAt: true } }),
    ]);

  const networkStatusMap: Record<'ACTIVE' | 'RESERVED' | 'ARCHIVED', number> = {
    ACTIVE: 0,
    RESERVED: 0,
    ARCHIVED: 0,
  };
  for (const row of networkStatusCounts) {
    networkStatusMap[row.status] = row._count._all;
  }

  const ipStatusMap: Record<
    'AVAILABLE' | 'ASSIGNED' | 'RESERVED' | 'BLOCKED',
    number
  > = { AVAILABLE: 0, ASSIGNED: 0, RESERVED: 0, BLOCKED: 0 };
  for (const row of ipStatusCounts) {
    ipStatusMap[row.status] = row._count._all;
  }

  // Explicit loops rather than `.map()` straight into `new Map()`/arrays —
  // this sandbox's broken (network-less) `prisma generate` output has
  // previously made TypeScript infer `{}` for `.map()` callback results in
  // similar spots, even with explicit annotations. Plain loops sidestep it.
  const networkCreatedAt: Date[] = [];
  for (const row of networkDates) networkCreatedAt.push(row.createdAt);
  const ipCreatedAt: Date[] = [];
  for (const row of ipDates) ipCreatedAt.push(row.createdAt);

  return {
    networksByStatus: [
      { label: 'Active', value: networkStatusMap.ACTIVE },
      { label: 'Reserved', value: networkStatusMap.RESERVED },
      { label: 'Archived', value: networkStatusMap.ARCHIVED },
    ],
    ipsByStatus: [
      { label: 'Assigned', value: ipStatusMap.ASSIGNED },
      { label: 'Available', value: ipStatusMap.AVAILABLE },
      { label: 'Reserved', value: ipStatusMap.RESERVED },
      { label: 'Blocked', value: ipStatusMap.BLOCKED },
    ],
    networkGrowth: buildGrowthSeries(networkCreatedAt, GROWTH_WINDOW_MONTHS),
    ipGrowth: buildGrowthSeries(ipCreatedAt, GROWTH_WINDOW_MONTHS),
  };
}
