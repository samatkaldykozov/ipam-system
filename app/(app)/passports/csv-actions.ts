'use server';

import { revalidatePath } from 'next/cache';
import { Prisma } from '@prisma/client';
import type { FieldDefinition } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { getCurrentUser, canEditPassports } from '@/lib/auth';
import { parseCsv, generateCsv, type ImportResult } from '@/lib/csv-utils';
import { validatePassportValues } from '@/app/(app)/passports/validate-values';

// Plan step 7 (docs/it-passports-design.md section 5, optional):
// CSV import/export per object type, reusing the same lib/csv-utils.ts
// engine and components/csv-import-dialog.tsx UI already used for
// Networks. Scoped to non-TABLE fields only — a repeating-row section
// like "Состав системы" doesn't flatten sensibly into one CSV row per
// passport, so those columns are left out of both directions; a passport
// imported this way can be opened afterward to fill in its table
// sections through the regular form. Unlike Networks' CSV import (which
// upserts by CIDR, a natural unique key), ObjectInstance has no such key,
// so import here always creates new passports rather than updating
// existing ones by name.

const MAX_IMPORT_ROWS = 2000;

function nonTableFields(fields: FieldDefinition[]) {
  return fields.filter((f) => f.type !== 'TABLE').sort((a, b) => a.order - b.order);
}

export async function exportPassportsCsv(objectTypeId: string): Promise<string> {
  const currentUser = await getCurrentUser();
  if (!currentUser || !canEditPassports(currentUser.passportRole)) {
    return generateCsv(['name'], []);
  }

  const objectType = await prisma.objectType.findUnique({
    where: { id: objectTypeId },
    include: { fields: true },
  });
  if (!objectType) {
    return generateCsv(['name'], []);
  }

  const fields = nonTableFields(objectType.fields);
  const headers = ['name', ...fields.map((f) => f.key)];

  const instances = await prisma.objectInstance.findMany({
    where: { objectTypeId },
    orderBy: { name: 'asc' },
  });

  const rows = instances.map((instance) => {
    const values = instance.values as unknown as Record<string, unknown>;
    return [
      instance.name,
      ...fields.map((f) => {
        const v = values[f.key];
        if (v === undefined || v === null) return '';
        if (f.type === 'BOOLEAN') return v === true ? 'true' : 'false';
        return String(v);
      }),
    ];
  });

  return generateCsv(headers, rows);
}

// Always creates — see the module-level comment on why there's no
// update-by-match path here, unlike importNetworksCsv.
export async function importPassportsCsv(
  objectTypeId: string,
  csvText: string,
): Promise<ImportResult> {
  const currentUser = await getCurrentUser();
  if (!currentUser || !canEditPassports(currentUser.passportRole)) {
    return {
      ok: false,
      created: 0,
      updated: 0,
      errors: [
        {
          row: 0,
          message: 'You do not have permission to perform this action.',
        },
      ],
    };
  }

  const objectType = await prisma.objectType.findUnique({
    where: { id: objectTypeId },
    include: { fields: true },
  });
  if (!objectType) {
    return {
      ok: false,
      created: 0,
      updated: 0,
      errors: [{ row: 0, message: 'Тип объекта не найден' }],
    };
  }

  const fields = nonTableFields(objectType.fields);

  const records = parseCsv(csvText);
  if (records.length === 0) {
    return {
      ok: false,
      created: 0,
      updated: 0,
      errors: [{ row: 0, message: 'В файле нет строк с данными.' }],
    };
  }
  if (records.length > MAX_IMPORT_ROWS) {
    return {
      ok: false,
      created: 0,
      updated: 0,
      errors: [
        {
          row: 0,
          message: `В файле ${records.length} строк — за раз можно импортировать не более ${MAX_IMPORT_ROWS}.`,
        },
      ],
    };
  }

  let created = 0;
  const errors: { row: number; message: string }[] = [];

  for (let i = 0; i < records.length; i++) {
    const rowNum = i + 2; // +1 for the header row, +1 for 1-indexing
    const record = records[i];

    const name = (record.name ?? '').trim();
    if (!name) {
      errors.push({ row: rowNum, message: 'Не указано название (name)' });
      continue;
    }

    const rawValues: Record<string, unknown> = {};
    for (const field of fields) {
      const raw = record[field.key];
      if (field.type === 'BOOLEAN') {
        rawValues[field.key] = (raw ?? '').trim().toLowerCase() === 'true';
      } else {
        rawValues[field.key] = raw ?? '';
      }
    }

    // Only the non-TABLE fields are passed in, so the "add at least one
    // row" required-check for TABLE fields never fires here — see
    // validate-values.ts's doc comment.
    const validated = validatePassportValues(fields, rawValues, {});
    if (!validated.ok) {
      const firstError = Object.values(validated.fieldErrors)[0];
      errors.push({ row: rowNum, message: firstError ?? 'Некорректная строка' });
      continue;
    }

    try {
      const instance = await prisma.objectInstance.create({
        data: {
          objectTypeId,
          name,
          values: validated.data.values as Prisma.InputJsonValue,
          createdById: currentUser.id,
        },
      });
      await prisma.auditLog.create({
        data: {
          action: 'CREATE',
          entity: 'ObjectInstance',
          entityId: instance.id,
          userId: currentUser.id,
          metadata: { name, objectTypeId, source: 'csv-import' },
        },
      });
      created += 1;
    } catch {
      errors.push({ row: rowNum, message: 'Не удалось сохранить эту строку' });
    }
  }

  revalidatePath('/passports');

  return { ok: errors.length === 0, created, updated: 0, errors };
}
