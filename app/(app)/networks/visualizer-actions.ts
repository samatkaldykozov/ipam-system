'use server';

import { IpStatus, NetworkStatus } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { getNetworkCapacity, getUsableAddresses } from '@/lib/cidr-utils';

const MAX_VISUALIZED_ADDRESSES = 1024;

export type SubnetChildBlock = {
  id: string;
  cidr: string;
  name: string;
  status: NetworkStatus;
  childCount: number;
  ipAddressCount: number;
  capacity: number | null;
};

export type SubnetAddressCell = {
  address: string;
  status: IpStatus | 'UNASSIGNED';
  hostname: string | null;
  ipAddressId: string | null;
};

export type SubnetVisualization =
  | { kind: 'not-found' }
  | {
      kind: 'subnetted';
      id: string;
      cidr: string;
      name: string;
      children: SubnetChildBlock[];
    }
  | {
      kind: 'too-large';
      id: string;
      cidr: string;
      name: string;
      capacity: number | null;
      ipAddressCount: number;
    }
  | {
      kind: 'addresses';
      id: string;
      cidr: string;
      name: string;
      capacity: number;
      cells: SubnetAddressCell[];
    };

// Powers the subnet visualizer dialog. A network that has been subnetted
// further shows its direct children as blocks (drill into one to visualize
// it in turn); a leaf network shows its individual usable addresses as a
// grid, capped at MAX_VISUALIZED_ADDRESSES to keep the page from trying to
// render tens of thousands of cells for something like a /16.
export async function getNetworkVisualization(
  networkId: string,
): Promise<SubnetVisualization> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { kind: 'not-found' };

  const network = await prisma.network.findUnique({
    where: { id: networkId },
    include: { _count: { select: { children: true, ipAddresses: true } } },
  });
  if (!network) return { kind: 'not-found' };

  if (network._count.children > 0) {
    const children = await prisma.network.findMany({
      where: { parentId: networkId },
      include: { _count: { select: { children: true, ipAddresses: true } } },
      orderBy: { cidr: 'asc' },
    });

    const blocks: SubnetChildBlock[] = [];
    for (const c of children) {
      blocks.push({
        id: c.id,
        cidr: c.cidr,
        name: c.name,
        status: c.status,
        childCount: c._count.children,
        ipAddressCount: c._count.ipAddresses,
        capacity: getNetworkCapacity(c.cidr),
      });
    }

    return {
      kind: 'subnetted',
      id: network.id,
      cidr: network.cidr,
      name: network.name,
      children: blocks,
    };
  }

  const capacity = getNetworkCapacity(network.cidr);
  if (capacity === null) return { kind: 'not-found' };

  if (capacity > MAX_VISUALIZED_ADDRESSES) {
    return {
      kind: 'too-large',
      id: network.id,
      cidr: network.cidr,
      name: network.name,
      capacity,
      ipAddressCount: network._count.ipAddresses,
    };
  }

  const addresses = getUsableAddresses(network.cidr) ?? [];
  const ipRows = await prisma.ipAddress.findMany({
    where: { networkId },
    select: { id: true, address: true, status: true, hostname: true },
  });

  const byAddress = new Map<
    string,
    { id: string; status: IpStatus; hostname: string | null }
  >();
  for (const row of ipRows) {
    byAddress.set(row.address, {
      id: row.id,
      status: row.status,
      hostname: row.hostname,
    });
  }

  const cells: SubnetAddressCell[] = [];
  for (const address of addresses) {
    const row = byAddress.get(address);
    cells.push({
      address,
      status: row?.status ?? 'UNASSIGNED',
      hostname: row?.hostname ?? null,
      ipAddressId: row?.id ?? null,
    });
  }

  return {
    kind: 'addresses',
    id: network.id,
    cidr: network.cidr,
    name: network.name,
    capacity,
    cells,
  };
}
