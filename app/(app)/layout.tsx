import { Sidebar } from '@/components/sidebar';
import { Topbar } from '@/components/topbar';
import { createClient } from '@/lib/supabase/server';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex min-h-screen flex-1 flex-col">
        <Topbar email={user?.email ?? null} />
        <main className="flex-1 px-6 py-8">{children}</main>
      </div>
    </div>
  );
}
