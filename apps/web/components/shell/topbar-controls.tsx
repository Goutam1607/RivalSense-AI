"use client";

import { AlertTriangle, Bell, Building2, Calendar, Check, ChevronsUpDown, LogOut, Search, Store } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { ThemeToggle } from "@/components/theme";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger, Popover, PopoverContent, PopoverTrigger } from "@/components/ui/overlay";
import { authClient } from "@/lib/auth-client";
import { RANGES } from "@/lib/date-range";
import { fmtP, fmtPct } from "@/lib/format";
import { cn, qs } from "@/lib/utils";
import { rememberRange, switchMarket, switchWorkspace } from "@/server/actions/navigation";
import type { Notification } from "@/server/data/meta";

export function GlobalSearch() {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  return (
    <form
      role="search"
      className="relative w-full max-w-xs"
      onSubmit={(e) => {
        e.preventDefault();
        router.push(`/reviews${qs({ q: q.trim() })}`);
      }}
    >
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-fg-subtle" aria-hidden />
      <label htmlFor="global-search" className="sr-only">
        Search reviews
      </label>
      <input
        id="global-search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search reviews…"
        className="h-8 w-full rounded-md border border-border bg-bg pr-2 pl-8 text-sm placeholder:text-fg-subtle focus-visible:border-ring focus-visible:outline-none"
      />
    </form>
  );
}

const RANGE_PAGES = ["/dashboard", "/competitors", "/compare", "/trends", "/insights"];

