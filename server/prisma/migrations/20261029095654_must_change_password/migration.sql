-- Forces a member to change their password on first login when staff
-- created or reset it. New column, not null with a false default, so
-- every existing login (staff and member alike) is unaffected — the
-- flag is only ever set true going forward, by
-- POST/PATCH /api/members/:id/login.
--
-- Purely additive. Safe to apply to production before this PR merges
-- (expand/contract).

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "must_change_password" BOOLEAN NOT NULL DEFAULT false;
