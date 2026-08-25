'use server';

import { revalidatePath } from 'next/cache';
import { Prisma, FieldType } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { getCurrentUser, isPassportAdmin } from '@/lib/auth';
import {
  objectTypeSchema,
  fieldDefinitionSchema,
  type ObjectTypeValues,
} from '@/lib/validations';

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

async function requirePassportAdmin() {
  const currentUser = await getCurrentUser();
  if (!currentUser || !isPassportAdmin(currentUser.passportRole)) {
    return null;
  }
  return currentUser;
}

async function writeAudit(
  action: 'CREATE' | 'UPDATE' | 'DELETE',
  entity: 'ObjectType' | 'FieldDefinition',
  entityId: string,
  userId?: string,
  metadata?: Record<string, unknown>,
) {
  await prisma.auditLog.create({
    data: {
      action,
      entity,
      entityId,
      userId: userId ?? null,
      metadata: (metadata ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}

// ─────────────────────────────────────────────
// Reads
// ─────────────────────────────────────────────

export async function getObjectTypes() {
  return prisma.objectType.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { fields: true, instances: true } } },
  });
}

export async function getObjectType(id: string) {
  return prisma.objectType.findUnique({
    where: { id },
    include: {
      fields: {
        // Global order across the whole type, not per-section — the
        // builder UI groups consecutive same-section fields together for
        // display (see groupBySection in fields-builder.tsx), but the
        // underlying order is one flat sequence the admin controls with
        // the up/down buttons.
        orderBy: { order: 'asc' },
        include: { visibleRoles: { include: { role: true } } },
      },
      _count: { select: { instances: true } },
    },
  });
}

// Roles an admin can restrict field visibility to — Passport-scope only,
// same set used for the "Role (Паспорта)" column on the Users page.
export async function getPassportRoles() {
  return prisma.role.findMany({
    where: { scope: 'PASSPORT' },
    orderBy: { name: 'asc' },
  });
}

// ─────────────────────────────────────────────
// ObjectType CRUD
// ─────────────────────────────────────────────

export async function createObjectType(
  values: ObjectTypeValues,
): Promise<ActionResult<{ id: string }>> {
  const currentUser = await requirePassportAdmin();
  // Can't reuse the shared PERMISSION_DENIED constant here — it's typed as
  // ActionResult<void>, which TypeScript won't widen to this function's
  // ActionResult<{ id: string }> return type even though `data` is
  // optional on both. A fresh literal sidesteps that.
  if (!currentUser) {
    return {
      ok: false,
      message: 'You do not have permission to perform this action.',
    };
  }

  const parsed = objectTypeSchema.safeParse(values);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[issue.path[0] as string] = issue.message;
    }
    return { ok: false, fieldErrors };
  }
  const data = parsed.data;

  const existingByName = await prisma.objectType.findUnique({
    where: { name: data.name },
  });
  if (existingByName) {
    return {
      ok: false,
      fieldErrors: { name: 'An object type with this name already exists' },
    };
  }
  const existingByCode = await prisma.objectType.findUnique({
    where: { code: data.code },
  });
  if (existingByCode) {
    return {
      ok: false,
      fieldErrors: { code: 'An object type with this code already exists' },
    };
  }

  try {
    const objectType = await prisma.objectType.create({
      data: {
        name: data.name,
        code: data.code,
        description: data.description || null,
      },
    });
    await writeAudit('CREATE', 'ObjectType', objectType.id, currentUser.id, {
      name: objectType.name,
      code: objectType.code,
    });
    revalidatePath('/object-types');
    return {
      ok: true,
      message: 'Object type created',
      data: { id: objectType.id },
    };
  } catch {
    return { ok: false, message: 'Failed to create object type' };
  }
}

