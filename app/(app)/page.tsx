import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { Activity, Network, Plus, Server, ShieldCheck } from 'lucide-react';
import type { AuditAction } from '@prisma/client';

import { PageHeader } from '@/components/page-header';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmptyState } from '@/components/empty-state';
import { getCurrentUser, canEdit } from '@/lib/auth';
import { getDashboardData } from '@/app/(app)/actions';

export const dynamic = 'force-dynamic';

type ActivityRow = {
  id: string;
  action: AuditAction;
  entity: string;
  createdAt: Date;
  metadata: unknown;
  user: { email: string } | null;
};

function describeActivity(log: ActivityRow): string {
  const meta = (log.metadata ?? {}) as Record<string, unknown>;
  const str = (key: string) =>
    typeof meta[key] === 'string' ? (meta[key] as string) : '';
  const actor = log.user?.email ?? 'Someone';

  if (log.entity === 'Auth') {
    return log.action === 'LOGIN'
      ? `${actor} signed in`
      : `${actor} signed out`;
  }

  if (log.entity === 'Network') {
    const label = [str('cidr'), str('name')].filter(Boolean).join(' — ');
    if (log.action === 'CREATE') return `${actor} created network ${label}`;
    if (log.action === 'UPDATE') return `${actor} updated network ${label}`;
    if (log.action === 'DELETE') return `${actor} deleted network ${label}`;
  }

  if (log.entity === 'IpAddress') {
    const address = str('address');
    if (log.action === 'CREATE') return `${actor} assigned ${address}`;
    if (log.action === 'UPDATE') return `${actor} updated ${address}`;
    if (log.action === 'DELETE') return `${actor} removed ${address}`;
  }

  if (log.entity === 'User') {
    const email = str('email');
    const role = str('newRole') || str('invitedRole');
    if (log.action === 'CREATE')
      return `${actor} invited ${email}${role ? ` as ${role}` : ''}`;
    if (log.action === 'UPDATE')
      return `${actor} set ${email}'s role to ${role}`;
  }

  return `${actor} ${log.action.toLowerCase()}d ${log.entity.toLowerCase()}`;
}

export default async function DashboardPage() {
  const [{ totalNetworks, totalIps, statusMap, recentActivity }, currentUser] =
    await Promise.all([getDashboardData(), getCurrentUser()]);

  const userCanEdit = !!currentUser && canEdit(currentUser.role);

  const stats = [
    { label: 'Total Networks', value: totalNetworks, icon: Network },
    { label: 'Total IP Addresses', value: totalIps, icon: Server },
    { label: 'Assigned IPs', value: statusMap.ASSIGNED, icon: Activity },
    { label: 'Available IPs', value: statusMap.AVAILABLE, icon: ShieldCheck },
  ];

  const statusBreakdown = [
    {
      label: 'Assigned',
      value: statusMap.ASSIGNED,
      variant: 'default' as const,
    },
    {
      label: 'Available',
      value: statusMap.AVAILABLE,
      variant: 'secondary' as const,
    },
    {
      label: 'Reserved',
      value: statusMap.RESERVED,
      variant: 'outline' as const,
    },
    {
      label: 'Blocked',
      value: statusMap.BLOCKED,
      variant: 'destructive' as const,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Overview of your IP address space and network inventory."
      >
        {userCanEdit ? (
          <Button asChild>
            <Link href="/networks">
              <Plus className="mr-2 h-4 w-4" />
              Add Network
            </Link>
          </Button>
        ) : null}
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.label}
              </CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>
              Latest changes across networks, IP addresses, and users.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {recentActivity.length === 0 ? (
              <EmptyState
                icon={<Activity className="h-6 w-6" />}
                title="No activity yet"
                description="Changes you make across the app will show up here."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Event</TableHead>
                    <TableHead className="w-[140px] text-right">Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentActivity.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">
                        {describeActivity(row)}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {formatDistanceToNow(row.createdAt, {
                          addSuffix: true,
                        })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>IP Status Breakdown</CardTitle>
            <CardDescription>Across all tracked IP addresses.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {statusBreakdown.map((row) => (
              <div
                key={row.label}
                className="flex items-center justify-between"
              >
                <span className="text-sm">{row.label}</span>
                <Badge variant={row.variant}>{row.value}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
