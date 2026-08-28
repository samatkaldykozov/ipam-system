'use server';

import { revalidatePath } from 'next/cache';
import { Prisma, LocationKind } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { locationSchema, type LocationValues } from '@/lib/validations';
import { getCurrentUser, canEdit } from '@/lib/auth';
import type { SortField, SortOrder } from '@/app/(app)/locations/types';

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
      entity: 'Location',
      entityId,
      userId: userId ?? null,
      metadata: (metadata ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}

// Paginated, searchable flat list — used by the "List" view.
export async function getLocations(params: {
  search?: string;
  sortBy?: SortField;
  sortOrder?: SortOrder;
  page?: number;
  pageSize?: number;
}) {
  const {
    search = '',
    sortBy = 'name',
    sortOrder = 'asc',
    page = 1,
    pageSize = 10,
  } = params;

  const where: Prisma.LocationWhereInput = {};
  if (search.trim()) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { code: { contains: search, mode: 'insensitive' } },
      { city: { contains: search, mode: 'insensitive' } },
      { country: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.location.findMany({
      where,
      include: {
        _count: { select: { networks: true, children: true } },
        parent: { select: { id: true, name: true, code: true } },
      },
      orderBy: { [sortBy]: sortOrder },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.location.count({ where }),
  ]);

  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

// Unpaged — used by the "Tree" view, which builds the hierarchy client-side
// (same pattern as networks/actions.ts's getNetworkTree). The dataset here
// is small (hundreds to low thousands of nodes even at full CMDB scale),
// so fetching everything at once is fine — see it-passports-design.md on
// scale for the same reasoning applied to passports.
export async function getLocationTree() {
  return prisma.location.findMany({
    include: {
      _count: { select: { networks: true, children: true } },
      parent: { select: { id: true, name: true, code: true } },
    },
    orderBy: { name: 'asc' },
  });
}

// Every existing location is a valid parent candidate, except the node
// being edited and any of its own descendants (picking one of those would
// create a cycle) — mirrors getAvailableParents in networks/actions.ts.
export async function getAvailableLocationParents(excludeId?: string) {
  const all = await prisma.location.findMany({
    orderBy: { name: 'asc' },
    select: { id: true, name: true, code: true, kind: true, parentId: true },
  });

  if (!excludeId) {
    return all.map(({ id, name, code, kind }) => ({ id, name, code, kind }));
  }

  const excluded = new Set<string>([excludeId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const l of all) {
      if (l.parentId && excluded.has(l.parentId) && !excluded.has(l.id)) {
        excluded.add(l.id);
        changed = true;
      }
    }
  }

  return all
    .filter((l) => !excluded.has(l.id))
    .map(({ id, name, code, kind }) => ({ id, name, code, kind }));
}

// Root-level ("site") locations only — the level networks actually attach
// to. Used by networks/actions.ts's own getLocations() for the network
// form's location dropdown, so a network can't accidentally be assigned to
// a rack or a room.
export async function getSiteLocations() {
  return prisma.location.findMany({
    where: { parentId: null },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, code: true },
  });
}

async function findSibling(
  parentId: string | null,
  field: 'name' | 'code',
  value: string,
  excludeId?: string,
) {
  return prisma.location.findFirst({
    where: {
      parentId,
      [field]: value,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
  });
}

export async function createLocation(
  values: LocationValues,
): Promise<ActionResult> {
  const currentUser = await getCurrentUser();
  if (!currentUser || !canEdit(currentUser.role)) {
    return PERMISSION_DENIED;
  }

  const parsed = locationSchema.safeParse(values);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[issue.path[0] as string] = issue.message;
    }
    return { ok: false, fieldErrors };
  }
  const data = parsed.data;
  const parentId = data.parentId || null;

  if (parentId) {
    const parent = await prisma.location.findUnique({
      where: { id: parentId },
    });
    if (!parent) {
      return {
        ok: false,
        fieldErrors: { parentId: 'Selected parent location does not exist' },
      };
    }
  }

  // name/code are unique among siblings (same parent), not globally — see
  // the comment on the Location model in schema.prisma.
  const [existingName, existingCode] = await Promise.all([
    findSibling(parentId, 'name', data.name),
    findSibling(parentId, 'code', data.code),
  ]);
  if (existingName) {
    return {
      ok: false,
      fieldErrors: { name: 'A location with this name already exists here' },
    };
  }
  if (existingCode) {
    return {
      ok: false,
      fieldErrors: { code: 'A location with this code already exists here' },
    };
  }

  try {
    const location = await prisma.location.create({
      data: {
        kind: data.kind as LocationKind,
        parentId,
        name: data.name,
        code: data.code,
        rowCode: data.rowCode || null,
        address: data.address || null,
        city: data.city || null,
        country: data.country || null,
        latitude: data.latitude ?? null,
        longitude: data.longitude ?? null,
        description: data.description || null,
      },
    });
    await writeAudit('CREATE', location.id, currentUser.id, {
      name: location.name,
      code: location.code,
      kind: location.kind,
    });
    revalidatePath('/locations');
    revalidatePath('/networks');
    return { ok: true, message: 'Location created successfully' };
  } catch {
    return { ok: false, message: 'Failed to create location' };
  }
}

