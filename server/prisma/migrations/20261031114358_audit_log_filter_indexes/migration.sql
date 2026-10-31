-- Indexes for the global Audit Log viewer (audit.routes.ts's GET / and
-- GET /export) — filters by user, action, and date range query these
-- three columns directly, and audit_logs is append-only and never
-- trimmed, so it only grows. No data change.

-- CreateIndex
CREATE INDEX "audit_logs_performed_by_idx" ON "audit_logs"("performed_by");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_performed_at_idx" ON "audit_logs"("performed_at");
