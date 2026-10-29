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

// Dividend / patronage refund distribution rates — the split applied to
// a closed fiscal year's unallocated remainder (see
// fiscalYears.routes.ts's distribute handler). Seeded at 0%/0% by the
// migration, same inert-default convention as allowance rates: posting
// at 0% distributes nothing until the board sets real percentages.
settingsRouter.get("/dividend-rates", async (_req, res) => {
  const row = await prisma.dividendDistributionSetting.findFirst();
  res.json(row);
});

const dividendRatesSchema = z
  .object({
    shareCapitalInterestPercent: z.coerce.number().min(0).max(100),
    patronageRefundPercent: z.coerce.number().min(0).max(100),
  })
  .refine((data) => data.shareCapitalInterestPercent + data.patronageRefundPercent <= 100, {
    message: "The two percentages together can't exceed 100%",
  });

settingsRouter.put(
  "/dividend-rates",
  requireRole("manager", "accountant", "admin"),
  async (req, res) => {
    const data = dividendRatesSchema.parse(req.body);
    const existing = await prisma.dividendDistributionSetting.findFirst();
    if (!existing) throw badRequest("Dividend distribution settings row is missing");

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.dividendDistributionSetting.update({
        where: { id: existing.id },
        data: { ...data, updatedById: req.user!.id },
      });
      if (
        Number(existing.shareCapitalInterestPercent) !== data.shareCapitalInterestPercent ||
        Number(existing.patronageRefundPercent) !== data.patronageRefundPercent
      ) {
        await writeAuditLog(tx, {
          entityType: "DividendDistributionSetting",
          entityId: result.id,
          action: "update",
          previousValue: {
            shareCapitalInterestPercent: existing.shareCapitalInterestPercent,
            patronageRefundPercent: existing.patronageRefundPercent,
          },
          newValue: {
            shareCapitalInterestPercent: result.shareCapitalInterestPercent,
            patronageRefundPercent: result.patronageRefundPercent,
          },
          performedBy: { id: req.user!.id, name: req.user!.name },
        });
      }
      return result;
    });

    res.json(updated);
  }
);

// Placeholder loanable-amount rule — see LoanLimitSetting's schema
// comment and GET /api/loans/loan-limit/:memberId. Not board-approved;
// the client marks this setting and its effect as unconfirmed.
settingsRouter.get("/loan-limit", async (_req, res) => {
  const row = await prisma.loanLimitSetting.findFirst();
  res.json(row);
});

const loanLimitSchema = z.object({
  shareCapitalMultiplier: z.coerce.number().min(0),
});

settingsRouter.put(
  "/loan-limit",
  requireRole("manager", "accountant", "admin"),
  async (req, res) => {
    const data = loanLimitSchema.parse(req.body);
    const existing = await prisma.loanLimitSetting.findFirst();
    if (!existing) throw badRequest("Loan limit settings row is missing");

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.loanLimitSetting.update({
        where: { id: existing.id },
        data: { ...data, updatedById: req.user!.id },
      });
      if (Number(existing.shareCapitalMultiplier) !== data.shareCapitalMultiplier) {
        await writeAuditLog(tx, {
          entityType: "LoanLimitSetting",
          entityId: result.id,
          action: "update",
          previousValue: { shareCapitalMultiplier: existing.shareCapitalMultiplier },
          newValue: { shareCapitalMultiplier: result.shareCapitalMultiplier },
          performedBy: { id: req.user!.id, name: req.user!.name },
        });
      }
      return result;
    });

    res.json(updated);
  }
);
