import { notFound, redirect } from 'next/navigation';

import { PageHeader } from '@/components/page-header';
import { getCurrentUser, canEditPassports } from '@/lib/auth';
import {
  getObjectTypeForFill,
  getPassportUsers,
} from '@/app/(app)/passports/actions';
import { PassportForm } from '@/app/(app)/passports/passport-form';

export const dynamic = 'force-dynamic';

export default async function NewPassportPage({
  params,
}: {
  params: Promise<{ objectTypeId: string }>;
}) {
  const { objectTypeId } = await params;
  const currentUser = await getCurrentUser();
  if (!currentUser || !canEditPassports(currentUser.passportRole)) {
    redirect('/passports');
  }

  const [objectType, users] = await Promise.all([
    getObjectTypeForFill(objectTypeId),
    getPassportUsers(),
  ]);

  if (!objectType) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Новый паспорт: ${objectType.name}`}
        description="Заполните поля ниже. Обязательные отмечены звёздочкой."
      />
      <PassportForm objectType={objectType} users={users} passport={null} />
    </div>
  );
}
