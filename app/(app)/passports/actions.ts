'use server';

import { revalidatePath } from 'next/cache';
import { Prisma } from '@prisma/client';
import type { FieldDefinition } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import {
  getCurrentUser,
  hasPassportAccess,
  canEditPassports,
} from '@/lib/auth';

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
}) {
  const currentUser = await requirePassportViewer();
  if (!currentUser) return { items: [] };

  const where: Prisma.ObjectInstanceWhereInput = {};
  if (params.objectTypeId) where.objectTypeId = params.objectTypeId;
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

export async function getPassportUsers() {
  const currentUser = await requirePassportEditor();
  if (!currentUser) return [];
  return prisma.user.findMany({
    where: { isActive: true },
    orderBy: { email: 'asc' },
    select: { id: true, email: true, fullName: true },
  });
}

// ─────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────

type ValidatedPassportData = {
  values: Record<string, unknown>;
  tableRows: Record<string, Record<string, unknown>[]>;
};

// Checks required-ness and does light type normalization per field. This
// intentionally does not build a full per-field-type Zod schema — the set
// of fields is only known at runtime (defined by the admin through the
// form builder), so a hand-rolled pass keyed by FieldDefinition.type is
// simpler and just as safe for what we actually need to guarantee here.
function validatePassportValues(
  fields: FieldDefinition[],
  rawValues: Record<string, unknown>,
  rawTableRows: Record<string, { cells: Record<string, unknown> }[]>,
):
  | { ok: true; data: ValidatedPassportData }
  | { ok: false; fieldErrors: Record<string, string> } {
  const fieldErrors: Record<string, string> = {};
  const values: Record<string, unknown> = {};
  const tableRows: Record<string, Record<string, unknown>[]> = {};

  for (const field of fields) {
    if (field.type === 'TABLE') {
      const rows = rawTableRows[field.key] ?? [];
      if (field.required && rows.length === 0) {
        fieldErrors[field.key] = `«${field.label}»: добавьте хотя бы одну строку`;
      }
      tableRows[field.key] = rows.map((r) => r.cells ?? {});
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

// ─────────────────────────────────────────────
// Create / update / delete
// ─────────────────────────────────────────────

type PassportInput = {
  objectTypeId: string;
  name: string;
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
    return { ok: false, fieldErrors: { name: 'Укажите название паспорта' } };
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

  const tableFieldByKey = new Map(
    objectType.fields
      .filter((f) => f.type === 'TABLE')
      .map((f) => [f.key, f] as const),
  );

  try {
    const instance = await prisma.$transaction(async (tx) => {
      const created = await tx.objectInstance.create({
        data: {
          objectTypeId: objectType.id,
          name,
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

      return created;
    });

    await writeAudit('CREATE', instance.id, currentUser.id, {
      name: instance.name,
      objectTypeId: objectType.id,
    });
    revalidatePath('/passports');
    return {
      ok: true,
      message: 'Паспорт создан',
      data: { id: instance.id },
    };
  } catch {
    return { ok: false, message: 'Не удалось создать паспорт' };
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
    return { ok: false, fieldErrors: { name: 'Укажите название паспорта' } };
  }

  const existing = await prisma.objectInstance.findUnique({
    where: { id },
    include: { objectType: { include: { fields: true } } },
  });
  if (!existing) {
    return { ok: false, message: 'Паспорт не найден' };
  }

  const validated = validatePassportValues(
    existing.objectType.fields,
    input.values,
    input.tableRows,
  );
  if (!validated.ok) {
    return { ok: false, fieldErrors: validated.fieldErrors };
  }

  const tableFieldByKey = new Map(
    existing.objectType.fields
      .filter((f) => f.type === 'TABLE')
      .map((f) => [f.key, f] as const),
  );

  try {
    await prisma.$transaction(async (tx) => {
      await tx.objectInstance.update({
        where: { id },
        data: {
          name,
          values: validated.data.values as Prisma.InputJsonValue,
        },
      });

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
    });

    await writeAudit('UPDATE', id, currentUser.id, { name });
    revalidatePath('/passports');
    revalidatePath(`/passports/${id}`);
    return { ok: true, message: 'Паспорт обновлён' };
  } catch {
    return { ok: false, message: 'Не удалось обновить паспорт' };
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
    return { ok: false, message: 'Паспорт не найден' };
  }

  try {
    // Cascades to ObjectInstanceResponsible and TableFieldRow rows via the
    // schema's onDelete: Cascade.
    await prisma.objectInstance.delete({ where: { id } });
    await writeAudit('DELETE', id, currentUser.id, { name: existing.name });
    revalidatePath('/passports');
    return { ok: true, message: 'Паспорт удалён' };
  } catch {
    return { ok: false, message: 'Не удалось удалить паспорт' };
  }
}
