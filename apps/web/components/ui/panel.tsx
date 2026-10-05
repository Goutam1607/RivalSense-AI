import * as React from "react";
import { cn } from "@/lib/utils";

/** A bordered section that groups related content. Header carries title, description and actions. */
export function Panel({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
  id,
  as: Comp = "section",
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  id?: string;
  as?: "section" | "div" | "article";
}) {
  const headingId = id ? `${id}-title` : undefined;
  return (
    <Comp id={id} aria-labelledby={title ? headingId : undefined} className={cn("min-w-0 rounded-lg border border-border bg-bg", className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            {title && (
              <h2 id={headingId} className="text-md font-semibold text-fg">
                {title}
              </h2>
            )}
            {description && <p className="mt-0.5 text-sm text-fg-muted">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn("p-4", bodyClassName)}>{children}</div>
    </Comp>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  meta,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  meta?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 pb-5">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-fg">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-fg-muted">{description}</p>}
        {meta && <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg-subtle">{meta}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, sub, className }: { label: string; value: React.ReactNode; sub?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="text-xs text-fg-subtle">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular text-fg">{value}</div>
      {sub && <div className="text-xs text-fg-subtle">{sub}</div>}
    </div>
  );
}
