'use server';

import { revalidatePath } from 'next/cache';
import { Prisma, IpStatus } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { ipAddressSchema, type IpAddressValues } from '@/lib/validations';

export type ActionResult<T = void> = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
  data?: T;
};

async function writeAudit(
  action: 'CREATE' | 'UPDATE' | 'DELETE',
  entityId: string,
  metadata?: Record<string, unknown>,
) {
  await prisma.auditLog.create({
    data: {
      action,
      entity: 'IPAddress',
      entityId,
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
      },
    });

    await writeAudit('CREATE', ipAddress.id, {
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
      },
    });

    await writeAudit('UPDATE', ipAddress.id, {
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
  try {
    const ipAddress = await prisma.ipAddress.findUnique({ where: { id } });
    if (!ipAddress) {
      return { ok: false, message: 'IP address not found' };
    }

    await prisma.ipAddress.delete({ where: { id } });
    await writeAudit('DELETE', id, {
      address: ipAddress.address,
      networkId: ipAddress.networkId,
    });

    revalidatePath('/ip-addresses');
    return { ok: true, message: 'IP address deleted successfully' };
  } catch {
    return { ok: false, message: 'Failed to delete IP address' };
  }
}