export async function updateObjectType(
  id: string,
  values: ObjectTypeValues,
): Promise<ActionResult> {
  const currentUser = await requirePassportAdmin();
  if (!currentUser) return PERMISSION_DENIED;

  const parsed = objectTypeSchema.safeParse(values);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[issue.path[0] as string] = issue.message;
    }
    return { ok: false, fieldErrors };
  }
  const data = parsed.data;

  const existingByName = await prisma.objectType.findUnique({
    where: { name: data.name },
  });
  if (existingByName && existingByName.id !== id) {
    return {
      ok: false,
      fieldErrors: { name: 'An object type with this name already exists' },
    };
  }
  const existingByCode = await prisma.objectType.findUnique({
    where: { code: data.code },
  });
  if (existingByCode && existingByCode.id !== id) {
    return {
      ok: false,
      fieldErrors: { code: 'An object type with this code already exists' },
    };
  }

  try {
    const objectType = await prisma.objectType.update({
      where: { id },
      data: {
        name: data.name,
        code: data.code,
        description: data.description || null,
      },
    });
    await writeAudit('UPDATE', 'ObjectType', objectType.id, currentUser.id, {
      name: objectType.name,
      code: objectType.code,
    });
    revalidatePath('/object-types');
    return { ok: true, message: 'Object type updated' };
  } catch {
    return { ok: false, message: 'Failed to update object type' };
  }
}

export async function deleteObjectType(id: string): Promise<ActionResult> {
  const currentUser = await requirePassportAdmin();
  if (!currentUser) return PERMISSION_DENIED;

  const objectType = await prisma.objectType.findUnique({
    where: { id },
    include: { _count: { select: { instances: true } } },
  });
  if (!objectType) {
    return { ok: false, message: 'Object type not found' };
  }
  if (objectType._count.instances > 0) {
    return {
      ok: false,
      message: `Cannot delete this object type because ${objectType._count.instances} passport(s) of this type exist. Delete them first.`,
    };
  }

  try {
    await prisma.objectType.delete({ where: { id } });
    await writeAudit('DELETE', 'ObjectType', id, currentUser.id, {
      name: objectType.name,
      code: objectType.code,
    });
    revalidatePath('/object-types');
    return { ok: true, message: 'Object type deleted' };
  } catch {
    return { ok: false, message: 'Failed to delete object type' };
  }
}

// ─────────────────────────────────────────────
// FieldDefinition CRUD
// ─────────────────────────────────────────────

// Deliberately not tied to FieldDefinitionValues (the zod-inferred type) —
// the field-form-dialog builds its own react-hook-form state (options and
// tableColumns as field arrays, for useFieldArray) and transforms it into
// this plain shape before calling the action. fieldDefinitionSchema below
// is still what actually validates it at runtime.
type FieldDefinitionInput = {
  sectionName?: string;
  key: string;
  label: string;
  helpText?: string;
  type: FieldType;
  required: boolean;
  visibleToAll: boolean;
  visibleRoleIds: string[];
  options: string[];
  tableColumns: { key: string; label: string; type: string }[];
  validateAsIp: boolean;
};

// Returns the `order` value a field should be placed right after, so it
// lands adjacent to its section's other fields (or at the very end of the
// type, for a brand-new section or no section at all).
//
// This matters because `order` is one flat, type-wide sequence — not
// per-section — and the builder UI (fields-builder.tsx's groupBySection)
// only merges fields into one visual group when they're *contiguous* in
// that sequence with the same sectionName. A field that shares a section's
// name but isn't next to that section's other fields renders as a second,
// separate group with the same title further down the list — which is
// exactly what happens if a new field is simply appended to the very end
// (the old behavior here), and the admin picked a section that isn't the
// last one in the list.
async function nextOrderForSection(
  objectTypeId: string,
  sectionName: string | null,
  excludeFieldId?: string,
) {
  if (sectionName) {
    const lastInSection = await prisma.fieldDefinition.findFirst({
      where: {
        objectTypeId,
        sectionName,
        ...(excludeFieldId ? { id: { not: excludeFieldId } } : {}),
      },
      orderBy: { order: 'desc' },
      select: { order: true },
    });
    if (lastInSection) return lastInSection.order;
  }
  const last = await prisma.fieldDefinition.findFirst({
    where: {
      objectTypeId,
      ...(excludeFieldId ? { id: { not: excludeFieldId } } : {}),
    },
    orderBy: { order: 'desc' },
    select: { order: true },
  });
  return last?.order ?? -1;
}

