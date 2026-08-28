'use server';

import { revalidatePath } from 'next/cache';

import { prisma } from '@/lib/prisma';
import { getCurrentUser, isPassportAdmin } from '@/lib/auth';
import {
  equipmentTypeCodeSchema,
  type EquipmentTypeCodeValues,
} from '@/lib/validations';

// EquipmentTypeCode — admin-managed dictionary of equipment-type codes used
// by AUTO_IDENTIFIER fields (CMDB phase 3, see it-passports-design.md
// section 8). Gated the same way as the form builder (isPassportAdmin) —
// this dictionary is config, not passport data, so a Passport Manager
// shouldn't be able to edit it any more than they can edit a FieldDefinition.

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

export async function getEquipmentTypeCodes() {
  return prisma.equipmentTypeCode.findMany({
    orderBy: [{ order: 'asc' }, { code: 'asc' }],
    include: { _count: { select: { fields: true } } },
  });
}

// Lightweight option list for the AUTO_IDENTIFIER field picker in the form
// builder — same idea as getObjectTypeOptions in object-types/actions.ts.
export async function getEquipmentTypeCodeOptions() {
  return prisma.equipmentTypeCode.findMany({
    orderBy: [{ order: 'asc' }, { code: 'asc' }],
    select: { id: true, code: true, label: true },
  });
}

export async function createEquipmentTypeCode(
  values: EquipmentTypeCodeValues,
): Promise<ActionResult> {
  const currentUser = await requirePassportAdmin();
  if (!currentUser) return PERMISSION_DENIED;

  const parsed = equipmentTypeCodeSchema.safeParse(values);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[issue.path[0] as string] = issue.message;
    }
    return { ok: false, fieldErrors };
  }
  const data = parsed.data;

  const existing = await prisma.equipmentTypeCode.findUnique({
    where: { code: data.code },
  });
  if (existing) {
    return {
      ok: false,
      fieldErrors: { code: 'This code already exists' },
    };
  }

  const last = await prisma.equipmentTypeCode.findFirst({
    orderBy: { order: 'desc' },
    select: { order: true },
  });

  try {
    await prisma.equipmentTypeCode.create({
      data: {
        code: data.code,
        label: data.label,
        order: (last?.order ?? -1) + 1,
      },
    });
    revalidatePath('/equipment-type-codes');
    return { ok: true, message: 'Code added' };
  } catch {
    return { ok: false, message: 'Failed to create code' };
  }
}

export async function updateEquipmentTypeCode(
  id: string,
  values: EquipmentTypeCodeValues,
): Promise<ActionResult> {
  const currentUser = await requirePassportAdmin();
  if (!currentUser) return PERMISSION_DENIED;

  const parsed = equipmentTypeCodeSchema.safeParse(values);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[issue.path[0] as string] = issue.message;
    }
    return { ok: false, fieldErrors };
  }
  const data = parsed.data;

  const existing = await prisma.equipmentTypeCode.findUnique({
    where: { id },
  });
  if (!existing) {
    return { ok: false, message: 'Code not found' };
  }

  if (data.code !== existing.code) {
    const clash = await prisma.equipmentTypeCode.findUnique({
      where: { code: data.code },
    });
    if (clash) {
      return { ok: false, fieldErrors: { code: 'This code already exists' } };
    }
  }

  try {
    // Note: renaming/relabeling a code does not touch any already-computed
    // AUTO_IDENTIFIER string (those are generated once and stored verbatim
    // in ObjectInstance.values — see FieldAutoIdentifierValue's doc comment
    // in schema.prisma) — only future generations pick up the new code
    // text. This is a deliberate, minor inconsistency risk the admin should
    // be aware of before renaming a code already in active use.
    await prisma.equipmentTypeCode.update({
      where: { id },
      data: { code: data.code, label: data.label },
    });
    revalidatePath('/equipment-type-codes');
    return { ok: true, message: 'Code updated' };
  } catch {
    return { ok: false, message: 'Failed to update code' };
  }
}

export async function deleteEquipmentTypeCode(
  id: string,
): Promise<ActionResult> {
  const currentUser = await requirePassportAdmin();
  if (!currentUser) return PERMISSION_DENIED;

  const code = await prisma.equipmentTypeCode.findUnique({
    where: { id },
    include: {
      _count: { select: { fields: true, autoIdentifierLinks: true } },
    },
  });
  if (!code) {
    return { ok: false, message: 'Code not found' };
  }

  // Two separate FK-Restrict relations can both block this delete — a
  // field currently configured to use this code (config-level), and an
  // already-generated identifier that used this code (data-level, which
  // can outlive a field's config being changed to a different code — see
  // updateFieldDefinition). Check both proactively for a friendly error,
  // same pattern as deleteObjectType/deleteLocation.
  if (code._count.fields > 0) {
    const fields = await prisma.fieldDefinition.findMany({
      where: { autoIdentifierEquipmentTypeCodeId: id },
      take: 5,
      include: { objectType: { select: { name: true } } },
    });
    const names = Array.from(
      new Set(fields.map((f) => `${f.objectType.name} → «${f.label}»`)),
    );
    return {
      ok: false,
      message: `Этот код используется в полях: ${names.join(', ')} — сначала измените их настройку`,
    };
  }
  if (code._count.autoIdentifierLinks > 0) {
    return {
      ok: false,
      message: `Этот код уже использован в ${code._count.autoIdentifierLinks} присвоенном идентификаторе — удаление невозможно`,
    };
  }

  try {
    await prisma.equipmentTypeCode.delete({ where: { id } });
    revalidatePath('/equipment-type-codes');
    return { ok: true, message: 'Code deleted' };
  } catch {
    return { ok: false, message: 'Failed to delete code' };
  }
}
