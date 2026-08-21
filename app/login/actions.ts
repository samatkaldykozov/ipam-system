'use server';

import { prisma } from '@/lib/prisma';

// Records a LOGIN/LOGOUT event. Called from client components right after
// Supabase Auth confirms the sign-in/sign-out, passing the user id explicitly
// (rather than reading the session server-side) so this works the same way
// regardless of exactly when the session cookie has propagated.
export async function logAuthEvent(action: 'LOGIN' | 'LOGOUT', userId: string) {
  try {
    await prisma.auditLog.create({
      data: {
        action,
        entity: 'Auth',
        entityId: userId,
        userId,
      },
    });
  } catch {
    // Best-effort logging only — never block sign-in/sign-out on this.
  }
}
