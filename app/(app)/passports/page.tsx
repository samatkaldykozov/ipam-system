import { redirect } from 'next/navigation';
import { FileStack } from 'lucide-react';

import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/empty-state';
import { getCurrentUser, hasPassportAccess, isPassportAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Placeholder landing page for the Паспорта branch — this step (navigation
// shell, docs/it-passports-design.md plan step 2) only wires up the branch
// switcher and access control. The actual passport list/create/fill flow
// is plan step 4.
export default async function PassportsPage() {
  const currentUser = await getCurrentUser();

  if (!currentUser || !hasPassportAccess(currentUser.passportRole)) {
    redirect('/');
  }

  const canCreateTypes = isPassportAdmin(currentUser.passportRole);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Паспорта"
        description="Паспорта ИТ-объектов — базы данных, КИС, ЦОД и других систем."
      />
      <Card>
        <CardContent className="pt-6">
          <EmptyState
            icon={<FileStack className="h-6 w-6" />}
            title="Список паспортов появится здесь"
            description={
              canCreateTypes
                ? 'Сначала нужно создать хотя бы один тип объекта в конструкторе форм, а затем можно будет заводить паспорта этого типа.'
                : 'Пока не заведено ни одного типа объекта. Обратитесь к Passport Admin.'
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
