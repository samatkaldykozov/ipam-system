import { redirect } from 'next/navigation';

import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getCurrentUser, isAdmin, isPassportAdmin } from '@/lib/auth';
import { getUsersAndRoles } from '@/app/(app)/users/actions';
import { UsersTable } from '@/app/(app)/users/users-table';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  const currentUser = await getCurrentUser();

  // Server-side guard: shared between branches (see
  // docs/it-passports-design.md section 4) — an admin of either IPAM or
  // Паспорта can reach this page, regardless of whether the nav link is
  // hidden client-side. Which columns they can actually edit is decided
  // per-column below and re-checked independently in each server action.
  const canManageIpamRoles = !!currentUser && isAdmin(currentUser.role);
  const canManagePassportRoles =
    !!currentUser && isPassportAdmin(currentUser.passportRole);
  if (!currentUser || (!canManageIpamRoles && !canManagePassportRoles)) {
    redirect('/');
  }

  const { users, ipamRoles, passportRoles } = await getUsersAndRoles();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        description="Manage teammate access by assigning roles."
      />

      <Card>
        <CardHeader>
          <CardTitle>User Accounts</CardTitle>
        </CardHeader>
        <CardContent>
          <UsersTable
            users={users}
            ipamRoles={ipamRoles}
            passportRoles={passportRoles}
            currentUserId={currentUser.id}
            canManageIpamRoles={canManageIpamRoles}
            canManagePassportRoles={canManagePassportRoles}
          />
        </CardContent>
      </Card>
    </div>
  );
}
