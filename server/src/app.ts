import "express-async-errors";
import express from "express";
import cors from "cors";
import { env } from "./config/env";
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

app.use(cors({ origin: env.clientOrigin }));
app.use(express.json());

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

app.use("/api/auth", authRouter);
app.use("/api/members", membersRouter);
app.use("/api/share-capital", shareCapitalRouter);
app.use("/api/loans", loansRouter);
app.use("/api/cash", cashRouter);
app.use("/api/accounting", accountingRouter);
app.use("/api/audit", auditRouter);
app.use("/api/dashboard", dashboardRouter);

app.use(errorHandler);
