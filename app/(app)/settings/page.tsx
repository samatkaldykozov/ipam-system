import { redirect } from 'next/navigation';

import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { getCurrentUser } from '@/lib/auth';
import { ProfileForm } from '@/app/(app)/settings/profile-form';
import { PasswordForm } from '@/app/(app)/settings/password-form';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const currentUser = await getCurrentUser();

  // Server-side guard, same pattern as the Users page: this shouldn't
  // normally be reachable signed out (middleware already redirects), but
  // the forms below need a real user to submit against.
  if (!currentUser) {
    redirect('/login');
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Manage your profile and application preferences."
      />

      <div className="max-w-2xl space-y-6">
        <ProfileForm
          email={currentUser.email}
          fullName={currentUser.fullName}
        />

        <Separator />

        <PasswordForm />

        <Separator />

        <Card>
          <CardHeader>
            <CardTitle>Danger Zone</CardTitle>
            <CardDescription>
              Irreversible actions for your account.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Self-service account deletion is intentionally unavailable in this
              internal tool — deleting the wrong account here has no undo. If
              you need your account removed, ask an administrator.
            </p>
          </CardContent>
          <CardFooter className="justify-end">
            <Button variant="destructive" disabled>
              Delete account
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
