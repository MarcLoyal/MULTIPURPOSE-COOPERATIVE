-- Member portal (roadmap item 4): a new 'member' UserRole, and a
-- nullable, unique User.member_id linking a login to its Member
-- record. Only ever set by staff via POST /api/members/:id/login
-- (admin/manager) — there is no public self-signup path. See
-- middleware/auth.ts's requireStaff (blocks 'member' from every
-- existing staff router) and the new portal.routes.ts (scopes every
-- query to the caller's own member_id).
--
-- Purely additive — one new enum value, one new nullable+unique
-- column with an FK, no existing column, table, or row is touched.
-- Safe to apply to production before this PR merges (expand/contract).

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'member';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "member_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_member_id_key" ON "users"("member_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;
