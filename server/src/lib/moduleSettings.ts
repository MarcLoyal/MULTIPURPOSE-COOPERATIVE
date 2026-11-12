import { NextFunction, Request, Response } from "express";
import { prisma } from "./prisma";
import { forbidden } from "./httpError";

/**
 * Per-deployment module on/off switch (IWMPC phase-in — see
 * ModuleSetting's doc comment in schema.prisma). Every key here has a
 * seeded row at enabled=true, so a missing row (a module added after a
 * deployment's database was created) defaults to ON rather than
 * silently 403ing everyone — "new module, not yet configured" should
 * never read as "module deliberately disabled."
 *
 * Deliberately NOT a module list for Dashboard/Members/Cash/Loans —
 * those are always on and never gated — nor for Share Capital/Deposits'
 * own transaction-recording endpoints, which the member profile's
 * "Receive Payment" action depends on regardless of whether their
 * standalone page is hidden. Only the report/accounting modules and
 * the "advanced" admin-tools bucket are ever blocked server-side by
 * requireModule below.
 */
export async function getModuleSettings(): Promise<Record<string, boolean>> {
  const rows = await prisma.moduleSetting.findMany();
  const map: Record<string, boolean> = {};
  for (const row of rows) map[row.key] = row.enabled;
  return map;
}

/**
 * Route guard: 403s every role except admin when the named module is
 * disabled. Admin always passes through — that's what gives admin the
 * "reach it via a small Advanced link" access the hidden nav item
 * doesn't otherwise offer. A missing row (see getModuleSettings' doc
 * comment) is treated as enabled, same reasoning.
 */
export function requireModule(key: string) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    if (req.user?.role === "admin") return next();
    const setting = await prisma.moduleSetting.findUnique({ where: { key } });
    if (setting && !setting.enabled) {
      throw forbidden("This feature isn't enabled for your cooperative yet");
    }
    next();
  };
}
