"use client";

import { X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { NativeSelect } from "@/components/ui/form";

export type FilterField = { key: string; label: string; options: { value: string; label: string }[]; allLabel?: string };

/** A row of select filters bound to URL search params (shareable, back button works). */
export function UrlFilters({ fields, keep = ["range"] }: { fields: FilterField[]; keep?: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, start] = React.useTransition();
  const set = (key: string, value: string) => {
    const sp = new URLSearchParams(params.toString());
    if (value) sp.set(key, value);
    else sp.delete(key);
    start(() => router.push(`${pathname}?${sp.toString()}`, { scroll: false }));
  };
  const active = fields.some((f) => params.get(f.key));
  return (
    <div className="flex flex-wrap items-end gap-2">
      {fields.map((f) => (
        <div key={f.key} className="flex min-w-36 flex-col gap-1">
          <label htmlFor={`uf-${f.key}`} className="text-2xs font-medium tracking-wide text-fg-subtle uppercase">
            {f.label}
          </label>
          <NativeSelect id={`uf-${f.key}`} value={params.get(f.key) ?? ""} onChange={(e) => set(f.key, e.target.value)}>
            <option value="">{f.allLabel ?? "All"}</option>
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </NativeSelect>
        </div>
      ))}
      {active && (
        <button
          type="button"
          onClick={() => {
            const sp = new URLSearchParams();
            for (const k of keep) {
              const v = params.get(k);
              if (v) sp.set(k, v);
            }
            start(() => router.push(`${pathname}?${sp.toString()}`));
          }}
          className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-sm text-fg-muted hover:bg-bg-muted hover:text-fg"
        >
          <X className="size-4" aria-hidden /> Clear
        </button>
      )}
    </div>
  );
}
