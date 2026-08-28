'use server';

import { revalidatePath } from 'next/cache';
import { Prisma, NetworkStatus } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { networkSchema, type NetworkValues } from '@/lib/validations';
import { containsCidr, cidrsOverlap, getPrefixLength } from '@/lib/cidr-utils';
import { getCurrentUser, canEdit } from '@/lib/auth';

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
      entity: 'Network',
      entityId,
      userId: userId ?? null,
      metadata: (metadata ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}

// Root-level ("site") locations only, now that Location can be a deeper
// tree (Region/City/Building/Room/Zone/Rack — see schema.prisma). A network
// still attaches at the site level, same as before the hierarchy existed;
// picking a rack or a room here wouldn't mean anything.
export async function getLocations() {
  return prisma.location.findMany({
    where: { parentId: null },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, code: true },
  });
}

// Every existing network is a valid parent candidate, except the node being
// edited and any of its own descendants (picking one of those would create
// a cycle in the tree).
export async function getAvailableParents(excludeId?: string) {
  const all = await prisma.network.findMany({
    orderBy: { cidr: 'asc' },
    select: { id: true, cidr: true, name: true, parentId: true },
  });

  if (!excludeId) {
    return all.map(({ id, cidr, name }) => ({ id, cidr, name }));
  }

  const excluded = new Set<string>([excludeId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const n of all) {
      if (n.parentId && excluded.has(n.parentId) && !excluded.has(n.id)) {
        excluded.add(n.id);
        changed = true;
      }
    }
  }

  return all
    .filter((n) => !excluded.has(n.id))
    .map(({ id, cidr, name }) => ({ id, cidr, name }));
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
      include: {
        location: true,
        parent: { select: { id: true, cidr: true, name: true } },
        _count: { select: { children: true, ipAddresses: true } },
      },
      orderBy: { [sortBy]: sortOrder },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.network.count({ where }),
  ]);

  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

// Full, unpaginated set of networks for the tree view. Text search doesn't
// make sense once results are nested (a match buried three levels deep would
// need its whole ancestor chain pulled in too), so this only honors the
// status filter; the flat/paginated view above still supports free-text search.
export async function getNetworkTree(status: NetworkStatus | 'ALL' = 'ALL') {
  const where: Prisma.NetworkWhereInput = {};
  if (status !== 'ALL') where.status = status;

  return prisma.network.findMany({
    where,
    include: {
      location: true,
      parent: { select: { id: true, cidr: true, name: true } },
      _count: { select: { children: true, ipAddresses: true } },
    },
    orderBy: { cidr: 'asc' },
  });
}

export async function getNetwork(id: string) {
  return prisma.network.findUnique({
    where: { id },
    include: {
      location: true,
      parent: { select: { id: true, cidr: true, name: true } },
      _count: { select: { children: true, ipAddresses: true } },
    },
  });
}

function validateHierarchyRules(
  cidr: string,
  prefixLength: number,
  parentCidr: string | null,
): Record<string, string> | null {
  if (!parentCidr) return null;

  const parentLen = getPrefixLength(parentCidr);
  if (parentLen === null) {
    return { parentId: 'Parent network has invalid CIDR' };
  }

  if (prefixLength <= parentLen) {
    return {
      cidr: `A child network (/${prefixLength}) must be more specific than its parent (/${parentLen})`,
    };
  }

  if (!containsCidr(parentCidr, cidr)) {
    return {
      cidr: 'Child network must be completely contained inside its parent network',
    };
  }

  return null;
}

async function checkSiblingOverlap(
  cidr: string,
  parentId: string | null,
  excludeId?: string,
): Promise<Record<string, string> | null> {
  const where: Prisma.NetworkWhereInput = { parentId: parentId ?? null };
  if (excludeId) {
    where.id = { not: excludeId };
  }

  const siblings = await prisma.network.findMany({
    where,
    select: { cidr: true },
  });

  for (const sibling of siblings) {
    if (cidrsOverlap(cidr, sibling.cidr)) {
      return {
        cidr: `This network overlaps an existing network (${sibling.cidr}) at the same hierarchy level`,
      };
    }
  }

  return null;
}

