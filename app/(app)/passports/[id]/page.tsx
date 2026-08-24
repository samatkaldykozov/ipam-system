import { notFound, redirect } from 'next/navigation';

import { PageHeader } from '@/components/page-header';
import { getCurrentUser, hasPassportAccess } from '@/lib/auth';
import { getPassportView } from '@/app/(app)/passports/actions';
import { PassportViewCard } from '@/app/(app)/passports/[id]/passport-view';

export const dynamic = 'force-dynamic';

// Read-only, role-masked view — open to anyone with any level of passport
// access, including Guest. getPassportView() does the masking server-side
// (docs/it-passports-design.md section 4): a field the viewer's role can't
// see is filtered out of the response entirely, definition and value both,
// before it ever reaches this page. Editing lives at
// app/(app)/passports/[id]/edit/page.tsx, gated to Admin/Manager.
export default async function PassportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const currentUser = await getCurrentUser();
  if (!currentUser || !hasPassportAccess(currentUser.passportRole)) {
    redirect('/');
  }

  const data = await getPassportView(id);
  if (!data) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <PageHeader title={data.name} />
      <PassportViewCard data={data} />
    </div>
  );
}
