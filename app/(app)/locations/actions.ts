'use server';

import { revalidatePath } from 'next/cache';
import { Prisma, LocationKind } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import {
  locationSchema,
  rackPositionValueRegex,
  type LocationValues,
} from '@/lib/validations';
import { getCurrentUser, canEdit, hasPassportAccess } from '@/lib/auth';
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
        rackUnits: data.rackUnits ?? null,
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
        rackUnits: data.rackUnits ?? null,
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

// ─────────────────────────────────────────────
// Rack elevation (CMDB phase 5, 31 August 2026, see it-passports-design.md
// section 8.8) — a picture of what equipment occupies which unit of a
// rack. RACK_POSITION is manually entered and has no relational mirror
// table (unlike OBJECT_REFERENCE/AUTO_IDENTIFIER — see the doc comment on
// FieldType.RACK_POSITION in schema.prisma), so this is a render-time scan
// rather than a stored/enforced fact: it finds every passport whose
// "rack" OBJECT_REFERENCE field points at this location, reads that
// passport's RACK_POSITION field value out of its `values` json, and flags
// overlaps/over-capacity here rather than blocking anything at save time —
// the same "scan and report" pattern as getIntegrityIssues() in
// data-integrity/actions.ts.
// ─────────────────────────────────────────────

export type RackOccupant = {
  objectInstanceId: string;
  objectInstanceName: string;
  objectTypeName: string;
  fieldLabel: string;
  raw: string;
  start: number;
  size: number;
  end: number;
};

export type RackElevation =
  | { kind: 'not-found' }
  | { kind: 'not-a-rack'; locationName: string }
  | { kind: 'no-capacity'; locationId: string; locationName: string }
  | {
      kind: 'ok';
      locationId: string;
      locationName: string;
      rackUnits: number;
      occupants: RackOccupant[];
      overlapUnits: number[];
      overCapacity: RackOccupant[];
      unplaced: {
        objectInstanceId: string;
        objectInstanceName: string;
        objectTypeName: string;
      }[];
    };

