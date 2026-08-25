'use server';

import { revalidatePath } from 'next/cache';
import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import {
  getCurrentUser,
  hasPassportAccess,
  canEditPassports,
} from '@/lib/auth';
import { validatePassportValues } from '@/app/(app)/passports/validate-values';

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

  const tableRows = instance.tableRows.filter((r) =>
    visibleFieldIds.has(r.fieldDefinitionId),
  );

  return {
    id: instance.id,
    name: instance.name,
    objectType: {
      id: instance.objectType.id,
      name: instance.objectType.name,
      code: instance.objectType.code,
    },
    fields: visibleFields,
    values,
    tableRows,
    responsible: instance.responsible,
    createdAt: instance.createdAt,
    updatedAt: instance.updatedAt,
    canEdit: canSeeAll,
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
  address: string;
  hostname: string | null;
  networkLabel: string;
}

// Prefix search over real IPAM addresses, used to power the autocomplete
// dropdown under a `validateAsIp` field — purely a UI convenience, still
// stores the field value as plain text either way (see checkIpAddressKnown
// above for the accompanying advisory check).
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
      address: true,
      hostname: true,
      network: { select: { name: true, cidr: true } },
    },
    orderBy: { address: 'asc' },
    take: 8,
  });
  return found.map((ip) => ({
    address: ip.address,
    hostname: ip.hostname,
    networkLabel: `${ip.network.name} (${ip.network.cidr})`,
  }));
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