export function DateRangePicker({ initial }: { initial: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = params.get("range") ?? initial;
  const enabled = RANGE_PAGES.some((p) => pathname.startsWith(p));
  return (
    <div className="relative">
      <Calendar className="pointer-events-none absolute top-1/2 left-2.5 hidden size-4 -translate-y-1/2 text-fg-subtle sm:block" aria-hidden />
      <label htmlFor="date-range" className="sr-only">
        Date range
      </label>
      <select
        id="date-range"
        value={current}
        disabled={!enabled}
        title={enabled ? "Date range (ending at the latest review in this market)" : "This page has its own date filters"}
        onChange={async (e) => {
          const sp = new URLSearchParams(params.toString());
          sp.set("range", e.target.value);
          await rememberRange(e.target.value);
          router.push(`${pathname}?${sp.toString()}`);
        }}
        className="h-8 max-w-[7.5rem] appearance-none rounded-md border border-border bg-bg pr-6 pl-2 text-xs text-fg disabled:opacity-50 sm:max-w-none sm:pr-7 sm:pl-8 sm:text-sm"
      >
        {RANGES.map((r) => (
          <option key={r.key} value={r.key}>
            {r.label}
          </option>
        ))}
      </select>
      <ChevronsUpDown className="pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2 text-fg-subtle" aria-hidden />
    </div>
  );
}

export function Notifications({ items, runLabel }: { items: Notification[]; runLabel: string | null }) {
  return (
    <Popover>
      <PopoverTrigger
        className="relative rounded-md p-1.5 text-fg-muted hover:bg-bg-muted hover:text-fg"
        aria-label={`Notifications: ${items.length} emerging issue${items.length === 1 ? "" : "s"}`}
      >
        <Bell className="size-4" />
        {items.length > 0 && (
          <span className="absolute -top-0.5 -right-0.5 grid min-w-4 place-items-center rounded-full bg-warning px-1 text-[10px] font-semibold text-bg tabular">
            {items.length}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0">
        <div className="border-b border-border px-3 py-2">
          <p className="text-sm font-medium">Emerging issues</p>
          <p className="text-xs text-fg-subtle">{runLabel ? `From the latest analysis run (${runLabel})` : "No analysis run yet"}</p>
        </div>
        {items.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-fg-muted">No emerging issues were detected in the latest run.</p>
        ) : (
          <ul className="max-h-80 divide-y divide-border overflow-y-auto">
            {items.map((n) => (
              <li key={n.id}>
                <Link
                  href={`/reviews${qs({ competitor: n.competitorSlug, aspect: n.aspectKey, aspectSentiment: "NEGATIVE", ...(n.appVersion ? {} : { range: "30d" }) })}`}
                  className="flex gap-2.5 px-3 py-2.5 hover:bg-bg-subtle"
                >
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                  <span className="min-w-0 text-sm">
                    <span className="font-medium">
                      {n.competitor} · {n.aspect}
                    </span>
                    <span className="block text-xs text-fg-muted tabular">
                      {n.kind === "APP_VERSION" ? `From app version ${n.appVersion}: ` : "Last 30 days: "}
                      negative share {fmtPct(n.prevShare, 1)} → {fmtPct(n.recentShare, 1)}, p {fmtP(n.pValue)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

type WS = { id: string; name: string; isDemo: boolean; role: string };
type MK = { id: string; name: string; dataKind: string };

export function WorkspaceSwitcher({ workspaces, current, markets, market }: { workspaces: WS[]; current: WS; markets: MK[]; market: MK | null }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  return (
    <Menu>
      <MenuTrigger
        className="flex h-8 max-w-[8.5rem] min-w-0 items-center gap-2 rounded-md border border-border bg-bg px-2.5 text-sm hover:bg-bg-muted sm:max-w-64"
        aria-label="Switch workspace or market"
      >
        <Building2 className="size-4 shrink-0 text-fg-subtle" aria-hidden />
        <span className="truncate">
          <span className="text-fg">{current.name}</span>
          {market && <span className="hidden text-fg-subtle sm:inline"> / {market.name}</span>}
        </span>
        <ChevronsUpDown className="size-3.5 shrink-0 text-fg-subtle" aria-hidden />
      </MenuTrigger>
      <MenuContent align="start" className={cn("w-72", pending && "opacity-60")}>
        <MenuLabel>Workspaces</MenuLabel>
        {workspaces.map((w) => (
          <MenuItem
            key={w.id}
            onSelect={() =>
              start(async () => {
                await switchWorkspace(w.id);
                router.refresh();
              })
            }
          >
            <Building2 />
            <span className="flex-1 truncate">{w.name}</span>
            {w.isDemo && <span className="text-2xs text-fg-subtle">read-only</span>}
            {w.id === current.id && <Check className="text-fg" />}
          </MenuItem>
        ))}
        {markets.length > 0 && (
          <>
            <MenuSeparator />
            <MenuLabel>Markets in {current.name}</MenuLabel>
            {markets.map((m) => (
              <MenuItem
                key={m.id}
                onSelect={() =>
                  start(async () => {
                    await switchMarket(m.id);
                    router.refresh();
                  })
                }
              >
                <Store />
                <span className="flex-1 truncate">{m.name}</span>
                {m.dataKind === "DEMO_SYNTHETIC" && <span className="text-2xs text-fg-subtle">synthetic</span>}
                {market?.id === m.id && <Check className="text-fg" />}
              </MenuItem>
            ))}
          </>
        )}
      </MenuContent>
    </Menu>
  );
}

export function UserMenu({ name, email }: { name: string; email: string }) {
  const router = useRouter();
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <Menu>
      <MenuTrigger className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-bg-muted" aria-label="Account menu">
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-bg-muted text-2xs font-semibold text-fg-muted">{initials || "?"}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-fg">{name}</span>
          <span className="block truncate text-xs text-fg-subtle">{email}</span>
        </span>
        <ChevronsUpDown className="size-3.5 text-fg-subtle" aria-hidden />
      </MenuTrigger>
      <MenuContent align="start" className="w-60">
        <div className="flex items-center justify-between px-2 py-1.5">
          <span className="text-xs text-fg-subtle">Theme</span>
          <ThemeToggle />
        </div>
        <MenuSeparator />
        <MenuItem asChild>
          <Link href="/settings">Settings</Link>
        </MenuItem>
        <MenuItem
          onSelect={async () => {
            await authClient.signOut();
            router.push("/");
            router.refresh();
          }}
        >
          <LogOut />
          Sign out
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
