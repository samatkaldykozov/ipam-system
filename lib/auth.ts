import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';

// The three roles seeded in the `roles` table. Matched by name rather than
// a fixed enum column, since Role is a real table (an Admin could rename or
// add roles later) — these three names are the ones the app currently knows
// how to reason about permissions for.
export type Role = 'Admin' | 'Network Engineer' | 'Viewer';

export type CurrentUser = {
  id: string;
  email: string;
  fullName: string | null;
  role: Role;
};

// Resolves the signed-in Supabase Auth user to their app-level profile and
// role. A user with no role assigned yet (role_id is null — e.g. an account
// an Admin just created but hasn't gotten to yet) defaults to Viewer: the
// safe, read-only default rather than accidentally granting edit access.
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const profile = await prisma.user.findUnique({
    where: { id: user.id },
    include: { role: true },
  });

  const roleName = profile?.role?.name;
  const role: Role =
    roleName === 'Admin' || roleName === 'Network Engineer'
      ? roleName
      : 'Viewer';

  return {
    id: user.id,
    email: user.email ?? profile?.email ?? '',
    fullName: profile?.fullName ?? null,
    role,
  };
}

export function canEdit(role: Role): boolean {
  return role === 'Admin' || role === 'Network Engineer';
}

export function isAdmin(role: Role): boolean {
  return role === 'Admin';
}
