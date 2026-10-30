-- First-time setup (PR B): cooperative_profile is the permanent
-- "setup has been completed" flag (its mere existence, checked by
-- GET /api/setup/status — see setup.routes.ts), and setup_attempts
-- tracks failed setup-code attempts for rate limiting. See the
-- CooperativeProfile/SetupAttempt doc comments in schema.prisma for why
-- this isn't derived from "does an admin User exist."

-- CreateTable
CREATE TABLE "cooperative_profile" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "cda_registration_number" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cooperative_profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "setup_attempts" (
    "id" TEXT NOT NULL,
    "attempted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "setup_attempts_pkey" PRIMARY KEY ("id")
);
