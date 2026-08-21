'use server';

import { revalidatePath } from 'next/cache';
import { NetworkStatus } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { getCurrentUser, canEdit } from '@/lib/auth';
import { containsCidr, cidrsOverlap, getPrefixLength } from '@/lib/cidr-utils';
import { parseCsv, generateCsv, type ImportResult } from '@/lib/csv-utils';
import { NETWORK_STATUSES } from '@/app/(app)/networks/types';

const NETWORK_CSV_HEADERS = [
  'cidr',
  'name',
  'description',
  'vlanId',
  'status',
  'locationCode',
  'parentCidr',
];

const MAX_IMPORT_ROWS = 2000;

export async function exportNetworksCsv(): Promise<string> {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return generateCsv(NETWORK_CSV_HEADERS, []);
  }

  const networks = await prisma.network.findMany({
    include: {
      location: { select: { code: true } },
      parent: { select: { cidr: true } },
    },
    orderBy: { cidr: 'asc' },
  });

  const rows = networks.map((n) => [
    n.cidr,
    n.name,
    n.description ?? '',
    n.vlanId ?? '',
    n.status,
    n.location?.code ?? '',
    n.parent?.cidr ?? '',
  ]);

  return generateCsv(NETWORK_CSV_HEADERS, rows);
}

