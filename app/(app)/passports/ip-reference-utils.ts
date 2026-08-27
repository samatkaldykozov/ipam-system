import type { FieldDefinition, Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';

// Shared by both actions.ts (create/update passport, form-driven) and
// csv-actions.ts (bulk import) — same reason validate-values.ts is a plain
// module and not 'use server': a 'use server' file may only export async
// functions, so this cross-file logic has to live outside either of them.
//
// FieldType.IP_REFERENCE fields store the *id* of the referenced IpAddress
// under their key in ObjectInstance.values (same "one JSON blob" pattern as
// every other field type), but FieldIpAddressValue is the real relational
// mirror of that — see schema.prisma's doc comment on that model. Every
// write path that can set an IP_REFERENCE field's value must keep both in
// sync, which is what syncFieldIpAddressLinks below does.

export function ipReferenceFields(fields: FieldDefinition[]) {
  return fields.filter((f) => f.type === 'IP_REFERENCE');
}

// Given the ids referenced this save (already validated to exist — see
// validateIpReferenceValues below), replaces this passport's link rows
// wholesale. Same "delete then recreate" approach already used for
// TableFieldRow/ObjectInstanceResponsible in actions.ts — the sets
// involved are small (one row per IP_REFERENCE field on the object type).
export async function syncFieldIpAddressLinks(
  tx: Prisma.TransactionClient,
  objectInstanceId: string,
  ipRefFields: FieldDefinition[],
  values: Record<string, unknown>,
): Promise<void> {
  await tx.fieldIpAddressValue.deleteMany({ where: { objectInstanceId } });
  if (ipRefFields.length === 0) return;

  const rows = ipRefFields
    .map((field) => {
      const raw = values[field.key];
      return typeof raw === 'string' && raw
        ? { objectInstanceId, fieldDefinitionId: field.id, ipAddressId: raw }
        : null;
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (rows.length > 0) {
    await tx.fieldIpAddressValue.createMany({ data: rows });
  }
}

// Pre-check run before the transaction: every non-empty IP_REFERENCE value
// must be the id of a real IpAddress row, or the transaction would fail on
// the FieldIpAddressValue FK with an unfriendly raw error. Returns field
// errors keyed the same way as validate-values.ts's ValidatePassportValuesResult.
export async function validateIpReferenceValues(
  ipRefFields: FieldDefinition[],
  values: Record<string, unknown>,
): Promise<Record<string, string>> {
  const wanted = ipRefFields
    .map((field) => {
      const raw = values[field.key];
      return typeof raw === 'string' && raw
        ? { field, ipAddressId: raw }
        : null;
    })
    .filter((w): w is NonNullable<typeof w> => w !== null);

  if (wanted.length === 0) return {};

  const found = await prisma.ipAddress.findMany({
    where: { id: { in: wanted.map((w) => w.ipAddressId) } },
    select: { id: true },
  });
  const foundIds = new Set(found.map((f) => f.id));

  const fieldErrors: Record<string, string> = {};
  for (const { field, ipAddressId } of wanted) {
    if (!foundIds.has(ipAddressId)) {
      fieldErrors[field.key] =
        `«${field.label}»: выбранного IP-адреса больше нет в IPAM — выберите другой`;
    }
  }
  return fieldErrors;
}

export interface IpAddressRefLabel {
  id: string;
  address: string;
  hostname: string | null;
  networkLabel: string;
}

// Resolves a batch of IpAddress ids to display labels — used both by the
// fill form (to show the currently selected address in edit mode, since
// the stored value is just an id) and by the read-only passport view /
// CSV export (to show the address instead of a raw uuid).
export async function resolveIpAddressLabels(
  ids: string[],
): Promise<Map<string, IpAddressRefLabel>> {
  const unique = Array.from(new Set(ids)).filter(Boolean);
  if (unique.length === 0) return new Map();

  const found = await prisma.ipAddress.findMany({
    where: { id: { in: unique } },
    select: {
      id: true,
      address: true,
      hostname: true,
      network: { select: { name: true, cidr: true } },
    },
  });

  return new Map(
    found.map((ip) => [
      ip.id,
      {
        id: ip.id,
        address: ip.address,
        hostname: ip.hostname,
        networkLabel: `${ip.network.name} (${ip.network.cidr})`,
      },
    ]),
  );
}
