"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { SegmentedControl } from "./segmented-control";

export type ScorePoint = {
  /** "YYYY-MM-DD" */
  date: string;
  value: number;
  /** Official results get a ringed marker. */
  official?: boolean;
  /** Screen-reader / tooltip text for the point, e.g. "12 Oct · Mock · 6.5". */
  label: string;
};

export type ScoreSeries = { key: string; label: string; points: ScorePoint[] };

/** Drawing width before the container is measured (the server render). */
const DEFAULT_W = 640;
const H = 260;
const PAD = { top: 16, right: 20, bottom: 32, left: 44 };
const SECTION_COLORS = ["var(--chart-2)", "var(--chart-3)", "var(--chart-2)", "var(--chart-3)"];
const SECTION_DASH = [undefined, undefined, "6 4", "6 4"];

const dayMs = (d: string) => Date.parse(`${d}T00:00:00Z`);

function niceTicks(min: number, max: number, count = 4): number[] {
  const span = max - min || 1;
  const raw = span / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
  const start = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + step / 1000; v += step) ticks.push(Math.round(v * 100) / 100);
  return ticks;
}

/**
 * Exam progress (16, M6): total score over time with a dashed target line and an exam-date marker; section
 * lines behind a toggle. Plain SVG drawn with the chart tokens (05-ui), redrawn at its container's width so
 * text keeps its size on a phone. `min`/`max` are the type's range; the visible range hugs the data.
 */
