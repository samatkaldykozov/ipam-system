import { notFound, redirect } from 'next/navigation';

import { PageHeader } from '@/components/page-header';
import { getCurrentUser, canEditPassports } from '@/lib/auth';
import { getPassport, getPassportUsers } from '@/app/(app)/passports/actions';
import { PassportForm } from '@/app/(app)/passports/passport-form';

export const dynamic = 'force-dynamic';

// Step 4 scope: this is an edit form for Passport Admin/Manager only. A
// masked, read-only view for everyone with passport access (including
// Guest) is plan step 5 — not built yet, so Guests are redirected rather
// than shown unmasked field values.
export default async function PassportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const currentUser = await getCurrentUser();
  if (!currentUser || !canEditPassports(currentUser.passportRole)) {
    redirect('/passports');
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
      <PageHeader title={passport.name} description={`Тип: ${passport.objectType.name}`} />
      <PassportForm objectType={passport.objectType} users={users} passport={passport} />
    </div>
  );
}
