import * as React from "react";
import { cn } from "@/lib/utils";

/** First-class tables: sticky header, row hover, right-aligned tabular numbers, horizontal scroll on small screens. */
export function Table({ className, wrapperClassName, ...props }: React.ComponentProps<"table"> & { wrapperClassName?: string }) {
  return (
    <div className={cn("relative w-full overflow-x-auto", wrapperClassName)}>
      <table className={cn("w-full caption-bottom border-collapse text-sm", className)} {...props} />
    </div>
  );
}

export function THead({ className, ...props }: React.ComponentProps<"thead">) {
  return <thead className={cn("sticky top-0 z-10 bg-bg-subtle", className)} {...props} />;
}

export function TBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return <tbody className={cn("[&_tr:last-child]:border-0", className)} {...props} />;
}

export function TR({ className, ...props }: React.ComponentProps<"tr">) {
  return <tr className={cn("border-b border-border transition-colors hover:bg-bg-subtle", className)} {...props} />;
}

export function TH({ className, numeric, ...props }: React.ComponentProps<"th"> & { numeric?: boolean }) {
  return (
    <th
      scope="col"
      className={cn(
        "h-9 border-b border-border px-3 text-left align-middle text-xs font-medium whitespace-nowrap text-fg-subtle",
        numeric && "text-right",
        className,
      )}
      {...props}
    />
  );
}

export function TD({ className, numeric, ...props }: React.ComponentProps<"td"> & { numeric?: boolean }) {
  return <td className={cn("px-3 py-2 align-middle", numeric && "text-right tabular num", className)} {...props} />;
}

/** Frozen first column for wide tables on mobile. */
export const stickyCol = "sticky left-0 z-[1] bg-bg";