export function ScoreChart({
  points,
  sections,
  min,
  max,
  target,
  examDate,
  format,
  formatDate,
  labels,
  className,
}: {
  points: ScorePoint[];
  sections?: ScoreSeries[];
  min: number;
  max: number;
  target?: number | null;
  examDate?: string | null;
  format: (value: number) => string;
  /** Short axis date, e.g. "12 Oct". */
  formatDate: (date: string) => string;
  labels: {
    /** Accessible summary of the whole chart. */
    title: string;
    target: string;
    examDate: string;
    total: string;
    sections: string;
  };
  className?: string;
}) {
  const [view, setView] = useState<"total" | "sections">("total");
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(DEFAULT_W);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setW(Math.max(280, Math.round(entry.contentRect.width)));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const showSections = view === "sections" && (sections?.length ?? 0) > 0;
  const series = showSections ? sections! : [];

  const values = [
    ...points.map((p) => p.value),
    ...series.flatMap((s) => s.points.map((p) => p.value)),
    ...(target !== null && target !== undefined ? [target] : []),
  ];
  const span = max - min;
  let lo = Math.max(min, Math.min(...values) - span * 0.08);
  let hi = Math.min(max, Math.max(...values) + span * 0.08);
  if (!(hi > lo)) {
    lo = min;
    hi = max;
  }

  const dates = [...points.map((p) => p.date), ...(examDate ? [examDate] : [])].map(dayMs);
  let t0 = Math.min(...dates);
  let t1 = Math.max(...dates);
  t1 += (t1 - t0) * 0.03;
  if (t1 - t0 < 7 * 86_400_000) {
    t0 -= 3 * 86_400_000;
    t1 += 3 * 86_400_000;
  }

  const x = (date: string) =>
    PAD.left + ((dayMs(date) - t0) / (t1 - t0)) * (W - PAD.left - PAD.right);
  const y = (value: number) =>
    PAD.top + (1 - (value - lo) / (hi - lo)) * (H - PAD.top - PAD.bottom);
  const path = (ps: ScorePoint[]) =>
    ps
      .map((p, i) => `${i === 0 ? "M" : "L"}${x(p.date).toFixed(1)},${y(p.value).toFixed(1)}`)
      .join(" ");

  const ticks = niceTicks(lo, hi);
  const targetText =
    target === null || target === undefined ? "" : `${labels.target} ${format(target)}`;
  const pointTitle = (series: string, point: string) => `${series} · ${point}`;
  const days = [...new Set(points.map((p) => p.date))];
  const xTicks = days.length <= Math.floor(W / 90) ? days : [days[0]!, days.at(-1)!];

  return (
    <div ref={box} className={cn("space-y-3", className)}>
      {sections && sections.length > 0 ? (
        <SegmentedControl
          label={labels.title}
          value={view}
          onChange={setView}
          options={[
            { value: "total", label: labels.total },
            { value: "sections", label: labels.sections },
          ]}
        />
      ) : null}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={labels.title}
        className="h-auto w-full"
        data-testid="score-chart"
      >
        {ticks.map((v) => (
          <g key={v}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(v)}
              y2={y(v)}
              stroke="var(--border)"
              strokeWidth={1}
            />
            <text
              x={PAD.left - 8}
              y={y(v)}
              textAnchor="end"
              dominantBaseline="middle"
              fontSize={12}
              fill="var(--muted-foreground)"
            >
              {format(v)}
            </text>
          </g>
        ))}
        {xTicks.map((d) => (
          <text
            key={d}
            x={x(d)}
            y={H - 10}
            textAnchor="middle"
            fontSize={12}
            fill="var(--muted-foreground)"
          >
            {formatDate(d)}
          </text>
        ))}

        {target !== null && target !== undefined && target >= lo && target <= hi ? (
          <g data-testid="score-chart-target">
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(target)}
              y2={y(target)}
              stroke="var(--success)"
              strokeWidth={2}
              strokeDasharray="6 5"
            />
            <text
              x={PAD.left + 6}
              y={y(target) - 6}
              textAnchor="start"
              fontSize={12}
              fontWeight={600}
              fill="var(--success)"
            >
              {targetText}
            </text>
          </g>
        ) : null}

        {examDate ? (
          <g data-testid="score-chart-exam-date">
            <line
              x1={x(examDate)}
              x2={x(examDate)}
              y1={PAD.top}
              y2={H - PAD.bottom}
              stroke="var(--warning)"
              strokeWidth={2}
              strokeDasharray="4 4"
            />
            <text
              x={x(examDate) - 6}
              y={H - PAD.bottom - 6}
              textAnchor="end"
              fontSize={12}
              fontWeight={600}
              fill="var(--warning)"
            >
              {labels.examDate}
            </text>
          </g>
        ) : null}

        {series.map((s, i) => (
          <g key={s.key}>
            <path
              d={path(s.points)}
              fill="none"
              stroke={SECTION_COLORS[i % SECTION_COLORS.length]}
              strokeWidth={2}
              strokeDasharray={SECTION_DASH[i % SECTION_DASH.length]}
              opacity={0.9}
            />
            {s.points.map((p, j) => (
              <circle
                key={j}
                cx={x(p.date)}
                cy={y(p.value)}
                r={3}
                fill={SECTION_COLORS[i % SECTION_COLORS.length]}
              >
                <title>{pointTitle(s.label, p.label)}</title>
              </circle>
            ))}
          </g>
        ))}

        <path d={path(points)} fill="none" stroke="var(--chart-1)" strokeWidth={3} />
        {points.map((p, j) => (
          <circle
            key={j}
            cx={x(p.date)}
            cy={y(p.value)}
            r={p.official ? 6 : 4.5}
            fill={p.official ? "var(--card)" : "var(--chart-1)"}
            stroke="var(--chart-1)"
            strokeWidth={p.official ? 3 : 0}
            data-testid="score-chart-point"
          >
            <title>{p.label}</title>
          </circle>
        ))}
      </svg>
      {showSections ? (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-secondary-foreground">
          {series.map((s, i) => (
            <li key={s.key} className="flex items-center gap-2">
              <svg width="18" height="6" aria-hidden="true">
                <line
                  x1="0"
                  x2="18"
                  y1="3"
                  y2="3"
                  stroke={SECTION_COLORS[i % SECTION_COLORS.length]}
                  strokeWidth="2"
                  strokeDasharray={SECTION_DASH[i % SECTION_DASH.length]}
                />
              </svg>
              {s.label}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
