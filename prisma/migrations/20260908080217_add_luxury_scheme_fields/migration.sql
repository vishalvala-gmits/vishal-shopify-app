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
    "giftEnabled" BOOLEAN NOT NULL DEFAULT false,
    "giftName" TEXT,
    "giftValue" INTEGER,
    "giftImageUrl" TEXT,
    "giftMinAmount" INTEGER,
    "popularAmount" INTEGER,
    "earlyRedemptionEnabled" BOOLEAN NOT NULL DEFAULT true,
    "earlyRedemptionMinMonths" INTEGER NOT NULL DEFAULT 6,
    "termsText" TEXT DEFAULT 'I agree to Terms & Conditions of Lucira Jewelry.',
    "currencySymbol" TEXT NOT NULL DEFAULT '₹',
    "primaryColor" TEXT NOT NULL DEFAULT '#5C4642',
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_SavingsScheme" ("bonusEnabled", "bonusMonths", "createdAt", "currencySymbol", "durationMonths", "giftEnabled", "giftName", "giftValue", "id", "maxAmount", "minAmount", "name", "presetAmounts", "primaryColor", "shop", "status", "updatedAt") SELECT "bonusEnabled", "bonusMonths", "createdAt", "currencySymbol", "durationMonths", "giftEnabled", "giftName", "giftValue", "id", "maxAmount", "minAmount", "name", "presetAmounts", "primaryColor", "shop", "status", "updatedAt" FROM "SavingsScheme";
DROP TABLE "SavingsScheme";
ALTER TABLE "new_SavingsScheme" RENAME TO "SavingsScheme";
CREATE INDEX "SavingsScheme_shop_idx" ON "SavingsScheme"("shop");
CREATE INDEX "SavingsScheme_shop_status_idx" ON "SavingsScheme"("shop", "status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
