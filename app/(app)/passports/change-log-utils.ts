import type { FieldDefinition } from '@prisma/client';

import {
  ipReferenceFields,
  resolveIpAddressLabels,
} from '@/app/(app)/passports/ip-reference-utils';
import {
  objectReferenceFields,
  resolveObjectReferenceLabels,
} from '@/app/(app)/passports/object-reference-utils';

// Structured field-level diff for the audit log (2 September 2026, CMDB
// phase 7 — see it-passports-design.md section 8.11). Turns "the passport
// was updated" into "field X went from A to B", so the change history on a
// passport's own card (and the shared /audit-log page) can show what
// actually happened, not just that something did. Stored as-is in
// AuditLog.metadata (already a free-form JSON column) — no new table
// needed, same reasoning as reusing FieldObjectReferenceValue's mirror
// columns in phase 6 rather than adding new schema where existing columns
// already cover it.
export type FieldChange = {
  key: string;
  label: string;
  from: string;
  to: string;
};

const EMPTY_DISPLAY = '—';

function formatScalar(type: string, value: unknown): string {
  if (value === undefined || value === null || value === '') {
    return EMPTY_DISPLAY;
  }
  if (type === 'BOOLEAN') return value === true ? 'Да' : 'Нет';
  return String(value);
}

// Builds the change list for one passport's regular (non-TABLE) field
// values, plus name/status/responsible — everything that
// createPassport/updatePassport can change in one save. TABLE fields are
// diffed separately by the caller (buildTableFieldChanges below) — a
// deliberately coarser comparison, see that function's doc comment.
export async function buildFieldChanges(params: {
  fields: FieldDefinition[];
  oldName: string;
  newName: string;
  oldStatus: string;
  newStatus: string;
  statusLabels: Record<string, string>;
  oldResponsible: { id: string; label: string }[];
  newResponsible: { id: string; label: string }[];
  oldValues: Record<string, unknown>;
  newValues: Record<string, unknown>;
}): Promise<FieldChange[]> {
  const {
    fields,
    oldName,
    newName,
    oldStatus,
    newStatus,
    statusLabels,
    oldResponsible,
    newResponsible,
    oldValues,
    newValues,
  } = params;

  const changes: FieldChange[] = [];

  if (oldName !== newName) {
    changes.push({
      key: 'name',
      label: 'Название',
      from: oldName,
      to: newName,
    });
  }
  if (oldStatus !== newStatus) {
    changes.push({
      key: 'status',
      label: 'Статус',
      from: statusLabels[oldStatus] ?? oldStatus,
      to: statusLabels[newStatus] ?? newStatus,
    });
  }

  const oldRespIds = new Set(oldResponsible.map((r) => r.id));
  const newRespIds = new Set(newResponsible.map((r) => r.id));
  const sameResponsible =
    oldRespIds.size === newRespIds.size &&
    Array.from(oldRespIds).every((id) => newRespIds.has(id));
  if (!sameResponsible) {
    changes.push({
      key: 'responsible',
      label: 'Ответственные',
      from: oldResponsible.map((r) => r.label).join(', ') || EMPTY_DISPLAY,
      to: newResponsible.map((r) => r.label).join(', ') || EMPTY_DISPLAY,
    });
  }

  const nonTableFields = fields.filter((f) => f.type !== 'TABLE');
  const ipRefFields = ipReferenceFields(nonTableFields);
  const objectRefFields = objectReferenceFields(nonTableFields);
  const ipRefKeys = new Set(ipRefFields.map((f) => f.key));
  const objectRefKeyToField = new Map(objectRefFields.map((f) => [f.key, f]));

  // Resolve every IP/object reference id that appears on either side of the
  // diff in one batched pass, same "resolve up front" approach as
  // getPassportView/exportPassportsCsv — never one query per changed field.
  const ipIds: string[] = [];
  for (const f of ipRefFields) {
    const a = oldValues[f.key];
    const b = newValues[f.key];
    if (typeof a === 'string' && a) ipIds.push(a);
    if (typeof b === 'string' && b) ipIds.push(b);
  }
  const ipLabels = await resolveIpAddressLabels(ipIds);

  const locationIds: string[] = [];
  const instanceIds: string[] = [];
  for (const f of objectRefFields) {
    const a = oldValues[f.key];
    const b = newValues[f.key];
    const bucket =
      f.referenceTargetKind === 'LOCATION' ? locationIds : instanceIds;
    if (typeof a === 'string' && a) bucket.push(a);
    if (typeof b === 'string' && b) bucket.push(b);
  }
  const { locations, instances } = await resolveObjectReferenceLabels(
    locationIds,
    instanceIds,
  );

  function displayValue(field: FieldDefinition, raw: unknown): string {
    if (typeof raw !== 'string' || !raw) return formatScalar(field.type, raw);
    if (ipRefKeys.has(field.key)) {
      return ipLabels.get(raw)?.address ?? raw;
    }
    const refField = objectRefKeyToField.get(field.key);
    if (refField) {
      const pool =
        refField.referenceTargetKind === 'LOCATION' ? locations : instances;
      return pool.get(raw)?.title ?? raw;
    }
    return formatScalar(field.type, raw);
  }

  for (const field of nonTableFields) {
    const before = oldValues[field.key];
    const after = newValues[field.key];
    // Cheap equality check on the raw stored value first — avoids doing
    // reference-label lookups (and pushing a no-op change entry) for the
    // overwhelming majority of fields on any given save, which don't
    // change.
    if (before === after) continue;
    if (
      (before === undefined || before === null || before === '') &&
      (after === undefined || after === null || after === '')
    ) {
      continue;
    }
    changes.push({
      key: field.key,
      label: field.label,
      from: displayValue(field, before),
      to: displayValue(field, after),
    });
  }

  return changes;
}

// TABLE fields (e.g. "Состав системы", "Патч-корды") can hold many rows,
// each with several columns — a full per-cell diff would make the change
// history unreadable for anything but the smallest tables, and TABLE rows
// are already replaced wholesale on every save (see updatePassport's doc
// comment on that), so there's no natural "this one row changed" unit to
// report anyway. Deliberately coarse instead: report only that the field
// changed, with the row count on each side — enough to notice "someone
// touched the patch-cord list" in the history; opening the passport shows
// the current rows. A finer per-row diff is a reasonable follow-up if this
// ever turns out not to be enough (documented as a known cut in
// it-passports-design.md section 8.11).
export function buildTableFieldChanges(
  tableFields: FieldDefinition[],
  oldRowsByFieldId: Map<string, unknown[]>,
  newRowsByFieldId: Map<string, unknown[]>,
): FieldChange[] {
  const changes: FieldChange[] = [];
  for (const field of tableFields) {
    const before = oldRowsByFieldId.get(field.id) ?? [];
    const after = newRowsByFieldId.get(field.id) ?? [];
    if (before.length === 0 && after.length === 0) continue;
    if (JSON.stringify(before) === JSON.stringify(after)) continue;
    changes.push({
      key: field.key,
      label: field.label,
      from: `${before.length} стр.`,
      to: `${after.length} стр.`,
    });
  }
  return changes;
}
