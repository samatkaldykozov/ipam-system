'use server';

import { prisma } from '@/lib/prisma';
import { getNetworkCapacity } from '@/lib/cidr-utils';
import { buildGrowthSeries } from '@/lib/dashboard-chart-utils';

export type DashboardAlert = {
  id: string;
  severity: 'warning' | 'critical';
  message: string;
  href: string;
};

export type LocationBreakdownRow = {
  id: string | null; // null = networks with no location assigned
  name: string;
  code: string | null;
  networkCount: number;
  ipCount: number;
};

const CAPACITY_WARNING_THRESHOLD = 0.9;

// How many trailing months the growth charts cover.
const GROWTH_WINDOW_MONTHS = 12;

// Everything the Dashboard needs, fetched in exactly ONE Promise.all of
// FOUR queries — deliberately consolidated into the fewest possible round
// trips.
//
// Why this matters here specifically: lib/prisma.ts pins `connection_limit=1`
// on the pooled connection string (required for Supabase's PgBouncer in
// transaction mode — see the comment there), which means every query from
// this app serializes through a single physical connection with only a 10s
// pool-acquire timeout. This function used to be three separate
// getDashboardData/getDashboardAlerts/getDashboardCharts calls totaling 11
// queries; under real production latency that blew past the 10s budget and
// crashed the page with a `P2024` connection-pool-timeout error. Rather than
// letting Prisma do a handful of small groupBy/count queries, this fetches
// the full network and IP address rows ONCE each (still cheap — just a few
// scalar columns per row) and derives every count, breakdown, alert, and
// growth series from those two in-memory arrays.
export async function getDashboardData() {
  const [networks, ipAddresses, locations, recentActivity] = await Promise.all([
    prisma.network.findMany({
      select: {
        id: true,
        cidr: true,
        name: true,
        status: true,
        locationId: true,
        createdAt: true,
        _count: { select: { children: true, ipAddresses: true } },
      },
    }),
    prisma.ipAddress.findMany({
      select: { status: true, createdAt: true },
    }),
    prisma.location.findMany({
      select: {
        id: true,
        name: true,
        code: true,
        _count: { select: { networks: true } },
      },
    }),
    prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 8,
      include: { user: { select: { email: true } } },
    }),
  ]);

  // ─── IP address counts, status breakdown, growth ───
  const statusMap: Record<
    'AVAILABLE' | 'ASSIGNED' | 'RESERVED' | 'BLOCKED',
    number
  > = { AVAILABLE: 0, ASSIGNED: 0, RESERVED: 0, BLOCKED: 0 };
  const ipCreatedAt: Date[] = [];
  for (const ip of ipAddresses) {
    statusMap[ip.status]++;
    ipCreatedAt.push(ip.createdAt);
  }

  // ─── Network counts, status breakdown, growth ───
  const networkStatusMap: Record<'ACTIVE' | 'RESERVED' | 'ARCHIVED', number> = {
    ACTIVE: 0,
    RESERVED: 0,
    ARCHIVED: 0,
  };
  const networkCreatedAt: Date[] = [];
  for (const n of networks) {
    networkStatusMap[n.status]++;
    networkCreatedAt.push(n.createdAt);
  }

  // ─── Alerts: computed, not stored — recalculated from the same data on
  // every load rather than persisted as notification rows. Covers three
  // things worth a heads-up: leaf networks running low on free addresses,
  // locations nobody has attached a network to yet, and networks with no
  // location on file. ───
  const alerts: DashboardAlert[] = [];

  for (const n of networks) {
    if (n._count.children > 0) continue; // only leaf networks have a meaningful "capacity"

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

  const networksWithoutLocation = networks.filter(
    (n: { locationId: string | null }) => n.locationId === null,
  ).length;
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

  // ─── Networks/IPs by location — derived entirely from the `networks`
  // and `locations` arrays already fetched above, so this adds zero extra
  // database round trips (see this function's doc comment on why that
  // matters — the connection_limit=1 incident from 21 August). Networks
  // with no location go into a synthetic trailing "no location" row
  // (id: null) rather than being silently dropped — that's the same gap
  // the "networks-without-location" alert above already surfaces. ───
  const byLocationId = new Map<
    string,
    { networkCount: number; ipCount: number }
  >();
  let noLocationNetworkCount = 0;
  let noLocationIpCount = 0;
  for (const n of networks) {
    if (n.locationId === null) {
      noLocationNetworkCount += 1;
      noLocationIpCount += n._count.ipAddresses;
      continue;
    }
    const entry = byLocationId.get(n.locationId) ?? {
      networkCount: 0,
      ipCount: 0,
    };
    entry.networkCount += 1;
    entry.ipCount += n._count.ipAddresses;
    byLocationId.set(n.locationId, entry);
  }

  const locationBreakdown: LocationBreakdownRow[] = locations
    .map((l) => {
      const entry = byLocationId.get(l.id) ?? { networkCount: 0, ipCount: 0 };
      return {
        id: l.id,
        name: l.name,
        code: l.code,
        networkCount: entry.networkCount,
        ipCount: entry.ipCount,
      };
    })
    .sort(
      (a, b) =>
        b.ipCount - a.ipCount ||
        b.networkCount - a.networkCount ||
        a.name.localeCompare(b.name),
    );

  if (noLocationNetworkCount > 0) {
    locationBreakdown.push({
      id: null,
      name: 'No location',
      code: null,
      networkCount: noLocationNetworkCount,
      ipCount: noLocationIpCount,
    });
  }

  return {
    totalNetworks: networks.length,
    totalIps: ipAddresses.length,
    statusMap,
    recentActivity,
    alerts,
    locationBreakdown,
    networksByStatus: [
      { label: 'Active', value: networkStatusMap.ACTIVE },
      { label: 'Reserved', value: networkStatusMap.RESERVED },
      { label: 'Archived', value: networkStatusMap.ARCHIVED },
    ],
    ipsByStatus: [
      { label: 'Assigned', value: statusMap.ASSIGNED },
      { label: 'Available', value: statusMap.AVAILABLE },
      { label: 'Reserved', value: statusMap.RESERVED },
      { label: 'Blocked', value: statusMap.BLOCKED },
    ],
    networkGrowth: buildGrowthSeries(networkCreatedAt, GROWTH_WINDOW_MONTHS),
    ipGrowth: buildGrowthSeries(ipCreatedAt, GROWTH_WINDOW_MONTHS),
  };
}
