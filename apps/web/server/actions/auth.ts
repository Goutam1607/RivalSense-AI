"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import { auth } from "@/server/auth";
import { WORKSPACE_COOKIE, MARKET_COOKIE } from "@/server/context";
import { prisma } from "@/server/db/client";

/**
 * "Explore demo": signs in as the shared, read-only demo viewer and opens the demo workspace.
 * Credentials come from server env vars and never reach the browser.
 */
export async function enterDemo(): Promise<{ ok: false; message: string } | never> {
  const demo = await prisma.workspace.findUnique({ where: { slug: "demo" }, select: { id: true } });
  if (!demo) {
    return { ok: false, message: "The demo workspace has not been seeded yet. Run `npm run seed`." };
  }
  try {
    await auth.api.signInEmail({
      body: { email: env.DEMO_USER_EMAIL, password: env.DEMO_USER_PASSWORD },
      headers: await headers(),
    });
  } catch {
    return { ok: false, message: "Could not open the demo right now. Please try again in a minute." };
  }
  const jar = await cookies();
  jar.set(WORKSPACE_COOKIE, demo.id, { httpOnly: true, sameSite: "lax", secure: env.NODE_ENV === "production", path: "/" });
  jar.delete(MARKET_COOKIE);
  redirect("/dashboard");
}