// Imports (creates or updates, matched by CIDR) networks from a CSV built to
// the same column layout as exportNetworksCsv(). Rows are processed in file
// order and validated with the same hierarchy/overlap rules as the regular
// create/update actions, but working off in-memory maps instead of calling
// those actions directly — going row-by-row through getCurrentUser() for a
// few hundred rows would mean a few hundred extra auth round-trips. A
// parentCidr may point at a network already in the database OR at an
// earlier row in the same file (so a file can create a parent and its
// children in one pass, as long as the parent line comes first).
export async function importNetworksCsv(
  csvText: string,
): Promise<ImportResult> {
  const currentUser = await getCurrentUser();
  if (!currentUser || !canEdit(currentUser.role)) {
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

  const records = parseCsv(csvText);
  if (records.length === 0) {
    return {
      ok: false,
      created: 0,
      updated: 0,
      errors: [{ row: 0, message: 'No data rows found in the CSV file.' }],
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
          message: `This file has ${records.length} rows; imports are limited to ${MAX_IMPORT_ROWS} at a time.`,
        },
      ],
    };
  }

  const [locations, existingNetworks] = await Promise.all([
    prisma.location.findMany({ select: { id: true, code: true } }),
    prisma.network.findMany({
      select: { id: true, cidr: true, parentId: true },
    }),
  ]);

  const locationIdByCode = new Map<string, string>();
  for (const l of locations) {
    locationIdByCode.set(l.code.toLowerCase(), l.id);
  }

  const dbCidrs = new Set(existingNetworks.map((n) => n.cidr));
  const networkByCidr = new Map<
    string,
    { id: string; parentId: string | null }
  >();
  for (const n of existingNetworks) {
    networkByCidr.set(n.cidr, { id: n.id, parentId: n.parentId });
  }
  const siblingsByParent = new Map<string, string[]>();
  for (const n of existingNetworks) {
    const key = n.parentId ?? 'root';
    const list = siblingsByParent.get(key) ?? [];
    list.push(n.cidr);
    siblingsByParent.set(key, list);
  }

  let created = 0;
  let updated = 0;
  const errors: { row: number; message: string }[] = [];

  for (let i = 0; i < records.length; i++) {
    const rowNum = i + 2; // +1 for header row, +1 for 1-indexing
    const record = records[i];

    const cidr = (record.cidr ?? '').trim();
    const name = (record.name ?? '').trim();
    if (!cidr || !name) {
      errors.push({ row: rowNum, message: 'cidr and name are required' });
      continue;
    }

    const prefixLength = getPrefixLength(cidr);
    if (prefixLength === null) {
      errors.push({ row: rowNum, message: `Invalid CIDR "${cidr}"` });
      continue;
    }

    let locationId: string | null = null;
    const locationCode = (record.locationCode ?? '').trim();
    if (locationCode) {
      const id = locationIdByCode.get(locationCode.toLowerCase());
      if (!id) {
        errors.push({
          row: rowNum,
          message: `Unknown location code "${locationCode}"`,
        });
        continue;
      }
      locationId = id;
    }

    let parentId: string | null = null;
    let parentCidrResolved: string | null = null;
    const parentCidr = (record.parentCidr ?? '').trim();
    if (parentCidr) {
      const parentEntry = networkByCidr.get(parentCidr);
      if (!parentEntry) {
        errors.push({
          row: rowNum,
          message: `Parent network "${parentCidr}" was not found. List parent networks before their children in the file, or make sure it already exists.`,
        });
        continue;
      }
      parentId = parentEntry.id;
      parentCidrResolved = parentCidr;
    }

    if (parentCidrResolved) {
      const parentLen = getPrefixLength(parentCidrResolved);
      if (parentLen === null || prefixLength <= parentLen) {
        errors.push({
          row: rowNum,
          message: `A child network must be more specific than its parent (${parentCidrResolved})`,
        });
        continue;
      }
      if (!containsCidr(parentCidrResolved, cidr)) {
        errors.push({
          row: rowNum,
          message:
            'Child network must be completely contained inside its parent network',
        });
        continue;
      }
    }

    const isUpdate = dbCidrs.has(cidr);
    const selfId = isUpdate ? networkByCidr.get(cidr)!.id : undefined;

    const siblingKey = parentId ?? 'root';
    const siblingCidrs = siblingsByParent.get(siblingKey) ?? [];
    const overlapping = siblingCidrs.find(
      (sibCidr) => sibCidr !== cidr && cidrsOverlap(cidr, sibCidr),
    );
    if (overlapping) {
      errors.push({
        row: rowNum,
        message: `This network overlaps an existing network (${overlapping}) at the same hierarchy level`,
      });
      continue;
    }

    const statusRaw = (record.status || 'ACTIVE').trim().toUpperCase();
    if (!NETWORK_STATUSES.includes(statusRaw as NetworkStatus)) {
      errors.push({
        row: rowNum,
        message: `Invalid status "${record.status}" — must be one of ${NETWORK_STATUSES.join(', ')}`,
      });
      continue;
    }

    const vlanRaw = (record.vlanId ?? '').trim();
    let vlanId: number | null = null;
    if (vlanRaw) {
      const n = Number(vlanRaw);
      if (!Number.isInteger(n) || n < 1 || n > 4094) {
        errors.push({
          row: rowNum,
          message: `Invalid VLAN "${record.vlanId}" — must be an integer between 1 and 4094`,
        });
        continue;
      }
      vlanId = n;
    }

    const description = (record.description ?? '').trim() || null;

    try {
      let networkId: string;
      if (isUpdate && selfId) {
        const network = await prisma.network.update({
          where: { id: selfId },
          data: {
            name,
            description,
            vlanId,
            status: statusRaw as NetworkStatus,
            locationId,
            parentId,
          },
        });
        networkId = network.id;
        updated += 1;
      } else {
        const network = await prisma.network.create({
          data: {
            cidr,
            name,
            description,
            vlanId,
            status: statusRaw as NetworkStatus,
            locationId,
            parentId,
          },
        });
        networkId = network.id;
        created += 1;
      }

      await prisma.auditLog.create({
        data: {
          action: isUpdate ? 'UPDATE' : 'CREATE',
          entity: 'Network',
          entityId: networkId,
          userId: currentUser.id,
          metadata: { cidr, name, source: 'csv-import' },
        },
      });

      networkByCidr.set(cidr, { id: networkId, parentId });
      dbCidrs.add(cidr);
      const list = siblingsByParent.get(siblingKey) ?? [];
      if (!list.includes(cidr)) list.push(cidr);
      siblingsByParent.set(siblingKey, list);
    } catch {
      errors.push({
        row: rowNum,
        message: 'Unexpected error while saving this row',
      });
    }
  }

  revalidatePath('/networks');

  return { ok: errors.length === 0, created, updated, errors };
}
