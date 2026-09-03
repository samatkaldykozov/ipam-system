'use server';

import { revalidatePath } from 'next/cache';
import {
  Prisma,
  type RelationshipType,
  type ObjectInstanceStatus,
} from '@prisma/client';

import { prisma } from '@/lib/prisma';
import {
  getCurrentUser,
  hasPassportAccess,
  canEditPassports,
} from '@/lib/auth';
import { validatePassportValues } from '@/app/(app)/passports/validate-values';
import {
  buildFieldChanges,
  buildTableFieldChanges,
  type FieldChange,
} from '@/app/(app)/passports/change-log-utils';
import {
  OBJECT_INSTANCE_STATUS_LABELS,
  type PassportHistoryEntry,
} from '@/app/(app)/passports/types';
import {
  ipReferenceColumnKeys,
  ipReferenceFields,
  resolveIpAddressLabels,
  syncFieldIpAddressLinks,
  syncTableCellIpAddressLinks,
  validateIpReferenceValues,
  validateTableIpReferenceValues,
  type IpAddressRefLabel,
} from '@/app/(app)/passports/ip-reference-utils';
import {
  objectReferenceColumns,
  objectReferenceFields,
  resolveObjectReferenceLabels,
  syncFieldObjectReferenceLinks,
  syncTableCellObjectReferenceLinks,
  validateObjectReferenceValues,
  validateTableObjectReferenceValues,
  validateUniqueObjectReferenceTargets,
  type ObjectReferenceColumn,
  type ObjectReferenceLabel,
} from '@/app/(app)/passports/object-reference-utils';
import {
  autoIdentifierFields,
  syncAutoIdentifierValues,
  validateAutoIdentifierRackValues,
} from '@/app/(app)/passports/auto-identifier-utils';
import {
  vmIdentifierFields,
  syncVmIdentifierValue,
  validateVmIdentifierFields,
} from '@/app/(app)/passports/vm-identifier-utils';

export type ActionResult<T = void> = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
  data?: T;
};

async function requirePassportEditor() {
  const currentUser = await getCurrentUser();
  if (!currentUser || !canEditPassports(currentUser.passportRole)) {
    return null;
  }
  return currentUser;
}

async function requirePassportViewer() {
  const currentUser = await getCurrentUser();
  if (!currentUser || !hasPassportAccess(currentUser.passportRole)) {
    return null;
  }
  return currentUser;
}

