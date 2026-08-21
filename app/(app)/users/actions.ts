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

// A function (not a shared constant) so it type-checks against whichever
// ActionResult<T> the caller declares, including the generic inviteUser
// result below.
function permissionDenied<T = void>(): ActionResult<T> {
  return {
    ok: false,
    message: 'You do not have permission to perform this action.',
  };
}

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
    return permissionDenied();
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

// Falls back to the known production URL if the env var isn't set, so
// invites still work without extra Vercel configuration.
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://ipam-system-delta.vercel.app';

// Invites a new teammate by email (Admin-only). Rather than asking Supabase
// to send the invite email itself (blocked in the dashboard until a custom
// SMTP provider is configured), this generates the invite link directly and
// hands it back to the admin to send however they like. The existing DB
// trigger mirrors the new auth user into public.users automatically, and
// this then assigns the role the admin picked so the account isn't left
// with no role at all.
export async function inviteUser(
  values: InviteUserValues,
): Promise<ActionResult<{ inviteLink: string }>> {
  const currentUser = await getCurrentUser();
  if (!currentUser || !isAdmin(currentUser.role)) {
    return permissionDenied();
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

  const { data, error } = await admin.auth.admin.generateLink({
    type: 'invite',
    email,
    options: { redirectTo: `${SITE_URL}/set-password` },
  });
  if (error || !data.user || !data.properties?.hashed_token) {
    return {
      ok: false,
      message: error?.message ?? 'Failed to generate invite link',
    };
  }

  const inviteLink = `${SITE_URL}/auth/confirm?token_hash=${encodeURIComponent(
    data.properties.hashed_token,
  )}&type=invite&next=/set-password`;

  // The trigger that mirrors auth.users -> public.users runs on insert and
  // should have already landed by the time generateLink resolves, but
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
  return {
    ok: true,
    message: `Invite link created for ${email}`,
    data: { inviteLink },
  };
}
