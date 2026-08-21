import {
  formatMonthLabel,
  type GrowthPoint,
} from '@/lib/dashboard-chart-utils';

// Hand-rolled SVG line/area chart — same rationale as donut-chart.tsx: no
// new charting dependency, just SVG paths computed from the data. Renders
// server-side, no client JS needed.

interface GrowthChartProps {
  data: GrowthPoint[];
  color: string;
}

const WIDTH = 300;
const HEIGHT = 80;
const PADDING = 4;

export function GrowthChart({ data, color }: GrowthChartProps) {
  const maxValue = Math.max(1, ...data.map((d) => d.count));
  const stepX = data.length > 1 ? (WIDTH - PADDING * 2) / (data.length - 1) : 0;

  const points = data.map((d, i) => ({
    x: PADDING + i * stepX,
    y: HEIGHT - PADDING - (d.count / maxValue) * (HEIGHT - PADDING * 2),
  }));

  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(' ');
  const areaPath =
    points.length > 1
      ? `${linePath} L ${points[points.length - 1].x.toFixed(2)} ${HEIGHT - PADDING} L ${points[0].x.toFixed(2)} ${HEIGHT - PADDING} Z`
      : '';

  const midIndex = Math.floor((data.length - 1) / 2);

  return (
    <div className="space-y-1.5">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        className="h-20 w-full"
      >
        {points.length > 1 ? (
          <>
            <path d={areaPath} fill={color} fillOpacity={0.12} stroke="none" />
            <path
              d={linePath}
              fill="none"
              stroke={color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </>
        ) : null}
      </svg>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        {data.map((d, i) => (
          <span
            key={d.month}
            className={
              i === 0 || i === data.length - 1 || i === midIndex
                ? undefined
                : 'invisible'
            }
          >
            {formatMonthLabel(d.month)}
          </span>
        ))}
      </div>
    </div>
  );
}
