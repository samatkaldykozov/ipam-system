'use server';

import { revalidatePath } from 'next/cache';

import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { inviteUserSchema, type InviteUserValues } from '@/lib/validations';

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
  action: 'CREATE' | 'UPDATE',
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

// Invites a new teammate by email (Admin-only). Creates the Supabase Auth
// user and emails them an invite link; the existing DB trigger mirrors that
// auth user into public.users automatically, and this then assigns the
// role the admin picked so the account isn't left with no role at all.
export async function inviteUser(
  values: InviteUserValues,
): Promise<ActionResult> {
  const currentUser = await getCurrentUser();
  if (!currentUser || !isAdmin(currentUser.role)) {
    return PERMISSION_DENIED;
  }

  const parsed = inviteUserSchema.safeParse(values);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? 'Invalid input',
    };
  }
  const { email, roleId } = parsed.data;

  const role = await prisma.role.findUnique({ where: { id: roleId } });
  if (!role) {
    return { ok: false, message: 'Selected role does not exist' };
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { ok: false, message: 'A user with this email already exists' };
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return {
      ok: false,
      message:
        'Invites are not configured on the server (missing service role key).',
    };
  }

  const { data, error } = await admin.auth.admin.inviteUserByEmail(email);
  if (error || !data.user) {
    return { ok: false, message: error?.message ?? 'Failed to send invite' };
  }

  // The trigger that mirrors auth.users -> public.users runs on insert and
  // should have already landed by the time inviteUserByEmail resolves, but
  // guard with a try/catch anyway: if it hasn't yet, the admin can still set
  // the role from the table once the row appears rather than the whole
  // invite failing outright.
  try {
    await prisma.user.update({
      where: { id: data.user.id },
      data: { roleId },
    });
  } catch {
    // Ignored — see comment above.
  }

  await writeAudit('CREATE', data.user.id, currentUser.id, {
    email,
    invitedRole: role.name,
  });
  revalidatePath('/users');
  return { ok: true, message: `Invite sent to ${email}` };
}
