import type { FieldDefinition, Prisma } from '@prisma/client';

// Shared by actions.ts only for now (create/update passport) — kept as a
// plain module rather than folded into actions.ts, same reasoning as
// ip-reference-utils.ts/object-reference-utils.ts: a 'use server' file may
// only export async functions, and this logic is easier to read and test
// on its own.
//
// FieldType.AUTO_IDENTIFIER (CMDB phase 3, see it-passports-design.md
// section 8.1 item 3 and schema.prisma's doc comment on FieldType) fields
// hold a computed composite identifier string, e.g. "alma-A1-cs-3",
// assembled from three things: the rack this passport lives in (read off
// another OBJECT_REFERENCE-to-LOCATION field on the same ObjectType — see
// FieldDefinition.autoIdentifierRackFieldKey), a fixed equipment-type code
// (FieldDefinition.autoIdentifierEquipmentTypeCodeId), and the next free
// sequence number for that (rack, code) pair. Unlike every other reference
// type in this app, once generated an identifier is never regenerated on a
// later save — see syncAutoIdentifierValues below.
//
// Scope of this first pass (deliberately, see the AskUserQuestion decision
// recorded 28 August 2026): only rack-anchored equipment, format
// "{region}-{rack}-{code}-{seq}", built directly on the Location tree from
// phase 1. Cluster/VM/patch-cord identifier formats from the rest of the
// Kazakhtelecom standard are out of scope for this field type.

export function autoIdentifierFields(fields: FieldDefinition[]) {
  return fields.filter((f) => f.type === 'AUTO_IDENTIFIER');
}

type LocationAncestor = {
  id: string;
  kind: string;
  code: string;
  rowCode: string | null;
  parentId: string | null;
};

// Walks from the given Location up to the root via parentId, returning the
// chain root-first, target-last (at most 6 rows — REGION/CITY/BUILDING/
// ROOM/ZONE/RACK, see LocationKind in schema.prisma — so one query per
// level is fine at this app's scale rather than a recursive CTE).
async function resolveLocationAncestors(
  tx: Prisma.TransactionClient,
  locationId: string,
): Promise<LocationAncestor[] | null> {
  const chain: LocationAncestor[] = [];
  let currentId: string | null = locationId;
  while (currentId) {
    const node: LocationAncestor | null = await tx.location.findUnique({
      where: { id: currentId },
      select: {
        id: true,
        kind: true,
        code: true,
        rowCode: true,
        parentId: true,
      },
    });
    if (!node) return null;
    chain.unshift(node);
    currentId = node.parentId;
  }
  return chain;
}

// Assembles the "{region}-{location}" prefix from a root-to-rack ancestor
// chain. Deliberately does NOT re-derive the Kazakhtelecom standard's own
// letter-position grammar (e.g. which character means "building" vs
// "room") — it trusts that each node's `code` was already entered per that
// standard when the admin built the Location tree (phase 1), and simply
// concatenates them in root-to-leaf order, splicing the rack's rowCode
// right before its own code (mirroring the standard's own
// building+room+row+rack composition — see it-passports-design.md section
// 8.2). The outermost ancestor (root, no parent — REGION or CITY) becomes
// the leading region segment; everything below it becomes one concatenated
// location-code segment.
function buildAutoIdentifierPrefix(
  ancestors: LocationAncestor[],
): { regionCode: string; locationCode: string } | null {
  if (ancestors.length < 2) return null; // need at least a root + the rack itself
  const [region, ...rest] = ancestors;
  const locationCode = rest
    .map((node) =>
      node.kind === 'RACK' ? `${node.rowCode ?? ''}${node.code}` : node.code,
    )
    .join('');
  return { regionCode: region.code.toLowerCase(), locationCode };
}

// Pre-check run before the transaction, mirroring
// validateIpReferenceValues/validateObjectReferenceValues: an
// AUTO_IDENTIFIER field can't generate anything without a rack, so this
// requires the configured rack field to already hold a value, regardless
// of whether that field's own `required` flag is set. Skips fields that
// already have a generated value (existingValues) — see
// syncAutoIdentifierValues's "generate once" rule below, editing the rack
// afterward doesn't retroactively invalidate an already-assigned identifier.
export function validateAutoIdentifierRackValues(
  allFields: FieldDefinition[],
  values: Record<string, unknown>,
  existingValues: Record<string, unknown> | null,
): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  const fieldsByKey = new Map(allFields.map((f) => [f.key, f] as const));

  for (const field of autoIdentifierFields(allFields)) {
    const alreadyGenerated =
      existingValues &&
      typeof existingValues[field.key] === 'string' &&
      (existingValues[field.key] as string).length > 0;
    if (alreadyGenerated) continue;

    const rackFieldKey = field.autoIdentifierRackFieldKey;
    const rackField = rackFieldKey ? fieldsByKey.get(rackFieldKey) : undefined;
    const rackValue = rackFieldKey ? values[rackFieldKey] : undefined;
    if (typeof rackValue !== 'string' || !rackValue) {
      fieldErrors[field.key] =
        `«${field.label}»: сначала укажите${rackField ? ` «${rackField.label}»` : ' стойку'}`;
    }
  }

  return fieldErrors;
}

