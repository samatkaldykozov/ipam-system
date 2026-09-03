import type { FieldDefinition, Prisma } from '@prisma/client';

// Shared by actions.ts only for now (create/update passport) — same
// reasoning as auto-identifier-utils.ts, which this module deliberately
// mirrors line for line wherever the two field types share behaviour.
//
// FieldType.VM_IDENTIFIER (CMDB — clusters/VMs, 3 September 2026, see
// it-passports-design.md section 8.15 and schema.prisma's doc comment on
// FieldType) fields hold a computed composite identifier string, e.g.
// "prx1-biling-app-2", assembled from four things: the cluster this VM
// belongs to (read off another OBJECT_REFERENCE field on the same
// ObjectType — FieldDefinition.vmIdentifierClusterFieldKey), that
// cluster's own short code (read off a TEXT field on the CLUSTER
// ObjectType itself — FieldDefinition.vmIdentifierClusterCodeFieldKey,
// see its doc comment in schema.prisma for why this is cross-type), a
// manually typed information-system code
// (FieldDefinition.vmIdentifierIsCodeFieldKey), a role from a fixed list
// (FieldDefinition.vmIdentifierRoleFieldKey), and the next free sequence
// number for that (cluster, IS code, role) triple. Exactly like
// AUTO_IDENTIFIER, once generated an identifier is never regenerated on a
// later save — see syncVmIdentifierValue below.
//
// The role SELECT field's own options are deliberately stored as the
// lowercase ASCII codes used directly in the identifier (e.g. "app", not
// "App") — same treatment as equipment_type_codes.code for
// AUTO_IDENTIFIER (also stored and used verbatim, never translated at
// generation time). See the seeder for "Виртуальная машина" for the exact
// option list.

export function vmIdentifierFields(fields: FieldDefinition[]) {
  return fields.filter((f) => f.type === 'VM_IDENTIFIER');
}

// Pre-check run before the transaction, mirroring
// validateAutoIdentifierRackValues: a VM_IDENTIFIER field can't generate
// anything without a cluster, an IS code, and a role, regardless of
// whether those fields' own `required` flags are set. Skips fields that
// already have a generated value (existingValues) — see
// syncVmIdentifierValue's "generate once" rule below.
export function validateVmIdentifierFields(
  allFields: FieldDefinition[],
  values: Record<string, unknown>,
  existingValues: Record<string, unknown> | null,
): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  const fieldsByKey = new Map(allFields.map((f) => [f.key, f] as const));

  for (const field of vmIdentifierFields(allFields)) {
    const alreadyGenerated =
      existingValues &&
      typeof existingValues[field.key] === 'string' &&
      (existingValues[field.key] as string).length > 0;
    if (alreadyGenerated) continue;

    const missing: string[] = [];

    const clusterFieldKey = field.vmIdentifierClusterFieldKey;
    const clusterValue = clusterFieldKey ? values[clusterFieldKey] : undefined;
    if (typeof clusterValue !== 'string' || !clusterValue) {
      const clusterField = clusterFieldKey
        ? fieldsByKey.get(clusterFieldKey)
        : undefined;
      missing.push(clusterField ? `«${clusterField.label}»` : 'кластер');
    }

    const isCodeFieldKey = field.vmIdentifierIsCodeFieldKey;
    const isCodeValue = isCodeFieldKey ? values[isCodeFieldKey] : undefined;
    if (typeof isCodeValue !== 'string' || !isCodeValue.trim()) {
      const isCodeField = isCodeFieldKey
        ? fieldsByKey.get(isCodeFieldKey)
        : undefined;
      missing.push(
        isCodeField ? `«${isCodeField.label}»` : 'код информационной системы',
      );
    }

    const roleFieldKey = field.vmIdentifierRoleFieldKey;
    const roleValue = roleFieldKey ? values[roleFieldKey] : undefined;
    if (typeof roleValue !== 'string' || !roleValue) {
      const roleField = roleFieldKey
        ? fieldsByKey.get(roleFieldKey)
        : undefined;
      missing.push(roleField ? `«${roleField.label}»` : 'роль');
    }

    if (missing.length > 0) {
      fieldErrors[field.key] =
        `«${field.label}»: сначала укажите ${missing.join(', ')}`;
    }
  }

  return fieldErrors;
}

