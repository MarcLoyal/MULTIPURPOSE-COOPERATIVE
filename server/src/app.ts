import "express-async-errors";
import express from "express";
import cors from "cors";
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

export const app = express();

app.use(
  cors({
    origin: (origin, callback) => {
      // No Origin header (e.g. curl, server-to-server) — allow.
      if (!origin || env.clientOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`Origin ${origin} is not allowed`));
      }
    },
  })
);
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

app.use(errorHandler);
