import "express-async-errors";
import express from "express";
import { env } from "./config/env";
import { prisma } from "./lib/prisma";
import { withTimeout } from "./lib/withTimeout";
import { errorHandler } from "./middleware/errorHandler";
import { authRouter } from "./modules/auth/auth.routes";
import { membersRouter } from "./modules/members/members.routes";
import { shareCapitalRouter } from "./modules/shareCapital/shareCapital.routes";
import { loansRouter } from "./modules/loans/loans.routes";
import { cashRouter } from "./modules/cash/cash.routes";
import { accountingRouter } from "./modules/accounting/accounting.routes";
import { auditRouter } from "./modules/audit/audit.routes";
import { dashboardRouter } from "./modules/dashboard/dashboard.routes";
import { settingsRouter } from "./modules/settings/settings.routes";
import { depositsRouter } from "./modules/deposits/deposits.routes";
import { fiscalYearsRouter } from "./modules/accounting/fiscalYears.routes";
import { portalRouter } from "./modules/portal/portal.routes";
import { receiptsRouter } from "./modules/receipts/receipts.routes";
import { usersRouter } from "./modules/users/users.routes";
import { setupRouter } from "./modules/setup/setup.routes";
import { openingBalancesRouter } from "./modules/openingBalances/openingBalances.routes";
import { disbursementVouchersRouter } from "./modules/disbursementVouchers/disbursementVouchers.routes";

export const app = express();

// Same-origin requests (the page and the API on the same domain) are
// always allowed, with no configuration needed — this covers production
// and every Vercel preview URL automatically, since client and server
// deploy together as one project (root vercel.json) and the Origin a
// browser sends always matches the Host it's actually talking to.
// CLIENT_ORIGIN remains only for local dev: Vite's dev-server proxy
// forwards Origin unchanged while rewriting Host (changeOrigin only
// touches Host, not Origin), so the two don't match there and the
// explicit allowlist is still needed.
//
// A rejected origin gets an explicit 403 here, not an Error thrown into
// Express's error pipeline — errorHandler.ts has no specific case for a
// generic Error and falls back to 500, which isn't the right status for
// "this origin isn't allowed."
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (!origin) return next(); // curl, server-to-server, same-origin navigation — none send Origin

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return res.status(403).json({ error: `Origin ${origin} is not allowed` });
  }

  const isSameOrigin = originHost === req.headers.host;
  const isExplicitlyAllowed = env.clientOrigins.includes(origin);
  if (!isSameOrigin && !isExplicitlyAllowed) {
    return res.status(403).json({ error: `Origin ${origin} is not allowed` });
  }

  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
app.use(express.json());

// Bounded DB ping: a bad connection string or unreachable pooler host would
// otherwise hang this (and every DB-touching route) until the platform's
// own timeout kills it, which looks like "never responds" rather than a
// diagnosable error. 5s is comfortably inside Vercel's function limit.
app.get("/api/health", async (_req, res) => {
  try {
    await withTimeout(prisma.$queryRaw`SELECT 1`, 5000, "database connectivity check");
    res.json({ status: "ok", db: "ok" });
  } catch (err) {
    res.status(503).json({
      status: "degraded",
      db: "unreachable",
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

app.use("/api/auth", authRouter);
app.use("/api/members", membersRouter);
app.use("/api/share-capital", shareCapitalRouter);
app.use("/api/loans", loansRouter);
app.use("/api/cash", cashRouter);
app.use("/api/accounting", accountingRouter);
app.use("/api/audit", auditRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/deposits", depositsRouter);
app.use("/api/accounting/fiscal-years", fiscalYearsRouter);
app.use("/api/portal", portalRouter);
app.use("/api/receipts", receiptsRouter);
app.use("/api/users", usersRouter);
app.use("/api/setup", setupRouter);
app.use("/api/opening-balances", openingBalancesRouter);
app.use("/api/disbursement-vouchers", disbursementVouchersRouter);

app.use(errorHandler);
