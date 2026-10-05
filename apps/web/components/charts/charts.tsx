"use client";

import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { competitorColor } from "@/lib/constants";
import { cn } from "@/lib/utils";

export type Series = { key: string; label: string; colorIndex: number };
/** One row per x value. Values live at row[series.key]; sample sizes at row[`${series.key}__n`]. */
export type Point = { x: string; xLabel: string } & Record<string, number | string | null>;
export type Marker = { x: string; seriesKey: string; label: string };

const axisTick = { fill: "var(--chart-axis)", fontSize: 11 };

/** Serializable formatter choice (functions cannot cross the server → client boundary). */
export type ValueFormat = "int" | "1dp" | "2dp";
const FORMATTERS: Record<ValueFormat, (v: number) => string> = {
  int: (v) => v.toFixed(0),
  "1dp": (v) => v.toFixed(1),
  "2dp": (v) => v.toFixed(2),
};

function ChartTooltip({
  active,
  payload,
  label,
  series,
  format,
  data,
  markers,
}: {
  active?: boolean;
  payload?: { dataKey: string; value: number | null }[];
  label?: string;
  series: Series[];
  format: (v: number) => string;
  data: Point[];
  markers?: Marker[];
}) {
  if (!active || !payload?.length) return null;
  const row = data.find((d) => d.x === label);
  const ms = markers?.filter((m) => m.x === label) ?? [];
  return (
    <div className="min-w-44 rounded-md border border-border bg-bg px-3 py-2 text-xs shadow-popover">
      <div className="mb-1.5 font-medium text-fg">{row?.xLabel ?? label}</div>
      <table className="w-full">
        <tbody>
          {series.map((s) => {
            const v = row?.[s.key];
            const n = row?.[`${s.key}__n`];
            if (v === undefined) return null;
            return (
              <tr key={s.key}>
                <td className="pr-3">
                  <span className="mr-1.5 inline-block size-2 rounded-full align-middle" style={{ background: competitorColor(s.colorIndex) }} />
                  <span className="text-fg-muted">{s.label}</span>
                </td>
                <td className="text-right font-medium text-fg tabular">{v === null ? "—" : format(v as number)}</td>
                {n !== undefined && <td className="pl-2 text-right text-fg-subtle tabular">n={n as number}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
      {ms.map((m) => (
        <p key={m.label} className="mt-1.5 border-t border-border pt-1.5 text-warning">
          {m.label}
        </p>
      ))}
    </div>
  );
}

function SeriesToggles({ series, hidden, toggle }: { series: Series[]; hidden: Set<string>; toggle: (k: string) => void }) {
  return (
    <div role="group" aria-label="Series" className="flex flex-wrap gap-1.5">
      {series.map((s) => {
        const on = !hidden.has(s.key);
        return (
          <button
            key={s.key}
            type="button"
            aria-pressed={on}
            onClick={() => toggle(s.key)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs transition-colors",
              on ? "border-border-strong text-fg" : "border-border text-fg-subtle line-through",
            )}
          >
            <span className="size-2 rounded-full" style={{ background: on ? competitorColor(s.colorIndex) : "var(--border-strong)" }} />
            {s.label}
          </button>
        );
      })}
    </div>
  );
}

export function DataTable({ data, series, format, caption }: { data: Point[]; series: Series[]; format: (v: number) => string; caption: string }) {
  return (
    <details className="mt-3 text-xs">
      <summary className="cursor-pointer text-fg-muted select-none hover:text-fg">View as table</summary>
      <div className="mt-2 max-h-72 overflow-auto rounded-md border border-border">
        <table className="w-full text-xs">
          <caption className="sr-only">{caption}</caption>
          <thead className="sticky top-0 bg-bg-subtle">
            <tr>
              <th scope="col" className="px-2 py-1.5 text-left font-medium text-fg-subtle">
                Period
              </th>
              {series.map((s) => (
                <th key={s.key} scope="col" className="px-2 py-1.5 text-right font-medium text-fg-subtle">
                  {s.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.x} className="border-t border-border">
                <th scope="row" className="px-2 py-1 text-left font-normal text-fg-muted">
                  {d.xLabel}
                </th>
                {series.map((s) => {
                  const v = d[s.key];
                  const n = d[`${s.key}__n`];
                  return (
                    <td key={s.key} className="px-2 py-1 text-right tabular">
                      {v === null || v === undefined ? "—" : format(v as number)}
                      {n !== undefined && <span className="ml-1 text-fg-subtle">(n={n as number})</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/** Multi-series line chart over time with per-series toggles, exact-value tooltips and a table view. */
export function TimeSeriesChart({
  data,
  series,
  yLabel,
  yDomain,
  valueFormat = "int",
  caption,
  markers,
  referenceY,
  height = 260,
}: {
  data: Point[];
  series: Series[];
  yLabel: string;
  yDomain?: [number | "auto", number | "auto"];
  valueFormat?: ValueFormat;
  caption: string;
  markers?: Marker[];
  referenceY?: { y: number; label: string };
  height?: number;
}) {
  const format = FORMATTERS[valueFormat];
  const [hidden, setHidden] = React.useState<Set<string>>(new Set());
  const toggle = (k: string) =>
    setHidden((h) => {
      const next = new Set(h);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  const visible = series.filter((s) => !hidden.has(s.key));
  return (
    <figure aria-label={caption}>
      {series.length > 1 && <SeriesToggles series={series} hidden={hidden} toggle={toggle} />}
      <div className="mt-3" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
            <XAxis dataKey="x" tickFormatter={(x) => data.find((d) => d.x === x)?.xLabel ?? x} tick={axisTick} tickLine={false} axisLine={{ stroke: "var(--chart-grid)" }} minTickGap={24} />
            <YAxis
              domain={yDomain ?? ["auto", "auto"]}
              tick={axisTick}
              tickLine={false}
              axisLine={false}
              width={40}
              tickFormatter={(v) => format(v)}
              label={{ value: yLabel, angle: -90, position: "insideLeft", style: { fill: "var(--chart-axis)", fontSize: 11, textAnchor: "middle" }, offset: 10 }}
            />
            {referenceY && <ReferenceLine y={referenceY.y} stroke="var(--border-strong)" strokeDasharray="4 4" label={{ value: referenceY.label, fill: "var(--chart-axis)", fontSize: 10, position: "insideTopRight" }} />}
            <Tooltip content={<ChartTooltip series={visible} format={format} data={data} markers={markers} />} cursor={{ stroke: "var(--border-strong)" }} />
            {visible.map((s) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={competitorColor(s.colorIndex)}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--bg)" }}
                connectNulls
                isAnimationActive={false}
              />
            ))}
            {markers
              ?.filter((m) => !hidden.has(m.seriesKey))
              .map((m) => {
                const row = data.find((d) => d.x === m.x);
                const y = row?.[m.seriesKey];
                if (y === null || y === undefined) return null;
                return <ReferenceDot key={`${m.x}-${m.seriesKey}`} x={m.x} y={y as number} r={6} fill="var(--warning)" stroke="var(--bg)" strokeWidth={2} />;
              })}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <DataTable data={data} series={series} format={format} caption={caption} />
    </figure>
  );
}

/** Grouped bars per category (e.g. aspect score per competitor), with a table alternative. */
export function GroupedBarChart({
  data,
  series,
  yLabel,
  valueFormat = "int",
  caption,
  yDomain = [0, 100],
  height = 300,
}: {
  data: Point[];
  series: Series[];
  yLabel: string;
  valueFormat?: ValueFormat;
  caption: string;
  yDomain?: [number, number];
  height?: number;
}) {
  const format = FORMATTERS[valueFormat];
  return (
    <figure aria-label={caption}>
      <div className="flex flex-wrap gap-3 text-xs text-fg-muted">
        {series.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-sm" style={{ background: competitorColor(s.colorIndex) }} />
            {s.label}
          </span>
        ))}
      </div>
      <div className="mt-3" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2} barCategoryGap="22%">
            <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
            <XAxis dataKey="x" tickFormatter={(x) => data.find((d) => d.x === x)?.xLabel ?? x} tick={axisTick} tickLine={false} axisLine={{ stroke: "var(--chart-grid)" }} interval={0} angle={-25} textAnchor="end" height={64} />
            <YAxis domain={yDomain} tick={axisTick} tickLine={false} axisLine={false} width={40} label={{ value: yLabel, angle: -90, position: "insideLeft", style: { fill: "var(--chart-axis)", fontSize: 11, textAnchor: "middle" }, offset: 10 }} />
            <ReferenceLine y={50} stroke="var(--border-strong)" strokeDasharray="4 4" />
            <Tooltip content={<ChartTooltip series={series} format={format} data={data} />} cursor={{ fill: "var(--bg-muted)" }} />
            {series.map((s) => (
              <Bar key={s.key} dataKey={s.key} name={s.label} fill={competitorColor(s.colorIndex)} radius={[3, 3, 0, 0]} isAnimationActive={false} maxBarSize={22} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <DataTable data={data} series={series} format={format} caption={caption} />
    </figure>
  );
}
