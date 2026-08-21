'use server';

import { prisma } from '@/lib/prisma';
import { getCurrentUser, isAdmin } from '@/lib/auth';

export type GlobalSearchItem = {
  type: 'network' | 'ipAddress' | 'location' | 'user';
  id: string;
  title: string;
  subtitle?: string;
  href: string;
};

const RESULTS_PER_TYPE = 5;
const MIN_QUERY_LENGTH = 2;

// Searches across every resource an authenticated user can see. User
// results are only included for Admins, since the Users page itself is
// admin-gated (app/(app)/users/page.tsx redirects everyone else) — search
// shouldn't be a side door around that.
export async function globalSearch(query: string): Promise<GlobalSearchItem[]> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return [];

  const q = query.trim();
  if (q.length < MIN_QUERY_LENGTH) return [];

  const [networks, ipAddresses, locations, users] = await Promise.all([
    prisma.network.findMany({
      where: {
        OR: [
          { cidr: { contains: q, mode: 'insensitive' } },
          { name: { contains: q, mode: 'insensitive' } },
        ],
      },
      include: { location: { select: { name: true } } },
      take: RESULTS_PER_TYPE,
      orderBy: { cidr: 'asc' },
    }),
    prisma.ipAddress.findMany({
      where: {
        OR: [
          { address: { contains: q, mode: 'insensitive' } },
          { hostname: { contains: q, mode: 'insensitive' } },
          { macAddress: { contains: q, mode: 'insensitive' } },
        ],
      },
      include: { network: { select: { cidr: true } } },
      take: RESULTS_PER_TYPE,
      orderBy: { address: 'asc' },
    }),
    prisma.location.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { code: { contains: q, mode: 'insensitive' } },
          { city: { contains: q, mode: 'insensitive' } },
          { country: { contains: q, mode: 'insensitive' } },
        ],
      },
      take: RESULTS_PER_TYPE,
      orderBy: { name: 'asc' },
    }),
    isAdmin(currentUser.role)
      ? prisma.user.findMany({
          where: { email: { contains: q, mode: 'insensitive' } },
          include: { role: true },
          take: RESULTS_PER_TYPE,
          orderBy: { email: 'asc' },
        })
      : Promise.resolve([]),
  ]);

  const items: GlobalSearchItem[] = [];

  for (const n of networks) {
    items.push({
      type: 'network',
      id: n.id,
      title: `${n.cidr} — ${n.name}`,
      subtitle: n.location?.name ? `Location: ${n.location.name}` : undefined,
      href: `/networks?q=${encodeURIComponent(n.cidr)}`,
    });
  }

  for (const ip of ipAddresses) {
    items.push({
      type: 'ipAddress',
      id: ip.id,
      title: ip.address,
      subtitle: ip.hostname
        ? `${ip.hostname} · ${ip.network.cidr}`
        : ip.network.cidr,
      href: `/ip-addresses?q=${encodeURIComponent(ip.address)}`,
    });
  }

  for (const loc of locations) {
    items.push({
      type: 'location',
      id: loc.id,
      title: `${loc.name} (${loc.code})`,
      subtitle: [loc.city, loc.country].filter(Boolean).join(', ') || undefined,
      href: `/locations?q=${encodeURIComponent(loc.code)}`,
    });
  }

  for (const u of users) {
    items.push({
      type: 'user',
      id: u.id,
      title: u.email,
      subtitle: u.role?.name ?? 'No role assigned',
      href: '/users',
    });
  }

  return items;
}
