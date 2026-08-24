import { Sidebar } from '@/components/sidebar';
import { Topbar } from '@/components/topbar';
import { getCurrentUser, isAdmin, isPassportAdmin, hasPassportAccess } from '@/lib/auth';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const currentUser = await getCurrentUser();
  const userIsAdmin = !!currentUser && isAdmin(currentUser.role);
  const userHasPassportAccess =
    !!currentUser && hasPassportAccess(currentUser.passportRole);
  const userIsPassportAdmin =
    !!currentUser && isPassportAdmin(currentUser.passportRole);

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar
        isIpamAdmin={userIsAdmin}
        hasPassportAccess={userHasPassportAccess}
        isPassportAdmin={userIsPassportAdmin}
      />
      <div className="flex min-h-screen flex-1 flex-col">
        <Topbar
          email={currentUser?.email ?? null}
          role={currentUser?.role ?? null}
          passportRole={currentUser?.passportRole ?? null}
        />
        <main className="flex-1 px-6 py-8">{children}</main>
      </div>
    </div>
  );
}
