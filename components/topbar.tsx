'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LogOut, User as UserIcon } from 'lucide-react';

import { createClient } from '@/lib/supabase/client';
import { logAuthEvent } from '@/app/login/actions';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme-toggle';
import { GlobalSearch } from '@/components/global-search';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface TopbarProps {
  email: string | null;
  role: string | null;
  passportRole: string | null;
}

export function Topbar({ email, role, passportRole }: TopbarProps) {
  const router = useRouter();
  const [signingOut, setSigningOut] = React.useState(false);

  const initial = email ? email.charAt(0).toUpperCase() : 'U';

  async function handleSignOut() {
    setSigningOut(true);
    const supabase = createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      await logAuthEvent('LOGOUT', user.id);
    }

    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background/95 px-6 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex flex-1 items-center">
        <GlobalSearch />
      </div>

      <ThemeToggle />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="relative h-9 w-9 rounded-full">
            <Avatar className="h-9 w-9">
              <AvatarImage alt="User avatar" />
              <AvatarFallback>{initial}</AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel className="flex flex-col gap-0.5 truncate">
            <span className="truncate">{email ?? 'Account'}</span>
            {role ? (
              <span className="text-xs font-normal text-muted-foreground">
                {role}
                {passportRole ? ` · ${passportRole}` : ''}
              </span>
            ) : null}
          </DropdownMenuLabel>
          <DropdownMenuItem asChild>
            <Link href="/settings" className="flex items-center gap-2">
              <UserIcon className="h-4 w-4" />
              Settings
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="flex items-center gap-2 text-destructive focus:text-destructive"
            disabled={signingOut}
            onClick={handleSignOut}
          >
            <LogOut className="h-4 w-4" />
            {signingOut ? 'Signing out…' : 'Sign out'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
