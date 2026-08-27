'use server';

import { revalidatePath } from 'next/cache';
import { Prisma } from '@prisma/client';
import type { FieldDefinition } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { getCurrentUser, canEditPassports } from '@/lib/auth';
import { parseCsv, generateCsv, type ImportResult } from '@/lib/csv-utils';
import { validatePassportValues } from '@/app/(app)/passports/validate-values';
import {
  ipReferenceFields,
  resolveIpAddressLabels,
  syncFieldIpAddressLinks,
} from '@/app/(app)/passports/ip-reference-utils';

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
  const ipRefKeys = new Set(ipReferenceFields(fields).map((f) => f.key));

  const instances = await prisma.objectInstance.findMany({
    where: { objectTypeId },
    orderBy: { name: 'asc' },
  });

  // IP_REFERENCE fields store an IpAddress id in `values` — resolve every
  // id referenced across all rows to its address up front (one query)
  // rather than per-cell, so the export shows the address, not a raw uuid.
  const ipRefKeyList = Array.from(ipRefKeys);
  const ipRefIds: string[] = [];
  for (const instance of instances) {
    const values = instance.values as unknown as Record<string, unknown>;
    for (const key of ipRefKeyList) {
      const v = values[key];
      if (typeof v === 'string' && v) ipRefIds.push(v);
    }
  }
  const ipRefLabels = await resolveIpAddressLabels(ipRefIds);

  const rows = instances.map((instance) => {
    const values = instance.values as unknown as Record<string, unknown>;
    return [
      instance.name,
      ...fields.map((f) => {
        const v = values[f.key];
        if (v === undefined || v === null) return '';
        if (f.type === 'BOOLEAN') return v === true ? 'true' : 'false';
        if (ipRefKeys.has(f.key)) {
          // Should always resolve — FK Restrict blocks deleting an
          // IpAddress while it's still referenced — but fall back to the
          // raw id rather than silently dropping data if it somehow can't.
          return typeof v === 'string'
            ? (ipRefLabels.get(v)?.address ?? v)
            : String(v);
        }
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
  const ipRefFields = ipReferenceFields(fields);

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

    // IP_REFERENCE columns round-trip as address text (see
    // exportPassportsCsv above), but the stored value has to be the real
    // IpAddress id — resolve each one here and fail the row if it isn't a
    // real, current IPAM address, same as validateIpReferenceValues does
    // for the regular form.
    let ipRefRowError: string | null = null;
    for (const field of ipRefFields) {
      const addressText = validated.data.values[field.key];
      if (typeof addressText !== 'string' || !addressText) continue;
      const ip = await prisma.ipAddress.findUnique({
        where: { address: addressText },
        select: { id: true },
      });
      if (!ip) {
        ipRefRowError = `«${field.label}»: адрес «${addressText}» не найден в IPAM`;
        break;
      }
      validated.data.values[field.key] = ip.id;
    }
    if (ipRefRowError) {
      errors.push({ row: rowNum, message: ipRefRowError });
      continue;
    }

    try {
      await prisma.$transaction(async (tx) => {
        const created = await tx.objectInstance.create({
          data: {
            objectTypeId,
            name,
            values: validated.data.values as Prisma.InputJsonValue,
            createdById: currentUser.id,
          },
        });
        await tx.auditLog.create({
          data: {
            action: 'CREATE',
            entity: 'ObjectInstance',
            entityId: created.id,
            userId: currentUser.id,
            metadata: { name, objectTypeId, source: 'csv-import' },
          },
        });
        await syncFieldIpAddressLinks(
          tx,
          created.id,
          ipRefFields,
          validated.data.values,
        );
        return created;
      });
      created += 1;
    } catch {
      errors.push({ row: rowNum, message: 'Не удалось сохранить эту строку' });
    }
  }

  revalidatePath('/passports');

  return { ok: errors.length === 0, created, updated: 0, errors };
}
