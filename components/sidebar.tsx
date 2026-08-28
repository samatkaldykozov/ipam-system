'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  ClipboardCheck,
  FileStack,
  Hash,
  History,
  LayoutDashboard,
  LayoutTemplate,
  MapPin,
  Network,
  Server,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { siteConfig, type Branch } from '@/lib/site-config';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const iconMap: Record<string, LucideIcon> = {
  ClipboardCheck,
  FileStack,
  Hash,
  History,
  LayoutDashboard,
  LayoutTemplate,
  MapPin,
  Network,
  Server,
  Settings,
  Users,
};

// Some routes belong unambiguously to one branch; others (Users, Audit Log,
// Settings) are shared between both (see docs/it-passports-design.md
// section 4) and shouldn't force a branch switch on their own — otherwise
// landing on a shared page from the Паспорта branch would silently flip
// the sidebar back to IPAM. `branchForPathname` returns null for those, and
// the caller falls back to whichever branch was last explicitly active
// (persisted in localStorage), which also gives us "remembers the last
// branch used" for free.
const PASSPORT_ONLY_PREFIXES = [
  '/passports',
  '/object-types',
  '/equipment-type-codes',
];
const IPAM_ONLY_PREFIXES = [
  '/networks',
  '/ip-addresses',
  '/locations',
  '/data-integrity',
];
const ACTIVE_BRANCH_STORAGE_KEY = 'ipam-active-branch';

function branchForPathname(pathname: string): Branch | null {
  if (PASSPORT_ONLY_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return 'passport';
  }
  if (
    pathname === '/' ||
    IPAM_ONLY_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  ) {
    return 'ipam';
  }
  return null;
}

interface SidebarProps {
  isIpamAdmin: boolean;
  hasPassportAccess: boolean;
  isPassportAdmin: boolean;
}

export function Sidebar({
  isIpamAdmin,
  hasPassportAccess,
  isPassportAdmin,
}: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  // Defaults to 'ipam' on first render (matches server-rendered output, so
  // no hydration mismatch); the effect below corrects it from the URL or
  // localStorage right after mount.
  const [lastBranch, setLastBranch] = React.useState<Branch>('ipam');

  React.useEffect(() => {
    const forced = branchForPathname(pathname);
    if (forced) {
      setLastBranch(forced);
      try {
        localStorage.setItem(ACTIVE_BRANCH_STORAGE_KEY, forced);
      } catch {
        // Storage can throw (private browsing, disabled storage) — the
        // branch switcher still works, it just won't be remembered.
      }
      return;
    }
    // A shared route (Users, Audit Log, Settings) — keep whatever branch
    // was last active instead of forcing one.
    try {
      const saved = localStorage.getItem(ACTIVE_BRANCH_STORAGE_KEY);
      if (saved === 'ipam' || saved === 'passport') setLastBranch(saved);
    } catch {
      // Ignored — falls back to the current state.
    }
  }, [pathname]);

  // Every signed-in user has at least Viewer access in IPAM (see
  // lib/auth.ts) — there's no "no IPAM access" state today, unlike
  // Passports, where a null passportRole genuinely means no access. So a
  // user without Passport access can never actually be on the passport
  // branch, regardless of what's stored.
  const activeBranch: Branch = hasPassportAccess ? lastBranch : 'ipam';
  const showSwitcher = hasPassportAccess; // only one branch worth switching between exists so far

  const nav = (
    activeBranch === 'ipam' ? siteConfig.ipamNav : siteConfig.passportNav
  ).filter((item) => {
    if (!item.adminOnly) return true;
    return activeBranch === 'ipam' ? isIpamAdmin : isPassportAdmin;
  });

  function handleBranchChange(value: string) {
    if (value === activeBranch) return;
    router.push(value === 'passport' ? '/passports' : '/');
  }

  return (
    <aside className="hidden h-screen w-60 shrink-0 border-r bg-card md:flex md:flex-col">
      <div className="flex h-16 items-center gap-2 border-b px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Network className="h-4 w-4" />
        </div>
        <span className="text-lg font-semibold tracking-tight">
          {siteConfig.name}
        </span>
      </div>

      {showSwitcher ? (
        <div className="border-b px-3 py-3">
          <Select value={activeBranch} onValueChange={handleBranchChange}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ipam">IPAM</SelectItem>
              <SelectItem value="passport">Паспорта</SelectItem>
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <nav className="flex-1 space-y-1 px-3 py-4">
        {nav.map((item) => {
          const Icon = iconMap[item.icon] ?? LayoutDashboard;
          const active =
            item.href === '/'
              ? pathname === '/'
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              <Icon className="h-4 w-4" />
              {item.title}
            </Link>
          );
        })}
      </nav>

      <div className="border-t px-6 py-4">
        <p className="text-xs text-muted-foreground">v0.1.0</p>
      </div>
    </aside>
  );
}
