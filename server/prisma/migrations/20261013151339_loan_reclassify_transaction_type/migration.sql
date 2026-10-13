-- AlterEnum
-- Additive only: adds one new enum value, used going forward by the PAR
-- whole-balance reclassification feature. No existing value is renamed
-- or removed, and no existing row's meaning changes.
ALTER TYPE "LoanTxnType" ADD VALUE 'reclassify';
