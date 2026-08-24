import { notFound, redirect } from 'next/navigation';

import { PageHeader } from '@/components/page-header';
import { getCurrentUser, canEditPassports } from '@/lib/auth';
import { getPassport, getPassportUsers } from '@/app/(app)/passports/actions';
import { PassportForm } from '@/app/(app)/passports/passport-form';

export const dynamic = 'force-dynamic';

// Edit form — Passport Admin/Manager only. The masked read-only view for
// everyone with passport access (including Guest) lives one level up, at
// app/(app)/passports/[id]/page.tsx (plan step 5).
export default async function EditPassportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const currentUser = await getCurrentUser();
  if (!currentUser || !canEditPassports(currentUser.passportRole)) {
    redirect(`/passports/${id}`);
  }

  const [passport, users] = await Promise.all([
    getPassport(id),
    getPassportUsers(),
  ]);

  if (!passport) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Редактирование: ${passport.name}`}
        description={`Тип: ${passport.objectType.name}`}
      />
      <PassportForm objectType={passport.objectType} users={users} passport={passport} />
    </div>
  );
}
