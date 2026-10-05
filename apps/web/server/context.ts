import "server-only";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db/client";
import { AppError, READ_ONLY_MESSAGE } from "@/server/errors";

export const WORKSPACE_COOKIE = "rs_ws";
export const MARKET_COOKIE = "rs_market";

export type WorkspaceSummary = { id: string; name: string; slug: string; isDemo: boolean; role: "OWNER" | "MEMBER" };
export type MarketSummary = { id: string; name: string; slug: string; dataKind: "DEMO_SYNTHETIC" | "LIVE" };

export type AppContext = {
  user: { id: string; name: string; email: string };
  workspace: WorkspaceSummary;
  workspaces: WorkspaceSummary[];
  market: MarketSummary | null;
  markets: MarketSummary[];
  /** Demo workspace (or a non-owner) — write actions are disabled. */
  readOnly: boolean;
  readOnlyReason: string | null;
};

/** The signed-in session for this request (deduplicated per request). */
export const getSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() });
});

/**
 * Resolves the user → active workspace → active market for this request.
 * The active workspace/market come from cookies but are always re-validated against the
 * user's memberships, so a forged cookie can never reach another workspace's data.
 */
export const getContext = cache(async (): Promise<AppContext> => {
  const session = await getSession();
  if (!session) throw new AppError("UNAUTHENTICATED", "Please sign in.");

  const memberships = await prisma.membership.findMany({
    where: { userId: session.user.id },
    include: { workspace: true },
    orderBy: { createdAt: "asc" },
  });
  if (memberships.length === 0) throw new AppError("FORBIDDEN", "Your account has no workspace.");

  const workspaces: WorkspaceSummary[] = memberships.map((m) => ({
    id: m.workspace.id,
    name: m.workspace.name,
    slug: m.workspace.slug,
    isDemo: m.workspace.isDemo,
    role: m.role,
  }));
  const jar = await cookies();
  const wanted = jar.get(WORKSPACE_COOKIE)?.value;
  const workspace =
    workspaces.find((w) => w.id === wanted) ?? workspaces.find((w) => !w.isDemo) ?? workspaces[0];

  const marketRows = await prisma.market.findMany({
    where: { workspaceId: workspace.id },
    select: { id: true, name: true, slug: true, dataKind: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  const markets: MarketSummary[] = marketRows.map((m) => ({ id: m.id, name: m.name, slug: m.slug, dataKind: m.dataKind }));
  const wantedMarket = jar.get(MARKET_COOKIE)?.value;
  const market = markets.find((m) => m.id === wantedMarket) ?? markets[0] ?? null;

  const readOnly = workspace.isDemo;
  return {
    user: { id: session.user.id, name: session.user.name, email: session.user.email },
    workspace,
    workspaces,
    market,
    markets,
    readOnly,
    readOnlyReason: readOnly ? READ_ONLY_MESSAGE : null,
  };
});

/** For data reads: a context that is guaranteed to have an active market. */
export async function getMarketContext(): Promise<AppContext & { market: MarketSummary }> {
  const ctx = await getContext();
  if (!ctx.market) throw new AppError("NOT_FOUND", "This workspace has no market yet.");
  return ctx as AppContext & { market: MarketSummary };
}

/** Every write goes through this guard. */
export function assertCanWrite(ctx: AppContext) {
  if (ctx.readOnly) throw new AppError("READ_ONLY", READ_ONLY_MESSAGE);
}
