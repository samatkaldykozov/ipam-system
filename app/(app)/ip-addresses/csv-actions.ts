'use server';

import { revalidatePath } from 'next/cache';
import { IpStatus } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { getCurrentUser, canEdit } from '@/lib/auth';
import { containsCidr } from '@/lib/cidr-utils';
import { ipv4Regex, macAddressRegex } from '@/lib/validations';
import { parseCsv, generateCsv, type ImportResult } from '@/lib/csv-utils';
import { IP_STATUSES } from '@/app/(app)/ip-addresses/types';

const IP_ADDRESS_CSV_HEADERS = [
  'address',
  'hostname',
  'macAddress',
  'status',
  'description',
  'networkCidr',
];

const MAX_IMPORT_ROWS = 5000;

export async function exportIpAddressesCsv(): Promise<string> {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return generateCsv(IP_ADDRESS_CSV_HEADERS, []);
  }

  const items = await prisma.ipAddress.findMany({
    include: { network: { select: { cidr: true } } },
    orderBy: { address: 'asc' },
  });

  const rows = items.map((ip) => [
    ip.address,
    ip.hostname ?? '',
    ip.macAddress ?? '',
    ip.status,
    ip.description ?? '',
    ip.network.cidr,
  ]);

  return generateCsv(IP_ADDRESS_CSV_HEADERS, rows);
}

// Imports (creates or updates, matched by address) IP addresses from a CSV
// built to the same column layout as exportIpAddressesCsv(). Each address
// must resolve to an existing network by CIDR — networks are not created
// implicitly here, import those first if needed.
export async function importIpAddressesCsv(
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

  const [networks, existingAddresses] = await Promise.all([
    prisma.network.findMany({ select: { id: true, cidr: true } }),
    prisma.ipAddress.findMany({ select: { id: true, address: true } }),
  ]);

  const networkByCidr = new Map(
    networks.map((n): [string, string] => [n.cidr, n.id]),
  );
  const idByAddress = new Map(
    existingAddresses.map((a): [string, string] => [a.address, a.id]),
  );

  let created = 0;
  let updated = 0;
  const errors: { row: number; message: string }[] = [];

  for (let i = 0; i < records.length; i++) {
    const rowNum = i + 2;
    const record = records[i];

    const address = (record.address ?? '').trim();
    if (!address) {
      errors.push({ row: rowNum, message: 'address is required' });
      continue;
    }
    if (!ipv4Regex.test(address)) {
      errors.push({
        row: rowNum,
        message: `Invalid IPv4 address "${address}"`,
      });
      continue;
    }

    const networkCidr = (record.networkCidr ?? '').trim();
    if (!networkCidr) {
      errors.push({ row: rowNum, message: 'networkCidr is required' });
      continue;
    }
    const networkId = networkByCidr.get(networkCidr);
    if (!networkId) {
      errors.push({
        row: rowNum,
        message: `Network "${networkCidr}" was not found. Import it first, or check the CIDR.`,
      });
      continue;
    }
    if (!containsCidr(networkCidr, `${address}/32`)) {
      errors.push({
        row: rowNum,
        message: `Address is outside the range of network ${networkCidr}`,
      });
      continue;
    }

    const statusRaw = (record.status || 'AVAILABLE').trim().toUpperCase();
    if (!IP_STATUSES.includes(statusRaw as IpStatus)) {
      errors.push({
        row: rowNum,
        message: `Invalid status "${record.status}" — must be one of ${IP_STATUSES.join(', ')}`,
      });
      continue;
    }

    const macAddress = (record.macAddress ?? '').trim();
    if (macAddress && !macAddressRegex.test(macAddress)) {
      errors.push({
        row: rowNum,
        message: `Invalid MAC address "${macAddress}"`,
      });
      continue;
    }

    const hostname = (record.hostname ?? '').trim() || null;
    const description = (record.description ?? '').trim() || null;
    const existingId = idByAddress.get(address);

    try {
      let ipAddressId: string;
      if (existingId) {
        const current = await prisma.ipAddress.findUnique({
          where: { id: existingId },
        });
        const becomingAssigned =
          statusRaw === 'ASSIGNED' && current?.status !== 'ASSIGNED';
        const leavingAssigned =
          statusRaw !== 'ASSIGNED' && current?.status === 'ASSIGNED';

        const ipAddress = await prisma.ipAddress.update({
          where: { id: existingId },
          data: {
            hostname,
            macAddress: macAddress || null,
            status: statusRaw as IpStatus,
            description,
            networkId,
            assignedAt: becomingAssigned
              ? new Date()
              : leavingAssigned
                ? null
                : current?.assignedAt,
          },
        });
        ipAddressId = ipAddress.id;
        updated += 1;
      } else {
        const ipAddress = await prisma.ipAddress.create({
          data: {
            address,
            hostname,
            macAddress: macAddress || null,
            status: statusRaw as IpStatus,
            description,
            networkId,
            assignedAt: statusRaw === 'ASSIGNED' ? new Date() : null,
          },
        });
        ipAddressId = ipAddress.id;
        created += 1;
      }

      await prisma.auditLog.create({
        data: {
          action: existingId ? 'UPDATE' : 'CREATE',
          entity: 'IPAddress',
          entityId: ipAddressId,
          userId: currentUser.id,
          metadata: { address, networkId, source: 'csv-import' },
        },
      });

      idByAddress.set(address, ipAddressId);
    } catch {
      errors.push({
        row: rowNum,
        message: 'Unexpected error while saving this row',
      });
    }
  }

  revalidatePath('/ip-addresses');

  return { ok: errors.length === 0, created, updated, errors };
}
