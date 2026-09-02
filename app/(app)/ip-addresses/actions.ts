'use server';

import { revalidatePath } from 'next/cache';
import { Prisma, IpStatus } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { ipAddressSchema, type IpAddressValues } from '@/lib/validations';
import { getCurrentUser, canEdit } from '@/lib/auth';
import {
  containsCidr,
  findFirstFreeAddress,
  getNetworkCapacity,
} from '@/lib/cidr-utils';

// Blocks larger than this aren't scanned for a free address — walking a
// full /16 (or bigger) on every dialog open isn't worth it, and the user can
// still enter an address manually.
const MAX_SUGGESTION_SCAN_CAPACITY = 65536;

export type ActionResult<T = void> = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
  data?: T;
};

const PERMISSION_DENIED: ActionResult = {
  ok: false,
  message: 'You do not have permission to perform this action.',
};

async function writeAudit(
  action: 'CREATE' | 'UPDATE' | 'DELETE',
  entityId: string,
  userId?: string,
  metadata?: Record<string, unknown>,
) {
  await prisma.auditLog.create({
    data: {
      action,
      entity: 'IPAddress',
      entityId,
      userId: userId ?? null,
      metadata: (metadata ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}

export async function getNetworkOptions() {
  return prisma.network.findMany({
    orderBy: { name: 'asc' },
    select: { id: true, name: true, cidr: true },
  });
}

// Suggests the first free usable address in a network, for the "Use next
// available" affordance in the assign dialog. Read-only — no permission
// gate, same as getNetworkOptions above.
export async function getNextAvailableAddress(
  networkId: string,
): Promise<{ address: string | null; message?: string }> {
  if (!networkId) {
    return { address: null, message: 'Select a network first.' };
  }

  const network = await prisma.network.findUnique({
    where: { id: networkId },
  });
  if (!network) {
    return { address: null, message: 'Selected network does not exist.' };
  }

  const capacity = getNetworkCapacity(network.cidr);
  if (capacity === null) {
    return { address: null, message: 'This network has an invalid CIDR.' };
  }
  if (capacity > MAX_SUGGESTION_SCAN_CAPACITY) {
    return {
      address: null,
      message:
        'This network is too large to auto-suggest an address for — please enter one manually.',
    };
  }

  const existing = await prisma.ipAddress.findMany({
    where: { networkId },
    select: { address: true },
  });
  const usedAddresses = new Set<string>();
  for (const { address } of existing) {
    usedAddresses.add(address);
  }

  const address = findFirstFreeAddress(network.cidr, usedAddresses);
  if (!address) {
    return {
      address: null,
      message: 'No free addresses remain in this network.',
    };
  }

  return { address };
}

export async function getIpAddresses(params: {
  search?: string;
  status?: IpStatus | 'ALL';
  networkId?: string;
  sortBy?: 'address' | 'hostname' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}) {
  const {
    search = '',
    status = 'ALL',
    networkId = 'ALL',
    sortBy = 'createdAt',
    sortOrder = 'desc',
    page = 1,
    pageSize = 10,
  } = params;

  const where: Prisma.IpAddressWhereInput = {};
  if (status !== 'ALL') where.status = status;
  if (networkId !== 'ALL') where.networkId = networkId;
  if (search.trim()) {
    where.OR = [
      { address: { contains: search, mode: 'insensitive' } },
      { hostname: { contains: search, mode: 'insensitive' } },
      { macAddress: { contains: search, mode: 'insensitive' } },
      { network: { cidr: { contains: search, mode: 'insensitive' } } },
      { network: { name: { contains: search, mode: 'insensitive' } } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.ipAddress.findMany({
      where,
      include: {
        network: { select: { id: true, cidr: true, name: true } },
      },
      orderBy: { [sortBy]: sortOrder },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.ipAddress.count({ where }),
  ]);

  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

export async function createIpAddress(
  values: IpAddressValues,
): Promise<ActionResult> {
  const currentUser = await getCurrentUser();
  if (!currentUser || !canEdit(currentUser.role)) {
    return PERMISSION_DENIED;
  }

  const parsed = ipAddressSchema.safeParse(values);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[issue.path[0] as string] = issue.message;
    }
    return { ok: false, fieldErrors };
  }

  const data = parsed.data;

  const existing = await prisma.ipAddress.findUnique({
    where: { address: data.address },
  });
  if (existing) {
    return {
      ok: false,
      fieldErrors: { address: 'This IP address already exists' },
    };
  }

  const network = await prisma.network.findUnique({
    where: { id: data.networkId },
  });
  if (!network) {
    return {
      ok: false,
      fieldErrors: { networkId: 'Selected network does not exist' },
    };
  }

  if (!containsCidr(network.cidr, `${data.address}/32`)) {
    return {
      ok: false,
      fieldErrors: {
        address: `This address is outside the selected network's range (${network.cidr})`,
      },
    };
  }

  try {
    const ipAddress = await prisma.ipAddress.create({
      data: {
        address: data.address,
        hostname: data.hostname || null,
        macAddress: data.macAddress ?? null,
        status: data.status,
        description: data.description || null,
        networkId: data.networkId,
        assignedAt: data.status === 'ASSIGNED' ? new Date() : null,
        branch: data.branch ?? null,
        responsibleParty: data.responsibleParty || null,
        purpose: data.purpose || null,
        deviceType: data.deviceType ?? null,
        basis: data.basis || null,
      },
    });

    await writeAudit('CREATE', ipAddress.id, currentUser.id, {
      address: ipAddress.address,
      networkId: ipAddress.networkId,
      status: ipAddress.status,
    });

    revalidatePath('/ip-addresses');
    return { ok: true, message: 'IP address assigned successfully' };
  } catch {
    return { ok: false, message: 'Failed to assign IP address' };
  }
}

export async function updateIpAddress(
  id: string,
  values: IpAddressValues,
): Promise<ActionResult> {
  const currentUser = await getCurrentUser();
  if (!currentUser || !canEdit(currentUser.role)) {
    return PERMISSION_DENIED;
  }

  const parsed = ipAddressSchema.safeParse(values);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[issue.path[0] as string] = issue.message;
    }
    return { ok: false, fieldErrors };
  }

  const data = parsed.data;

  const existing = await prisma.ipAddress.findUnique({
    where: { address: data.address },
  });
  if (existing && existing.id !== id) {
    return {
      ok: false,
      fieldErrors: { address: 'This IP address already exists' },
    };
  }

  const network = await prisma.network.findUnique({
    where: { id: data.networkId },
  });
  if (!network) {
    return {
      ok: false,
      fieldErrors: { networkId: 'Selected network does not exist' },
    };
  }

  if (!containsCidr(network.cidr, `${data.address}/32`)) {
    return {
      ok: false,
      fieldErrors: {
        address: `This address is outside the selected network's range (${network.cidr})`,
      },
    };
  }

  try {
    const current = await prisma.ipAddress.findUnique({ where: { id } });
    if (!current) {
      return { ok: false, message: 'IP address not found' };
    }

    const becomingAssigned =
      data.status === 'ASSIGNED' && current.status !== 'ASSIGNED';
    const leavingAssigned =
      data.status !== 'ASSIGNED' && current.status === 'ASSIGNED';

    const ipAddress = await prisma.ipAddress.update({
      where: { id },
      data: {
        address: data.address,
        hostname: data.hostname || null,
        macAddress: data.macAddress ?? null,
        status: data.status,
        description: data.description || null,
        networkId: data.networkId,
        assignedAt: becomingAssigned
          ? new Date()
          : leavingAssigned
            ? null
            : current.assignedAt,
        branch: data.branch ?? null,
        responsibleParty: data.responsibleParty || null,
        purpose: data.purpose || null,
        deviceType: data.deviceType ?? null,
        basis: data.basis || null,
      },
    });

    await writeAudit('UPDATE', ipAddress.id, currentUser.id, {
      address: ipAddress.address,
      networkId: ipAddress.networkId,
      status: ipAddress.status,
    });

    revalidatePath('/ip-addresses');
    return { ok: true, message: 'IP address updated successfully' };
  } catch {
    return { ok: false, message: 'Failed to update IP address' };
  }
}

export async function deleteIpAddress(id: string): Promise<ActionResult> {
  const currentUser = await getCurrentUser();
  if (!currentUser || !canEdit(currentUser.role)) {
    return PERMISSION_DENIED;
  }

  try {
    const ipAddress = await prisma.ipAddress.findUnique({ where: { id } });
    if (!ipAddress) {
      return { ok: false, message: 'IP address not found' };
    }

    // An IP_REFERENCE field (or IP_REFERENCE column inside a TABLE field)
    // on a passport is a real foreign key (onDelete: Restrict — see
    // FieldIpAddressValue and TableCellIpAddressValue in schema.prisma),
    // so deleting a referenced address would otherwise fail with a raw
    // Prisma FK error. Check both first and name the passport(s) instead.
    const [links, tableCellLinks] = await Promise.all([
      prisma.fieldIpAddressValue.findMany({
        where: { ipAddressId: id },
        take: 5,
        include: { objectInstance: { select: { name: true } } },
      }),
      prisma.tableCellIpAddressValue.findMany({
        where: { ipAddressId: id },
        take: 5,
        include: {
          tableFieldRow: {
            include: { objectInstance: { select: { name: true } } },
          },
        },
      }),
    ]);
    if (links.length > 0 || tableCellLinks.length > 0) {
      const names = Array.from(
        new Set([
          ...links.map((l) => l.objectInstance.name),
          ...tableCellLinks.map((l) => l.tableFieldRow.objectInstance.name),
        ]),
      );
      return {
        ok: false,
        message: `Этот адрес используется в КЕ: ${names.join(', ')} — сначала удалите ссылку там`,
      };
    }

    await prisma.ipAddress.delete({ where: { id } });
    await writeAudit('DELETE', id, currentUser.id, {
      address: ipAddress.address,
      networkId: ipAddress.networkId,
    });

    revalidatePath('/ip-addresses');
    return { ok: true, message: 'IP address deleted successfully' };
  } catch {
    return { ok: false, message: 'Failed to delete IP address' };
  }
}
