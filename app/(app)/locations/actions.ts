'use server';

import { revalidatePath } from 'next/cache';
import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { locationSchema, type LocationValues } from '@/lib/validations';
import { getCurrentUser, canEdit } from '@/lib/auth';
import type { SortField, SortOrder } from '@/app/(app)/locations/types';

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

async function writeAudit(
  action: 'CREATE' | 'UPDATE' | 'DELETE',
  entityId: string,
  userId?: string,
  metadata?: Record<string, unknown>,
) {
  await prisma.auditLog.create({
    data: {
      action,
      entity: 'Location',
      entityId,
      userId: userId ?? null,
      metadata: (metadata ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}

export async function getLocations(params: {
  search?: string;
  sortBy?: SortField;
  sortOrder?: SortOrder;
  page?: number;
  pageSize?: number;
}) {
  const {
    search = '',
    sortBy = 'name',
    sortOrder = 'asc',
    page = 1,
    pageSize = 10,
  } = params;

  const where: Prisma.LocationWhereInput = {};
  if (search.trim()) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { code: { contains: search, mode: 'insensitive' } },
      { city: { contains: search, mode: 'insensitive' } },
      { country: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.location.findMany({
      where,
      include: { _count: { select: { networks: true } } },
      orderBy: { [sortBy]: sortOrder },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.location.count({ where }),
  ]);

  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

export async function createLocation(
  values: LocationValues,
): Promise<ActionResult> {
  const currentUser = await getCurrentUser();
  if (!currentUser || !canEdit(currentUser.role)) {
    return PERMISSION_DENIED;
  }

  const parsed = locationSchema.safeParse(values);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[issue.path[0] as string] = issue.message;
    }
    return { ok: false, fieldErrors };
  }
  const data = parsed.data;

  const existingName = await prisma.location.findUnique({
    where: { name: data.name },
  });
  if (existingName) {
    return {
      ok: false,
      fieldErrors: { name: 'A location with this name already exists' },
    };
  }

  const existingCode = await prisma.location.findUnique({
    where: { code: data.code },
  });
  if (existingCode) {
    return {
      ok: false,
      fieldErrors: { code: 'A location with this code already exists' },
    };
  }

  try {
    const location = await prisma.location.create({
      data: {
        name: data.name,
        code: data.code,
        address: data.address || null,
        city: data.city || null,
        country: data.country || null,
        latitude: data.latitude ?? null,
        longitude: data.longitude ?? null,
        description: data.description || null,
      },
    });
    await writeAudit('CREATE', location.id, currentUser.id, {
      name: location.name,
      code: location.code,
    });
    revalidatePath('/locations');
    revalidatePath('/networks');
    return { ok: true, message: 'Location created successfully' };
  } catch {
    return { ok: false, message: 'Failed to create location' };
  }
}

export async function updateLocation(
  id: string,
  values: LocationValues,
): Promise<ActionResult> {
  const currentUser = await getCurrentUser();
  if (!currentUser || !canEdit(currentUser.role)) {
    return PERMISSION_DENIED;
  }

  const parsed = locationSchema.safeParse(values);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[issue.path[0] as string] = issue.message;
    }
    return { ok: false, fieldErrors };
  }
  const data = parsed.data;

  const existingName = await prisma.location.findUnique({
    where: { name: data.name },
  });
  if (existingName && existingName.id !== id) {
    return {
      ok: false,
      fieldErrors: { name: 'A location with this name already exists' },
    };
  }

  const existingCode = await prisma.location.findUnique({
    where: { code: data.code },
  });
  if (existingCode && existingCode.id !== id) {
    return {
      ok: false,
      fieldErrors: { code: 'A location with this code already exists' },
    };
  }

  try {
    const location = await prisma.location.update({
      where: { id },
      data: {
        name: data.name,
        code: data.code,
        address: data.address || null,
        city: data.city || null,
        country: data.country || null,
        latitude: data.latitude ?? null,
        longitude: data.longitude ?? null,
        description: data.description || null,
      },
    });
    await writeAudit('UPDATE', location.id, currentUser.id, {
      name: location.name,
      code: location.code,
    });
    revalidatePath('/locations');
    revalidatePath('/networks');
    return { ok: true, message: 'Location updated successfully' };
  } catch {
    return { ok: false, message: 'Failed to update location' };
  }
}

export async function deleteLocation(id: string): Promise<ActionResult> {
  const currentUser = await getCurrentUser();
  if (!currentUser || !canEdit(currentUser.role)) {
    return PERMISSION_DENIED;
  }

  try {
    const location = await prisma.location.findUnique({
      where: { id },
      include: { _count: { select: { networks: true } } },
    });
    if (!location) {
      return { ok: false, message: 'Location not found' };
    }

    if (location._count.networks > 0) {
      return {
        ok: false,
        message: `Cannot delete this location because ${location._count.networks} network(s) are assigned to it. Reassign them first.`,
      };
    }

    await prisma.location.delete({ where: { id } });
    await writeAudit('DELETE', id, currentUser.id, {
      name: location.name,
      code: location.code,
    });
    revalidatePath('/locations');
    revalidatePath('/networks');
    return { ok: true, message: 'Location deleted successfully' };
  } catch {
    return { ok: false, message: 'Failed to delete location' };
  }
}
