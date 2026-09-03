import type { AuditAction } from '@prisma/client';

export type AuditLogEntry = {
  action: AuditAction;
  entity: string;
  metadata: unknown;
  user: { email: string } | null;
};

function metaStr(metadata: unknown, key: string): string {
  const meta = (metadata ?? {}) as Record<string, unknown>;
  return typeof meta[key] === 'string' ? (meta[key] as string) : '';
}

// Describes what happened, without naming who did it — for contexts (like
// the audit log table) that already show the actor in its own column.
// Falls back to a generic "created/updated/deleted <entity>" sentence for
// any entity type that doesn't have bespoke phrasing below.
export function describeChange(
  log: Pick<AuditLogEntry, 'action' | 'entity' | 'metadata'>,
): string {
  const str = (key: string) => metaStr(log.metadata, key);

  if (log.entity === 'Auth') {
    return log.action === 'LOGIN' ? 'Signed in' : 'Signed out';
  }

  if (log.entity === 'Network') {
    const label = [str('cidr'), str('name')].filter(Boolean).join(' — ');
    if (log.action === 'CREATE') return `Created network ${label}`;
    if (log.action === 'UPDATE') return `Updated network ${label}`;
    if (log.action === 'DELETE') return `Deleted network ${label}`;
  }

  if (log.entity === 'IpAddress') {
    const address = str('address');
    if (log.action === 'CREATE') return `Assigned ${address}`;
    if (log.action === 'UPDATE') return `Updated ${address}`;
    if (log.action === 'DELETE') return `Removed ${address}`;
  }

  if (log.entity === 'Location') {
    const label = [str('code'), str('name')].filter(Boolean).join(' — ');
    if (log.action === 'CREATE') return `Created location ${label}`;
    if (log.action === 'UPDATE') return `Updated location ${label}`;
    if (log.action === 'DELETE') return `Deleted location ${label}`;
  }

  if (log.entity === 'User') {
    const email = str('email');
    const role = str('newRole') || str('invitedRole');
    if (log.action === 'CREATE')
      return `Invited ${email}${role ? ` as ${role}` : ''}`;
    if (log.action === 'UPDATE') return `Set ${email}'s role to ${role}`;
  }

  // ObjectInstance = a CMDB passport (2 September 2026, CMDB phase 7 — see
  // it-passports-design.md section 8.11). "CI" (Configuration Item) here
  // rather than the Russian "КЕ" used elsewhere in the app, to match this
  // function's own established English-language convention (see the other
  // branches above) — the passport's own name and field labels inside the
  // sentence are still whatever the admin/user actually typed.
  if (log.entity === 'ObjectInstance') {
    const name = str('name');
    if (log.action === 'CREATE') return `Created CI ${name}`;
    if (log.action === 'DELETE') return `Deleted CI ${name}`;
    if (log.action === 'UPDATE') {
      const meta = (log.metadata ?? {}) as Record<string, unknown>;
      const changes = Array.isArray(meta.changes)
        ? (meta.changes as { label: string; from: string; to: string }[])
        : [];
      if (changes.length === 0) return `Updated CI ${name}`;
      const shown = changes.slice(0, 2);
      const summary = shown
        .map((c) => `${c.label}: ${c.from} → ${c.to}`)
        .join('; ');
      const rest = changes.length - shown.length;
      return `Updated CI ${name}: ${summary}${rest > 0 ? ` (+${rest} more)` : ''}`;
    }
  }

  return `${log.action.charAt(0)}${log.action.slice(1).toLowerCase()}d ${log.entity.toLowerCase()}`;
}

// Full first-person-observer sentence including the actor — used by the
// Dashboard's single-column recent-activity feed, where there's no separate
// "actor" column to lean on.
export function describeActivity(log: AuditLogEntry): string {
  const actor = log.user?.email ?? 'Someone';
  const change = describeChange(log);
  return `${actor} ${change.charAt(0).toLowerCase()}${change.slice(1)}`;
}
