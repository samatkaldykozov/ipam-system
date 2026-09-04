'use client';

import Link from 'next/link';

import type { ImpactAnalysis } from '@/app/(app)/passports/actions';

// Visual "service map" view of the impact analysis (section 8.18, "Визуальная
// карта сервиса") — the exact same data the list view above already shows
// (getImpactAnalysis, section 8.13/8.10), laid out as a diagram instead of
// grouped text. No new server traversal: this only lays out the nodes and
// edges the server action already returns.
//
// Layout: one column per BFS depth, root in the middle (column 0).
// "Upstream" (what the root depends on) grows to the right, following the
// DEPENDENCY edge direction ("A зависит от B" is drawn A -> B); "downstream"
// (what depends on the root) grows to the left, so the whole diagram reads
// left-to-right as one dependency chain with the root in the middle. Direct
// IMPACT edges are drawn dashed, but only when both ends already have a
// position from the dependency chain above — a node that's *only*
// IMPACT-linked (no DEPENDENCY chain to the root) has nowhere principled to
// sit in this layout and stays in the "Прямое влияние" list instead, which
// already shows it.

const NODE_WIDTH = 176;
const NODE_HEIGHT = 48;
const COL_GAP = 88;
const ROW_GAP = 14;
const PADDING = 32;

type PositionedNode = {
  id: string;
  name: string;
  typeName: string;
  col: number;
  row: number;
  kind: 'root' | 'downstream' | 'upstream';
};

export function ImpactGraph({ data }: { data: ImpactAnalysis }) {
  const byColumn = new Map<number, PositionedNode[]>();

  function place(
    id: string,
    name: string,
    typeName: string,
    col: number,
    kind: PositionedNode['kind'],
  ) {
    if (!byColumn.has(col)) byColumn.set(col, []);
    const list = byColumn.get(col)!;
    if (list.some((n) => n.id === id)) return;
    list.push({ id, name, typeName, col, row: list.length, kind });
  }

  place(data.root.id, data.root.name, data.root.typeName, 0, 'root');
  for (const n of data.downstream) {
    place(n.id, n.name, n.typeName, -n.depth, 'downstream');
  }
  for (const n of data.upstream) {
    place(n.id, n.name, n.typeName, n.depth, 'upstream');
  }

  // Stable, readable row order within each column.
  for (const list of Array.from(byColumn.values())) {
    list.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    list.forEach((n, i) => (n.row = i));
  }

  if (byColumn.size <= 1) {
    return (
      <p className="text-sm text-muted-foreground">
        Кроме самого объекта, в цепочке зависимостей и прямых влияний рисовать
        нечего — диаграмма была бы пустой.
      </p>
    );
  }

  const columns = Array.from(byColumn.keys()).sort((a, b) => a - b);
  const colIndex = new Map(columns.map((c, i) => [c, i]));
  const maxRows = Math.max(
    ...Array.from(byColumn.values()).map((l) => l.length),
  );
  const rowHeight = NODE_HEIGHT + ROW_GAP;
  const colWidth = NODE_WIDTH + COL_GAP;

  const width = columns.length * colWidth - COL_GAP + PADDING * 2;
  const height = maxRows * rowHeight - ROW_GAP + PADDING * 2;
  const centerY = height / 2;

  const positions = new Map<
    string,
    PositionedNode & { x: number; y: number }
  >();
  for (const list of Array.from(byColumn.values())) {
    const colH = list.length * rowHeight - ROW_GAP;
    const top = centerY - colH / 2;
    for (const n of list) {
      const x = PADDING + (colIndex.get(n.col) ?? 0) * colWidth;
      const y = top + n.row * rowHeight;
      positions.set(n.id, { ...n, x, y });
    }
  }

  const dependencyEdges = data.edges.filter(
    (e) =>
      e.type === 'DEPENDENCY' && positions.has(e.from) && positions.has(e.to),
  );
  const impactEdges = data.edges.filter(
    (e) => e.type === 'IMPACT' && positions.has(e.from) && positions.has(e.to),
  );

  function edgePath(fromId: string, toId: string) {
    const a = positions.get(fromId)!;
    const b = positions.get(toId)!;
    const leftToRight = a.x <= b.x;
    const x1 = a.x + (leftToRight ? NODE_WIDTH : 0);
    const y1 = a.y + NODE_HEIGHT / 2;
    const x2 = b.x + (leftToRight ? 0 : NODE_WIDTH);
    const y2 = b.y + NODE_HEIGHT / 2;
    const dx = Math.max(Math.abs(x2 - x1) / 2, 24);
    return `M ${x1} ${y1} C ${x1 + (leftToRight ? dx : -dx)} ${y1}, ${
      x2 - (leftToRight ? dx : -dx)
    } ${y2}, ${x2} ${y2}`;
  }

  return (
    <div className="overflow-x-auto rounded-md border bg-muted/20">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="block"
      >
        <defs>
          <marker
            id="impact-arrow-dependency"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" className="fill-slate-400" />
          </marker>
          <marker
            id="impact-arrow-impact"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" className="fill-amber-500" />
          </marker>
        </defs>

        {dependencyEdges.map((e, i) => (
          <path
            key={`dep-${i}`}
            d={edgePath(e.from, e.to)}
            fill="none"
            className="stroke-slate-300"
            strokeWidth={1.5}
            markerEnd="url(#impact-arrow-dependency)"
          />
        ))}
        {impactEdges.map((e, i) => (
          <path
            key={`imp-${i}`}
            d={edgePath(e.from, e.to)}
            fill="none"
            className="stroke-amber-400"
            strokeWidth={1.5}
            strokeDasharray="5 4"
            markerEnd="url(#impact-arrow-impact)"
          />
        ))}

        {Array.from(positions.values()).map((n) => (
          <foreignObject
            key={n.id}
            x={n.x}
            y={n.y}
            width={NODE_WIDTH}
            height={NODE_HEIGHT}
          >
            <div
              className={`flex h-full flex-col justify-center rounded-md border px-2.5 py-1 text-xs leading-tight shadow-sm ${
                n.kind === 'root'
                  ? 'border-primary bg-primary/10'
                  : n.kind === 'downstream'
                    ? 'border-destructive/30 bg-destructive/5'
                    : 'border-border bg-background'
              }`}
            >
              {n.kind === 'root' ? (
                <span className="truncate font-medium">{n.name}</span>
              ) : (
                <Link
                  href={`/passports/${n.id}`}
                  className="truncate font-medium text-primary hover:underline"
                >
                  {n.name}
                </Link>
              )}
              <span className="truncate text-muted-foreground">
                {n.typeName}
              </span>
            </div>
          </foreignObject>
        ))}
      </svg>
    </div>
  );
}
