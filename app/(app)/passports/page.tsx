import { redirect } from 'next/navigation';

import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getCurrentUser, hasPassportAccess, canEditPassports } from '@/lib/auth';
import { getPassports } from '@/app/(app)/passports/actions';
import { PassportsTable } from '@/app/(app)/passports/passports-table';

export const dynamic = 'force-dynamic';

// Plan step 4 (docs/it-passports-design.md section 5): the list itself
// shows no field values (just name/type/responsible), so it's safe for
// anyone with passport access, including Guest. Creating/editing/deleting
// a passport is gated to Passport Admin/Manager (canEditPassports).
// Masked field-level viewing for everyone else is plan step 5.
export default async function PassportsPage() {
  const currentUser = await getCurrentUser();

  if (!currentUser || !hasPassportAccess(currentUser.passportRole)) {
    redirect('/');
  }

  const canEdit = canEditPassports(currentUser.passportRole);
  const { items } = await getPassports({});

  return (
    <div className="space-y-6">
      <PageHeader
        title="Паспорта"
        description="Паспорта ИТ-объектов — базы данных, КИС, ЦОД и других систем."
      />
      <Card>
        <CardHeader>
          <CardTitle>Список паспортов</CardTitle>
        </CardHeader>
        <CardContent>
          <PassportsTable items={items} canEdit={canEdit} />
        </CardContent>
      </Card>
    </div>
  );
}
