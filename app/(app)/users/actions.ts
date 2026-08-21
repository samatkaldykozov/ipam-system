'use server';

import { revalidatePath } from 'next/cache';

import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { getCurrentUser, isAdmin } from '@/lib/auth';

export type ActionResult<T = void> = {
  ok: boolean;
  message?: string;
  data?: T;
};

const PERMISSION_DENIED: ActionResult = {
  ok: false,
  message: 'You do not have permission to perform this action.',
};

async function writeAudit(
  action: 'UPDATE',
  entityId: string,
  userId?: string,
  metadata?: Record<string, unknown>,
) {
  await prisma.auditLog.create({
    data: {
      action,
      entity: 'User',
      entityId,
      userId: userId ?? null,
      metadata: (metadata ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}

// Users list for the admin table, plus the full set of roles for the
// per-row dropdown. Kept together since both are only ever needed on the
// same page.
export async function getUsersAndRoles() {
  const [users, roles] = await Promise.all([
    prisma.user.findMany({
      include: { role: true },
      orderBy: { email: 'asc' },
    }),
    prisma.role.findMany({ orderBy: { name: 'asc' } }),
  ]);

  return { users, roles };
}

export async function updateUserRole(
  userId: string,
  roleId: string,
): Promise<ActionResult> {
  const currentUser = await getCurrentUser();
  if (!currentUser || !isAdmin(currentUser.role)) {
    return PERMISSION_DENIED;
  }

  // Changing your own role could lock you out of the admin area with no
  // way back in (no other UI exists yet to re-grant Admin). Block it
  // outright rather than trying to detect "last remaining admin".
  if (userId === currentUser.id) {
    return {
      ok: false,
      message: 'You cannot change your own role. Ask another admin instead.',
    };
  }

  const role = await prisma.role.findUnique({ where: { id: roleId } });
  if (!role) {
    return { ok: false, message: 'Selected role does not exist' };
  }

  try {
    const user = await prisma.user.update({
      where: { id: userId },
      data: { roleId },
    });
    await writeAudit('UPDATE', user.id, currentUser.id, {
      email: user.email,
      newRole: role.name,
    });
    revalidatePath('/users');
    return { ok: true, message: `Role updated to ${role.name}` };
  } catch {
    return { ok: false, message: 'Failed to update role' };
  }
}
