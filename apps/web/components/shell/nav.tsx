"use client";

import {
  BarChart3,
  FileText,
  GitCompareArrows,
  LayoutDashboard,
  Lightbulb,
  Menu as MenuIcon,
  MessageSquareText,
  Settings,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dialog as D } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

export const NAV = [
  { href: "/dashboard", label: "Overview", Icon: LayoutDashboard },
  { href: "/competitors", label: "Competitors", Icon: Users },
  { href: "/reviews", label: "Reviews", Icon: MessageSquareText },
  { href: "/insights", label: "Insights", Icon: Lightbulb },
  { href: "/compare", label: "Compare", Icon: GitCompareArrows },
  { href: "/trends", label: "Trends", Icon: TrendingUp },
  { href: "/reports", label: "Reports", Icon: FileText },
] as const;

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const item = (href: string, label: string, Icon: React.ComponentType<{ className?: string }>) => {
    const active = pathname === href || pathname.startsWith(`${href}/`);
    return (
      <li key={href}>
        <Link
          href={href}
          onClick={onNavigate}
          aria-current={active ? "page" : undefined}
          className={cn(
            "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm text-fg-muted transition-colors hover:bg-bg-muted hover:text-fg",
            active && "bg-bg-muted font-medium text-fg",
          )}
        >
          <Icon className="size-4 shrink-0" />
          {label}
        </Link>
      </li>
    );
  };
  return (
    <nav aria-label="Main" className="flex flex-1 flex-col">
      <ul className="space-y-0.5">{NAV.map((n) => item(n.href, n.label, n.Icon))}</ul>
      <ul className="mt-auto space-y-0.5 pt-4">{item("/settings", "Settings", Settings)}</ul>
    </nav>
  );
}

export function Brand({ className }: { className?: string }) {
  return (
    <Link href="/dashboard" className={cn("flex items-center gap-2 font-semibold tracking-tight text-fg", className)}>
      <span className="grid size-6 place-items-center rounded-md bg-primary text-primary-fg">
        <BarChart3 className="size-3.5" aria-hidden />
      </span>
      RivalSense
    </Link>
  );
}

export function Sidebar({ footer }: { footer: React.ReactNode }) {
  return (
    <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col border-r border-border bg-bg-subtle px-3 py-4 lg:flex">
      <Brand className="mb-6 px-2.5" />
      <NavLinks />
      <div className="mt-3 border-t border-border pt-3">{footer}</div>
    </aside>
  );
}

export function MobileNav({ footer }: { footer: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  return (
    <D.Root open={open} onOpenChange={setOpen}>
      <D.Trigger className="rounded-md p-1.5 text-fg-muted hover:bg-bg-muted lg:hidden" aria-label="Open navigation">
        <MenuIcon className="size-5" />
      </D.Trigger>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/40 lg:hidden" />
        <D.Content className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-border bg-bg px-3 py-4 lg:hidden">
          <D.Title className="sr-only">Navigation</D.Title>
          <D.Description className="sr-only">Main navigation</D.Description>
          <div className="mb-6 flex items-center justify-between px-2.5">
            <Brand />
            <D.Close className="rounded-md p-1 text-fg-subtle hover:bg-bg-muted" aria-label="Close navigation">
              <X className="size-4" />
            </D.Close>
          </div>
          <NavLinks onNavigate={() => setOpen(false)} />
          <div className="mt-3 border-t border-border pt-3">{footer}</div>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
