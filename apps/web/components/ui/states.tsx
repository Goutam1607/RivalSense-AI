import { AlertTriangle, Inbox } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return <div aria-hidden className={cn("animate-pulse rounded-md bg-bg-muted", className)} {...props} />;
}

export function EmptyState({
  title,
  description,
  action,
  icon: Icon = Inbox,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-12 text-center", className)}>
      <Icon className="mb-3 size-6 text-fg-subtle" aria-hidden />
      <p className="text-md font-medium text-fg">{title}</p>
      {description && <p className="mt-1 max-w-md text-sm text-fg-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorNotice({ title = "Could not load this data", description, action }: { title?: string; description?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center rounded-lg border border-negative-border bg-negative-bg px-6 py-10 text-center">
      <AlertTriangle className="mb-3 size-6 text-negative" aria-hidden />
      <p className="text-md font-medium text-fg">{title}</p>
      {description && <p className="mt-1 max-w-md text-sm text-fg-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Shown instead of a number when a metric has fewer than the minimum sample (CLAUDE.md §4/§5). */
export function NotEnoughData({ n, className }: { n: number; className?: string }) {
  return (
    <span className={cn("text-xs whitespace-nowrap text-fg-subtle", className)}>
      Not enough data (n = <span className="tabular">{n}</span>)
    </span>
  );
}
