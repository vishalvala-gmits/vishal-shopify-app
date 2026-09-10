-- Add the new `gifts` JSON array column (max 2 entries, enforced in the
-- application layer) and backfill it from the legacy single-gift scalar
-- columns before those columns are dropped, so existing Gift 1 configuration
-- is preserved as gifts[0]. Gift 2 does not exist yet for any existing
-- scheme, so no second entry is added here.
ALTER TABLE "SavingsScheme" ADD COLUMN "gifts" JSONB NOT NULL DEFAULT '[]';

UPDATE "SavingsScheme"
SET "gifts" = json_array(
  json_object(
    'enabled', json("giftEnabled") = json('true'),
    'name', "giftName",
    'value', "giftValue",
    'imageUrl', "giftImageUrl",
    'minAmount', "giftMinAmount"
  )
)
WHERE "giftEnabled" IS NOT NULL
   OR "giftName" IS NOT NULL
   OR "giftValue" IS NOT NULL
   OR "giftImageUrl" IS NOT NULL
   OR "giftMinAmount" IS NOT NULL;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SavingsScheme" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "durationMonths" INTEGER NOT NULL,
    "bonusEnabled" BOOLEAN NOT NULL DEFAULT false,
    "bonusMonths" INTEGER NOT NULL DEFAULT 0,
    "minAmount" INTEGER NOT NULL,
    "maxAmount" INTEGER NOT NULL,
    "presetAmounts" JSONB NOT NULL,
    "gifts" JSONB NOT NULL DEFAULT '[]',
    "popularAmount" INTEGER,
    "earlyRedemptionEnabled" BOOLEAN NOT NULL DEFAULT true,
    "earlyRedemptionMinMonths" INTEGER NOT NULL DEFAULT 6,
    "termsText" TEXT,
    "currencySymbol" TEXT NOT NULL DEFAULT '₹',
    "primaryColor" TEXT NOT NULL DEFAULT '#5C4642',
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_SavingsScheme" ("id", "shop", "name", "durationMonths", "bonusEnabled", "bonusMonths", "minAmount", "maxAmount", "presetAmounts", "gifts", "popularAmount", "earlyRedemptionEnabled", "earlyRedemptionMinMonths", "termsText", "currencySymbol", "primaryColor", "status", "createdAt", "updatedAt")
SELECT "id", "shop", "name", "durationMonths", "bonusEnabled", "bonusMonths", "minAmount", "maxAmount", "presetAmounts", "gifts", "popularAmount", "earlyRedemptionEnabled", "earlyRedemptionMinMonths", "termsText", "currencySymbol", "primaryColor", "status", "createdAt", "updatedAt"
FROM "SavingsScheme";
DROP TABLE "SavingsScheme";
ALTER TABLE "new_SavingsScheme" RENAME TO "SavingsScheme";
CREATE INDEX "SavingsScheme_shop_idx" ON "SavingsScheme"("shop");
CREATE INDEX "SavingsScheme_shop_status_idx" ON "SavingsScheme"("shop", "status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- Add the gift eligibility snapshot column to enquiries. Existing
-- giftName/giftValue/giftEligible columns are left untouched for backward
-- compatibility with historical records.
ALTER TABLE "SavingsEnquiry" ADD COLUMN "giftsSnapshot" JSONB;