export async function createFieldDefinition(
  objectTypeId: string,
  values: FieldDefinitionInput,
): Promise<ActionResult> {
  const currentUser = await requirePassportAdmin();
  if (!currentUser) return PERMISSION_DENIED;

  const parsed = fieldDefinitionSchema.safeParse(values);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[issue.path[0] as string] = issue.message;
    }
    return { ok: false, fieldErrors };
  }
  const data = parsed.data;

  const objectType = await prisma.objectType.findUnique({
    where: { id: objectTypeId },
  });
  if (!objectType) {
    return { ok: false, message: 'Object type not found' };
  }

  const existingKey = await prisma.fieldDefinition.findUnique({
    where: { objectTypeId_key: { objectTypeId, key: data.key } },
  });
  if (existingKey) {
    return {
      ok: false,
      fieldErrors: { key: 'A field with this key already exists on this type' },
    };
  }

  // Place the new field right after the last existing field of the same
  // section (or at the very end, for a new section) — see
  // nextOrderForSection above for why this has to account for section
  // membership rather than always appending to the end.
  const normalizedSection = data.sectionName || null;
  const insertAfterOrder = await nextOrderForSection(
    objectTypeId,
    normalizedSection,
  );

  try {
    // Shift every field after the insertion point up by one to make room,
    // then create the new field in the freed slot — both in one
    // transaction so the sequence never has two fields sharing an order.
    const [, field] = await prisma.$transaction([
      prisma.fieldDefinition.updateMany({
        where: { objectTypeId, order: { gt: insertAfterOrder } },
        data: { order: { increment: 1 } },
      }),
      prisma.fieldDefinition.create({
        data: {
          objectTypeId,
          sectionName: normalizedSection,
          key: data.key,
          label: data.label,
          helpText: data.helpText || null,
          type: data.type as FieldType,
          order: insertAfterOrder + 1,
          required: data.required,
          visibleToAll: data.visibleToAll,
          validateAsIp: data.type === 'TEXT' ? data.validateAsIp : false,
          options:
            data.type === 'SELECT'
              ? (data.options as Prisma.InputJsonValue)
              : undefined,
          tableColumns:
            data.type === 'TABLE'
              ? (data.tableColumns as Prisma.InputJsonValue)
              : undefined,
          visibleRoles: data.visibleToAll
            ? undefined
            : { create: data.visibleRoleIds.map((roleId) => ({ roleId })) },
        },
      }),
    ]);
    await writeAudit('CREATE', 'FieldDefinition', field.id, currentUser.id, {
      objectTypeId,
      key: field.key,
      label: field.label,
    });
    revalidatePath(`/object-types/${objectTypeId}`);
    return { ok: true, message: 'Field added' };
  } catch {
    return { ok: false, message: 'Failed to create field' };
  }
}

export async function updateFieldDefinition(
  fieldId: string,
  values: FieldDefinitionInput,
): Promise<ActionResult> {
  const currentUser = await requirePassportAdmin();
  if (!currentUser) return PERMISSION_DENIED;

  const parsed = fieldDefinitionSchema.safeParse(values);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[issue.path[0] as string] = issue.message;
    }
    return { ok: false, fieldErrors };
  }
  const data = parsed.data;

  const existing = await prisma.fieldDefinition.findUnique({
    where: { id: fieldId },
  });
  if (!existing) {
    return { ok: false, message: 'Field not found' };
  }

  if (data.key !== existing.key) {
    const clash = await prisma.fieldDefinition.findUnique({
      where: {
        objectTypeId_key: { objectTypeId: existing.objectTypeId, key: data.key },
      },
    });
    if (clash) {
      return {
        ok: false,
        fieldErrors: { key: 'A field with this key already exists on this type' },
      };
    }
  }

  // Only reposition the field if its section is actually changing — normal
  // edits (label, type, options, …) that keep the same section shouldn't
  // touch `order` at all. When the section does change, the field needs to
  // move next to its new section's other fields for the same reason
  // described on nextOrderForSection above — otherwise it renders as a
  // stray one-field group wherever it happened to sit before.
  const normalizedSection = data.sectionName || null;
  const sectionChanged = normalizedSection !== existing.sectionName;
  const insertAfterOrder = sectionChanged
    ? await nextOrderForSection(existing.objectTypeId, normalizedSection, fieldId)
    : null;

  try {
    // FieldVisibility rows are replaced wholesale rather than diffed —
    // simpler, and the set is small (a handful of Passport-scope roles).
    const ops: Prisma.PrismaPromise<unknown>[] = [
      prisma.fieldVisibility.deleteMany({ where: { fieldDefinitionId: fieldId } }),
    ];
    if (insertAfterOrder !== null) {
      ops.push(
        prisma.fieldDefinition.updateMany({
          where: {
            objectTypeId: existing.objectTypeId,
            order: { gt: insertAfterOrder },
            id: { not: fieldId },
          },
          data: { order: { increment: 1 } },
        }),
      );
    }
    ops.push(
      prisma.fieldDefinition.update({
        where: { id: fieldId },
        data: {
          sectionName: normalizedSection,
          key: data.key,
          label: data.label,
          helpText: data.helpText || null,
          type: data.type as FieldType,
          required: data.required,
          visibleToAll: data.visibleToAll,
          validateAsIp: data.type === 'TEXT' ? data.validateAsIp : false,
          options:
            data.type === 'SELECT'
              ? (data.options as Prisma.InputJsonValue)
              : Prisma.DbNull,
          tableColumns:
            data.type === 'TABLE'
              ? (data.tableColumns as Prisma.InputJsonValue)
              : Prisma.DbNull,
          visibleRoles: data.visibleToAll
            ? undefined
            : { create: data.visibleRoleIds.map((roleId) => ({ roleId })) },
          ...(insertAfterOrder !== null ? { order: insertAfterOrder + 1 } : {}),
        },
      }),
    );
    await prisma.$transaction(ops);
    await writeAudit('UPDATE', 'FieldDefinition', fieldId, currentUser.id, {
      key: data.key,
      label: data.label,
    });
    revalidatePath(`/object-types/${existing.objectTypeId}`);
    return { ok: true, message: 'Field updated' };
  } catch {
    return { ok: false, message: 'Failed to update field' };
  }
}