export async function createNetwork(
  values: NetworkValues,
): Promise<ActionResult> {
  const currentUser = await getCurrentUser();
  if (!currentUser || !canEdit(currentUser.role)) {
    return PERMISSION_DENIED;
  }

  const parsed = networkSchema.safeParse(values);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[issue.path[0] as string] = issue.message;
    }
    return { ok: false, fieldErrors };
  }
  const data = parsed.data;

  const existing = await prisma.network.findUnique({
    where: { cidr: data.cidr },
  });
  if (existing) {
    return {
      ok: false,
      fieldErrors: { cidr: 'A network with this CIDR already exists' },
    };
  }

  const prefixLength = getPrefixLength(data.cidr);
  if (prefixLength === null) {
    return { ok: false, fieldErrors: { cidr: 'Invalid CIDR notation' } };
  }

  let parent: { id: string; cidr: string } | null = null;
  if (data.parentId) {
    parent = await prisma.network.findUnique({
      where: { id: data.parentId },
      select: { id: true, cidr: true },
    });
    if (!parent) {
      return {
        ok: false,
        fieldErrors: { parentId: 'Selected parent network does not exist' },
      };
    }
  }

  const hierarchyError = validateHierarchyRules(
    data.cidr,
    prefixLength,
    parent?.cidr ?? null,
  );
  if (hierarchyError) {
    return { ok: false, fieldErrors: hierarchyError };
  }

  const overlapError = await checkSiblingOverlap(
    data.cidr,
    parent?.id ?? null,
    undefined,
  );
  if (overlapError) {
    return { ok: false, fieldErrors: overlapError };
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
        parentId: parent?.id ?? null,
      },
    });
    await writeAudit('CREATE', network.id, currentUser.id, {
      cidr: network.cidr,
      name: network.name,
      parentId: network.parentId,
    });
    revalidatePath('/networks');
    return { ok: true, message: 'Network created successfully' };
  } catch {
    return { ok: false, message: 'Failed to create network' };
  }
}

export async function updateNetwork(
  id: string,
  values: NetworkValues,
): Promise<ActionResult> {
  const currentUser = await getCurrentUser();
  if (!currentUser || !canEdit(currentUser.role)) {
    return PERMISSION_DENIED;
  }

  const parsed = networkSchema.safeParse(values);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[issue.path[0] as string] = issue.message;
    }
    return { ok: false, fieldErrors };
  }
  const data = parsed.data;

  const existing = await prisma.network.findUnique({
    where: { cidr: data.cidr },
  });
  if (existing && existing.id !== id) {
    return {
      ok: false,
      fieldErrors: { cidr: 'A network with this CIDR already exists' },
    };
  }

  const prefixLength = getPrefixLength(data.cidr);
  if (prefixLength === null) {
    return { ok: false, fieldErrors: { cidr: 'Invalid CIDR notation' } };
  }

  let parent: { id: string; cidr: string } | null = null;
  if (data.parentId) {
    if (data.parentId === id) {
      return {
        ok: false,
        fieldErrors: { parentId: 'A network cannot be its own parent' },
      };
    }
    parent = await prisma.network.findUnique({
      where: { id: data.parentId },
      select: { id: true, cidr: true },
    });
    if (!parent) {
      return {
        ok: false,
        fieldErrors: { parentId: 'Selected parent network does not exist' },
      };
    }
  }

  const hierarchyError = validateHierarchyRules(
    data.cidr,
    prefixLength,
    parent?.cidr ?? null,
  );
  if (hierarchyError) {
    return { ok: false, fieldErrors: hierarchyError };
  }

  const overlapError = await checkSiblingOverlap(
    data.cidr,
    parent?.id ?? null,
    id,
  );
  if (overlapError) {
    return { ok: false, fieldErrors: overlapError };
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
        parentId: parent?.id ?? null,
      },
    });
    await writeAudit('UPDATE', network.id, currentUser.id, {
      cidr: network.cidr,
      name: network.name,
      parentId: network.parentId,
    });
    revalidatePath('/networks');
    return { ok: true, message: 'Network updated successfully' };
  } catch {
    return { ok: false, message: 'Failed to update network' };
  }
}

export async function deleteNetwork(id: string): Promise<ActionResult> {
  const currentUser = await getCurrentUser();
  if (!currentUser || !canEdit(currentUser.role)) {
    return PERMISSION_DENIED;
  }

  try {
    const network = await prisma.network.findUnique({
      where: { id },
      include: { _count: { select: { children: true, ipAddresses: true } } },
    });

    if (!network) {
      return { ok: false, message: 'Network not found' };
    }

    if (network._count.children > 0) {
      return {
        ok: false,
        message: `Cannot delete this network because it has ${network._count.children} child network(s). Remove them first.`,
      };
    }

    if (network._count.ipAddresses > 0) {
      return {
        ok: false,
        message: `Cannot delete this network because it has ${network._count.ipAddresses} IP address(es) assigned. Remove them first.`,
      };
    }

    await prisma.network.delete({ where: { id } });
    await writeAudit('DELETE', id, currentUser.id, {
      cidr: network.cidr,
      name: network.name,
    });
    revalidatePath('/networks');
    return { ok: true, message: 'Network deleted successfully' };
  } catch {
    return { ok: false, message: 'Failed to delete network' };
  }
}
