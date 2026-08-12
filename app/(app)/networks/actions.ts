'use server';

import { revalidatePath } from 'next/cache';
import { Prisma, NetworkStatus } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { networkSchema, type NetworkValues } from '@/lib/validations';

export type ActionResult<T = void> = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
  data?: T;
};

async function writeAudit(
  action: 'CREATE' | 'UPDATE' | 'DELETE',
  entityId: string,
  metadata?: Record<string, unknown>
) {
  await prisma.auditLog.create({
    data: {
      action,
      entity: 'Network',
      entityId,
      metadata: (metadata ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}

export async function getNetworks(params: {
  search?: string;
  status?: NetworkStatus | 'ALL';
  sortBy?: 'cidr' | 'name' | 'vlanId' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}) {
  const {
    search = '',
    status = 'ALL',
    sortBy = 'createdAt',
    sortOrder = 'desc',
    page = 1,
    pageSize = 10,
  } = params;

  const where: Prisma.NetworkWhereInput = {};
  if (status !== 'ALL') where.status = status;
  if (search.trim()) {
    where.OR = [
      { cidr: { contains: search, mode: 'insensitive' } },
      { name: { contains: search, mode: 'insensitive' } },
      { vlanId: { equals: Number(search) || undefined } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.network.findMany({
      where,
      include: { location: true, _count: { select: { prefixes: true, ipAddresses: true } } },
      orderBy: { [sortBy]: sortOrder },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.network.count({ where }),
  ]);

  return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

export async function getNetwork(id: string) {
  return prisma.network.findUnique({
    where: { id },
    include: {
      location: true,
      _count: { select: { prefixes: true, ipAddresses: true } },
    },
  });
}

export async function getLocations() {
  return prisma.location.findMany({
    orderBy: { name: 'asc' },
    select: { id: true, name: true, code: true },
  });
}

export async function createNetwork(values: NetworkValues): Promise<ActionResult> {
  const parsed = networkSchema.safeParse(values);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[issue.path[0] as string] = issue.message;
    }
    return { ok: false, fieldErrors };
  }
  const data = parsed.data;

  const existing = await prisma.network.findUnique({ where: { cidr: data.cidr } });
  if (existing) {
    return { ok: false, fieldErrors: { cidr: 'A network with this CIDR already exists' } };
  }

  try {
    const network = await prisma.network.create({
      data: {
        name: data.name,
        cidr: data.cidr,
        description: data.description ?? null,
        vlanId: data.vlanId ?? null,
        status: data.status as NetworkStatus,
        locationId: data.locationId || null,
      },
    });
    await writeAudit('CREATE', network.id, { cidr: network.cidr, name: network.name });
    revalidatePath('/networks');
    return { ok: true, message: 'Network created successfully' };
  } catch (e) {
    return { ok: false, message: 'Failed to create network' };
  }
}

export async function updateNetwork(
  id: string,
  values: NetworkValues
): Promise<ActionResult> {
  const parsed = networkSchema.safeParse(values);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[issue.path[0] as string] = issue.message;
    }
    return { ok: false, fieldErrors };
  }
  const data = parsed.data;

  const existing = await prisma.network.findUnique({ where: { cidr: data.cidr } });
  if (existing && existing.id !== id) {
    return { ok: false, fieldErrors: { cidr: 'A network with this CIDR already exists' } };
  }

  try {
    const network = await prisma.network.update({
      where: { id },
      data: {
        name: data.name,
        cidr: data.cidr,
        description: data.description ?? null,
        vlanId: data.vlanId ?? null,
        status: data.status as NetworkStatus,
        locationId: data.locationId || null,
      },
    });
    await writeAudit('UPDATE', network.id, { cidr: network.cidr, name: network.name });
    revalidatePath('/networks');
    return { ok: true, message: 'Network updated successfully' };
  } catch (e) {
    return { ok: false, message: 'Failed to update network' };
  }
}

export async function deleteNetwork(id: string): Promise<ActionResult> {
  try {
    const network = await prisma.network.findUnique({
      where: { id },
      include: { _count: { select: { prefixes: true, ipAddresses: true } } },
    });

    if (!network) {
      return { ok: false, message: 'Network not found' };
    }

    if (network._count.prefixes > 0 || network._count.ipAddresses > 0) {
      return {
        ok: false,
        message: `Cannot delete this network because it has ${network._count.prefixes} prefix(es) and ${network._count.ipAddresses} IP address(es) attached. Remove them first.`,
      };
    }

    await prisma.network.delete({ where: { id } });
    await writeAudit('DELETE', id, { cidr: network.cidr, name: network.name });
    revalidatePath('/networks');
    return { ok: true, message: 'Network deleted successfully' };
  } catch (e) {
    return { ok: false, message: 'Failed to delete network' };
  }
}