export async function deleteFieldDefinition(fieldId: string): Promise<ActionResult> {
  const currentUser = await requirePassportAdmin();
  if (!currentUser) return PERMISSION_DENIED;

  const field = await prisma.fieldDefinition.findUnique({ where: { id: fieldId } });
  if (!field) {
    return { ok: false, message: 'Field not found' };
  }

  try {
    // Cascades to this field's TableFieldRow rows (TABLE-type fields) and
    // FieldVisibility rows via the schema's onDelete: Cascade. Any values
    // already stored under this field's key inside ObjectInstance.values
    // (jsonb) are not touched — they're not FK-linked to FieldDefinition
    // and simply become orphaned, unused keys, which is harmless.
    await prisma.fieldDefinition.delete({ where: { id: fieldId } });
    await writeAudit('DELETE', 'FieldDefinition', fieldId, currentUser.id, {
      objectTypeId: field.objectTypeId,
      key: field.key,
      label: field.label,
    });
    revalidatePath(`/object-types/${field.objectTypeId}`);
    return { ok: true, message: 'Field deleted' };
  } catch {
    return { ok: false, message: 'Failed to delete field' };
  }
}

// Swaps this field's `order` with its immediate neighbor in the flat,
// type-wide order sequence — simpler and more robust than full drag-and-
// drop for a list that's usually a few dozen items at most.
export async function moveFieldDefinition(
  fieldId: string,
  direction: 'up' | 'down',
): Promise<ActionResult> {
  const currentUser = await requirePassportAdmin();
  if (!currentUser) return PERMISSION_DENIED;

  const field = await prisma.fieldDefinition.findUnique({ where: { id: fieldId } });
  if (!field) {
    return { ok: false, message: 'Field not found' };
  }

  const siblings = await prisma.fieldDefinition.findMany({
    where: { objectTypeId: field.objectTypeId },
    orderBy: { order: 'asc' },
    select: { id: true, order: true },
  });
  const index = siblings.findIndex((s) => s.id === fieldId);
  const swapIndex = direction === 'up' ? index - 1 : index + 1;
  if (index === -1 || swapIndex < 0 || swapIndex >= siblings.length) {
    return { ok: false, message: 'Cannot move field further' };
  }

  const a = siblings[index];
  const b = siblings[swapIndex];

  try {
    await prisma.$transaction([
      prisma.fieldDefinition.update({ where: { id: a.id }, data: { order: b.order } }),
      prisma.fieldDefinition.update({ where: { id: b.id }, data: { order: a.order } }),
    ]);
    revalidatePath(`/object-types/${field.objectTypeId}`);
    return { ok: true };
  } catch {
    return { ok: false, message: 'Failed to reorder field' };
  }
}
