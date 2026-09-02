import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';

import { PageHeader } from '@/components/page-header';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { getCurrentUser, hasPassportAccess } from '@/lib/auth';
import { getRackElevation } from '@/app/(app)/locations/actions';
import type { RackOccupant } from '@/app/(app)/locations/actions';

export const dynamic = 'force-dynamic';

// Places occupants into "lanes" (like a calendar view) so overlapping
// RACK_POSITION ranges render side by side instead of literally on top of
// each other — classic interval-scheduling greedy assignment. Occupants
// arrive pre-sorted by start (see getRackElevation).
function assignLanes(occupants: RackOccupant[]) {
  const laneEnds: number[] = [];
  return occupants.map((occ) => {
    let lane = laneEnds.findIndex((end) => end < occ.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(occ.end);
    } else {
      laneEnds[lane] = occ.end;
    }
    return { occ, lane };
  });
}

// Read-only picture of what occupies a rack, built from RACK_POSITION
// values scattered across equipment passports (CMDB phase 5, 31 August
// 2026 — see it-passports-design.md section 8.8). Gated the same as
// individual passport pages (hasPassportAccess) since it surfaces
// passport names/types, even though the URL lives under /locations.
export default async function RackElevationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const currentUser = await getCurrentUser();
  if (!currentUser || !hasPassportAccess(currentUser.passportRole)) {
    redirect('/');
  }

  const data = await getRackElevation(id);
  if (data.kind === 'not-found') {
    notFound();
  }

  if (data.kind === 'not-a-rack') {
    return (
      <div className="space-y-6">
        <PageHeader title={`Раскладка стойки — ${data.locationName}`} />
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            «{data.locationName}» не является стойкой (тип узла — не «Rack»),
            поэтому раскладка недоступна.
          </CardContent>
        </Card>
      </div>
    );
  }

  if (data.kind === 'no-capacity') {
    return (
      <div className="space-y-6">
        <PageHeader title={`Раскладка стойки — ${data.locationName}`} />
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            Для этой стойки не указана вместимость (юниты). Укажите её в
            карточке локации («Rack units (U)»), чтобы увидеть раскладку.
          </CardContent>
        </Card>
      </div>
    );
  }

  const lanePlacements = assignLanes(data.occupants);
  const lanes = lanePlacements.reduce((max, p) => Math.max(max, p.lane + 1), 1);
  const unitsDescending = Array.from(
    { length: data.rackUnits },
    (_, i) => data.rackUnits - i,
  );
  const hasProblems =
    data.overlapUnits.length > 0 || data.overCapacity.length > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Раскладка стойки — ${data.locationName}`}
        description={`${data.rackUnits}U. Юниты нумеруются снизу вверх (юнит 1 — самый нижний). Позиция заполняется вручную в КЕ оборудования и не проверяется при сохранении — эта страница только показывает текущую картину.`}
      />

      {hasProblems ? (
        <Card className="border-destructive/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base text-destructive">
              <AlertTriangle className="h-4 w-4" />
              Обнаружены проблемы
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {data.overlapUnits.length > 0 ? (
              <p>
                Пересечение позиций в юнит
                {data.overlapUnits.length === 1 ? 'е' : 'ах'}:{' '}
                {data.overlapUnits.join(', ')}.
              </p>
            ) : null}
            {data.overCapacity.map((occ) => (
              <p key={occ.objectInstanceId}>
                «{occ.objectInstanceName}» ({occ.raw}) выходит за пределы стойки
                ({data.rackUnits}U).
              </p>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Схема стойки</CardTitle>
        </CardHeader>
        <CardContent>
          {data.occupants.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              В этой стойке нет оборудования с указанной позицией.
            </p>
          ) : (
            <div
              className="grid overflow-hidden rounded-md border text-sm"
              style={{
                gridTemplateColumns: `3.5rem repeat(${lanes}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${data.rackUnits}, minmax(1.75rem, auto))`,
              }}
            >
              {unitsDescending.map((unit, rowIndex) => (
                <div
                  key={`label-${unit}`}
                  className={`flex items-center justify-end bg-muted/30 px-2 text-xs text-muted-foreground ${
                    rowIndex < data.rackUnits - 1
                      ? 'border-b border-r'
                      : 'border-r'
                  }`}
                  style={{ gridColumn: 1, gridRow: rowIndex + 1 }}
                >
                  {unit}
                </div>
              ))}
              {unitsDescending.map((unit, rowIndex) => (
                <div
                  key={`grid-${unit}`}
                  className={rowIndex < data.rackUnits - 1 ? 'border-b' : ''}
                  style={{ gridColumn: `2 / -1`, gridRow: rowIndex + 1 }}
                />
              ))}
              {lanePlacements.map(({ occ, lane }) => {
                const topRow = data.rackUnits - occ.end + 1;
                const hasOverlap = data.overlapUnits.some(
                  (u) => u >= occ.start && u <= occ.end,
                );
                const overCap = occ.end > data.rackUnits;
                return (
                  <Link
                    key={occ.objectInstanceId}
                    href={`/passports/${occ.objectInstanceId}`}
                    className={`m-0.5 flex flex-col justify-center overflow-hidden rounded-sm border px-2 py-1 text-xs transition-colors hover:opacity-80 ${
                      hasOverlap || overCap
                        ? 'bg-destructive/15 border-destructive'
                        : 'bg-primary/15 border-primary/40'
                    }`}
                    style={{
                      gridColumn: lane + 2,
                      gridRow: `${topRow} / span ${occ.size}`,
                    }}
                    title={`${occ.objectInstanceName} — ${occ.objectTypeName}, юнит${
                      occ.size > 1 ? 'ы' : ''
                    } ${occ.start}${occ.size > 1 ? `–${occ.end}` : ''}`}
                  >
                    <span className="truncate font-medium">
                      {occ.objectInstanceName}
                    </span>
                    <span className="truncate text-muted-foreground">
                      {occ.objectTypeName}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {data.unplaced.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Без указанной позиции</CardTitle>
            <CardDescription>
              Это оборудование привязано к стойке «{data.locationName}», но в
              его КЕ не заполнено поле «Позиция в стойке».
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {data.unplaced.map((item) => (
                <li key={item.objectInstanceId}>
                  <Link
                    href={`/passports/${item.objectInstanceId}`}
                    className="text-primary hover:underline"
                  >
                    {item.objectInstanceName}
                  </Link>{' '}
                  <span className="text-muted-foreground">
                    — {item.objectTypeName}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
