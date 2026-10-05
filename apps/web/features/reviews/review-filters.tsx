"use client";

import { Download, Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/form";
import { LANGUAGE_LABEL, SOURCE_LABEL } from "@/lib/constants";

type Opt = { value: string; label: string };

export function ReviewFilters({
  competitors,
  aspects,
  languages,
  sources,
}: {
  competitors: Opt[];
  aspects: Opt[];
  languages: { language: string; n: number }[];
  sources: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = React.useState(params.get("q") ?? "");
  const [, start] = React.useTransition();

  const set = React.useCallback(
    (patch: Record<string, string | null>) => {
      const sp = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v) sp.set(k, v);
        else sp.delete(k);
      }
      sp.delete("cursor"); // any filter change returns to the first page
      start(() => router.push(`${pathname}?${sp.toString()}`, { scroll: false }));
    },
    [params, pathname, router],
  );

  // Debounced keyword search
  React.useEffect(() => {
    const current = params.get("q") ?? "";
    if (q.trim() === current) return;
    const t = setTimeout(() => set({ q: q.trim() || null }), 350);
    return () => clearTimeout(t);
  }, [q, params, set]);

  const select = (key: string, label: string, options: Opt[], allLabel = "All") => (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={`f-${key}`} className="text-2xs font-medium tracking-wide text-fg-subtle uppercase">
        {label}
      </label>
      <NativeSelect id={`f-${key}`} value={params.get(key) ?? ""} onChange={(e) => set({ [key]: e.target.value || null })} className="h-8 text-sm">
        <option value="">{allLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </NativeSelect>
    </div>
  );

  const sentiments = [
    { value: "POSITIVE", label: "Positive" },
    { value: "NEUTRAL", label: "Neutral" },
    { value: "NEGATIVE", label: "Negative" },
  ];
  const active = [...params.keys()].filter((k) => !["cursor", "range"].includes(k)).length > 0;
  const exportHref = `/api/v1/reviews/export?${(() => {
    const sp = new URLSearchParams(params.toString());
    sp.delete("cursor");
    return sp.toString();
  })()}`;

  return (
    <div className="rounded-lg border border-border bg-bg p-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="relative min-w-56 flex-1">
          <label htmlFor="f-q" className="text-2xs font-medium tracking-wide text-fg-subtle uppercase">
            Keyword
          </label>
          <Search className="pointer-events-none absolute bottom-2 left-2.5 size-4 text-fg-subtle" aria-hidden />
          <input
            id="f-q"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder='e.g. refund, "out of stock", -app'
            className="mt-1 h-8 w-full rounded-md border border-border bg-bg pr-2 pl-8 text-sm placeholder:text-fg-subtle focus-visible:border-ring focus-visible:outline-none"
          />
        </div>
        <div className="flex flex-wrap items-end gap-2">
          {active && (
            <Button
              variant="ghost"
              size="md"
              onClick={() => {
                setQ("");
                start(() => router.push(pathname));
              }}
            >
              <X aria-hidden /> Clear filters
            </Button>
          )}
          <Button variant="secondary" size="md" asChild>
            <a href={exportHref} download>
              <Download aria-hidden /> Export CSV
            </a>
          </Button>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {select("competitor", "Competitor", competitors)}
        {select("sentiment", "Overall sentiment", sentiments)}
        {select("aspect", "Aspect", aspects)}
        {select("aspectSentiment", "Aspect sentiment", sentiments)}
        {select("rating", "Rating", [
          { value: "1,2", label: "1–2 stars" },
          { value: "4,5", label: "4–5 stars" },
          ...[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: `${n} star${n > 1 ? "s" : ""}` })),
        ])}
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor="f-from" className="text-2xs font-medium tracking-wide text-fg-subtle uppercase">
            From
          </label>
          <input id="f-from" type="date" value={params.get("from") ?? ""} onChange={(e) => set({ from: e.target.value || null })} className="h-8 rounded-md border border-border bg-bg px-2 text-sm" />
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor="f-to" className="text-2xs font-medium tracking-wide text-fg-subtle uppercase">
            To
          </label>
          <input id="f-to" type="date" value={params.get("to") ?? ""} onChange={(e) => set({ to: e.target.value || null })} className="h-8 rounded-md border border-border bg-bg px-2 text-sm" />
        </div>
        {select("source", "Source", sources.map((s) => ({ value: s, label: SOURCE_LABEL[s] ?? s })))}
        {select("language", "Language", languages.map((l) => ({ value: l.language, label: `${LANGUAGE_LABEL[l.language] ?? l.language} (${l.n})` })))}
        {select(
          "status",
          "Status",
          [
            { value: "analysed", label: "Analysed (English)" },
            { value: "not_analysed", label: "Not yet analysed (language)" },
            { value: "hidden", label: "Duplicates & spam" },
            { value: "all", label: "Everything" },
          ],
          "Default (no dupes/spam)",
        )}
      </div>
    </div>
  );
}
