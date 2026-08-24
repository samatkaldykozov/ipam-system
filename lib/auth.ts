import { cache } from 'react';

import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';

// The three roles seeded in the `roles` table. Matched by name rather than
// a fixed enum column, since Role is a real table (an Admin could rename or
// add roles later) — these three names are the ones the app currently knows
// how to reason about permissions for.
export type Role = 'Admin' | 'Network Engineer' | 'Viewer';

// Roles for the Паспорта (IT-object passports) branch — independent of the
// IPAM roles above. See docs/it-passports-design.md section 2: a user can
// hold one role of each kind at once, or none in one of the two branches.
export type PassportRole = 'Passport Admin' | 'Passport Manager' | 'Passport Guest';

export type CurrentUser = {
  id: string;
  email: string;
  fullName: string | null;
  role: Role;
  // Unlike `role` above, this has no "safe default" fallback — null means
  // the user genuinely has no access to the Паспорта branch at all, which
  // is what hides it from the branch switcher (see components/sidebar.tsx).
  passportRole: PassportRole | null;
};

// Resolves the signed-in Supabase Auth user to their app-level profile and
// role. A user with no role assigned yet (role_id is null — e.g. an account
// an Admin just created but hasn't gotten to yet) defaults to Viewer: the
// safe, read-only default rather than accidentally granting edit access.
//
// Wrapped in React's `cache()` so multiple calls within the same request
// (every page currently calls this once in its own page.tsx, on top of the
// call layout.tsx already makes) share one result instead of hitting
// Supabase Auth and the `users` table twice. This matters more than it
// might elsewhere: lib/prisma.ts pins `connection_limit=1` for Supabase's
// PgBouncer pooler, so every extra query is one more request serialized
// through a single connection — see the comment on getDashboardData() in
// app/(app)/actions.ts for what happens when that budget is blown.
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const profile = await prisma.user.findUnique({
    where: { id: user.id },
    include: { role: true, passportRole: true },
  });

  const roleName = profile?.role?.name;
  const role: Role =
    roleName === 'Admin' || roleName === 'Network Engineer'
      ? roleName
      : 'Viewer';

  const passportRoleName = profile?.passportRole?.name;
  const passportRole: PassportRole | null =
    passportRoleName === 'Passport Admin' ||
    passportRoleName === 'Passport Manager' ||
    passportRoleName === 'Passport Guest'
      ? passportRoleName
      : null;

  return {
    id: user.id,
    email: user.email ?? profile?.email ?? '',
    fullName: profile?.fullName ?? null,
    role,
    passportRole,
  };
});

export function canEdit(role: Role): boolean {
  return role === 'Admin' || role === 'Network Engineer';
}

export function isAdmin(role: Role): boolean {
  return role === 'Admin';
}

// Whether the user has any access at all to the Паспорта branch — used to
// decide whether it (and the branch switcher) shows up in navigation.
export function hasPassportAccess(passportRole: PassportRole | null): boolean {
  return passportRole !== null;
}

export function isPassportAdmin(passportRole: PassportRole | null): boolean {
  return passportRole === 'Passport Admin';
}

export function canEditPassports(passportRole: PassportRole | null): boolean {
  return passportRole === 'Passport Admin' || passportRole === 'Passport Manager';
}