export async function updateLocation(
  id: string,
  values: LocationValues,
): Promise<ActionResult> {
  const currentUser = await getCurrentUser();
  if (!currentUser || !canEdit(currentUser.role)) {
    return PERMISSION_DENIED;
  }

  const parsed = locationSchema.safeParse(values);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[issue.path[0] as string] = issue.message;
    }
    return { ok: false, fieldErrors };
  }
  const data = parsed.data;
  const parentId = data.parentId || null;

  if (parentId === id) {
    return {
      ok: false,
      fieldErrors: { parentId: 'A location cannot be its own parent' },
    };
  }

  if (parentId) {
    const parent = await prisma.location.findUnique({
      where: { id: parentId },
    });
    if (!parent) {
      return {
        ok: false,
        fieldErrors: { parentId: 'Selected parent location does not exist' },
      };
    }
  }

  const [existingName, existingCode] = await Promise.all([
    findSibling(parentId, 'name', data.name, id),
    findSibling(parentId, 'code', data.code, id),
  ]);
  if (existingName) {
    return {
      ok: false,
      fieldErrors: { name: 'A location with this name already exists here' },
    };
  }
  if (existingCode) {
    return {
      ok: false,
      fieldErrors: { code: 'A location with this code already exists here' },
    };
  }

  try {
    const location = await prisma.location.update({
      where: { id },
      data: {
        kind: data.kind as LocationKind,
        parentId,
        name: data.name,
        code: data.code,
        rowCode: data.rowCode || null,
        address: data.address || null,
        city: data.city || null,
        country: data.country || null,
        latitude: data.latitude ?? null,
        longitude: data.longitude ?? null,
        description: data.description || null,
      },
    });
    await writeAudit('UPDATE', location.id, currentUser.id, {
      name: location.name,
      code: location.code,
      kind: location.kind,
    });
    revalidatePath('/locations');
    revalidatePath('/networks');
    return { ok: true, message: 'Location updated successfully' };
  } catch {
    return { ok: false, message: 'Failed to update location' };
  }
}

export async function deleteLocation(id: string): Promise<ActionResult> {
  const currentUser = await getCurrentUser();
  if (!currentUser || !canEdit(currentUser.role)) {
    return PERMISSION_DENIED;
  }

  try {
    const location = await prisma.location.findUnique({
      where: { id },
      include: { _count: { select: { networks: true, children: true } } },
    });
    if (!location) {
      return { ok: false, message: 'Location not found' };
    }

    if (location._count.children > 0) {
      return {
        ok: false,
        message: `Cannot delete this location because it has ${location._count.children} child location(s). Delete or move them first.`,
      };
    }

    if (location._count.networks > 0) {
      return {
        ok: false,
        message: `Cannot delete this location because ${location._count.networks} network(s) are assigned to it. Reassign them first.`,
      };
    }

    // An OBJECT_REFERENCE field (or column) on a passport can point at
    // this node as a real foreign key (onDelete: Restrict — see
    // FieldObjectReferenceValue/TableCellObjectReferenceValue in
    // schema.prisma, CMDB phase 2), so deleting a referenced node would
    // otherwise fail with a raw Prisma FK error. Check both first and name
    // the passport(s) instead — same pattern as deleteIpAddress in
    // ip-addresses/actions.ts.
    const [links, tableCellLinks] = await Promise.all([
      prisma.fieldObjectReferenceValue.findMany({
        where: { targetLocationId: id },
        take: 5,
        include: { objectInstance: { select: { name: true } } },
      }),
      prisma.tableCellObjectReferenceValue.findMany({
        where: { targetLocationId: id },
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
        message: `Cannot delete this location because it's referenced by passport(s): ${names.join(', ')}. Remove the reference there first.`,
      };
    }

    // AUTO_IDENTIFIER values (28 August 2026, CMDB phase 3) generated using
    // this node as the rack are a real foreign key too (onDelete: Restrict
    // — see FieldAutoIdentifierValue in schema.prisma), separate from the
    // OBJECT_REFERENCE check above since a rack can be used by an
    // AUTO_IDENTIFIER field without that ObjectType also having an
    // OBJECT_REFERENCE field pointing at it directly (the AUTO_IDENTIFIER
    // field reads the rack off that other field's value, but only
    // FieldAutoIdentifierValue itself records the FK that blocks deletion).
    const autoIdLinks = await prisma.fieldAutoIdentifierValue.findMany({
      where: { targetLocationId: id },
      take: 5,
      include: { objectInstance: { select: { name: true } } },
    });
    if (autoIdLinks.length > 0) {
      const names = Array.from(
        new Set(autoIdLinks.map((l) => l.objectInstance.name)),
      );
      return {
        ok: false,
        message: `Cannot delete this location because equipment identifiers were generated using it as a rack, for passport(s): ${names.join(', ')}.`,
      };
    }

    await prisma.location.delete({ where: { id } });
    await writeAudit('DELETE', id, currentUser.id, {
      name: location.name,
      code: location.code,
      kind: location.kind,
    });
    revalidatePath('/locations');
    revalidatePath('/networks');
    return { ok: true, message: 'Location deleted successfully' };
  } catch {
    return { ok: false, message: 'Failed to delete location' };
  }
}
