import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "@/lib/env";
import { PrismaClient } from "./generated/client";

// One PrismaClient (= one connection pool) per server process; reused across hot reloads in dev.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL, max: 10 }) });

if (env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export type { PrismaClient };