// Computes the next free sequence number for (rackLocationId,
// equipmentTypeCodeId) and inserts the FieldAutoIdentifierValue row,
// retrying forward on a rare concurrent-collision unique violation rather
// than holding an explicit lock — see the doc comment on
// FieldAutoIdentifierValue in schema.prisma for why that trade-off was
// judged acceptable at this app's scale (same posture as the plain
// pre-check uniqueness guards used elsewhere, e.g. findSibling in
// locations/actions.ts). MAX_ATTEMPTS is just a safety bound against an
// infinite loop if something is fundamentally wrong, not an expected path.
const MAX_SEQ_ATTEMPTS = 20;

async function generateAutoIdentifierValue(
  tx: Prisma.TransactionClient,
  params: {
    objectInstanceId: string;
    fieldDefinitionId: string;
    rackLocationId: string;
    equipmentTypeCodeId: string;
    regionCode: string;
    locationCode: string;
    equipmentCode: string;
  },
): Promise<string> {
  const {
    objectInstanceId,
    fieldDefinitionId,
    rackLocationId,
    equipmentTypeCodeId,
    regionCode,
    locationCode,
    equipmentCode,
  } = params;

  const existingMax = await tx.fieldAutoIdentifierValue.aggregate({
    where: { targetLocationId: rackLocationId, equipmentTypeCodeId },
    _max: { seq: true },
  });
  let seq = (existingMax._max.seq ?? 0) + 1;

  for (let attempt = 0; attempt < MAX_SEQ_ATTEMPTS; attempt++) {
    const value = `${regionCode}-${locationCode}-${equipmentCode}-${seq}`;
    try {
      await tx.fieldAutoIdentifierValue.create({
        data: {
          objectInstanceId,
          fieldDefinitionId,
          targetLocationId: rackLocationId,
          equipmentTypeCodeId,
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
    `Could not allocate a free sequence number for ${regionCode}-${locationCode}-${equipmentCode} after ${MAX_SEQ_ATTEMPTS} attempts`,
  );
}

// Runs inside the same transaction as createPassport/updatePassport, after
// the ObjectInstance row exists (its id is required). Mutates `values` in
// place, filling in every AUTO_IDENTIFIER field's key — either with the
// value it already had (read from existingValues, e.g. across an edit
// that doesn't touch the rack) or with a freshly generated one. The caller
// is responsible for persisting the mutated `values` object back onto the
// ObjectInstance afterward (see createPassport/updatePassport in
// actions.ts) — validatePassportValues never populates these keys itself
// (see validate-values.ts), so skipping this call would silently drop any
// AUTO_IDENTIFIER value from storage.
//
// Deliberately NOT a delete-then-recreate sync like every other reference
// type here: once a FieldAutoIdentifierValue row exists for
// (objectInstanceId, fieldDefinitionId), it is left untouched for the life
// of the passport, even if the rack field is edited afterward — see the
// doc comment on FieldAutoIdentifierValue in schema.prisma for why
// (reissuing a seq risks colliding with a value that may already be
// printed on physical equipment).
export async function syncAutoIdentifierValues(
  tx: Prisma.TransactionClient,
  objectInstanceId: string,
  allFields: FieldDefinition[],
  values: Record<string, unknown>,
  existingValues: Record<string, unknown> | null,
): Promise<void> {
  const fields = autoIdentifierFields(allFields);
  if (fields.length === 0) return;

  for (const field of fields) {
    const existing = existingValues?.[field.key];
    if (typeof existing === 'string' && existing) {
      values[field.key] = existing;
      continue;
    }

    // validateAutoIdentifierRackValues already guaranteed this is set for
    // any field reaching this branch — see its call site in actions.ts.
    const rackLocationId = values[field.autoIdentifierRackFieldKey!] as string;

    const ancestors = await resolveLocationAncestors(tx, rackLocationId);
    if (!ancestors) {
      throw new Error(`Rack location ${rackLocationId} not found`);
    }
    const target = ancestors[ancestors.length - 1];
    if (target.kind !== 'RACK') {
      throw new Error(
        `Auto-identifier field "${field.key}" expects a RACK-level location, got ${target.kind}`,
      );
    }
    const prefix = buildAutoIdentifierPrefix(ancestors);
    if (!prefix) {
      throw new Error(
        `Rack location ${rackLocationId} has no ancestor to use as a region code`,
      );
    }

    const equipmentTypeCode = await tx.equipmentTypeCode.findUnique({
      where: { id: field.autoIdentifierEquipmentTypeCodeId! },
      select: { code: true },
    });
    if (!equipmentTypeCode) {
      throw new Error(
        `Equipment type code ${field.autoIdentifierEquipmentTypeCodeId} not found`,
      );
    }

    const value = await generateAutoIdentifierValue(tx, {
      objectInstanceId,
      fieldDefinitionId: field.id,
      rackLocationId,
      equipmentTypeCodeId: field.autoIdentifierEquipmentTypeCodeId!,
      regionCode: prefix.regionCode,
      locationCode: prefix.locationCode,
      equipmentCode: equipmentTypeCode.code,
    });
    values[field.key] = value;
  }
}
