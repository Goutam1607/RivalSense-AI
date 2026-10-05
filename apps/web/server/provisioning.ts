import "server-only";
import { prisma } from "@/server/db/client";
import marketConfig from "../../../config/markets/quick-commerce.json";

type AspectConfig = { key: string; label: string; description: string; seedKeywords: string[] };

/** Default aspect taxonomy from config/markets/quick-commerce.json (shared with the pipeline). */
export function defaultAspects(): AspectConfig[] {
  return (marketConfig as { aspects: AspectConfig[] }).aspects;
}

function slugify(s: string) {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "workspace"
  );
}

/**
 * Runs once after sign-up: a personal workspace (owner) with an empty market using the
 * default aspect taxonomy, plus read-only access to the demo workspace.
 */
export async function provisionNewUser(userId: string, name: string) {
  const base = slugify(name || "workspace");
  const slug = `${base}-${userId.slice(0, 6).toLowerCase()}`;
  await prisma.$transaction(async (tx) => {
    const ws = await tx.workspace.create({
      data: {
        name: `${name?.split(" ")[0] || "My"}'s workspace`,
        slug,
        memberships: { create: { userId, role: "OWNER" } },
      },
    });
    await tx.market.create({
      data: {
        workspaceId: ws.id,
        name: "My market",
        slug: "my-market",
        description: "Add competitors and their data sources, then run the pipeline to analyse them.",
        dataKind: "LIVE",
        aspectCategories: {
          create: defaultAspects().map((a, i) => ({
            key: a.key,
            label: a.label,
            description: a.description,
            seedKeywords: a.seedKeywords,
            sortOrder: i,
          })),
        },
      },
    });
    const demo = await tx.workspace.findUnique({ where: { slug: "demo" } });
    if (demo) {
      await tx.membership.upsert({
        where: { userId_workspaceId: { userId, workspaceId: demo.id } },
        update: {},
        create: { userId, workspaceId: demo.id, role: "MEMBER" },
      });
    }
  });
}