export async function getRackElevation(
  locationId: string,
): Promise<RackElevation> {
  const currentUser = await getCurrentUser();
  if (!currentUser || !hasPassportAccess(currentUser.passportRole)) {
    return { kind: 'not-found' };
  }

  const location = await prisma.location.findUnique({
    where: { id: locationId },
    select: { id: true, name: true, kind: true, rackUnits: true },
  });
  if (!location) return { kind: 'not-found' };
  if (location.kind !== 'RACK') {
    return { kind: 'not-a-rack', locationName: location.name };
  }
  if (!location.rackUnits) {
    return {
      kind: 'no-capacity',
      locationId: location.id,
      locationName: location.name,
    };
  }

  // Every RACK_POSITION field defined anywhere, together with the sibling
  // OBJECT_REFERENCE("Стойка") field it's tied to on the same ObjectType —
  // rackPositionRackFieldKey names that sibling by key (see the field
  // builder's requireRackFieldKey check in object-types/actions.ts).
  const rackPosFields = await prisma.fieldDefinition.findMany({
    where: { type: 'RACK_POSITION' },
    select: {
      id: true,
      key: true,
      label: true,
      objectTypeId: true,
      rackPositionRackFieldKey: true,
      objectType: { select: { name: true } },
    },
  });
  if (rackPosFields.length === 0) {
    return {
      kind: 'ok',
      locationId: location.id,
      locationName: location.name,
      rackUnits: location.rackUnits,
      occupants: [],
      overlapUnits: [],
      overCapacity: [],
      unplaced: [],
    };
  }

  const siblingFields = await prisma.fieldDefinition.findMany({
    where: {
      type: 'OBJECT_REFERENCE',
      OR: rackPosFields
        .filter((f) => f.rackPositionRackFieldKey)
        .map((f) => ({
          objectTypeId: f.objectTypeId,
          key: f.rackPositionRackFieldKey as string,
        })),
    },
    select: { id: true, objectTypeId: true },
  });

  const rackPosFieldByObjectTypeId = new Map(
    rackPosFields.map((f) => [f.objectTypeId, f] as const),
  );
  const siblingFieldIds = siblingFields.map((f) => f.id);

  if (siblingFieldIds.length === 0) {
    return {
      kind: 'ok',
      locationId: location.id,
      locationName: location.name,
      rackUnits: location.rackUnits,
      occupants: [],
      overlapUnits: [],
      overCapacity: [],
      unplaced: [],
    };
  }

  // Every passport whose "rack" field points at this location, regardless
  // of whether it has a RACK_POSITION value yet — those without one land
  // in `unplaced` below instead of `occupants`.
  const refValues = await prisma.fieldObjectReferenceValue.findMany({
    where: {
      targetLocationId: location.id,
      fieldDefinitionId: { in: siblingFieldIds },
    },
    select: { objectInstanceId: true },
  });
  const instanceIds = Array.from(
    new Set(refValues.map((r) => r.objectInstanceId)),
  );

  if (instanceIds.length === 0) {
    return {
      kind: 'ok',
      locationId: location.id,
      locationName: location.name,
      rackUnits: location.rackUnits,
      occupants: [],
      overlapUnits: [],
      overCapacity: [],
      unplaced: [],
    };
  }

  const instances = await prisma.objectInstance.findMany({
    where: { id: { in: instanceIds } },
    select: {
      id: true,
      name: true,
      values: true,
      objectTypeId: true,
      objectType: { select: { name: true } },
    },
  });

  const occupants: RackOccupant[] = [];
  const unplacedList: {
    objectInstanceId: string;
    objectInstanceName: string;
    objectTypeName: string;
  }[] = [];

  for (const instance of instances) {
    const rackPosField = rackPosFieldByObjectTypeId.get(instance.objectTypeId);
    if (!rackPosField) continue;
    const values = instance.values as unknown as Record<string, unknown>;
    const raw = values[rackPosField.key];
    if (typeof raw === 'string' && rackPositionValueRegex.test(raw)) {
      const [start, size] = raw.split(':').map((n) => parseInt(n, 10));
      occupants.push({
        objectInstanceId: instance.id,
        objectInstanceName: instance.name,
        objectTypeName: instance.objectType.name,
        fieldLabel: rackPosField.label,
        raw,
        start,
        size,
        end: start + size - 1,
      });
    } else {
      unplacedList.push({
        objectInstanceId: instance.id,
        objectInstanceName: instance.name,
        objectTypeName: instance.objectType.name,
      });
    }
  }

  occupants.sort((a, b) => a.start - b.start);

  // Advisory scan, not a stored fact — see the file-level comment above.
  // A unit is "overlapping" when more than one occupant's [start, end]
  // range covers it; over-capacity means the range runs past the rack's
  // declared rackUnits (or, in principle, starts before unit 1, though the
  // regex already rules that out at entry).
  const unitOwners = new Map<number, RackOccupant[]>();
  for (const occ of occupants) {
    for (let u = occ.start; u <= occ.end; u++) {
      const list = unitOwners.get(u);
      if (list) list.push(occ);
      else unitOwners.set(u, [occ]);
    }
  }
  // for...of over a Map needs downlevelIteration under this project's es5
  // target (not set — see the Object.entries()-only convention used
  // elsewhere in this codebase for the same reason), so use forEach here
  // instead of for...of.
  const overlapUnits: number[] = [];
  unitOwners.forEach((owners, unit) => {
    if (owners.length > 1) overlapUnits.push(unit);
  });
  overlapUnits.sort((a, b) => a - b);
  const overCapacity = occupants.filter((occ) => occ.end > location.rackUnits!);

  return {
    kind: 'ok',
    locationId: location.id,
    locationName: location.name,
    rackUnits: location.rackUnits,
    occupants,
    overlapUnits,
    overCapacity,
    unplaced: unplacedList,
  };
}
