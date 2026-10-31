import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { requireAuth, requireRole } from "../../middleware/auth";
import { badRequest } from "../../lib/httpError";
import { buildPreview, commitImport } from "../../lib/openingBalances";

/**
 * Opening balances import — admin only. A one-time, whole-cooperative
 * action that creates members, loans, deposits and share capital
 * balances directly and posts GL entries for every cent of them, so it
 * gets the same high-stakes gating as Staff User Management rather than
 * the narrower per-module roles (manager/accountant/cashier) those
 * modules' own day-to-day endpoints use.
 */
export const openingBalancesRouter = Router();
openingBalancesRouter.use(requireAuth, requireRole("admin"));

openingBalancesRouter.get("/status", async (_req, res) => {
  const [locked, ledgerCount] = await Promise.all([
    prisma.openingBalanceImport.findFirst(),
    prisma.ledgerEntry.count(),
  ]);
  res.json({
    locked: Boolean(locked),
    lockedRecord: locked,
    ledgerEmpty: ledgerCount === 0,
  });
});

const previewRequestSchema = z.object({
  cutoffDate: z.string().min(1),
  membersCsv: z.string().optional(),
  shareCapitalCsv: z.string().optional(),
  loansCsv: z.string().optional(),
  depositsCsv: z.string().optional(),
  otherCsv: z.string().optional(),
});

openingBalancesRouter.post("/validate", async (req, res) => {
  const data = previewRequestSchema.parse(req.body);
  const preview = await buildPreview(data);
  res.json(preview);
});

const commitRequestSchema = previewRequestSchema.extend({
  acknowledgeNonZeroSuspense: z.boolean().optional(),
});

openingBalancesRouter.post("/commit", async (req, res) => {
  const data = commitRequestSchema.parse(req.body);
  if (!req.user) throw badRequest("Not authenticated");
  const result = await commitImport(data, { id: req.user.id, name: req.user.name });
  res.json(result);
});

// Template downloads. Members/Share Capital are static; Loans/Deposits
// embed the cooperative's actual current active product names as a
// hint so the cooperative doesn't have to guess what loan_product_name
// or deposit_product_name values will resolve.
openingBalancesRouter.get("/templates/members.csv", (_req, res) => {
  sendCsv(
    res,
    "members_opening_balances_template.csv",
    [
      "member_number,full_name,phone,email,address,date_joined,status,membership_class,beneficiary_name,beneficiary_relationship",
      "0001,Juana Dela Cruz,09171234567,juana@example.com,\"123 Main St, Quezon City\",2018-03-01,active,regular,Pedro Dela Cruz,Spouse",
    ].join("\n")
  );
});

openingBalancesRouter.get("/templates/share-capital.csv", (_req, res) => {
  sendCsv(
    res,
    "share_capital_opening_balances_template.csv",
    ["member_number,balance", "0001,15000.00"].join("\n")
  );
});

openingBalancesRouter.get("/templates/loans.csv", async (_req, res) => {
  const products = await prisma.loanProduct.findMany({ where: { isActive: true }, select: { name: true } });
  const hint =
    products.length > 0
      ? `# Active loan products you can use for loan_product_name: ${products.map((p) => p.name).join(", ")}`
      : "# No active loan products yet — create one under Settings before importing loans";
  sendCsv(
    res,
    "loans_opening_balances_template.csv",
    [
      hint,
      "member_number,loan_product_name,principal_amount,interest_rate,rate_period,computation_method,term_months,release_date,total_repaid_to_date,outstanding_principal",
      "0001,Regular Loan,50000.00,,,,,12,2024-06-01,15000.00,",
    ].join("\n")
  );
});

openingBalancesRouter.get("/templates/deposits.csv", async (_req, res) => {
  const products = await prisma.depositProduct.findMany({ where: { isActive: true }, select: { name: true } });
  const hint =
    products.length > 0
      ? `# Active deposit products you can use for deposit_product_name: ${products.map((p) => p.name).join(", ")}`
      : "# No active deposit products yet — create one under Settings before importing deposits";
  sendCsv(
    res,
    "deposits_opening_balances_template.csv",
    [hint, "member_number,deposit_product_name,balance,opened_at,status", "0001,Regular Savings,8500.00,2019-01-10,active"].join("\n")
  );
});

openingBalancesRouter.get("/templates/other.csv", (_req, res) => {
  sendCsv(
    res,
    "other_gl_opening_balances_template.csv",
    [
      "# Enter every other opening-trial-balance account not covered by the Members/Share Capital/Loans/Deposits templates",
      "# (cash, fixed assets, payables, statutory funds, undivided net surplus, etc.) — exactly one of debit or credit per row.",
      "account_code,debit,credit",
      "11110,25000.00,",
      "30600,,8000.00",
    ].join("\n")
  );
});

function sendCsv(res: import("express").Response, filename: string, content: string) {
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(content);
}
