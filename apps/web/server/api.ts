import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getMarketContext } from "@/server/context";
import type { Ctx } from "@/server/data/analytics";
import { AppError } from "@/server/errors";

export type ApiError = { error: { code: string; message: string; details?: unknown } };

export function apiError(e: unknown): NextResponse<ApiError> {
  if (e instanceof AppError) {
    return NextResponse.json({ error: { code: e.code, message: e.message, details: e.details } }, { status: e.status });
  }
  if (e instanceof ZodError) {
    return NextResponse.json(
      { error: { code: "VALIDATION", message: "Invalid request parameters.", details: e.issues.map((i) => ({ path: i.path.join("."), message: i.message })) } },
      { status: 400 },
    );
  }
  console.error(e);
  return NextResponse.json({ error: { code: "INTERNAL", message: "Something went wrong." } }, { status: 500 });
}

/** Route handlers go through this: it resolves the signed-in user's workspace + market (or 401/404). */
export async function withMarket<T>(fn: (ctx: Ctx) => Promise<T>): Promise<NextResponse> {
  try {
    const ctx = await getMarketContext();
    const out = await fn(ctx);
    return out instanceof Response ? (out as unknown as NextResponse) : NextResponse.json(out);
  } catch (e) {
    return apiError(e);
  }
}

export function searchParamsObject(url: string): Record<string, string> {
  return Object.fromEntries(new URL(url).searchParams.entries());
}

/** CSV cell: quoted, with formula-injection protection for spreadsheet apps. */
export function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s = v instanceof Date ? v.toISOString() : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}
