import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Network,
  Plus,
  Server,
  ShieldCheck,
} from 'lucide-react';

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
import { DonutChart } from '@/components/donut-chart';
import { GrowthChart } from '@/components/growth-chart';
import { getCurrentUser, canEdit } from '@/lib/auth';
import {
  getDashboardData,
  getDashboardAlerts,
  getDashboardCharts,
} from '@/app/(app)/actions';
import { describeActivity } from '@/lib/audit-log-utils';

export const dynamic = 'force-dynamic';

// Fixed hsl(var(--chart-N)) tokens from globals.css — theme-aware (they
// have separate light/dark values) without hardcoding hex colors here.
const CHART_COLORS = {
  chart1: 'hsl(var(--chart-1))',
  chart2: 'hsl(var(--chart-2))',
  chart3: 'hsl(var(--chart-3))',
  chart4: 'hsl(var(--chart-4))',
  destructive: 'hsl(var(--destructive))',
  muted: 'hsl(var(--muted-foreground))',
};

export default async function DashboardPage() {
  const [
    { totalNetworks, totalIps, statusMap, recentActivity },
    alerts,
    charts,
    currentUser,
  ] = await Promise.all([
    getDashboardData(),
    getDashboardAlerts(),
    getDashboardCharts(),
    getCurrentUser(),
  ]);

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

      <Card>
        <CardHeader>
          <CardTitle>Alerts</CardTitle>
          <CardDescription>
            Things that might need attention, computed from current data.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {alerts.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              All clear — nothing needs attention right now.
            </div>
          ) : (
            <ul className="space-y-2">
              {alerts.map((alert) => (
                <li key={alert.id}>
                  <Link
                    href={alert.href}
                    className="flex items-start gap-2 rounded-md p-2 text-sm transition-colors hover:bg-accent"
                  >
                    {alert.severity === 'critical' ? (
                      <AlertOctagon className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                    ) : (
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                    )}
                    <span>{alert.message}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

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

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Status Breakdown</CardTitle>
            <CardDescription>
              Networks and IP addresses by current status.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6 sm:flex-row sm:flex-wrap">
            <DonutChart
              centerLabel="networks"
              segments={[
                {
                  label: 'Active',
                  value: charts.networksByStatus[0].value,
                  color: CHART_COLORS.chart2,
                },
                {
                  label: 'Reserved',
                  value: charts.networksByStatus[1].value,
                  color: CHART_COLORS.chart4,
                },
                {
                  label: 'Archived',
                  value: charts.networksByStatus[2].value,
                  color: CHART_COLORS.muted,
                },
              ]}
            />
            <DonutChart
              centerLabel="IPs"
              segments={[
                {
                  label: 'Assigned',
                  value: charts.ipsByStatus[0].value,
                  color: CHART_COLORS.chart1,
                },
                {
                  label: 'Available',
                  value: charts.ipsByStatus[1].value,
                  color: CHART_COLORS.chart2,
                },
                {
                  label: 'Reserved',
                  value: charts.ipsByStatus[2].value,
                  color: CHART_COLORS.chart4,
                },
                {
                  label: 'Blocked',
                  value: charts.ipsByStatus[3].value,
                  color: CHART_COLORS.destructive,
                },
              ]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Inventory Growth</CardTitle>
            <CardDescription>
              Cumulative total over the last 12 months.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">
                Networks
              </p>
              <GrowthChart
                data={charts.networkGrowth}
                color={CHART_COLORS.chart1}
              />
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">
                IP Addresses
              </p>
              <GrowthChart data={charts.ipGrowth} color={CHART_COLORS.chart2} />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
