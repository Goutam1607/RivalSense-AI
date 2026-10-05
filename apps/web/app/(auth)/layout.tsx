import Link from "next/link";
import { BarChart3 } from "lucide-react";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-col bg-bg-subtle">
      <header className="px-6 py-5">
        <Link href="/" className="inline-flex items-center gap-2 font-semibold tracking-tight">
          <span className="grid size-6 place-items-center rounded-md bg-primary text-primary-fg">
            <BarChart3 className="size-3.5" aria-hidden />
          </span>
          RivalSense
        </Link>
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pt-[8vh] pb-16">
        <div className="w-full max-w-sm rounded-lg border border-border bg-bg p-6 shadow-xs">{children}</div>
      </main>
    </div>
  );
}
