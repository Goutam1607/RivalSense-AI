"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseRange } from "@/lib/date-range";
import { getContext, MARKET_COOKIE, WORKSPACE_COOKIE } from "@/server/context";
import { AppError, toActionError, type ActionResult } from "@/server/errors";

const cookieOpts = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 };

/** Switch the active workspace (validated against the user's memberships). */
export async function switchWorkspace(workspaceId: string): Promise<ActionResult> {
  try {
    const id = z.string().uuid().parse(workspaceId);
    const ctx = await getContext();
    if (!ctx.workspaces.some((w) => w.id === id)) throw new AppError("FORBIDDEN", "You are not a member of that workspace.");
    const jar = await cookies();
    jar.set(WORKSPACE_COOKIE, id, cookieOpts);
    jar.delete(MARKET_COOKIE);
    revalidatePath("/", "layout");
    return { ok: true, data: undefined };
  } catch (e) {
    return toActionError(e);
  }
}

/** Switch the active market within the current workspace. */
export async function switchMarket(marketId: string): Promise<ActionResult> {
  try {
    const id = z.string().uuid().parse(marketId);
    const ctx = await getContext();
    if (!ctx.markets.some((m) => m.id === id)) throw new AppError("FORBIDDEN", "That market is not in this workspace.");
    (await cookies()).set(MARKET_COOKIE, id, cookieOpts);
    revalidatePath("/", "layout");
    return { ok: true, data: undefined };
  } catch (e) {
    return toActionError(e);
  }
}

/** Remember the chosen date range across pages. */
export async function rememberRange(range: string): Promise<void> {
  (await cookies()).set("rs_range", parseRange(range), { ...cookieOpts, httpOnly: false });
}
