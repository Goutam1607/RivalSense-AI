import { FlaskConical, Lock } from "lucide-react";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { MobileNav, Sidebar } from "@/components/shell/nav";
import { DateRangePicker, GlobalSearch, Notifications, UserMenu, WorkspaceSwitcher } from "@/components/shell/topbar-controls";
import { DEMO_LABEL } from "@/lib/constants";
import { DEFAULT_RANGE } from "@/lib/date-range";
import { fmtDateTime } from "@/lib/format";
import { getContext, type AppContext } from "@/server/context";
import { getMarketMeta, getNotifications, type MarketMeta, type Notification } from "@/server/data/meta";
import { AppError } from "@/server/errors";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  let ctx: AppContext;
  try {
    ctx = await getContext();
  } catch (e) {
    if (e instanceof AppError && e.code === "UNAUTHENTICATED") redirect("/login");
    throw e;
  }
  let meta: MarketMeta | null = null;
  let notifications: Notification[] = [];
  if (ctx.market) {
    const mctx = { ...ctx, market: ctx.market };
    [meta, notifications] = await Promise.all([getMarketMeta(mctx), getNotifications(mctx)]);
  }
  const range = (await cookies()).get("rs_range")?.value ?? DEFAULT_RANGE;
  const userMenu = <UserMenu name={ctx.user.name} email={ctx.user.email} />;
  const isDemoData = ctx.market?.dataKind === "DEMO_SYNTHETIC";

  return (
    <div className="flex min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-bg focus:px-3 focus:py-2">
        Skip to content
      </a>
      <Sidebar footer={userMenu} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-border bg-bg/95 backdrop-blur-sm">
          <div className="flex h-14 min-w-0 items-center gap-2 px-3 sm:px-4 lg:px-6">
            <MobileNav footer={userMenu} />
            <WorkspaceSwitcher workspaces={ctx.workspaces} current={ctx.workspace} markets={ctx.markets} market={ctx.market} />
            <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
              <div className="hidden md:block">
                <GlobalSearch />
              </div>
              <Suspense>
                <DateRangePicker initial={range} />
              </Suspense>
              <Notifications
                items={notifications}
                runLabel={meta?.latestRun?.finishedAt ? fmtDateTime(meta.latestRun.finishedAt) : null}
              />
            </div>
          </div>
          {isDemoData && (
            <div role="note" className="flex items-center gap-2 border-t border-warning-border bg-warning-bg px-4 py-1.5 text-xs text-fg lg:px-6">
              <FlaskConical className="size-3.5 shrink-0 text-warning" aria-hidden />
              <span>
                <strong className="font-medium">{DEMO_LABEL}.</strong> Fictional companies; every number is computed from generated reviews by the
                real pipeline.
              </span>
              {ctx.readOnly && (
                <span className="ml-auto hidden items-center gap-1 text-fg-muted sm:inline-flex">
                  <Lock className="size-3" aria-hidden /> Read-only ·{" "}
                  <Link href="/signup" className="text-accent underline underline-offset-2">
                    Create an account
                  </Link>
                </span>
              )}
            </div>
          )}
        </header>
        <main id="main" className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 lg:px-8">
          {children}
        </main>
        <footer className="border-t border-border px-4 py-3 text-xs text-fg-subtle lg:px-8">
          {meta?.latestRun?.finishedAt ? (
            <span>
              Last analysis run {fmtDateTime(meta.latestRun.finishedAt)} · run <span className="num">{meta.latestRun.id.slice(0, 8)}</span> ·{" "}
              {meta.sources.join(", ")}
            </span>
          ) : ctx.market ? (
            <span>No analysis run yet for {ctx.market.name}.</span>
          ) : (
            <span>No market selected.</span>
          )}
          {meta?.runningRun && <span className="ml-2 text-warning">· A new analysis run is in progress.</span>}
        </footer>
      </div>
    </div>
  );
}
