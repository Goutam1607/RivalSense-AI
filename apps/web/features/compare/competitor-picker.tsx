"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { competitorColor } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function CompetitorPicker({ competitors, selected }: { competitors: { slug: string; name: string; colorIndex: number }[]; selected: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, start] = React.useTransition();
  const toggle = (slug: string) => {
    const next = selected.includes(slug) ? selected.filter((s) => s !== slug) : [...selected, slug];
    if (next.length < 2 || next.length > 4) return;
    const sp = new URLSearchParams(params.toString());
    sp.set("c", next.join(","));
    start(() => router.push(`${pathname}?${sp.toString()}`, { scroll: false }));
  };
  return (
    <fieldset>
      <legend className="mb-1.5 text-xs text-fg-subtle">Compare 2–4 competitors</legend>
      <div className="flex flex-wrap gap-1.5">
        {competitors.map((c) => {
          const on = selected.includes(c.slug);
          const disabled = (on && selected.length <= 2) || (!on && selected.length >= 4);
          return (
            <button
              key={c.slug}
              type="button"
              aria-pressed={on}
              disabled={disabled}
              title={disabled ? (on ? "At least 2 competitors are needed" : "At most 4 competitors") : undefined}
              onClick={() => toggle(c.slug)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm transition-colors disabled:cursor-not-allowed",
                on ? "border-border-strong bg-bg-muted text-fg" : "border-border text-fg-muted hover:text-fg",
                disabled && !on && "opacity-50",
              )}
            >
              <span className="size-2 rounded-full" style={{ background: competitorColor(c.colorIndex) }} aria-hidden />
              {c.name}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
