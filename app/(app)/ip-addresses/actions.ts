'use server';

import { revalidatePath } from 'next/cache';
import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { ipAddressSchema, type IpAddressValues } from '@/lib/validations';

export type ActionResult<T = void> = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
  data?: T;
};

export async function getNetworkOptions() {
  return prisma.network.findMany({
    orderBy: { name: 'asc' },
    select: { id: true, name: true, cidr: true },
  });
}

export async function createIpAddress(values: IpAddressValues): Promise<ActionResult> {
  const parsed = ipAddressSchema.safeParse(values);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[issue.path[0] as string] = issue.message;
    }
    return { ok: false, fieldErrors };
  }

  const data = parsed.data;

  const existing = await prisma.ipAddress.findUnique({
    where: { address: data.address },
  });
  if (existing) {
    return { ok: false, fieldErrors: { address: 'This IP address already exists' } };
  }

  const network = await prisma.network.findUnique({ where: { id: data.networkId } });
  if (!network) {
    return { ok: false, fieldErrors: { networkId: 'Selected network does not exist' } };
  }

  try {
    const ipAddress = await prisma.ipAddress.create({
      data: {
        address: data.address,
        hostname: data.hostname ?? null,
        macAddress: data.macAddress ?? null,
        status: data.status,
        description: data.description ?? null,
        networkId: data.networkId,
        assignedAt: data.status === 'ASSIGNED' ? new Date() : null,
      },
    });

    await prisma.auditLog.create({
      data: {
        action: 'CREATE',
        entity: 'IPAddress',
        entityId: ipAddress.id,
        metadata: {
          address: ipAddress.address,
          networkId: ipAddress.networkId,
          status: ipAddress.status,
        } as Prisma.InputJsonValue,
      },
    });

    revalidatePath('/ip-addresses');
    return { ok: true, message: 'IP address assigned successfully' };
  } catch {
    return { ok: false, message: 'Failed to assign IP address' };
  }
}
