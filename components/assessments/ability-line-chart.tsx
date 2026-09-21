import { EmptyState } from "@/components/empty-state";
import { clubDateFromTimestamp } from "@/lib/assessments/model";
import { chartHasEnoughPoints, type DimensionSeries } from "@/lib/assessments/series";

export type LabeledDimensionSeries = DimensionSeries & {
  label: string;
  color: string;
};

type AbilityLineChartProps = {
  title: string;
  emptyTitle: string;
  emptyBody: string;
  series: LabeledDimensionSeries[];
};

const WIDTH = 640;
const HEIGHT = 260;
const PAD = { top: 16, right: 16, bottom: 40, left: 36 };

function xFor(index: number, count: number): number {
  if (count <= 1) {
    return PAD.left + (WIDTH - PAD.left - PAD.right) / 2;
  }
  return PAD.left + (index / (count - 1)) * (WIDTH - PAD.left - PAD.right);
}

function yFor(score: number): number {
  const min = 1;
  const max = 5;
  const t = (score - min) / (max - min);
  return HEIGHT - PAD.bottom - t * (HEIGHT - PAD.top - PAD.bottom);
}

export function AbilityLineChart({
  title,
  emptyTitle,
  emptyBody,
  series,
}: AbilityLineChartProps) {
  if (!chartHasEnoughPoints(series)) {
    return (
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          {title}
        </h2>
        <EmptyState title={emptyTitle} body={emptyBody} />
      </section>
    );
  }

  const axisTimes = [
    ...new Set(
      series.flatMap((item) => item.points.map((point) => point.at)),
    ),
  ].sort((a, b) => a.localeCompare(b));

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
        {title}
      </h2>
      <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <svg
          role="img"
          aria-label={title}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="h-auto w-full min-w-[20rem]"
        >
          <title>{title}</title>
          {[1, 2, 3, 4, 5].map((score) => (
            <g key={score}>
              <line
                x1={PAD.left}
                x2={WIDTH - PAD.right}
                y1={yFor(score)}
                y2={yFor(score)}
                className="stroke-zinc-200 dark:stroke-zinc-700"
                strokeWidth="1"
              />
              <text
                x={PAD.left - 8}
                y={yFor(score) + 4}
                textAnchor="end"
                className="fill-zinc-500 text-[11px]"
              >
                {score}
              </text>
            </g>
          ))}
          {axisTimes.map((at, index) => (
            <text
              key={at}
              x={xFor(index, axisTimes.length)}
              y={HEIGHT - 12}
              textAnchor="middle"
              className="fill-zinc-500 text-[10px]"
            >
              {clubDateFromTimestamp(at)}
            </text>
          ))}
          {series.map((item) => {
            if (item.points.length === 0) {
              return null;
            }
            const points = item.points
              .map((point) => {
                const index = axisTimes.indexOf(point.at);
                return `${xFor(index, axisTimes.length)},${yFor(point.score)}`;
              })
              .join(" ");
            return (
              <g key={`${item.kind}-${item.code}`}>
                {item.points.length >= 2 ? (
                  <polyline
                    fill="none"
                    stroke={item.color}
                    strokeWidth="2.5"
                    points={points}
                  />
                ) : null}
                {item.points.map((point) => {
                  const index = axisTimes.indexOf(point.at);
                  return (
                    <circle
                      key={`${item.code}-${point.at}`}
                      cx={xFor(index, axisTimes.length)}
                      cy={yFor(point.score)}
                      r="4"
                      fill={item.color}
                    >
                      <title>
                        {item.label} {clubDateFromTimestamp(point.at)} {point.score}
                      </title>
                    </circle>
                  );
                })}
              </g>
            );
          })}
        </svg>
        <ul className="mt-3 flex flex-wrap gap-3 text-sm">
          {series.map((item) => (
            <li key={`${item.kind}-${item.code}`} className="flex items-center gap-2">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: item.color }}
                aria-hidden
              />
              {item.label}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
