import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AlertTriangle, ArrowDown, ArrowUp, Zap } from 'lucide-react';

import { PageHeader } from '@/components/page-header';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getCurrentUser, hasPassportAccess } from '@/lib/auth';
import { getImpactAnalysis } from '@/app/(app)/passports/actions';
import type { ImpactNode, DirectImpact } from '@/app/(app)/passports/actions';
import { ImpactGraph } from './impact-graph';

export const dynamic = 'force-dynamic';

// Read-only traversal of DEPENDENCY-typed OBJECT_REFERENCE links (CMDB
// phase 6, 1 September 2026 — see it-passports-design.md section 8.9):
// "what would be affected if this passport stopped working" (downstream)
// and "what this passport can't function without" (upstream). Gated the
// same as an individual passport page (hasPassportAccess), since it's
// really just another view of passport data.
export default async function ImpactAnalysisPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const currentUser = await getCurrentUser();
  if (!currentUser || !hasPassportAccess(currentUser.passportRole)) {
    redirect('/');
  }

  const data = await getImpactAnalysis(id);
  if (!data) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Impact-анализ — ${data.root.name}`}
        description={data.root.typeName}
      />

      {data.truncated ? (
        <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Цепочка связей длиннее {8} уровней — показаны не все звенья.
        </div>
      ) : null}

      <Tabs defaultValue="list">
        <TabsList>
          <TabsTrigger value="list">Список</TabsTrigger>
          <TabsTrigger value="diagram">Диаграмма</TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ArrowDown className="h-4 w-4 text-destructive" />
                Что пострадает, если этот объект выйдет из строя
              </CardTitle>
              <CardDescription>
                КЕ, которые зависят от этого объекта — напрямую или через
                цепочку зависимостей (связь «Зависит от»).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ImpactList
                nodes={data.downstream}
                emptyText="Ничего не зависит от этого объекта — на него никто не ссылается связью «Зависит от»."
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ArrowUp className="h-4 w-4 text-muted-foreground" />
                От чего зависит этот объект
              </CardTitle>
              <CardDescription>
                КЕ, без которых этот объект не может работать — напрямую или
                через цепочку зависимостей.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ImpactList
                nodes={data.upstream}
                emptyText="Этот объект не сконфигурирован зависящим ни от чего (связь «Зависит от»)."
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Zap className="h-4 w-4 text-amber-500" />
                Прямое влияние (вручную зафиксированное)
              </CardTitle>
              <CardDescription>
                Связи типа «Влияет на» — прямые, не прослеживаются дальше по
                цепочке.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DirectImpactList impacts={data.directImpacts} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="diagram">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Карта зависимостей</CardTitle>
              <CardDescription>
                Слева — то, что зависит от этого объекта (пострадает при
                отказе), справа — то, от чего зависит сам объект. Пунктиром —
                связи «Влияет на» между объектами, уже попавшими в цепочку.
                Объекты, связанные только «Влияет на» без цепочки зависимостей
                до этого объекта, здесь не показаны — см. список выше.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ImpactGraph data={data} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function groupByDepth(nodes: ImpactNode[]) {
  const groups = new Map<number, ImpactNode[]>();
  for (const n of nodes) {
    if (!groups.has(n.depth)) groups.set(n.depth, []);
    groups.get(n.depth)!.push(n);
  }
  return Array.from(groups.entries()).sort((a, b) => a[0] - b[0]);
}

function ImpactList({
  nodes,
  emptyText,
}: {
  nodes: ImpactNode[];
  emptyText: string;
}) {
  if (nodes.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  }

  return (
    <div className="space-y-3">
      {groupByDepth(nodes).map(([depth, items]) => (
        <div key={depth} className="space-y-1.5">
          <p className="text-xs font-medium uppercase text-muted-foreground">
            Уровень {depth} {depth > 1 ? '(через цепочку)' : '(напрямую)'}
          </p>
          <ul className="space-y-1 pl-1">
            {items.map((n) => (
              <li key={n.id} className="text-sm">
                <Link
                  href={`/passports/${n.id}`}
                  className="text-primary hover:underline"
                >
                  {n.name}
                </Link>{' '}
                <span className="text-muted-foreground">({n.typeName})</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function DirectImpactList({ impacts }: { impacts: DirectImpact[] }) {
  if (impacts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Нет прямых связей «Влияет на» ни в одну, ни в другую сторону.
      </p>
    );
  }

  return (
    <ul className="space-y-1.5">
      {impacts.map((imp) => (
        <li
          key={`${imp.direction}-${imp.id}`}
          className="flex items-center gap-2 text-sm"
        >
          <Badge variant={imp.direction === 'OUTGOING' ? 'default' : 'outline'}>
            {imp.direction === 'OUTGOING'
              ? 'Этот объект влияет на'
              : 'Влияет на этот объект'}
          </Badge>
          <Link
            href={`/passports/${imp.id}`}
            className="text-primary hover:underline"
          >
            {imp.name}
          </Link>
          <span className="text-muted-foreground">({imp.typeName})</span>
        </li>
      ))}
    </ul>
  );
}