async function writeAudit(
  action: 'CREATE' | 'UPDATE' | 'DELETE',
  entityId: string,
  userId?: string,
  metadata?: Record<string, unknown>,
) {
  await prisma.auditLog.create({
    data: {
      action,
      entity: 'ObjectInstance',
      entityId,
      userId: userId ?? null,
      metadata: (metadata ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}

// ─────────────────────────────────────────────
// Reads
// ─────────────────────────────────────────────

// Card-picker options for "New passport" — editors only, browsing every
// object type isn't useful for a Guest who can't create anything.
export async function getObjectTypesForPicker() {
  const currentUser = await requirePassportEditor();
  if (!currentUser) return [];
  return prisma.objectType.findMany({
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      code: true,
      description: true,
      _count: { select: { fields: true } },
    },
  });
}

// The list itself only shows names/type/responsible — no field values — so
// it's safe for anyone with any level of passport access, including Guest.
// Field-value masking for the detail view is plan step 5, not this one.
export async function getPassports(params: {
  objectTypeId?: string;
  search?: string;
  status?: ObjectInstanceStatus;
}) {
  const currentUser = await requirePassportViewer();
  if (!currentUser) return { items: [] };

  const where: Prisma.ObjectInstanceWhereInput = {};
  if (params.objectTypeId) where.objectTypeId = params.objectTypeId;
  if (params.status) where.status = params.status;
  if (params.search?.trim()) {
    where.name = { contains: params.search.trim(), mode: 'insensitive' };
  }

  const items = await prisma.objectInstance.findMany({
    where,
    include: {
      objectType: { select: { id: true, name: true, code: true } },
      responsible: {
        include: {
          user: { select: { id: true, email: true, fullName: true } },
        },
      },
    },
    orderBy: { updatedAt: 'desc' },
  });

  return { items };
}

export async function getObjectTypeForFill(objectTypeId: string) {
  const currentUser = await requirePassportEditor();
  if (!currentUser) return null;
  return prisma.objectType.findUnique({
    where: { id: objectTypeId },
    include: { fields: { orderBy: { order: 'asc' } } },
  });
}

export async function getPassport(id: string) {
  const currentUser = await requirePassportEditor();
  if (!currentUser) return null;
  return prisma.objectInstance.findUnique({
    where: { id },
    include: {
      objectType: { include: { fields: { orderBy: { order: 'asc' } } } },
      responsible: {
        include: {
          user: { select: { id: true, email: true, fullName: true } },
        },
      },
      tableRows: true,
    },
  });
}

// Masked, read-only view for anyone with any level of passport access,
// including Guest — the counterpart to getPassport() above, which is the
// full/unmasked shape used only by the edit form (Admin/Manager). Field
// definitions AND their values are filtered out server-side before this
// ever leaves Prisma, per docs/it-passports-design.md section 4 ("скрытые
// поля не должны даже приходить в браузер"), not just hidden client-side.
//
// Admin/Manager (canEditPassports) always see every field, unmasked — the
// per-field visibleToAll/visibleRoles restriction only applies to Guest
// and any future view-only role. This matches how the feature was scoped
// in conversation: a Manager filling in a passport needs to see
// everything they're responsible for; the masking is about what a Guest
// is allowed to view afterward.
export async function getPassportView(id: string) {
  const currentUser = await requirePassportViewer();
  if (!currentUser) return null;

  const instance = await prisma.objectInstance.findUnique({
    where: { id },
    include: {
      objectType: {
        include: {
          fields: {
            orderBy: { order: 'asc' },
            include: { visibleRoles: { include: { role: true } } },
          },
        },
      },
      responsible: {
        include: {
          user: { select: { id: true, email: true, fullName: true } },
        },
      },
      tableRows: true,
    },
  });
  if (!instance) return null;

  const canSeeAll = canEditPassports(currentUser.passportRole);
  const roleName = currentUser.passportRole;

  const visibleFields = instance.objectType.fields.filter((field) => {
    if (canSeeAll) return true;
    if (field.visibleToAll) return true;
    if (!roleName) return false;
    return field.visibleRoles.some((v) => v.role.name === roleName);
  });
  const visibleFieldIds = new Set(visibleFields.map((f) => f.id));

  const rawValues = instance.values as unknown as Record<string, unknown>;
  const values: Record<string, unknown> = {};
  for (const field of visibleFields) {
    if (field.type === 'TABLE') continue;
    if (field.key in rawValues) values[field.key] = rawValues[field.key];
  }

  // IP_REFERENCE values are stored as a bare IpAddress id — resolve them
  // to the address text here, server-side, so the read-only view never
  // has to show a raw uuid (same idea as exportPassportsCsv).
  const ipRefFields = ipReferenceFields(visibleFields);
  if (ipRefFields.length > 0) {
    const ids = ipRefFields
      .map((f) => values[f.key])
      .filter((v): v is string => typeof v === 'string' && v.length > 0);
    const labels = await resolveIpAddressLabels(ids);
    for (const field of ipRefFields) {
      const v = values[field.key];
      if (typeof v === 'string' && v) {
        values[field.key] = labels.get(v)?.address ?? v;
      }
    }
  }

  // Same resolution for OBJECT_REFERENCE values (28 August 2026, CMDB
  // phase 2) — a bare Location or ObjectInstance id, resolved to its
  // display title. Split up front by each field's configured target kind,
  // same reasoning as resolveObjectReferenceLabels's doc comment.
  const objectRefFields = objectReferenceFields(visibleFields);
  if (objectRefFields.length > 0) {
    const locationIds: string[] = [];
    const instanceIds: string[] = [];
    for (const field of objectRefFields) {
      const v = values[field.key];
      if (typeof v !== 'string' || !v) continue;
      (field.referenceTargetKind === 'LOCATION'
        ? locationIds
        : instanceIds
      ).push(v);
    }
    const { locations, instances } = await resolveObjectReferenceLabels(
      locationIds,
      instanceIds,
    );
    for (const field of objectRefFields) {
      const v = values[field.key];
      if (typeof v !== 'string' || !v) continue;
      const label =
        field.referenceTargetKind === 'LOCATION'
          ? locations.get(v)
          : instances.get(v);
      values[field.key] = label?.title ?? v;
    }
  }

  const tableRows = instance.tableRows.filter((r) =>
    visibleFieldIds.has(r.fieldDefinitionId),
  );

  // Same resolution as above, one level down — a TABLE field can have a
  // column of type IP_REFERENCE (26 August 2026), whose cells also store
  // a bare IpAddress id.
  const columnKeysByFieldId = new Map<string, string[]>(
    visibleFields
      .filter((f) => f.type === 'TABLE')
      .map((f) => [f.id, ipReferenceColumnKeys(f)] as const),
  );
  const tableRefIds: string[] = [];
  for (const row of tableRows) {
    const keys = columnKeysByFieldId.get(row.fieldDefinitionId) ?? [];
    if (keys.length === 0) continue;
    const cells = row.cells as unknown as Record<string, unknown>;
    for (const key of keys) {
      const v = cells[key];
      if (typeof v === 'string' && v) tableRefIds.push(v);
    }
  }
  const tableRefLabels =
    tableRefIds.length > 0
      ? await resolveIpAddressLabels(tableRefIds)
      : new Map<string, IpAddressRefLabel>();

  // Same resolution one level further down for OBJECT_REFERENCE table
  // columns (28 August 2026) — mirrors the regular-field block above,
  // split by target kind, over every visible TABLE field's rows at once.
  const objectRefColumnsByFieldId = new Map<string, ObjectReferenceColumn[]>(
    visibleFields
      .filter((f) => f.type === 'TABLE')
      .map((f) => [f.id, objectReferenceColumns(f)] as const),
  );
  const tableObjectRefLocationIds: string[] = [];
  const tableObjectRefInstanceIds: string[] = [];
  for (const row of tableRows) {
    const columns = objectRefColumnsByFieldId.get(row.fieldDefinitionId) ?? [];
    if (columns.length === 0) continue;
    const cells = row.cells as unknown as Record<string, unknown>;
    for (const column of columns) {
      const v = cells[column.key];
      if (typeof v !== 'string' || !v) continue;
      (column.targetKind === 'LOCATION'
        ? tableObjectRefLocationIds
        : tableObjectRefInstanceIds
      ).push(v);
    }
  }
  const tableObjectRefLabels = await resolveObjectReferenceLabels(
    tableObjectRefLocationIds,
    tableObjectRefInstanceIds,
  );

  const resolvedTableRows = tableRows.map((row) => {
    const keys = columnKeysByFieldId.get(row.fieldDefinitionId) ?? [];
    const objectRefColumns =
      objectRefColumnsByFieldId.get(row.fieldDefinitionId) ?? [];
    if (keys.length === 0 && objectRefColumns.length === 0) return row;
    const cells = { ...(row.cells as unknown as Record<string, unknown>) };
    for (const key of keys) {
      const v = cells[key];
      if (typeof v === 'string' && v) {
        cells[key] = tableRefLabels.get(v)?.address ?? v;
      }
    }
    for (const column of objectRefColumns) {
      const v = cells[column.key];
      if (typeof v !== 'string' || !v) continue;
      const label =
        column.targetKind === 'LOCATION'
          ? tableObjectRefLabels.locations.get(v)
          : tableObjectRefLabels.instances.get(v);
      cells[column.key] = label?.title ?? v;
    }
    return { ...row, cells: cells as unknown as typeof row.cells };
  });

  return {
    id: instance.id,
    name: instance.name,
    status: instance.status,
    objectType: {
      id: instance.objectType.id,
      name: instance.objectType.name,
      code: instance.objectType.code,
    },
    fields: visibleFields,
    values,
    tableRows: resolvedTableRows,
    responsible: instance.responsible,
    createdAt: instance.createdAt,
    updatedAt: instance.updatedAt,
    canEdit: canSeeAll,
  };
}

// ─────────────────────────────────────────────
// Жизненный цикл КЕ + аудит-дифф (2 September 2026, CMDB phase 7 — see
// it-passports-design.md section 8.11). Read-only history of a single
// passport's own CREATE/UPDATE audit-log entries, with the structured
// field-level diff each one already carries (see change-log-utils.ts and
// createPassport/updatePassport above) — the counterpart to the generic
// /audit-log page, scoped to one КЕ and rendered with full diff detail
// rather than a one-line summary. Same access level as the card itself
// (requirePassportViewer) — this is just another view of the same data.
// ─────────────────────────────────────────────

export async function getPassportHistory(
  objectInstanceId: string,
): Promise<PassportHistoryEntry[]> {
  const currentUser = await requirePassportViewer();
  if (!currentUser) return [];

  const logs = await prisma.auditLog.findMany({
    where: {
      entity: 'ObjectInstance',
      entityId: objectInstanceId,
      action: { in: ['CREATE', 'UPDATE'] },
    },
    include: { user: { select: { email: true } } },
    orderBy: { createdAt: 'desc' },
  });

  return logs.map((log) => {
    const meta = (log.metadata ?? {}) as Record<string, unknown>;
    const changes = Array.isArray(meta.changes)
      ? (meta.changes as FieldChange[])
      : [];
    return {
      id: log.id,
      action: log.action as 'CREATE' | 'UPDATE',
      actorEmail: log.user?.email ?? null,
      createdAt: log.createdAt,
      changes,
    };
  });
}

// ─────────────────────────────────────────────
// Связи + impact-анализ (1 September 2026, CMDB phase 6 — see
// it-passports-design.md section 8.10). Two read-only additions on top of
// the existing OBJECT_REFERENCE mechanism (section 8.4), which only ever
// showed the *outgoing* side of a link: a passport's own field values, never
// who points back at it.
// ─────────────────────────────────────────────

export type IncomingReference = {
  sourceId: string;
  sourceName: string;
  sourceTypeName: string;
  fieldLabel: string;
  relationshipType: RelationshipType | null;
};

// Every other passport currently pointing AT this one, through a regular
// OBJECT_REFERENCE field or a TABLE column of that type — the reciprocal
// half of what getPassportView already resolves (which only ever follows a
// passport's own fields outward). Two queries, same "two mirror tables"
// split used everywhere else for OBJECT_REFERENCE (see
// object-reference-utils.ts) — both are simple indexed lookups on
// target_object_instance_id, no traversal.
export async function getIncomingReferences(
  objectInstanceId: string,
): Promise<IncomingReference[]> {
  const currentUser = await requirePassportViewer();
  if (!currentUser) return [];

  const [fieldRefs, cellRefs] = await Promise.all([
    prisma.fieldObjectReferenceValue.findMany({
      where: { targetObjectInstanceId: objectInstanceId },
      select: {
        relationshipType: true,
        fieldDefinition: { select: { label: true } },
        objectInstance: {
          select: {
            id: true,
            name: true,
            objectType: { select: { name: true } },
          },
        },
      },
    }),
    prisma.tableCellObjectReferenceValue.findMany({
      where: { targetObjectInstanceId: objectInstanceId },
      select: {
        relationshipType: true,
        tableFieldRow: {
          select: {
            fieldDefinition: { select: { label: true } },
            objectInstance: {
              select: {
                id: true,
                name: true,
                objectType: { select: { name: true } },
              },
            },
          },
        },
      },
    }),
  ]);

  const result: IncomingReference[] = [
    ...fieldRefs.map((r) => ({
      sourceId: r.objectInstance.id,
      sourceName: r.objectInstance.name,
      sourceTypeName: r.objectInstance.objectType.name,
      fieldLabel: r.fieldDefinition.label,
      relationshipType: r.relationshipType,
    })),
    ...cellRefs.map((r) => ({
      sourceId: r.tableFieldRow.objectInstance.id,
      sourceName: r.tableFieldRow.objectInstance.name,
      sourceTypeName: r.tableFieldRow.objectInstance.objectType.name,
      fieldLabel: r.tableFieldRow.fieldDefinition.label,
      relationshipType: r.relationshipType,
    })),
  ];

  result.sort((a, b) => a.sourceName.localeCompare(b.sourceName, 'ru'));
  return result;
}

export type ImpactNode = {
  id: string;
  name: string;
  typeName: string;
  depth: number;
};

export type DirectImpact = {
  id: string;
  name: string;
  typeName: string;
  direction: 'OUTGOING' | 'INCOMING';
};

export type ImpactAnalysis = {
  root: { id: string; name: string; typeName: string };
  // Passports that would be affected if this one stopped working — built by
  // following DEPENDENCY edges *backward* (who points at this passport, or
  // at something that eventually points at it, with relationshipType =
  // DEPENDENCY) — i.e. "who depends on me, transitively".
  downstream: ImpactNode[];
  // Passports this one cannot function without — DEPENDENCY edges followed
  // *forward*, transitively — i.e. "what I depend on".
  upstream: ImpactNode[];
  // Explicit, admin-asserted IMPACT links, both directions — shown as
  // direct edges only, deliberately not traversed transitively (see
  // RelationshipType.IMPACT's doc comment in schema.prisma for why: an
  // admin asserting "A влияет на B" is a one-off judgment call, not
  // necessarily true of whatever B itself affects).
  directImpacts: DirectImpact[];
  truncated: boolean;
};

// How many hops the DEPENDENCY traversal follows before giving up — a
// circuit-breaker against a very long chain or (despite the visited-set
// cycle guard below) a pathological amount of fan-out, not an expected
// limit at this app's scale (~10 thousand pieces of equipment, per
// it-passports-design.md section 8.0 — dependency chains between passports
// are a much smaller subset of that).
const IMPACT_MAX_DEPTH = 8;

// Every DEPENDENCY-typed OBJECT_REFERENCE edge in the system, as a flat
// (from, to) list — "from depends on to". Two queries (regular fields,
// TABLE columns), same split as everywhere else. Cheap thanks to the
// relationship_type index added alongside the denormalized column (see
// schema.prisma) and to relationshipType being copied onto the mirror
// tables at save time, so no join back to field_definitions is needed here.
async function fetchDependencyEdges(): Promise<{ from: string; to: string }[]> {
  const [fieldEdges, cellEdges] = await Promise.all([
    prisma.fieldObjectReferenceValue.findMany({
      where: { relationshipType: 'DEPENDENCY' },
      select: { objectInstanceId: true, targetObjectInstanceId: true },
    }),
    prisma.tableCellObjectReferenceValue.findMany({
      where: { relationshipType: 'DEPENDENCY' },
      select: {
        targetObjectInstanceId: true,
        tableFieldRow: { select: { objectInstanceId: true } },
      },
    }),
  ]);

  const edges: { from: string; to: string }[] = [];
  for (const e of fieldEdges) {
    if (e.targetObjectInstanceId) {
      edges.push({ from: e.objectInstanceId, to: e.targetObjectInstanceId });
    }
  }
  for (const e of cellEdges) {
    if (e.targetObjectInstanceId) {
      edges.push({
        from: e.tableFieldRow.objectInstanceId,
        to: e.targetObjectInstanceId,
      });
    }
  }
  return edges;
}

// Breadth-first traversal of a plain adjacency map, depth-limited and
// cycle-guarded by a visited set (a DEPENDENCY cycle shouldn't exist in a
// well-modeled CMDB, but nothing at the database level forbids one, so this
// has to tolerate it rather than looping forever).
function bfs(
  startId: string,
  adjacency: Map<string, string[]>,
): { result: { id: string; depth: number }[]; truncated: boolean } {
  const visited = new Set<string>([startId]);
  const result: { id: string; depth: number }[] = [];
  let frontier = [startId];
  let depth = 0;
  let truncated = false;
  while (frontier.length > 0) {
    if (depth >= IMPACT_MAX_DEPTH) {
      truncated = frontier.some((id) => (adjacency.get(id) ?? []).length > 0);
      break;
    }
    depth++;
    const next: string[] = [];
    for (const id of frontier) {
      for (const neighbor of adjacency.get(id) ?? []) {
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);
        result.push({ id: neighbor, depth });
        next.push(neighbor);
      }
    }
    frontier = next;
  }
  return { result, truncated };
}

// Powers the impact-analysis page (/passports/[id]/impact) — see
// it-passports-design.md section 8.10 for the reasoning behind traversing
// only DEPENDENCY edges transitively, and treating IMPACT edges as direct,
// non-transitive assertions instead.
export async function getImpactAnalysis(
  objectInstanceId: string,
): Promise<ImpactAnalysis | null> {
  const currentUser = await requirePassportViewer();
  if (!currentUser) return null;

  const root = await prisma.objectInstance.findUnique({
    where: { id: objectInstanceId },
    select: { id: true, name: true, objectType: { select: { name: true } } },
  });
  if (!root) return null;

  const edges = await fetchDependencyEdges();
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();
  for (const e of edges) {
    if (!outgoing.has(e.from)) outgoing.set(e.from, []);
    outgoing.get(e.from)!.push(e.to);
    if (!incoming.has(e.to)) incoming.set(e.to, []);
    incoming.get(e.to)!.push(e.from);
  }

  const downstreamBfs = bfs(objectInstanceId, incoming);
  const upstreamBfs = bfs(objectInstanceId, outgoing);

  const [
    outgoingImpactField,
    incomingImpactField,
    outgoingImpactCell,
    incomingImpactCell,
  ] = await Promise.all([
    prisma.fieldObjectReferenceValue.findMany({
      where: { relationshipType: 'IMPACT', objectInstanceId },
      select: { targetObjectInstanceId: true },
    }),
    prisma.fieldObjectReferenceValue.findMany({
      where: {
        relationshipType: 'IMPACT',
        targetObjectInstanceId: objectInstanceId,
      },
      select: { objectInstanceId: true },
    }),
    prisma.tableCellObjectReferenceValue.findMany({
      where: {
        relationshipType: 'IMPACT',
        tableFieldRow: { objectInstanceId },
      },
      select: { targetObjectInstanceId: true },
    }),
    prisma.tableCellObjectReferenceValue.findMany({
      where: {
        relationshipType: 'IMPACT',
        targetObjectInstanceId: objectInstanceId,
      },
      select: { tableFieldRow: { select: { objectInstanceId: true } } },
    }),
  ]);

  const directImpactIds: { id: string; direction: 'OUTGOING' | 'INCOMING' }[] =
    [
      ...outgoingImpactField
        .filter((r) => r.targetObjectInstanceId)
        .map((r) => ({
          id: r.targetObjectInstanceId as string,
          direction: 'OUTGOING' as const,
        })),
      ...incomingImpactField.map((r) => ({
        id: r.objectInstanceId,
        direction: 'INCOMING' as const,
      })),
      ...outgoingImpactCell
        .filter((r) => r.targetObjectInstanceId)
        .map((r) => ({
          id: r.targetObjectInstanceId as string,
          direction: 'OUTGOING' as const,
        })),
      ...incomingImpactCell.map((r) => ({
        id: r.tableFieldRow.objectInstanceId,
        direction: 'INCOMING' as const,
      })),
    ].filter((d) => d.id !== objectInstanceId);

  const allIds = new Set<string>([
    ...downstreamBfs.result.map((r) => r.id),
    ...upstreamBfs.result.map((r) => r.id),
    ...directImpactIds.map((d) => d.id),
  ]);

  const instances =
    allIds.size > 0
      ? await prisma.objectInstance.findMany({
          where: { id: { in: Array.from(allIds) } },
          select: {
            id: true,
            name: true,
            objectType: { select: { name: true } },
          },
        })
      : [];
  const byId = new Map(instances.map((i) => [i.id, i]));

  function toNode(entry: { id: string; depth: number }): ImpactNode | null {
    const i = byId.get(entry.id);
    if (!i) return null;
    return {
      id: i.id,
      name: i.name,
      typeName: i.objectType.name,
      depth: entry.depth,
    };
  }

  return {
    root: { id: root.id, name: root.name, typeName: root.objectType.name },
    downstream: downstreamBfs.result
      .map(toNode)
      .filter((n): n is ImpactNode => n !== null),
    upstream: upstreamBfs.result
      .map(toNode)
      .filter((n): n is ImpactNode => n !== null),
    directImpacts: directImpactIds
      .map((d) => {
        const i = byId.get(d.id);
        if (!i) return null;
        return {
          id: i.id,
          name: i.name,
          typeName: i.objectType.name,
          direction: d.direction,
        };
      })
      .filter((n): n is DirectImpact => n !== null),
    truncated: downstreamBfs.truncated || upstreamBfs.truncated,
  };
}

export async function getPassportUsers() {
  const currentUser = await requirePassportEditor();
  if (!currentUser) return [];
  return prisma.user.findMany({
    where: { isActive: true },
    orderBy: { email: 'asc' },
    select: { id: true, email: true, fullName: true },
  });
}

// Backs the soft "Это IP-адрес" check on TEXT fields (see
// FieldDefinition.validateAsIp in schema.prisma) — the fill form calls this
// per field, debounced, to show a non-blocking warning when the typed value
// doesn't match any address in IPAM. Deliberately advisory only: this never
// blocks saving a passport, and `address` isn't otherwise normalized here,
// so it relies on the same plain-string comparison IpAddress.address is
// already stored as (@unique, so this is a single indexed lookup).
export async function checkIpAddressKnown(address: string): Promise<boolean> {
  const currentUser = await requirePassportEditor();
  if (!currentUser) return true; // no session — don't surface a false warning
  const trimmed = address.trim();
  if (!trimmed) return true;
  const found = await prisma.ipAddress.findUnique({
    where: { address: trimmed },
    select: { id: true },
  });
  return !!found;
}

export interface IpAddressSuggestion {
  id: string;
  address: string;
  hostname: string | null;
  networkLabel: string;
}

// Prefix search over real IPAM addresses. Powers two different UIs off the
// same query: the autocomplete dropdown under a `validateAsIp` TEXT field
// (a convenience only — that field still stores plain text, see
// checkIpAddressKnown above) and the required picker for an IP_REFERENCE
// field (which stores `id`, the only one of these fields that actually
// needs it).
export async function searchIpAddresses(
  prefix: string,
): Promise<IpAddressSuggestion[]> {
  const currentUser = await requirePassportEditor();
  if (!currentUser) return [];
  const trimmed = prefix.trim();
  if (!trimmed) return [];
  const found = await prisma.ipAddress.findMany({
    where: { address: { startsWith: trimmed } },
    select: {
      id: true,
      address: true,
      hostname: true,
      network: { select: { name: true, cidr: true } },
    },
    orderBy: { address: 'asc' },
    take: 8,
  });
  return found.map((ip) => ({
    id: ip.id,
    address: ip.address,
    hostname: ip.hostname,
    networkLabel: `${ip.network.name} (${ip.network.cidr})`,
  }));
}

// Resolves a passport's currently-selected IP_REFERENCE values (stored as
// IpAddress ids) to display labels — used by the fill form's edit-mode
// initial render, since the raw stored value is just a uuid. Wraps
// resolveIpAddressLabels from ip-reference-utils.ts (shared with
// csv-actions.ts) with the same passport-editor auth check as the rest of
// this file.
export async function getIpAddressLabels(
  ids: string[],
): Promise<Record<string, IpAddressRefLabel>> {
  const currentUser = await requirePassportEditor();
  if (!currentUser) return {};
  const map = await resolveIpAddressLabels(ids);
  return Object.fromEntries(map);
}

// ─────────────────────────────────────────────
// OBJECT_REFERENCE picker support (28 August 2026, CMDB phase 2) — same
// idea as searchIpAddresses/getIpAddressLabels above, generalized to the
// two possible target kinds. A field's target kind (and, for OBJECT_TYPE,
// which type) is fixed by the admin, so the caller always knows up front
// which search to run — there's no single "search anything" endpoint.
// ─────────────────────────────────────────────

export interface LocationReferenceSuggestion {
  id: string;
  name: string;
  code: string;
  kind: string;
  parentName: string | null;
}

export async function searchLocationsForReference(
  prefix: string,
): Promise<LocationReferenceSuggestion[]> {
  const currentUser = await requirePassportEditor();
  if (!currentUser) return [];
  const trimmed = prefix.trim();
  if (!trimmed) return [];
  const found = await prisma.location.findMany({
    where: {
      OR: [
        { name: { contains: trimmed, mode: 'insensitive' } },
        { code: { contains: trimmed, mode: 'insensitive' } },
      ],
    },
    include: { parent: { select: { name: true } } },
    orderBy: { name: 'asc' },
    take: 8,
  });
  return found.map((l) => ({
    id: l.id,
    name: l.name,
    code: l.code,
    kind: l.kind,
    parentName: l.parent?.name ?? null,
  }));
}

export interface ObjectInstanceReferenceSuggestion {
  id: string;
  name: string;
  objectTypeName: string;
  // Surfaced so the picker can flag a decommissioned target (2 September
  // 2026, CMDB phase 7) — linking to one isn't blocked (a historical
  // dependency chain may legitimately reference retired equipment), just
  // labeled so it's not picked by accident.
  status: ObjectInstanceStatus;
}

// Scoped to one ObjectType when the field's configured referenceObjectTypeId
// is set — an OBJECT_TYPE-kind field normally never offers passports of any
// other type. objectTypeId is null when the field is configured for "any
// object type" (31 August 2026, CMDB phase 5, see it-passports-design.md
// section 8.8 — e.g. a patch-cord column, where the other end of a cable
// can be any kind of equipment): in that case the search is unscoped, and
// objectTypeName in the result is what tells the picker which type each
// match actually is.
export async function searchObjectInstancesForReference(
  objectTypeId: string | null,
  prefix: string,
): Promise<ObjectInstanceReferenceSuggestion[]> {
  const currentUser = await requirePassportEditor();
  if (!currentUser) return [];
  const trimmed = prefix.trim();
  if (!trimmed) return [];
  const found = await prisma.objectInstance.findMany({
    where: {
      ...(objectTypeId ? { objectTypeId } : {}),
      name: { contains: trimmed, mode: 'insensitive' },
    },
    include: { objectType: { select: { name: true } } },
    orderBy: { name: 'asc' },
    take: 8,
  });
  return found.map((i) => ({
    id: i.id,
    name: i.name,
    objectTypeName: i.objectType.name,
    status: i.status,
  }));
}

// Resolves a passport's currently-selected OBJECT_REFERENCE values (a mix
// of Location ids and ObjectInstance ids, depending on each field's
// configured kind) to display labels in one batch — used by the fill
// form's edit-mode initial render, mirroring getIpAddressLabels above.
export async function getObjectReferenceLabels(
  locationIds: string[],
  objectInstanceIds: string[],
): Promise<{
  locations: Record<string, ObjectReferenceLabel>;
  instances: Record<string, ObjectReferenceLabel>;
}> {
  const currentUser = await requirePassportEditor();
  if (!currentUser) return { locations: {}, instances: {} };
  const { locations, instances } = await resolveObjectReferenceLabels(
    locationIds,
    objectInstanceIds,
  );
  return {
    locations: Object.fromEntries(locations),
    instances: Object.fromEntries(instances),
  };
}

// ─────────────────────────────────────────────
// Create / update / delete
//
// Validation (validatePassportValues) now lives in validate-values.ts —
// shared with csv-actions.ts, which can't import it from here since a
// 'use server' file may only export async functions.
// ─────────────────────────────────────────────

type PassportInput = {
  objectTypeId: string;
  name: string;
  status: ObjectInstanceStatus;
  values: Record<string, unknown>;
  tableRows: Record<string, { cells: Record<string, unknown> }[]>;
  responsibleUserIds: string[];
};

export async function createPassport(
  input: PassportInput,
): Promise<ActionResult<{ id: string }>> {
  const currentUser = await requirePassportEditor();
  if (!currentUser) {
    return {
      ok: false,
      message: 'You do not have permission to perform this action.',
    };
  }

  const name = input.name.trim();
  if (!name) {
    return { ok: false, fieldErrors: { name: 'Укажите название КЕ' } };
  }

  const objectType = await prisma.objectType.findUnique({
    where: { id: input.objectTypeId },
    include: { fields: true },
  });
  if (!objectType) {
    return { ok: false, message: 'Тип объекта не найден' };
  }

  const validated = validatePassportValues(
    objectType.fields,
    input.values,
    input.tableRows,
  );
  if (!validated.ok) {
    return { ok: false, fieldErrors: validated.fieldErrors };
  }

  const ipRefFields = ipReferenceFields(objectType.fields);
  const objectRefFields = objectReferenceFields(objectType.fields);
  const tableFields = objectType.fields.filter((f) => f.type === 'TABLE');
  const [
    ipRefErrors,
    tableIpRefErrors,
    objectRefErrors,
    tableObjectRefErrors,
    uniqueTargetErrors,
  ] = await Promise.all([
    validateIpReferenceValues(ipRefFields, validated.data.values),
    validateTableIpReferenceValues(tableFields, validated.data.tableRows),
    validateObjectReferenceValues(objectRefFields, validated.data.values),
    validateTableObjectReferenceValues(tableFields, validated.data.tableRows),
    validateUniqueObjectReferenceTargets(
      objectRefFields,
      validated.data.values,
      null,
    ),
  ]);
  // No existing passport yet, so no AUTO_IDENTIFIER/VM_IDENTIFIER value can
  // already be generated — every such field on this type needs its source
  // fields filled in.
  const autoIdErrors = validateAutoIdentifierRackValues(
    objectType.fields,
    validated.data.values,
    null,
  );
  const vmIdErrors = validateVmIdentifierFields(
    objectType.fields,
    validated.data.values,
    null,
  );
  const combinedIpRefErrors = {
    ...ipRefErrors,
    ...tableIpRefErrors,
    ...objectRefErrors,
    ...tableObjectRefErrors,
    ...uniqueTargetErrors,
    ...autoIdErrors,
    ...vmIdErrors,
  };
  if (Object.keys(combinedIpRefErrors).length > 0) {
    return { ok: false, fieldErrors: combinedIpRefErrors };
  }

  const tableFieldByKey = new Map(tableFields.map((f) => [f.key, f] as const));
  const autoIdFields = autoIdentifierFields(objectType.fields);
  const vmIdFields = vmIdentifierFields(objectType.fields);

  try {
    const instance = await prisma.$transaction(async (tx) => {
      const created = await tx.objectInstance.create({
        data: {
          objectTypeId: objectType.id,
          name,
          status: input.status,
          values: validated.data.values as Prisma.InputJsonValue,
          createdById: currentUser.id,
          responsible: {
            create: input.responsibleUserIds.map((userId) => ({ userId })),
          },
        },
      });

      for (const [key, rows] of Object.entries(validated.data.tableRows)) {
        const field = tableFieldByKey.get(key);
        if (!field || rows.length === 0) continue;
        await tx.tableFieldRow.createMany({
          data: rows.map((cells, index) => ({
            objectInstanceId: created.id,
            fieldDefinitionId: field.id,
            rowOrder: index,
            cells: cells as Prisma.InputJsonValue,
          })),
        });
      }

      await syncFieldIpAddressLinks(
        tx,
        created.id,
        ipRefFields,
        validated.data.values,
      );
      await syncFieldObjectReferenceLinks(
        tx,
        created.id,
        objectRefFields,
        validated.data.values,
      );
      // Runs after the table rows above are inserted — needs their real
      // ids, see syncTableCellIpAddressLinks's doc comment.
      await syncTableCellIpAddressLinks(tx, created.id, tableFields);
      await syncTableCellObjectReferenceLinks(tx, created.id, tableFields);

      if (autoIdFields.length > 0 || vmIdFields.length > 0) {
        // Needs created.id, so this can only run after the create above —
        // mutates validated.data.values in place, then that has to be
        // persisted with a follow-up write, since the initial create above
        // never had these keys in its `values` (see
        // validatePassportValues's AUTO_IDENTIFIER/VM_IDENTIFIER branch).
        await syncAutoIdentifierValues(
          tx,
          created.id,
          objectType.fields,
          validated.data.values,
          null,
        );
        await syncVmIdentifierValue(
          tx,
          created.id,
          objectType.fields,
          validated.data.values,
          null,
        );
        await tx.objectInstance.update({
          where: { id: created.id },
          data: { values: validated.data.values as Prisma.InputJsonValue },
        });
      }

      return created;
    });

    await writeAudit('CREATE', instance.id, currentUser.id, {
      name: instance.name,
      objectTypeId: objectType.id,
      status: instance.status,
    });
    revalidatePath('/passports');
    return {
      ok: true,
      message: 'КЕ создана',
      data: { id: instance.id },
    };
  } catch {
    return { ok: false, message: 'Не удалось создать КЕ' };
  }
}

type PassportUpdateInput = Omit<PassportInput, 'objectTypeId'>;

export async function updatePassport(
  id: string,
  input: PassportUpdateInput,
): Promise<ActionResult> {
  const currentUser = await requirePassportEditor();
  if (!currentUser) {
    return {
      ok: false,
      message: 'You do not have permission to perform this action.',
    };
  }

  const name = input.name.trim();
  if (!name) {
    return { ok: false, fieldErrors: { name: 'Укажите название КЕ' } };
  }

  const existing = await prisma.objectInstance.findUnique({
    where: { id },
    include: {
      objectType: { include: { fields: true } },
      responsible: {
        include: {
          user: { select: { id: true, email: true, fullName: true } },
        },
      },
      tableRows: { select: { fieldDefinitionId: true, cells: true } },
    },
  });
  if (!existing) {
    return { ok: false, message: 'КЕ не найдена' };
  }

  const validated = validatePassportValues(
    existing.objectType.fields,
    input.values,
    input.tableRows,
  );
  if (!validated.ok) {
    return { ok: false, fieldErrors: validated.fieldErrors };
  }

  const ipRefFields = ipReferenceFields(existing.objectType.fields);
  const objectRefFields = objectReferenceFields(existing.objectType.fields);
  const tableFields = existing.objectType.fields.filter(
    (f) => f.type === 'TABLE',
  );
  const existingValues = existing.values as unknown as Record<string, unknown>;
  const [
    ipRefErrors,
    tableIpRefErrors,
    objectRefErrors,
    tableObjectRefErrors,
    uniqueTargetErrors,
  ] = await Promise.all([
    validateIpReferenceValues(ipRefFields, validated.data.values),
    validateTableIpReferenceValues(tableFields, validated.data.tableRows),
    validateObjectReferenceValues(objectRefFields, validated.data.values),
    validateTableObjectReferenceValues(tableFields, validated.data.tableRows),
    validateUniqueObjectReferenceTargets(
      objectRefFields,
      validated.data.values,
      id,
    ),
  ]);
  // Fields that already have a generated value (existingValues) are
  // skipped — editing the rack/cluster afterward doesn't retroactively
  // invalidate an already-assigned identifier, see
  // syncAutoIdentifierValues/syncVmIdentifierValue.
  const autoIdErrors = validateAutoIdentifierRackValues(
    existing.objectType.fields,
    validated.data.values,
    existingValues,
  );
  const vmIdErrors = validateVmIdentifierFields(
    existing.objectType.fields,
    validated.data.values,
    existingValues,
  );
  const combinedIpRefErrors = {
    ...ipRefErrors,
    ...tableIpRefErrors,
    ...objectRefErrors,
    ...tableObjectRefErrors,
    ...uniqueTargetErrors,
    ...autoIdErrors,
    ...vmIdErrors,
  };
  if (Object.keys(combinedIpRefErrors).length > 0) {
    return { ok: false, fieldErrors: combinedIpRefErrors };
  }

  const tableFieldByKey = new Map(tableFields.map((f) => [f.key, f] as const));
  const autoIdFields = autoIdentifierFields(existing.objectType.fields);
  const vmIdFields = vmIdentifierFields(existing.objectType.fields);

  // Structured change history (2 September 2026, CMDB phase 7) — computed
  // from the *old* state fetched above, before anything is written. Has to
  // happen before the transaction below, since that overwrites the very
  // values being diffed against.
  const oldResponsibleIds = new Set(existing.responsible.map((r) => r.userId));
  const newResponsibleIds = new Set(input.responsibleUserIds);
  const responsibleUsers = await prisma.user.findMany({
    where: {
      id: {
        in: Array.from(
          new Set([
            ...Array.from(oldResponsibleIds),
            ...Array.from(newResponsibleIds),
          ]),
        ),
      },
    },
    select: { id: true, email: true, fullName: true },
  });
  const responsibleLabelById = new Map<string, string>(
    responsibleUsers.map(
      (u) => [u.id, (u.fullName || u.email) as string] as const,
    ),
  );
  const oldResponsible = existing.responsible.map((r) => ({
    id: r.userId,
    label:
      responsibleLabelById.get(r.userId) ??
      ((r.user.fullName || r.user.email) as string),
  }));
  const newResponsible = input.responsibleUserIds.map((userId) => ({
    id: userId,
    label: responsibleLabelById.get(userId) ?? userId,
  }));

  const oldTableRowsByFieldId = new Map<string, unknown[]>();
  for (const row of existing.tableRows) {
    const arr = oldTableRowsByFieldId.get(row.fieldDefinitionId) ?? [];
    arr.push(row.cells);
    oldTableRowsByFieldId.set(row.fieldDefinitionId, arr);
  }
  const newTableRowsByFieldId = new Map<string, unknown[]>();
  for (const [key, rows] of Object.entries(validated.data.tableRows)) {
    const field = tableFieldByKey.get(key);
    if (!field) continue;
    newTableRowsByFieldId.set(
      field.id,
      rows.map((r) => r.cells),
    );
  }

  const changes: FieldChange[] = [
    ...(await buildFieldChanges({
      fields: existing.objectType.fields,
      oldName: existing.name,
      newName: name,
      oldStatus: existing.status,
      newStatus: input.status,
      statusLabels: OBJECT_INSTANCE_STATUS_LABELS,
      oldResponsible,
      newResponsible,
      oldValues: existingValues,
      newValues: validated.data.values,
    })),
    ...buildTableFieldChanges(
      tableFields,
      oldTableRowsByFieldId,
      newTableRowsByFieldId,
    ),
  ];

  try {
    await prisma.$transaction(async (tx) => {
      await tx.objectInstance.update({
        where: { id },
        data: {
          name,
          status: input.status,
          values: validated.data.values as Prisma.InputJsonValue,
        },
      });

      await syncFieldIpAddressLinks(tx, id, ipRefFields, validated.data.values);
      await syncFieldObjectReferenceLinks(
        tx,
        id,
        objectRefFields,
        validated.data.values,
      );

      // Responsible users and table rows are both replaced wholesale
      // rather than diffed — same approach as FieldVisibility in the form
      // builder (app/(app)/object-types/actions.ts): simpler, and the sets
      // involved are small.
      await tx.objectInstanceResponsible.deleteMany({
        where: { objectInstanceId: id },
      });
      if (input.responsibleUserIds.length > 0) {
        await tx.objectInstanceResponsible.createMany({
          data: input.responsibleUserIds.map((userId) => ({
            objectInstanceId: id,
            userId,
          })),
        });
      }

      await tx.tableFieldRow.deleteMany({ where: { objectInstanceId: id } });
      for (const [key, rows] of Object.entries(validated.data.tableRows)) {
        const field = tableFieldByKey.get(key);
        if (!field || rows.length === 0) continue;
        await tx.tableFieldRow.createMany({
          data: rows.map((cells, index) => ({
            objectInstanceId: id,
            fieldDefinitionId: field.id,
            rowOrder: index,
            cells: cells as Prisma.InputJsonValue,
          })),
        });
      }
      // Runs after the table rows above are (re)inserted — needs their
      // real (freshly-generated) ids, see syncTableCellIpAddressLinks's
      // doc comment. The deleteMany just above already cascaded away any
      // old links for this passport's previous rows.
      await syncTableCellIpAddressLinks(tx, id, tableFields);
      await syncTableCellObjectReferenceLinks(tx, id, tableFields);

      if (autoIdFields.length > 0 || vmIdFields.length > 0) {
        // The initial update above never had these keys in `values` (see
        // validatePassportValues's AUTO_IDENTIFIER/VM_IDENTIFIER branch) —
        // mutate them in and persist with a follow-up write, same as
        // createPassport.
        await syncAutoIdentifierValues(
          tx,
          id,
          existing.objectType.fields,
          validated.data.values,
          existingValues,
        );
        await syncVmIdentifierValue(
          tx,
          id,
          existing.objectType.fields,
          validated.data.values,
          existingValues,
        );
        await tx.objectInstance.update({
          where: { id },
          data: { values: validated.data.values as Prisma.InputJsonValue },
        });
      }
    });

    await writeAudit('UPDATE', id, currentUser.id, { name, changes });
    revalidatePath('/passports');
    revalidatePath(`/passports/${id}`);
    return { ok: true, message: 'КЕ обновлена' };
  } catch {
    return { ok: false, message: 'Не удалось обновить КЕ' };
  }
}

export async function deletePassport(id: string): Promise<ActionResult> {
  const currentUser = await requirePassportEditor();
  if (!currentUser) {
    return {
      ok: false,
      message: 'You do not have permission to perform this action.',
    };
  }

  const existing = await prisma.objectInstance.findUnique({ where: { id } });
  if (!existing) {
    return { ok: false, message: 'КЕ не найдена' };
  }

  // An OBJECT_REFERENCE field (or column) on another passport can point at
  // this one as a real foreign key (onDelete: Restrict — see
  // FieldObjectReferenceValue/TableCellObjectReferenceValue in
  // schema.prisma), so deleting a referenced passport would otherwise fail
  // with a raw Prisma FK error. Check both first and name the passport(s)
  // instead — same pattern as deleteIpAddress in ip-addresses/actions.ts.
  // A VM_IDENTIFIER value on another passport can point at this one as a
  // real foreign key too (onDelete: Restrict on targetClusterInstanceId —
  // see FieldVmIdentifierValue in schema.prisma) — same reasoning as the
  // OBJECT_REFERENCE checks above, checked separately since it isn't
  // backed by FieldObjectReferenceValue/TableCellObjectReferenceValue.
  const [links, tableCellLinks, vmIdentifierLinks] = await Promise.all([
    prisma.fieldObjectReferenceValue.findMany({
      where: { targetObjectInstanceId: id },
      take: 5,
      include: { objectInstance: { select: { name: true } } },
    }),
    prisma.tableCellObjectReferenceValue.findMany({
      where: { targetObjectInstanceId: id },
      take: 5,
      include: {
        tableFieldRow: {
          include: { objectInstance: { select: { name: true } } },
        },
      },
    }),
    prisma.fieldVmIdentifierValue.findMany({
      where: { targetClusterInstanceId: id },
      take: 5,
      include: { objectInstance: { select: { name: true } } },
    }),
  ]);
  if (
    links.length > 0 ||
    tableCellLinks.length > 0 ||
    vmIdentifierLinks.length > 0
  ) {
    const names = Array.from(
      new Set([
        ...links.map((l) => l.objectInstance.name),
        ...tableCellLinks.map((l) => l.tableFieldRow.objectInstance.name),
        ...vmIdentifierLinks.map((l) => l.objectInstance.name),
      ]),
    );
    return {
      ok: false,
      message: `Эта КЕ используется в другой КЕ: ${names.join(', ')} — сначала удалите ссылку там`,
    };
  }

  try {
    // Cascades to ObjectInstanceResponsible and TableFieldRow rows via the
    // schema's onDelete: Cascade.
    await prisma.objectInstance.delete({ where: { id } });
    await writeAudit('DELETE', id, currentUser.id, {
      name: existing.name,
      status: existing.status,
    });
    revalidatePath('/passports');
    return { ok: true, message: 'КЕ удалена' };
  } catch {
    return { ok: false, message: 'Не удалось удалить КЕ' };
  }
}
