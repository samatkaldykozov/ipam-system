import type { FieldDefinition, Prisma, RelationshipType } from '@prisma/client';

import { prisma } from '@/lib/prisma';

// Shared by both actions.ts (create/update passport) — generalizes
// ip-reference-utils.ts (28 August 2026, CMDB phase 2 — see
// it-passports-design.md section 8) from IpAddress-only targets to any
// CMDB object: a Location tree node (containment) or another passport
// (dependency). Deliberately NOT wired into csv-actions.ts — see the
// module comment there on why OBJECT_REFERENCE fields are excluded from
// CSV import/export entirely, the same way TABLE fields already are.
//
// A field's target kind (LOCATION or OBJECT_TYPE) is fixed by the admin at
// FieldDefinition.referenceTargetKind, not chosen per value — so, exactly
// like IP_REFERENCE, the value stored in ObjectInstance.values is just the
// target's bare id (a string). FieldObjectReferenceValue is the real
// relational mirror of that id, in one of two mutually-exclusive columns
// depending on the field's configured kind — see its doc comment in
// schema.prisma for the CHECK constraint that enforces this at the DB
// level.

export function objectReferenceFields(fields: FieldDefinition[]) {
  return fields.filter((f) => f.type === 'OBJECT_REFERENCE');
}

// Given the ids referenced this save (already validated to exist and match
// their field's configured target — see validateObjectReferenceValues
// below), replaces this passport's link rows wholesale. Same "delete then
// recreate" approach as syncFieldIpAddressLinks.
export async function syncFieldObjectReferenceLinks(
  tx: Prisma.TransactionClient,
  objectInstanceId: string,
  refFields: FieldDefinition[],
  values: Record<string, unknown>,
): Promise<void> {
  await tx.fieldObjectReferenceValue.deleteMany({
    where: { objectInstanceId },
  });
  if (refFields.length === 0) return;

  const rows = refFields
    .map((field) => {
      const raw = values[field.key];
      if (typeof raw !== 'string' || !raw) return null;
      return field.referenceTargetKind === 'LOCATION'
        ? {
            objectInstanceId,
            fieldDefinitionId: field.id,
            targetLocationId: raw,
            targetObjectInstanceId: null,
            relationshipType: null,
          }
        : {
            objectInstanceId,
            fieldDefinitionId: field.id,
            targetLocationId: null,
            targetObjectInstanceId: raw,
            // Denormalized copy for getImpactAnalysis (1 September 2026, CMDB
            // phase 6) — see FieldObjectReferenceValue.relationshipType's doc
            // comment in schema.prisma. Falls back to ASSOCIATION for fields
            // saved before this column existed on the field itself, though in
            // practice the migration backfilled every existing OBJECT_TYPE-
            // target field, so field.relationshipType should already be set.
            relationshipType: field.relationshipType ?? 'ASSOCIATION',
          };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (rows.length > 0) {
    await tx.fieldObjectReferenceValue.createMany({ data: rows });
  }
}

// Pre-check run before the transaction: every non-empty OBJECT_REFERENCE
// value must be the id of a real target of the field's configured kind —
// a Location row for LOCATION, or an ObjectInstance of the configured
// ObjectType for OBJECT_TYPE — or the transaction would fail on the
// mirror table's FK/CHECK with an unfriendly raw error.
export async function validateObjectReferenceValues(
  refFields: FieldDefinition[],
  values: Record<string, unknown>,
): Promise<Record<string, string>> {
  const wanted = refFields
    .map((field) => {
      const raw = values[field.key];
      return typeof raw === 'string' && raw ? { field, targetId: raw } : null;
    })
    .filter((w): w is NonNullable<typeof w> => w !== null);

  if (wanted.length === 0) return {};

  const locationIds = wanted
    .filter((w) => w.field.referenceTargetKind === 'LOCATION')
    .map((w) => w.targetId);
  const instanceWanted = wanted.filter(
    (w) => w.field.referenceTargetKind !== 'LOCATION',
  );

  const [foundLocations, foundInstances] = await Promise.all([
    locationIds.length > 0
      ? prisma.location.findMany({
          where: { id: { in: locationIds } },
          select: { id: true },
        })
      : Promise.resolve([]),
    instanceWanted.length > 0
      ? prisma.objectInstance.findMany({
          where: { id: { in: instanceWanted.map((w) => w.targetId) } },
          select: { id: true, objectTypeId: true },
        })
      : Promise.resolve([]),
  ]);
  const foundLocationIds = new Set(foundLocations.map((l) => l.id));
  const instanceById = new Map(foundInstances.map((i) => [i.id, i]));

  const fieldErrors: Record<string, string> = {};
  for (const { field, targetId } of wanted) {
    if (field.referenceTargetKind === 'LOCATION') {
      if (!foundLocationIds.has(targetId)) {
        fieldErrors[field.key] =
          `«${field.label}»: выбранного узла больше нет в дереве локаций — выберите другой`;
      }
      continue;
    }
    const instance = instanceById.get(targetId);
    if (!instance) {
      fieldErrors[field.key] =
        `«${field.label}»: выбранный паспорт больше не существует — выберите другой`;
    } else if (
      field.referenceObjectTypeId &&
      instance.objectTypeId !== field.referenceObjectTypeId
    ) {
      fieldErrors[field.key] =
        `«${field.label}»: выбранный паспорт не того типа — выберите другой`;
    }
  }
  return fieldErrors;
}

// ─────────────────────────────────────────────
// TABLE-column counterpart — a TABLE field can have a column of type
// OBJECT_REFERENCE (see TABLE_COLUMN_TYPES in lib/validations.ts). Cell
// values are still a bare target id stored in TableFieldRow.cells JSON;
// TableCellObjectReferenceValue is the real relational mirror, one row per
// (table row, column) — see schema.prisma's doc comment on that model.
// ─────────────────────────────────────────────

// Minimal shape of a TABLE field's column metadata needed here — enough to
// find OBJECT_REFERENCE columns and their configured target without
// importing the full TableColumnDef type (object-types/types.ts).
type TableColumnLike = {
  key: string;
  type: string;
  referenceTargetKind?: string | null;
  referenceObjectTypeId?: string | null;
  relationshipType?: string | null;
};

function parseTableColumns(raw: unknown): TableColumnLike[] {
  return Array.isArray(raw) ? (raw as TableColumnLike[]) : [];
}

export interface ObjectReferenceColumn {
  key: string;
  targetKind: 'LOCATION' | 'OBJECT_TYPE';
  referenceObjectTypeId: string | null;
  // Null for targetKind LOCATION (containment via the location tree, never
  // classified — see RelationshipType's doc comment in schema.prisma);
  // falls back to ASSOCIATION for targetKind OBJECT_TYPE columns saved
  // before this key existed in the stored JSON (1 September 2026, CMDB
  // phase 6), same reasoning as syncFieldObjectReferenceLinks's fallback.
  relationshipType: RelationshipType | null;
}

// The OBJECT_REFERENCE columns of one TABLE field, read from its stored
// `tableColumns` JSON metadata, with their configured target.
export function objectReferenceColumns(
  field: FieldDefinition,
): ObjectReferenceColumn[] {
  return parseTableColumns(field.tableColumns)
    .filter((c) => c.type === 'OBJECT_REFERENCE')
    .map((c) => {
      const targetKind =
        (c.referenceTargetKind as 'LOCATION' | 'OBJECT_TYPE') ?? 'LOCATION';
      return {
        key: c.key,
        targetKind,
        referenceObjectTypeId: c.referenceObjectTypeId ?? null,
        relationshipType:
          targetKind === 'OBJECT_TYPE'
            ? ((c.relationshipType as RelationshipType | null | undefined) ??
              'ASSOCIATION')
            : null,
      };
    });
}

// Same idea as objectReferenceColumns, but just the key list — used where
// only membership matters (e.g. deciding whether a TABLE field needs any
// object-reference handling at all).
export function objectReferenceColumnKeys(field: FieldDefinition): string[] {
  return objectReferenceColumns(field).map((c) => c.key);
}

// Pre-check run before the transaction, mirroring validateObjectReferenceValues
// above but over every row of every TABLE field. tableRowsByFieldKey is
// validate-values.ts's ValidatedPassportData.tableRows.
export async function validateTableObjectReferenceValues(
  tableFields: FieldDefinition[],
  tableRowsByFieldKey: Record<string, Record<string, unknown>[]>,
): Promise<Record<string, string>> {
  const wanted: {
    fieldKey: string;
    fieldLabel: string;
    rowIndex: number;
    column: ObjectReferenceColumn;
    targetId: string;
  }[] = [];

  for (const field of tableFields) {
    const columns = objectReferenceColumns(field);
    if (columns.length === 0) continue;
    const rows = tableRowsByFieldKey[field.key] ?? [];
    rows.forEach((row, rowIndex) => {
      for (const column of columns) {
        const raw = row[column.key];
        if (typeof raw === 'string' && raw) {
          wanted.push({
            fieldKey: field.key,
            fieldLabel: field.label,
            rowIndex,
            column,
            targetId: raw,
          });
        }
      }
    });
  }
  if (wanted.length === 0) return {};

  const locationIds = wanted
    .filter((w) => w.column.targetKind === 'LOCATION')
    .map((w) => w.targetId);
  const instanceWanted = wanted.filter(
    (w) => w.column.targetKind !== 'LOCATION',
  );

  const [foundLocations, foundInstances] = await Promise.all([
    locationIds.length > 0
      ? prisma.location.findMany({
          where: { id: { in: locationIds } },
          select: { id: true },
        })
      : Promise.resolve([]),
    instanceWanted.length > 0
      ? prisma.objectInstance.findMany({
          where: { id: { in: instanceWanted.map((w) => w.targetId) } },
          select: { id: true, objectTypeId: true },
        })
      : Promise.resolve([]),
  ]);
  const foundLocationIds = new Set(foundLocations.map((l) => l.id));
  const instanceById = new Map(foundInstances.map((i) => [i.id, i]));

  const fieldErrors: Record<string, string> = {};
  for (const w of wanted) {
    if (fieldErrors[w.fieldKey]) continue;
    if (w.column.targetKind === 'LOCATION') {
      if (!foundLocationIds.has(w.targetId)) {
        fieldErrors[w.fieldKey] =
          `«${w.fieldLabel}», строка ${w.rowIndex + 1}: выбранного узла больше нет в дереве локаций — выберите другой`;
      }
      continue;
    }
    const instance = instanceById.get(w.targetId);
    if (!instance) {
      fieldErrors[w.fieldKey] =
        `«${w.fieldLabel}», строка ${w.rowIndex + 1}: выбранный паспорт больше не существует — выберите другой`;
    } else if (
      w.column.referenceObjectTypeId &&
      instance.objectTypeId !== w.column.referenceObjectTypeId
    ) {
      fieldErrors[w.fieldKey] =
        `«${w.fieldLabel}», строка ${w.rowIndex + 1}: выбранный паспорт не того типа — выберите другой`;
    }
  }
  return fieldErrors;
}

// Run inside the same transaction, AFTER this save's TableFieldRow rows
// have been (re)created — needs their real ids. Mirrors
// syncTableCellIpAddressLinks's doc comment on ordering/no-explicit-delete.
export async function syncTableCellObjectReferenceLinks(
  tx: Prisma.TransactionClient,
  objectInstanceId: string,
  tableFields: FieldDefinition[],
): Promise<void> {
  const refTableFields = tableFields.filter(
    (f) => objectReferenceColumns(f).length > 0,
  );
  if (refTableFields.length === 0) return;

  const columnsByFieldId = new Map(
    refTableFields.map((f) => [f.id, objectReferenceColumns(f)]),
  );

  const rows = await tx.tableFieldRow.findMany({
    where: {
      objectInstanceId,
      fieldDefinitionId: { in: refTableFields.map((f) => f.id) },
    },
    select: { id: true, fieldDefinitionId: true, cells: true },
  });

  const links = rows.flatMap((row) => {
    const columns = columnsByFieldId.get(row.fieldDefinitionId) ?? [];
    const cells = row.cells as unknown as Record<string, unknown>;
    return columns
      .map((column) => {
        const raw = cells[column.key];
        if (typeof raw !== 'string' || !raw) return null;
        return column.targetKind === 'LOCATION'
          ? {
              tableFieldRowId: row.id,
              columnKey: column.key,
              targetLocationId: raw,
              targetObjectInstanceId: null,
              relationshipType: null,
            }
          : {
              tableFieldRowId: row.id,
              columnKey: column.key,
              targetLocationId: null,
              targetObjectInstanceId: raw,
              relationshipType: column.relationshipType,
            };
      })
      .filter((link): link is NonNullable<typeof link> => link !== null);
  });

  if (links.length > 0) {
    await tx.tableCellObjectReferenceValue.createMany({ data: links });
  }
}

// ─────────────────────────────────────────────
// Label resolution — display support
// ─────────────────────────────────────────────

export interface ObjectReferenceLabel {
  id: string;
  title: string;
  subtitle: string;
}

// Resolves a batch of Location ids and a batch of ObjectInstance ids to
// display labels in one pass (two queries) — used both by the fill form
// (to show the currently selected target in edit mode, since the stored
// value is just an id) and by the read-only passport view / a future CSV
// export. Kept as two separate maps rather than one keyed purely by id: a
// consumer always knows which pool an id belongs to from the owning
// field's configured targetKind, so there's no ambiguity, and this avoids
// ever needing to guess which kind an id is from the id alone.
export async function resolveObjectReferenceLabels(
  locationIds: string[],
  objectInstanceIds: string[],
): Promise<{
  locations: Map<string, ObjectReferenceLabel>;
  instances: Map<string, ObjectReferenceLabel>;
}> {
  const uniqueLocationIds = Array.from(new Set(locationIds)).filter(Boolean);
  const uniqueInstanceIds = Array.from(new Set(objectInstanceIds)).filter(
    Boolean,
  );

  const [foundLocations, foundInstances] = await Promise.all([
    uniqueLocationIds.length > 0
      ? prisma.location.findMany({
          where: { id: { in: uniqueLocationIds } },
          select: { id: true, name: true, code: true, kind: true },
        })
      : Promise.resolve([]),
    uniqueInstanceIds.length > 0
      ? prisma.objectInstance.findMany({
          where: { id: { in: uniqueInstanceIds } },
          select: {
            id: true,
            name: true,
            objectType: { select: { name: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  return {
    locations: new Map(
      foundLocations.map((l) => [
        l.id,
        { id: l.id, title: l.name, subtitle: `${l.code} · ${l.kind}` },
      ]),
    ),
    instances: new Map(
      foundInstances.map((i) => [
        i.id,
        { id: i.id, title: i.name, subtitle: i.objectType.name },
      ]),
    ),
  };
}
