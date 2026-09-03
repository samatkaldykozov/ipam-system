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

// Lightweight list for the "reference target type" picker on an
// OBJECT_REFERENCE field's config (field-form-dialog.tsx) — id/name/code
// only, same idea as getAvailableLocationParents in locations/actions.ts.
// Not scoped to passport-admin-only like getObjectTypesForPicker in
// passports/actions.ts, since this is itself only reachable from a
// passport-admin-gated screen (the field builder).
export async function getObjectTypeOptions() {
  const currentUser = await requirePassportAdmin();
  if (!currentUser) return [];
  return prisma.objectType.findMany({
    orderBy: { name: 'asc' },
    select: { id: true, name: true, code: true },
  });
}

// Lightweight list of an object type's own fields — used by the
// VM_IDENTIFIER "код кластера" picker (field-form-dialog.tsx) to offer TEXT
// fields belonging to whichever Cluster-type ObjectType the field's own
// "cluster" picker currently resolves to, not the VM's own ObjectType (see
// vmIdentifierClusterCodeFieldKey's doc comment in schema.prisma for why
// this is cross-type). Same passport-admin gate and id/key/label/type
// shape as getObjectTypeOptions above.
export async function getObjectTypeFieldOptions(objectTypeId: string) {
  const currentUser = await requirePassportAdmin();
  if (!currentUser) return [];
  return prisma.fieldDefinition.findMany({
    where: { objectTypeId },
    orderBy: { order: 'asc' },
    select: { id: true, key: true, label: true, type: true },
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
    include: {
      _count: { select: { instances: true, fieldsReferencingThisType: true } },
    },
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
  // Config-level FK Restrict (see FieldDefinition.referenceObjectType in
  // schema.prisma) — some OBJECT_REFERENCE field elsewhere is still
  // configured to only accept passports of this type. Check proactively
  // for a friendly error rather than a raw FK failure.
  if (objectType._count.fieldsReferencingThisType > 0) {
    const referencingFields = await prisma.fieldDefinition.findMany({
      where: { referenceObjectTypeId: id },
      take: 5,
      include: { objectType: { select: { name: true } } },
    });
    const names = Array.from(
      new Set(
        referencingFields.map((f) => `${f.objectType.name} → «${f.label}»`),
      ),
    );
    return {
      ok: false,
      message: `Этот тип объекта используется как цель ссылки в полях: ${names.join(', ')} — сначала измените или удалите эти поля`,
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
  tableColumns: {
    key: string;
    label: string;
    type: string;
    validateAsIp: boolean;
    referenceTargetKind?: string | null;
    referenceObjectTypeId?: string | null;
    relationshipType?: string | null;
  }[];
  validateAsIp: boolean;
  // Only meaningful when type is 'OBJECT_REFERENCE' — see
  // FieldDefinition.referenceTargetKind/referenceObjectTypeId in
  // schema.prisma.
  referenceTargetKind?: string | null;
  referenceObjectTypeId?: string | null;
  // Only meaningful when type is 'OBJECT_REFERENCE' and referenceTargetKind
  // is 'OBJECT_TYPE' — see FieldDefinition.relationshipType/RelationshipType
  // in schema.prisma.
  relationshipType?: string | null;
  // Only meaningful when type is 'AUTO_IDENTIFIER' — see
  // FieldDefinition.autoIdentifierRackFieldKey/
  // autoIdentifierEquipmentTypeCodeId in schema.prisma.
  autoIdentifierRackFieldKey?: string | null;
  autoIdentifierEquipmentTypeCodeId?: string | null;
  // Only meaningful when type is 'RACK_POSITION' — see
  // FieldDefinition.rackPositionRackFieldKey in schema.prisma.
  rackPositionRackFieldKey?: string | null;
  // Only meaningful when type is 'VM_IDENTIFIER' — see
  // FieldDefinition.vmIdentifierClusterFieldKey and the three fields next
  // to it in schema.prisma.
  vmIdentifierClusterFieldKey?: string | null;
  vmIdentifierClusterCodeFieldKey?: string | null;
  vmIdentifierIsCodeFieldKey?: string | null;
  vmIdentifierRoleFieldKey?: string | null;
};

// Pre-check run before create/update, mirroring the pattern used for
// Location's parentId (locations/actions.ts): a bad referenceObjectTypeId
// would otherwise fail at the FK level with an unfriendly raw error, for
// both the field's own config and every OBJECT_REFERENCE column inside a
// TABLE field's tableColumns.
async function validateReferenceObjectTypeIds(
  data: Pick<
    FieldDefinitionInput,
    'type' | 'referenceObjectTypeId' | 'tableColumns'
  >,
): Promise<string | null> {
  const wanted = new Set<string>();
  if (data.type === 'OBJECT_REFERENCE' && data.referenceObjectTypeId) {
    wanted.add(data.referenceObjectTypeId);
  }
  if (data.type === 'TABLE') {
    for (const col of data.tableColumns) {
      if (col.type === 'OBJECT_REFERENCE' && col.referenceObjectTypeId) {
        wanted.add(col.referenceObjectTypeId);
      }
    }
  }
  if (wanted.size === 0) return null;

  const found = await prisma.objectType.findMany({
    where: { id: { in: Array.from(wanted) } },
    select: { id: true },
  });
  const foundIds = new Set(found.map((f) => f.id));
  const missing = Array.from(wanted).find((id) => !foundIds.has(id));
  return missing ? 'Selected object type does not exist' : null;
}

// Pre-check for AUTO_IDENTIFIER fields (CMDB phase 3): the configured
// autoIdentifierRackFieldKey must name a sibling field on the *same*
// ObjectType (not a global fieldDefinitionId, since the two fields are
// created/edited independently and the rack field may not exist yet at
// the exact moment this one is being renamed — matching by key, which the
// admin sees and controls directly, is simpler and avoids that ordering
// problem) that is itself OBJECT_REFERENCE targeting LOCATION — anything
// else would let an AUTO_IDENTIFIER field "point at" a plain text field
// and fail confusingly at generation time instead of at save time here.
// autoIdentifierEquipmentTypeCodeId is checked for existence the same way
// validateReferenceObjectTypeIds checks referenceObjectTypeId above.
async function validateAutoIdentifierConfig(
  data: Pick<
    FieldDefinitionInput,
    'type' | 'autoIdentifierRackFieldKey' | 'autoIdentifierEquipmentTypeCodeId'
  >,
  objectTypeId: string,
  excludeFieldId?: string,
): Promise<{ rackFieldKey?: string; equipmentTypeCodeId?: string } | null> {
  if (data.type !== 'AUTO_IDENTIFIER') return null;

  const errors: { rackFieldKey?: string; equipmentTypeCodeId?: string } = {};

  if (data.autoIdentifierRackFieldKey) {
    const rackField = await prisma.fieldDefinition.findFirst({
      where: {
        objectTypeId,
        key: data.autoIdentifierRackFieldKey,
        ...(excludeFieldId ? { id: { not: excludeFieldId } } : {}),
      },
      select: { type: true, referenceTargetKind: true },
    });
    if (
      !rackField ||
      rackField.type !== 'OBJECT_REFERENCE' ||
      rackField.referenceTargetKind !== 'LOCATION'
    ) {
      errors.rackFieldKey =
        'Selected field must be an OBJECT_REFERENCE field on this type, linking to a location';
    }
  }

  if (data.autoIdentifierEquipmentTypeCodeId) {
    const code = await prisma.equipmentTypeCode.findUnique({
      where: { id: data.autoIdentifierEquipmentTypeCodeId },
      select: { id: true },
    });
    if (!code) {
      errors.equipmentTypeCodeId =
        'Selected equipment-type code does not exist';
    }
  }

  return Object.keys(errors).length > 0 ? errors : null;
}

// Pre-check for RACK_POSITION fields (CMDB phase 5) — same "sibling field
// by key must be OBJECT_REFERENCE targeting LOCATION" check as
// validateAutoIdentifierConfig's rack-field half above, minus the
// equipment-type-code half (RACK_POSITION has no dictionary — height is
// typed per instance, not fixed per field, see the FieldType.RACK_POSITION
// doc comment in schema.prisma for why).
async function validateRackPositionConfig(
  data: Pick<FieldDefinitionInput, 'type' | 'rackPositionRackFieldKey'>,
  objectTypeId: string,
  excludeFieldId?: string,
): Promise<{ rackFieldKey?: string } | null> {
  if (data.type !== 'RACK_POSITION') return null;
  if (!data.rackPositionRackFieldKey) return null;

  const rackField = await prisma.fieldDefinition.findFirst({
    where: {
      objectTypeId,
      key: data.rackPositionRackFieldKey,
      ...(excludeFieldId ? { id: { not: excludeFieldId } } : {}),
    },
    select: { type: true, referenceTargetKind: true },
  });
  if (
    !rackField ||
    rackField.type !== 'OBJECT_REFERENCE' ||
    rackField.referenceTargetKind !== 'LOCATION'
  ) {
    return {
      rackFieldKey:
        'Selected field must be an OBJECT_REFERENCE field on this type, linking to a location',
    };
  }
  return null;
}

// Pre-check for VM_IDENTIFIER fields (CMDB — clusters/VMs, 3 September
// 2026, see it-passports-design.md section 8.15). Four sibling-field-key
// checks, three of them the familiar "key of a field on this same
// ObjectType" shape used by AUTO_IDENTIFIER/RACK_POSITION above:
//   * vmIdentifierClusterFieldKey must name a sibling field on THIS
//     ObjectType that is OBJECT_REFERENCE targeting OBJECT_TYPE with a
//     *fixed* referenceObjectTypeId (i.e. restricted to one specific
//     Cluster-type passport, not "any type" — unlike a patch-cord column,
//     a VM_IDENTIFIER field needs to know exactly which ObjectType is "the
//     cluster type" so vmIdentifierClusterCodeFieldKey below can be
//     resolved against it).
//   * vmIdentifierIsCodeFieldKey must name a sibling TEXT field on this
//     ObjectType.
//   * vmIdentifierRoleFieldKey must name a sibling SELECT field on this
//     ObjectType.
// vmIdentifierClusterCodeFieldKey is the odd one out — it's cross-type: it
// must name a TEXT field, but on the Cluster ObjectType that
// vmIdentifierClusterFieldKey's target is restricted to, not on this VM's
// own ObjectType. That target type is only known once the cluster field
// itself has been validated above, so this check runs second and depends
// on the first one's result.
async function validateVmIdentifierConfig(
  data: Pick<
    FieldDefinitionInput,
    | 'type'
    | 'vmIdentifierClusterFieldKey'
    | 'vmIdentifierClusterCodeFieldKey'
    | 'vmIdentifierIsCodeFieldKey'
    | 'vmIdentifierRoleFieldKey'
  >,
  objectTypeId: string,
  excludeFieldId?: string,
): Promise<{
  clusterFieldKey?: string;
  clusterCodeFieldKey?: string;
  isCodeFieldKey?: string;
  roleFieldKey?: string;
} | null> {
  if (data.type !== 'VM_IDENTIFIER') return null;

  const errors: {
    clusterFieldKey?: string;
    clusterCodeFieldKey?: string;
    isCodeFieldKey?: string;
    roleFieldKey?: string;
  } = {};

  let clusterObjectTypeId: string | null = null;
  if (data.vmIdentifierClusterFieldKey) {
    const clusterField = await prisma.fieldDefinition.findFirst({
      where: {
        objectTypeId,
        key: data.vmIdentifierClusterFieldKey,
        ...(excludeFieldId ? { id: { not: excludeFieldId } } : {}),
      },
      select: {
        type: true,
        referenceTargetKind: true,
        referenceObjectTypeId: true,
      },
    });
    if (
      !clusterField ||
      clusterField.type !== 'OBJECT_REFERENCE' ||
      clusterField.referenceTargetKind !== 'OBJECT_TYPE' ||
      !clusterField.referenceObjectTypeId
    ) {
      errors.clusterFieldKey =
        'Selected field must be an OBJECT_REFERENCE field on this type, linking to one fixed object type';
    } else {
      clusterObjectTypeId = clusterField.referenceObjectTypeId;
    }
  }

  if (data.vmIdentifierClusterCodeFieldKey) {
    if (!clusterObjectTypeId) {
      // Cluster field itself is missing/invalid — nothing to check the
      // code field against. The cluster-field error above already covers
      // this case, so this branch stays silent rather than reporting a
      // confusing second error.
    } else {
      const codeField = await prisma.fieldDefinition.findFirst({
        where: {
          objectTypeId: clusterObjectTypeId,
          key: data.vmIdentifierClusterCodeFieldKey,
        },
        select: { type: true },
      });
      if (!codeField || codeField.type !== 'TEXT') {
        errors.clusterCodeFieldKey =
          'Selected field must be a TEXT field on the cluster type';
      }
    }
  }

  if (data.vmIdentifierIsCodeFieldKey) {
    const isCodeField = await prisma.fieldDefinition.findFirst({
      where: {
        objectTypeId,
        key: data.vmIdentifierIsCodeFieldKey,
        ...(excludeFieldId ? { id: { not: excludeFieldId } } : {}),
      },
      select: { type: true },
    });
    if (!isCodeField || isCodeField.type !== 'TEXT') {
      errors.isCodeFieldKey =
        'Selected field must be a TEXT field on this type';
    }
  }

  if (data.vmIdentifierRoleFieldKey) {
    const roleField = await prisma.fieldDefinition.findFirst({
      where: {
        objectTypeId,
        key: data.vmIdentifierRoleFieldKey,
        ...(excludeFieldId ? { id: { not: excludeFieldId } } : {}),
      },
      select: { type: true },
    });
    if (!roleField || roleField.type !== 'SELECT') {
      errors.roleFieldKey =
        'Selected field must be a SELECT field on this type';
    }
  }

  return Object.keys(errors).length > 0 ? errors : null;
}

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

  const refTypeError = await validateReferenceObjectTypeIds(data);
  if (refTypeError) {
    return {
      ok: false,
      fieldErrors: { referenceObjectTypeId: refTypeError },
    };
  }

  const autoIdErrors = await validateAutoIdentifierConfig(data, objectTypeId);
  if (autoIdErrors) {
    return {
      ok: false,
      fieldErrors: {
        ...(autoIdErrors.rackFieldKey
          ? { autoIdentifierRackFieldKey: autoIdErrors.rackFieldKey }
          : {}),
        ...(autoIdErrors.equipmentTypeCodeId
          ? {
              autoIdentifierEquipmentTypeCodeId:
                autoIdErrors.equipmentTypeCodeId,
            }
          : {}),
      },
    };
  }

  const rackPositionErrors = await validateRackPositionConfig(
    data,
    objectTypeId,
  );
  if (rackPositionErrors) {
    return {
      ok: false,
      fieldErrors: {
        ...(rackPositionErrors.rackFieldKey
          ? { rackPositionRackFieldKey: rackPositionErrors.rackFieldKey }
          : {}),
      },
    };
  }

  const vmIdErrors = await validateVmIdentifierConfig(data, objectTypeId);
  if (vmIdErrors) {
    return {
      ok: false,
      fieldErrors: {
        ...(vmIdErrors.clusterFieldKey
          ? { vmIdentifierClusterFieldKey: vmIdErrors.clusterFieldKey }
          : {}),
        ...(vmIdErrors.clusterCodeFieldKey
          ? { vmIdentifierClusterCodeFieldKey: vmIdErrors.clusterCodeFieldKey }
          : {}),
        ...(vmIdErrors.isCodeFieldKey
          ? { vmIdentifierIsCodeFieldKey: vmIdErrors.isCodeFieldKey }
          : {}),
        ...(vmIdErrors.roleFieldKey
          ? { vmIdentifierRoleFieldKey: vmIdErrors.roleFieldKey }
          : {}),
      },
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
          required:
            data.type === 'AUTO_IDENTIFIER' || data.type === 'VM_IDENTIFIER'
              ? false
              : data.required,
          visibleToAll: data.visibleToAll,
          validateAsIp: data.type === 'TEXT' ? data.validateAsIp : false,
          referenceTargetKind:
            data.type === 'OBJECT_REFERENCE' ? data.referenceTargetKind : null,
          referenceObjectTypeId:
            data.type === 'OBJECT_REFERENCE' &&
            data.referenceTargetKind === 'OBJECT_TYPE'
              ? data.referenceObjectTypeId
              : null,
          relationshipType:
            data.type === 'OBJECT_REFERENCE' &&
            data.referenceTargetKind === 'OBJECT_TYPE'
              ? data.relationshipType
              : null,
          autoIdentifierRackFieldKey:
            data.type === 'AUTO_IDENTIFIER'
              ? data.autoIdentifierRackFieldKey
              : null,
          autoIdentifierEquipmentTypeCodeId:
            data.type === 'AUTO_IDENTIFIER'
              ? data.autoIdentifierEquipmentTypeCodeId
              : null,
          rackPositionRackFieldKey:
            data.type === 'RACK_POSITION'
              ? data.rackPositionRackFieldKey
              : null,
          vmIdentifierClusterFieldKey:
            data.type === 'VM_IDENTIFIER'
              ? data.vmIdentifierClusterFieldKey
              : null,
          vmIdentifierClusterCodeFieldKey:
            data.type === 'VM_IDENTIFIER'
              ? data.vmIdentifierClusterCodeFieldKey
              : null,
          vmIdentifierIsCodeFieldKey:
            data.type === 'VM_IDENTIFIER'
              ? data.vmIdentifierIsCodeFieldKey
              : null,
          vmIdentifierRoleFieldKey:
            data.type === 'VM_IDENTIFIER'
              ? data.vmIdentifierRoleFieldKey
              : null,
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
        objectTypeId_key: {
          objectTypeId: existing.objectTypeId,
          key: data.key,
        },
      },
    });
    if (clash) {
      return {
        ok: false,
        fieldErrors: {
          key: 'A field with this key already exists on this type',
        },
      };
    }
  }

  const refTypeError = await validateReferenceObjectTypeIds(data);
  if (refTypeError) {
    return {
      ok: false,
      fieldErrors: { referenceObjectTypeId: refTypeError },
    };
  }

  const autoIdErrors = await validateAutoIdentifierConfig(
    data,
    existing.objectTypeId,
    fieldId,
  );
  if (autoIdErrors) {
    return {
      ok: false,
      fieldErrors: {
        ...(autoIdErrors.rackFieldKey
          ? { autoIdentifierRackFieldKey: autoIdErrors.rackFieldKey }
          : {}),
        ...(autoIdErrors.equipmentTypeCodeId
          ? {
              autoIdentifierEquipmentTypeCodeId:
                autoIdErrors.equipmentTypeCodeId,
            }
          : {}),
      },
    };
  }

  const rackPositionErrors = await validateRackPositionConfig(
    data,
    existing.objectTypeId,
    fieldId,
  );
  if (rackPositionErrors) {
    return {
      ok: false,
      fieldErrors: {
        ...(rackPositionErrors.rackFieldKey
          ? { rackPositionRackFieldKey: rackPositionErrors.rackFieldKey }
          : {}),
      },
    };
  }

  const vmIdErrors = await validateVmIdentifierConfig(
    data,
    existing.objectTypeId,
    fieldId,
  );
  if (vmIdErrors) {
    return {
      ok: false,
      fieldErrors: {
        ...(vmIdErrors.clusterFieldKey
          ? { vmIdentifierClusterFieldKey: vmIdErrors.clusterFieldKey }
          : {}),
        ...(vmIdErrors.clusterCodeFieldKey
          ? { vmIdentifierClusterCodeFieldKey: vmIdErrors.clusterCodeFieldKey }
          : {}),
        ...(vmIdErrors.isCodeFieldKey
          ? { vmIdentifierIsCodeFieldKey: vmIdErrors.isCodeFieldKey }
          : {}),
        ...(vmIdErrors.roleFieldKey
          ? { vmIdentifierRoleFieldKey: vmIdErrors.roleFieldKey }
          : {}),
      },
    };
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
    ? await nextOrderForSection(
        existing.objectTypeId,
        normalizedSection,
        fieldId,
      )
    : null;

  try {
    // FieldVisibility rows are replaced wholesale rather than diffed —
    // simpler, and the set is small (a handful of Passport-scope roles).
    const ops: Prisma.PrismaPromise<unknown>[] = [
      prisma.fieldVisibility.deleteMany({
        where: { fieldDefinitionId: fieldId },
      }),
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
          required:
            data.type === 'AUTO_IDENTIFIER' || data.type === 'VM_IDENTIFIER'
              ? false
              : data.required,
          visibleToAll: data.visibleToAll,
          validateAsIp: data.type === 'TEXT' ? data.validateAsIp : false,
          referenceTargetKind:
            data.type === 'OBJECT_REFERENCE' ? data.referenceTargetKind : null,
          referenceObjectTypeId:
            data.type === 'OBJECT_REFERENCE' &&
            data.referenceTargetKind === 'OBJECT_TYPE'
              ? data.referenceObjectTypeId
              : null,
          relationshipType:
            data.type === 'OBJECT_REFERENCE' &&
            data.referenceTargetKind === 'OBJECT_TYPE'
              ? data.relationshipType
              : null,
          autoIdentifierRackFieldKey:
            data.type === 'AUTO_IDENTIFIER'
              ? data.autoIdentifierRackFieldKey
              : null,
          autoIdentifierEquipmentTypeCodeId:
            data.type === 'AUTO_IDENTIFIER'
              ? data.autoIdentifierEquipmentTypeCodeId
              : null,
          rackPositionRackFieldKey:
            data.type === 'RACK_POSITION'
              ? data.rackPositionRackFieldKey
              : null,
          vmIdentifierClusterFieldKey:
            data.type === 'VM_IDENTIFIER'
              ? data.vmIdentifierClusterFieldKey
              : null,
          vmIdentifierClusterCodeFieldKey:
            data.type === 'VM_IDENTIFIER'
              ? data.vmIdentifierClusterCodeFieldKey
              : null,
          vmIdentifierIsCodeFieldKey:
            data.type === 'VM_IDENTIFIER'
              ? data.vmIdentifierIsCodeFieldKey
              : null,
          vmIdentifierRoleFieldKey:
            data.type === 'VM_IDENTIFIER'
              ? data.vmIdentifierRoleFieldKey
              : null,
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

export async function deleteFieldDefinition(
  fieldId: string,
): Promise<ActionResult> {
  const currentUser = await requirePassportAdmin();
  if (!currentUser) return PERMISSION_DENIED;

  const field = await prisma.fieldDefinition.findUnique({
    where: { id: fieldId },
  });
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

  const field = await prisma.fieldDefinition.findUnique({
    where: { id: fieldId },
  });
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
      prisma.fieldDefinition.update({
        where: { id: a.id },
        data: { order: b.order },
      }),
      prisma.fieldDefinition.update({
        where: { id: b.id },
        data: { order: a.order },
      }),
    ]);
    revalidatePath(`/object-types/${field.objectTypeId}`);
    return { ok: true };
  } catch {
    return { ok: false, message: 'Failed to reorder field' };
  }
}
