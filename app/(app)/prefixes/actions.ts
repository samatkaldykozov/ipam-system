'use server';

import { revalidatePath } from 'next/cache';
import { Prisma, PrefixStatus } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { prefixSchema, type PrefixValues } from '@/lib/validations';
import {
  containsCidr,
  cidrsOverlap,
  getPrefixLength,
  requiresAncestor24,
} from '@/lib/prefix-utils';

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
      entity: 'Prefix',
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

export async function getAvailableParentPrefixes(networkId: string, excludeId?: string) {
  const where: Prisma.PrefixWhereInput = { networkId };
  if (excludeId) {
    where.id = { not: excludeId };
  }
  return prisma.prefix.findMany({
    where,
    orderBy: { cidr: 'asc' },
    select: { id: true, cidr: true, name: true, networkId: true },
  });
}

export async function getPrefixes(params: {
  search?: string;
  status?: PrefixStatus | 'ALL';
  networkId?: string;
  sortBy?: 'cidr' | 'name' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}) {
  const {
    search = '',
    status = 'ALL',
    networkId,
    sortBy = 'createdAt',
    sortOrder = 'desc',
    page = 1,
    pageSize = 10,
  } = params;

  const where: Prisma.PrefixWhereInput = {};
  if (status !== 'ALL') where.status = status;
  if (networkId) where.networkId = networkId;
  if (search.trim()) {
    where.OR = [
      { cidr: { contains: search, mode: 'insensitive' } },
      { name: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.prefix.findMany({
      where,
      include: {
        network: { select: { id: true, name: true, cidr: true } },
        parentPrefix: { select: { id: true, cidr: true, name: true } },
      },
      orderBy: { [sortBy]: sortOrder },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.prefix.count({ where }),
  ]);

  const enriched = await Promise.all(
    items.map(async (p) => {
      const _count = await prisma.prefix.count({
        where: { parentPrefixId: p.id },
      });
      const ipCount = await prisma.ipAddress.count({
        where: { prefixId: p.id },
      });
      return {
        ...p,
        _count: { childPrefixes: _count, ipAddresses: ipCount },
      };
    })
  );

  return { items: enriched, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

export async function getPrefix(id: string) {
  return prisma.prefix.findUnique({
    where: { id },
    include: {
      network: { select: { id: true, name: true, cidr: true } },
      parentPrefix: { select: { id: true, cidr: true, name: true } },
    },
  });
}

export async function createPrefix(values: PrefixValues): Promise<ActionResult> {
  const parsed = prefixSchema.safeParse(values);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[issue.path[0] as string] = issue.message;
    }
    return { ok: false, fieldErrors };
  }

  const data = parsed.data;

  const existing = await prisma.prefix.findUnique({ where: { cidr: data.cidr } });
  if (existing) {
    return { ok: false, fieldErrors: { cidr: 'A prefix with this CIDR already exists' } };
  }

  const network = await prisma.network.findUnique({ where: { id: data.networkId } });
  if (!network) {
    return { ok: false, fieldErrors: { networkId: 'Selected network does not exist' } };
  }

  const prefixLength = getPrefixLength(data.cidr);
  if (prefixLength === null) {
    return { ok: false, fieldErrors: { cidr: 'Invalid CIDR notation' } };
  }

  let parentPrefix: {
    id: string;
    cidr: string;
    networkId: string;
  } | null = null;

  if (data.parentPrefixId) {
    parentPrefix = await prisma.prefix.findUnique({
      where: { id: data.parentPrefixId },
      select: { id: true, cidr: true, networkId: true },
    });
    if (!parentPrefix) {
      return { ok: false, fieldErrors: { parentPrefixId: 'Selected parent prefix does not exist' } };
    }
  }

  const hierarchyError = validateHierarchyRules(
    data.cidr,
    prefixLength,
    network.cidr,
    parentPrefix?.cidr ?? null
  );
  if (hierarchyError) {
    return { ok: false, fieldErrors: hierarchyError };
  }

  if (parentPrefix && parentPrefix.networkId !== data.networkId) {
    return {
      ok: false,
      fieldErrors: { parentPrefixId: 'Parent prefix must belong to the same network' },
    };
  }

  const overlapError = await checkSiblingOverlap(
    data.cidr,
    data.networkId,
    data.parentPrefixId ?? null,
    undefined
  );
  if (overlapError) {
    return { ok: false, fieldErrors: overlapError };
  }

  try {
    const prefix = await prisma.prefix.create({
      data: {
        cidr: data.cidr,
        name: data.name ?? null,
        description: data.description ?? null,
        status: data.status as PrefixStatus,
        networkId: data.networkId,
        parentPrefixId: parentPrefix?.id ?? null,
      },
    });
    await writeAudit('CREATE', prefix.id, {
      cidr: prefix.cidr,
      name: prefix.name,
      networkId: prefix.networkId,
      parentPrefixId: prefix.parentPrefixId,
    });
    revalidatePath('/prefixes');
    return { ok: true, message: 'Prefix created successfully' };
  } catch {
    return { ok: false, message: 'Failed to create prefix' };
  }
}

export async function updatePrefix(
  id: string,
  values: PrefixValues
): Promise<ActionResult> {
  const parsed = prefixSchema.safeParse(values);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[issue.path[0] as string] = issue.message;
    }
    return { ok: false, fieldErrors };
  }

  const data = parsed.data;

  const current = await prisma.prefix.findUnique({ where: { id } });
  if (!current) {
    return { ok: false, message: 'Prefix not found' };
  }

  if (data.cidr !== current.cidr) {
    const existing = await prisma.prefix.findUnique({ where: { cidr: data.cidr } });
    if (existing && existing.id !== id) {
      return { ok: false, fieldErrors: { cidr: 'A prefix with this CIDR already exists' } };
    }
  }

  const network = await prisma.network.findUnique({ where: { id: data.networkId } });
  if (!network) {
    return { ok: false, fieldErrors: { networkId: 'Selected network does not exist' } };
  }

  const prefixLength = getPrefixLength(data.cidr);
  if (prefixLength === null) {
    return { ok: false, fieldErrors: { cidr: 'Invalid CIDR notation' } };
  }

  let parentPrefix: { id: string; cidr: string; networkId: string } | null = null;
  if (data.parentPrefixId) {
    if (data.parentPrefixId === id) {
      return { ok: false, fieldErrors: { parentPrefixId: 'A prefix cannot be its own parent' } };
    }
    parentPrefix = await prisma.prefix.findUnique({
      where: { id: data.parentPrefixId },
      select: { id: true, cidr: true, networkId: true },
    });
    if (!parentPrefix) {
      return { ok: false, fieldErrors: { parentPrefixId: 'Selected parent prefix does not exist' } };
    }
  }

  const hierarchyError = validateHierarchyRules(
    data.cidr,
    prefixLength,
    network.cidr,
    parentPrefix?.cidr ?? null
  );
  if (hierarchyError) {
    return { ok: false, fieldErrors: hierarchyError };
  }

  if (parentPrefix && parentPrefix.networkId !== data.networkId) {
    return {
      ok: false,
      fieldErrors: { parentPrefixId: 'Parent prefix must belong to the same network' },
    };
  }

  const overlapError = await checkSiblingOverlap(
    data.cidr,
    data.networkId,
    data.parentPrefixId ?? null,
    id
  );
  if (overlapError) {
    return { ok: false, fieldErrors: overlapError };
  }

  try {
    const prefix = await prisma.prefix.update({
      where: { id },
      data: {
        cidr: data.cidr,
        name: data.name ?? null,
        description: data.description ?? null,
        status: data.status as PrefixStatus,
        networkId: data.networkId,
        parentPrefixId: parentPrefix?.id ?? null,
      },
    });
    await writeAudit('UPDATE', prefix.id, {
      cidr: prefix.cidr,
      name: prefix.name,
      networkId: prefix.networkId,
      parentPrefixId: prefix.parentPrefixId,
    });
    revalidatePath('/prefixes');
    return { ok: true, message: 'Prefix updated successfully' };
  } catch {
    return { ok: false, message: 'Failed to update prefix' };
  }
}

export async function deletePrefix(id: string): Promise<ActionResult> {
  try {
    const prefix = await prisma.prefix.findUnique({
      where: { id },
      include: {
        _count: { select: { childPrefixes: true, ipAddresses: true } },
      },
    });

    if (!prefix) {
      return { ok: false, message: 'Prefix not found' };
    }

    if (prefix._count.childPrefixes > 0) {
      return {
        ok: false,
        message: `Cannot delete this prefix because it has ${prefix._count.childPrefixes} child prefix(es). Remove them first.`,
      };
    }

    if (prefix._count.ipAddresses > 0) {
      return {
        ok: false,
        message: `Cannot delete this prefix because it has ${prefix._count.ipAddresses} IP address(es) assigned. Remove them first.`,
      };
    }

    await prisma.prefix.delete({ where: { id } });
    await writeAudit('DELETE', id, { cidr: prefix.cidr, name: prefix.name });
    revalidatePath('/prefixes');
    return { ok: true, message: 'Prefix deleted successfully' };
  } catch {
    return { ok: false, message: 'Failed to delete prefix' };
  }
}

function validateHierarchyRules(
  cidr: string,
  prefixLength: number,
  networkCidr: string,
  parentCidr: string | null
): Record<string, string> | null {
  if (requiresAncestor24(cidr) && !parentCidr) {
    return {
      parentPrefixId: `Prefix /${prefixLength} requires a parent prefix with prefix length /24 or more specific`,
    };
  }

  if (parentCidr) {
    const parentLen = getPrefixLength(parentCidr);
    if (parentLen === null) {
      return { parentPrefixId: 'Parent prefix has invalid CIDR' };
    }

    if (prefixLength <= parentLen) {
      return {
        cidr: `Child prefix /${prefixLength} must be more specific than parent /${parentLen}`,
      };
    }

    if (prefixLength >= 25 && parentLen < 24) {
      return {
        parentPrefixId: `Prefix /${prefixLength} requires a parent with prefix length /24 or more specific (parent is /${parentLen})`,
      };
    }

    if (!containsCidr(parentCidr, cidr)) {
      return { cidr: 'Child prefix must be completely contained inside its parent prefix' };
    }
  }

  if (!containsCidr(networkCidr, cidr)) {
    return { cidr: 'Prefix must be contained within the selected network' };
  }

  return null;
}

async function checkSiblingOverlap(
  cidr: string,
  _networkId: string,
  parentPrefixId: string | null,
  excludeId?: string
): Promise<Record<string, string> | null> {
  const where: Prisma.PrefixWhereInput = { parentPrefixId: parentPrefixId ?? null };
  if (excludeId) {
    where.id = { not: excludeId };
  }

  const siblings = await prisma.prefix.findMany({
    where,
    select: { cidr: true },
  });

  for (const sibling of siblings) {
    if (cidrsOverlap(cidr, sibling.cidr)) {
      return {
        cidr: `This prefix overlaps an existing prefix (${sibling.cidr}) at the same hierarchy level`,
      };
    }
  }

  return null;
}
