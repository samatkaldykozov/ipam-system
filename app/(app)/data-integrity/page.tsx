import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AlertOctagon, AlertTriangle, CheckCircle2 } from 'lucide-react';

import { PageHeader } from '@/components/page-header';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { getIntegrityIssues } from '@/app/(app)/data-integrity/actions';
import {
  CATEGORY_LABELS,
  type IntegrityIssue,
} from '@/lib/data-integrity-utils';

export const dynamic = 'force-dynamic';

export default async function DataIntegrityPage() {
  const currentUser = await getCurrentUser();

  // Server-side guard, same pattern as the Users page: admin-only, since
  // this surfaces raw data problems and fixing any of them needs edit
  // access anyway.
  if (!currentUser || !isAdmin(currentUser.role)) {
    redirect('/');
  }

  const report = await getIntegrityIssues();

  const grouped = new Map<string, IntegrityIssue[]>();
  for (const issue of report.issues) {
    const existing = grouped.get(issue.category);
    if (existing) {
      existing.push(issue);
    } else {
      grouped.set(issue.category, [issue]);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Data Integrity"
        description="Scans current data for inconsistencies that validation alone can't catch after the fact — records older than a check, CSV imports, or direct database edits."
      />

      <Card>
        <CardHeader>
          <CardTitle>Scan Results</CardTitle>
          <CardDescription>
            Scanned {report.networksScanned} network
            {report.networksScanned === 1 ? '' : 's'} and{' '}
            {report.ipAddressesScanned} IP address
            {report.ipAddressesScanned === 1 ? '' : 'es'} just now — this runs
            fresh on every visit, nothing is stored.
            {report.overlapCheckSkipped
              ? ' The network-overlap check was skipped because there are too many networks to compare pairwise.'
              : ''}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {report.issues.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              No issues found.
            </div>
          ) : (
            <div className="space-y-5">
              {Array.from(grouped.entries()).map(([category, issues]) => (
                <div key={category}>
                  <h3 className="mb-2 text-sm font-semibold">
                    {CATEGORY_LABELS[category] ?? category} ({issues.length})
                  </h3>
                  <ul className="space-y-1">
                    {issues.map((issue) => (
                      <li key={issue.id}>
                        <Link
                          href={issue.href}
                          className="flex items-start gap-2 rounded-md p-2 text-sm transition-colors hover:bg-accent"
                        >
                          {issue.severity === 'critical' ? (
                            <AlertOctagon className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                          ) : (
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                          )}
                          <span>{issue.message}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
