import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { requireAuth, requireRole } from "../../middleware/auth";
import { writeAuditLog } from "../../lib/audit";
import { badRequest } from "../../lib/httpError";

export const settingsRouter = Router();
settingsRouter.use(requireAuth);

// Read-only for any authenticated role, same as the rest of the app's
// reference data (account labels, etc.) — editing is what's gated.
settingsRouter.get("/allowance-rates", async (_req, res) => {
  const rows = await prisma.allowanceRateSetting.findMany({ orderBy: { sortOrder: "asc" } });
  res.json(rows);
});

const updateSchema = z.object({
  rates: z
    .array(
      z.object({
        bucketLabel: z.string().min(1),
        ratePercent: z.coerce.number().min(0).max(100),
      })
    )
    .min(1),
});

// Never auto-applied: a human with manager/accountant/admin access has to
// explicitly set these away from the 0% default before the allowance
// report (accounting.routes.ts) computes anything nonzero.
settingsRouter.put(
  "/allowance-rates",
  requireRole("manager", "accountant", "admin"),
  async (req, res) => {
    const { rates } = updateSchema.parse(req.body);

    const existing = await prisma.allowanceRateSetting.findMany();
    const existingByLabel = new Map(existing.map((r) => [r.bucketLabel, r]));
    for (const rate of rates) {
      if (!existingByLabel.has(rate.bucketLabel)) {
        throw badRequest(`Unknown allowance bucket: ${rate.bucketLabel}`);
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const results = [];
      for (const rate of rates) {
        const before = existingByLabel.get(rate.bucketLabel)!;
        const result = await tx.allowanceRateSetting.update({
          where: { bucketLabel: rate.bucketLabel },
          data: { ratePercent: rate.ratePercent, updatedById: req.user!.id },
        });
        if (Number(before.ratePercent) !== rate.ratePercent) {
          await writeAuditLog(tx, {
            entityType: "AllowanceRateSetting",
            entityId: result.id,
            action: "update",
            previousValue: { ratePercent: before.ratePercent },
            newValue: { ratePercent: result.ratePercent },
            performedBy: { id: req.user!.id, name: req.user!.name },
          });
        }
        results.push(result);
      }
      return results;
    });

    res.json(updated.sort((a, b) => a.sortOrder - b.sortOrder));
  }
);
