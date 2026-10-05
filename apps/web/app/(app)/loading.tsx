import { Skeleton } from "@/components/ui/states";

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <Skeleton className="h-6 w-64" />
      <Skeleton className="mt-2 mb-6 h-4 w-96 max-w-full" />
      <div className="grid gap-5">
        <div className="rounded-lg border border-border p-4">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="mt-4 h-56 w-full" />
        </div>
        <div className="rounded-lg border border-border p-4">
          <Skeleton className="h-4 w-40" />
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="mt-3 h-8 w-full" />
          ))}
        </div>
        <div className="grid gap-5 xl:grid-cols-2">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    </div>
  );
}
