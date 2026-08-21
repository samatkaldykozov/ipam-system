'use server';

import { revalidatePath } from 'next/cache';
import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { profileSchema, type ProfileValues } from '@/lib/validations';

export type ActionResult<T = void> = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
  data?: T;
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

// Updates the signed-in user's own profile. No canEdit/isAdmin gate — every
// signed-in user manages their own profile, regardless of role; the only
// requirement is being signed in at all (getCurrentUser returning non-null).
export async function updateProfile(
  values: ProfileValues,
): Promise<ActionResult> {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return {
      ok: false,
      message: 'You must be signed in to update your profile.',
    };
  }

  const parsed = profileSchema.safeParse(values);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[issue.path[0] as string] = issue.message;
    }
    return { ok: false, fieldErrors };
  }

  const fullName = parsed.data.fullName?.trim() || null;

  try {
    await prisma.user.update({
      where: { id: currentUser.id },
      data: { fullName },
    });

    await writeAudit('UPDATE', currentUser.id, currentUser.id, { fullName });

    revalidatePath('/settings');
    return { ok: true, message: 'Profile updated' };
  } catch {
    return { ok: false, message: 'Failed to update profile' };
  }
}
