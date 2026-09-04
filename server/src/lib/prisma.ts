import { PrismaClient } from "@prisma/client";

// On Vercel, each serverless function invocation can reuse a "warm"
// container between requests. Without this global-singleton guard, a
// naive `new PrismaClient()` at module scope gets re-instantiated on every
// hot reload / re-invocation and can exhaust Supabase's connection pool.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
