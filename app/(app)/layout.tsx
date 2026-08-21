import { Sidebar } from '@/components/sidebar';
import { Topbar } from '@/components/topbar';
import { getCurrentUser, isAdmin } from '@/lib/auth';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const currentUser = await getCurrentUser();
  const userIsAdmin = !!currentUser && isAdmin(currentUser.role);

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar isAdmin={userIsAdmin} />
      <div className="flex min-h-screen flex-1 flex-col">
        <Topbar
          email={currentUser?.email ?? null}
          role={currentUser?.role ?? null}
        />
        <main className="flex-1 px-6 py-8">{children}</main>
      </div>
    </div>
  );
}