// Computes the next free sequence number for (targetClusterInstanceId,
// isCode, role) and inserts the FieldVmIdentifierValue row, retrying
// forward on a rare concurrent-collision unique violation — same
// trade-off, same MAX_ATTEMPTS safety bound, as
// generateAutoIdentifierValue in auto-identifier-utils.ts.
const MAX_SEQ_ATTEMPTS = 20;

async function generateVmIdentifierValue(
  tx: Prisma.TransactionClient,
  params: {
    objectInstanceId: string;
    fieldDefinitionId: string;
    targetClusterInstanceId: string;
    isCode: string;
    role: string;
    clusterCode: string;
  },
): Promise<string> {
  const {
    objectInstanceId,
    fieldDefinitionId,
    targetClusterInstanceId,
    isCode,
    role,
    clusterCode,
  } = params;

  const existingMax = await tx.fieldVmIdentifierValue.aggregate({
    where: { targetClusterInstanceId, isCode, role },
    _max: { seq: true },
  });
  let seq = (existingMax._max.seq ?? 0) + 1;

  for (let attempt = 0; attempt < MAX_SEQ_ATTEMPTS; attempt++) {
    const value = `${clusterCode}-${isCode}-${role}-${seq}`;
    try {
      await tx.fieldVmIdentifierValue.create({
        data: {
          objectInstanceId,
          fieldDefinitionId,
          targetClusterInstanceId,
          isCode,
          role,
          seq,
          value,
        },
      });
      return value;
    } catch (err) {
      const isUniqueViolation =
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code?: string }).code === 'P2002';
      if (!isUniqueViolation) throw err;
      seq += 1;
    }
  }
  throw new Error(
    `Could not allocate a free sequence number for ${clusterCode}-${isCode}-${role} after ${MAX_SEQ_ATTEMPTS} attempts`,
  );
}

// Runs inside the same transaction as createPassport/updatePassport, after
// the ObjectInstance row exists — same contract as
// syncAutoIdentifierValues (see its doc comment in
// auto-identifier-utils.ts for the full explanation, repeated only where
// it differs below). Mutates `values` in place.
//
// Deliberately NOT a delete-then-recreate sync, same reasoning as
// FieldAutoIdentifierValue — see the doc comment on
// FieldVmIdentifierValue in schema.prisma.
export async function syncVmIdentifierValue(
  tx: Prisma.TransactionClient,
  objectInstanceId: string,
  allFields: FieldDefinition[],
  values: Record<string, unknown>,
  existingValues: Record<string, unknown> | null,
): Promise<void> {
  const fields = vmIdentifierFields(allFields);
  if (fields.length === 0) return;

  for (const field of fields) {
    const existing = existingValues?.[field.key];
    if (typeof existing === 'string' && existing) {
      values[field.key] = existing;
      continue;
    }

    // validateVmIdentifierFields already guaranteed these are set for any
    // field reaching this branch — see its call site in actions.ts.
    const targetClusterInstanceId = values[
      field.vmIdentifierClusterFieldKey!
    ] as string;
    const isCode = (values[field.vmIdentifierIsCodeFieldKey!] as string).trim();
    const role = values[field.vmIdentifierRoleFieldKey!] as string;

    const clusterInstance = await tx.objectInstance.findUnique({
      where: { id: targetClusterInstanceId },
      select: { values: true },
    });
    if (!clusterInstance) {
      throw new Error(`Cluster instance ${targetClusterInstanceId} not found`);
    }
    const clusterValues = clusterInstance.values as Record<string, unknown>;
    const clusterCode = clusterValues[field.vmIdentifierClusterCodeFieldKey!];
    if (typeof clusterCode !== 'string' || !clusterCode.trim()) {
      throw new Error(
        `Cluster instance ${targetClusterInstanceId} has no value for field "${field.vmIdentifierClusterCodeFieldKey}"`,
      );
    }

    const value = await generateVmIdentifierValue(tx, {
      objectInstanceId,
      fieldDefinitionId: field.id,
      targetClusterInstanceId,
      isCode,
      role,
      clusterCode: clusterCode.trim(),
    });
    values[field.key] = value;
  }
}
