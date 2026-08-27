import type { FieldDefinition, Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';

// Shared by both actions.ts (create/update passport, form-driven) and
// csv-actions.ts (bulk import) — same reason validate-values.ts is a plain
// module and not 'use server': a 'use server' file may only export async
// functions, so this cross-file logic has to live outside either of them.
//
// FieldType.IP_REFERENCE fields store the *id* of the referenced IpAddress
// under their key in ObjectInstance.values (same "one JSON blob" pattern as
// every other field type), but FieldIpAddressValue is the real relational
// mirror of that — see schema.prisma's doc comment on that model. Every
// write path that can set an IP_REFERENCE field's value must keep both in
// sync, which is what syncFieldIpAddressLinks below does.

export function ipReferenceFields(fields: FieldDefinition[]) {
  return fields.filter((f) => f.type === 'IP_REFERENCE');
}

// Given the ids referenced this save (already validated to exist — see
// validateIpReferenceValues below), replaces this passport's link rows
// wholesale. Same "delete then recreate" approach already used for
// TableFieldRow/ObjectInstanceResponsible in actions.ts — the sets
// involved are small (one row per IP_REFERENCE field on the object type).
export async function syncFieldIpAddressLinks(
  tx: Prisma.TransactionClient,
  objectInstanceId: string,
  ipRefFields: FieldDefinition[],
  values: Record<string, unknown>,
): Promise<void> {
  await tx.fieldIpAddressValue.deleteMany({ where: { objectInstanceId } });
  if (ipRefFields.length === 0) return;

  const rows = ipRefFields
    .map((field) => {
      const raw = values[field.key];
      return typeof raw === 'string' && raw
        ? { objectInstanceId, fieldDefinitionId: field.id, ipAddressId: raw }
        : null;
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (rows.length > 0) {
    await tx.fieldIpAddressValue.createMany({ data: rows });
  }
}

// Pre-check run before the transaction: every non-empty IP_REFERENCE value
// must be the id of a real IpAddress row, or the transaction would fail on
// the FieldIpAddressValue FK with an unfriendly raw error. Returns field
// errors keyed the same way as validate-values.ts's ValidatePassportValuesResult.
export async function validateIpReferenceValues(
  ipRefFields: FieldDefinition[],
  values: Record<string, unknown>,
): Promise<Record<string, string>> {
  const wanted = ipRefFields
    .map((field) => {
      const raw = values[field.key];
      return typeof raw === 'string' && raw
        ? { field, ipAddressId: raw }
        : null;
    })
    .filter((w): w is NonNullable<typeof w> => w !== null);

  if (wanted.length === 0) return {};

  const found = await prisma.ipAddress.findMany({
    where: { id: { in: wanted.map((w) => w.ipAddressId) } },
    select: { id: true },
  });
  const foundIds = new Set(found.map((f) => f.id));

  const fieldErrors: Record<string, string> = {};
  for (const { field, ipAddressId } of wanted) {
    if (!foundIds.has(ipAddressId)) {
      fieldErrors[field.key] =
        `«${field.label}»: выбранного IP-адреса больше нет в IPAM — выберите другой`;
    }
  }
  return fieldErrors;
}

// ─────────────────────────────────────────────
// TABLE-column counterpart (26 August 2026) — a TABLE field can have a
// column of type IP_REFERENCE (see TABLE_COLUMN_TYPES in
// lib/validations.ts). The cell's value is still an IpAddress id stored
// in TableFieldRow.cells JSON, same "one JSON blob" pattern as everywhere
// else; TableCellIpAddressValue is its real relational mirror, one row
// per (table row, column) — see schema.prisma's doc comment on that
// model. Deliberately separate functions from the regular-field ones
// above rather than a shared generic: the two levels (whole passport vs.
// one table row) don't share a natural key.
// ─────────────────────────────────────────────

// Minimal shape of a TABLE field's column metadata — enough to find the
// IP_REFERENCE columns without importing the full TableColumnDef type
// (app/(app)/object-types/types.ts), which pulls in more than this needs.
type TableColumnLike = { key: string; type: string };

function parseTableColumns(raw: unknown): TableColumnLike[] {
  return Array.isArray(raw) ? (raw as TableColumnLike[]) : [];
}

// The IP_REFERENCE column keys of one TABLE field, read from its stored
// `tableColumns` JSON metadata.
export function ipReferenceColumnKeys(field: FieldDefinition): string[] {
  return parseTableColumns(field.tableColumns)
    .filter((c) => c.type === 'IP_REFERENCE')
    .map((c) => c.key);
}

// Pre-check run before the transaction, mirroring validateIpReferenceValues
// above but over every row of every TABLE field. tableRowsByFieldKey is
// validate-values.ts's ValidatedPassportData.tableRows — one array of
// plain cell-objects per TABLE field key, already trimmed/normalized.
// Table rows don't have a per-cell error slot in the existing form (only
// per-field, via ValidatePassportValuesResult.fieldErrors), so on the
// first bad cell this reports which row/column, keyed by the field.
export async function validateTableIpReferenceValues(
  tableFields: FieldDefinition[],
  tableRowsByFieldKey: Record<string, Record<string, unknown>[]>,
): Promise<Record<string, string>> {
  const wanted: {
    fieldKey: string;
    fieldLabel: string;
    rowIndex: number;
    columnKey: string;
    ipAddressId: string;
  }[] = [];

  for (const field of tableFields) {
    const columnKeys = ipReferenceColumnKeys(field);
    if (columnKeys.length === 0) continue;
    const rows = tableRowsByFieldKey[field.key] ?? [];
    rows.forEach((row, rowIndex) => {
      for (const columnKey of columnKeys) {
        const raw = row[columnKey];
        if (typeof raw === 'string' && raw) {
          wanted.push({
            fieldKey: field.key,
            fieldLabel: field.label,
            rowIndex,
            columnKey,
            ipAddressId: raw,
          });
        }
      }
    });
  }
  if (wanted.length === 0) return {};

  const found = await prisma.ipAddress.findMany({
    where: { id: { in: wanted.map((w) => w.ipAddressId) } },
    select: { id: true },
  });
  const foundIds = new Set(found.map((f) => f.id));

  const fieldErrors: Record<string, string> = {};
  for (const w of wanted) {
    if (!foundIds.has(w.ipAddressId) && !fieldErrors[w.fieldKey]) {
      fieldErrors[w.fieldKey] =
        `«${w.fieldLabel}», строка ${w.rowIndex + 1}: выбранного IP-адреса больше нет в IPAM — выберите другой`;
    }
  }
  return fieldErrors;
}

// Run inside the same transaction, AFTER this save's TableFieldRow rows
// have been (re)created — needs their real ids, which only exist once
// they're inserted. Re-reads those rows back (ordered the same way they
// were inserted, by rowOrder) rather than threading ids through the
// createMany call, since Prisma's createMany doesn't return the created
// rows. No explicit delete of old links first: the old TableFieldRow rows
// were already deleted earlier in the same transaction (the usual
// "delete-then-recreate" sync in actions.ts), and onDelete: Cascade on
// TableCellIpAddressValue.tableFieldRow already cleaned those up with it.
export async function syncTableCellIpAddressLinks(
  tx: Prisma.TransactionClient,
  objectInstanceId: string,
  tableFields: FieldDefinition[],
): Promise<void> {
  const ipRefTableFields = tableFields.filter(
    (f) => ipReferenceColumnKeys(f).length > 0,
  );
  if (ipRefTableFields.length === 0) return;

  const columnKeysByFieldId = new Map(
    ipRefTableFields.map((f) => [f.id, ipReferenceColumnKeys(f)]),
  );

  const rows = await tx.tableFieldRow.findMany({
    where: {
      objectInstanceId,
      fieldDefinitionId: { in: ipRefTableFields.map((f) => f.id) },
    },
    select: { id: true, fieldDefinitionId: true, cells: true },
  });

  const links = rows.flatMap((row) => {
    const columnKeys = columnKeysByFieldId.get(row.fieldDefinitionId) ?? [];
    const cells = row.cells as unknown as Record<string, unknown>;
    return columnKeys
      .map((columnKey) => {
        const raw = cells[columnKey];
        return typeof raw === 'string' && raw
          ? { tableFieldRowId: row.id, columnKey, ipAddressId: raw }
          : null;
      })
      .filter((link): link is NonNullable<typeof link> => link !== null);
  });

  if (links.length > 0) {
    await tx.tableCellIpAddressValue.createMany({ data: links });
  }
}

export interface IpAddressRefLabel {
  id: string;
  address: string;
  hostname: string | null;
  networkLabel: string;
}

// Resolves a batch of IpAddress ids to display labels — used both by the
// fill form (to show the currently selected address in edit mode, since
// the stored value is just an id) and by the read-only passport view /
// CSV export (to show the address instead of a raw uuid).
export async function resolveIpAddressLabels(
  ids: string[],
): Promise<Map<string, IpAddressRefLabel>> {
  const unique = Array.from(new Set(ids)).filter(Boolean);
  if (unique.length === 0) return new Map();

  const found = await prisma.ipAddress.findMany({
    where: { id: { in: unique } },
    select: {
      id: true,
      address: true,
      hostname: true,
      network: { select: { name: true, cidr: true } },
    },
  });

  return new Map(
    found.map((ip) => [
      ip.id,
      {
        id: ip.id,
        address: ip.address,
        hostname: ip.hostname,
        networkLabel: `${ip.network.name} (${ip.network.cidr})`,
      },
    ]),
  );
}
