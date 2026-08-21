import { redirect } from 'next/navigation';

import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { getUsersAndRoles } from '@/app/(app)/users/actions';
import { UsersTable } from '@/app/(app)/users/users-table';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  const currentUser = await getCurrentUser();

  // Server-side guard: non-admins never see this page, regardless of
  // whether the nav link is hidden client-side.
  if (!currentUser || !isAdmin(currentUser.role)) {
    redirect('/');
  }

  const { users, roles } = await getUsersAndRoles();

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
            roles={roles}
            currentUserId={currentUser.id}
          />
        </CardContent>
      </Card>
    </div>
  );
}
