import {
  computeDonutSegments,
  type DonutInput,
} from '@/lib/dashboard-chart-utils';

// Hand-rolled SVG donut — see the comment in lib/dashboard-chart-utils.ts
// for why this doesn't use the recharts dependency that's already in
// package.json. Pure SVG + CSS, no client-side JS needed at all.
const RADIUS = 15.91549430918954; // circumference = 2*pi*r = 100

interface DonutChartProps {
  segments: (DonutInput & { color: string })[];
  centerLabel?: string;
}

export function DonutChart({ segments, centerLabel }: DonutChartProps) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const computed = computeDonutSegments(segments);

  return (
    <div className="flex items-center gap-5">
      <div className="relative h-32 w-32 shrink-0">
        <svg viewBox="0 0 42 42" className="h-full w-full -rotate-90">
          <circle
            cx="21"
            cy="21"
            r={RADIUS}
            fill="transparent"
            stroke="hsl(var(--muted))"
            strokeWidth="5"
          />
          {total > 0
            ? computed.map((seg, i) => {
                const color = segments[i].color;
                return (
                  <circle
                    key={seg.label}
                    cx="21"
                    cy="21"
                    r={RADIUS}
                    fill="transparent"
                    stroke={color}
                    strokeWidth="5"
                    strokeDasharray={`${seg.percent} ${100 - seg.percent}`}
                    strokeDashoffset={-seg.offset}
                  />
                );
              })
            : null}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-semibold">{total}</span>
          {centerLabel ? (
            <span className="text-[10px] text-muted-foreground">
              {centerLabel}
            </span>
          ) : null}
        </div>
      </div>
      <div className="space-y-1.5">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center gap-2 text-sm">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: s.color }}
            />
            <span className="text-muted-foreground">{s.label}</span>
            <span className="font-medium">{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
