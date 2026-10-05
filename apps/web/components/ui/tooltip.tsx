"use client";

import { Tooltip as T } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "./button";

export function TooltipProvider({ children }: { children: React.ReactNode }) {
  return (
    <T.Provider delayDuration={250} skipDelayDuration={100}>
      {children}
    </T.Provider>
  );
}

export function Tooltip({
  content,
  children,
  side = "top",
  className,
}: {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
}) {
  if (!content) return <>{children}</>;
  return (
    <T.Root>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content
          side={side}
          sideOffset={6}
          collisionPadding={8}
          className={cn(
            "z-50 max-w-xs rounded-md border border-border bg-bg px-2.5 py-1.5 text-xs leading-relaxed text-fg shadow-popover",
            className,
          )}
        >
          {content}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}

/**
 * A visibly disabled control with a tooltip explaining why (CLAUDE.md §4 "No fake functionality").
 * Uses aria-disabled so the control stays focusable and the reason is reachable by keyboard.
 */
export function DisabledWithReason({ reason, children }: { reason: string; children: React.ReactElement<Record<string, unknown>> }) {
  const child = React.cloneElement(children, {
    "aria-disabled": true,
    onClick: (e: React.MouseEvent) => e.preventDefault(),
    "aria-describedby": undefined,
    title: undefined,
  });
  return (
    <Tooltip content={reason}>
      <span className="inline-flex" tabIndex={-1}>
        {child}
      </span>
    </Tooltip>
  );
}

/** Server-component-safe variant: renders its own button (no cloneElement on server-rendered children). */
export function DisabledButton({
  reason,
  children,
  variant = "secondary",
  size = "md",
  className,
  "aria-label": ariaLabel,
}: {
  reason: string;
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg" | "icon" | "icon-sm";
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <Tooltip content={reason}>
      <button type="button" aria-disabled="true" aria-label={ariaLabel} onClick={(e) => e.preventDefault()} className={cn(buttonVariants({ variant, size }), className)}>
        {children}
      </button>
    </Tooltip>
  );
}
