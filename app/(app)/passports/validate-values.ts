import type { FieldDefinition } from '@prisma/client';

// Deliberately NOT a 'use server' file: a file with that directive may only
// export async functions (every export becomes a Server Action), and this
// is a plain synchronous helper shared by both actions.ts (create/update
// passport) and csv-actions.ts (bulk import) — pulling it out here lets
// both import it without tripping that restriction.

export type ValidatedPassportData = {
  values: Record<string, unknown>;
  tableRows: Record<string, Record<string, unknown>[]>;
};

export type ValidatePassportValuesResult =
  | { ok: true; data: ValidatedPassportData }
  | { ok: false; fieldErrors: Record<string, string> };

// Checks required-ness and does light type normalization per field. This
// intentionally does not build a full per-field-type Zod schema — the set
// of fields is only known at runtime (defined by the admin through the
// form builder), so a hand-rolled pass keyed by FieldDefinition.type is
// simpler and just as safe for what we actually need to guarantee here.
//
// Callers that don't have table-row data to offer (CSV import, which is
// scoped to non-TABLE columns — see csv-actions.ts) should pass a `fields`
// list that already excludes TABLE-type fields, so the "add at least one
// row" required-check below never fires for a field they have no way to
// fill in through that path.
export function validatePassportValues(
  fields: FieldDefinition[],
  rawValues: Record<string, unknown>,
  rawTableRows: Record<string, { cells: Record<string, unknown> }[]>,
): ValidatePassportValuesResult {
  const fieldErrors: Record<string, string> = {};
  const values: Record<string, unknown> = {};
  const tableRows: Record<string, Record<string, unknown>[]> = {};

  for (const field of fields) {
    if (field.type === 'TABLE') {
      const rows = rawTableRows[field.key] ?? [];
      if (field.required && rows.length === 0) {
        fieldErrors[field.key] =
          `«${field.label}»: добавьте хотя бы одну строку`;
      }
      tableRows[field.key] = rows.map((r) => r.cells ?? {});
      continue;
    }

    if (field.type === 'AUTO_IDENTIFIER') {
      // Never entered by hand — computed server-side by
      // syncAutoIdentifierValues (auto-identifier-utils.ts), called from
      // createPassport/updatePassport *after* this validation step (it
      // needs the real ObjectInstance id). Skip the generic required-check
      // and raw-value capture entirely; the caller injects the computed
      // value into `values` afterward — leaving the key out here is
      // deliberate, not an oversight, see that function's doc comment.
      continue;
    }

    const raw = rawValues[field.key];

    if (field.type === 'BOOLEAN') {
      values[field.key] = raw === true;
      continue;
    }

    const strValue =
      typeof raw === 'string' ? raw.trim() : raw == null ? '' : String(raw);

    if (field.required && !strValue) {
      fieldErrors[field.key] = `«${field.label}»: обязательное поле`;
      continue;
    }
    if (!strValue) {
      // Unset optional field — omit the key entirely rather than storing
      // an empty string, so "not filled in" stays distinguishable.
      continue;
    }

    if (field.type === 'SELECT') {
      const options = Array.isArray(field.options)
        ? (field.options as unknown as string[])
        : [];
      if (options.length > 0 && !options.includes(strValue)) {
        fieldErrors[field.key] = `«${field.label}»: недопустимое значение`;
        continue;
      }
    }

    values[field.key] = strValue;
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors };
  }
  return { ok: true, data: { values, tableRows } };
}
