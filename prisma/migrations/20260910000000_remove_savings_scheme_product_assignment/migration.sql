-- DropTable
DROP TABLE "SavingsSchemeProduct";

-- RedefineTables (SQLite requires a table rebuild to relax NOT NULL)
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SavingsEnquiry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "schemeId" TEXT NOT NULL,
    "shopifyProductId" TEXT,
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT,
    "customerPhone" TEXT,
    "monthlyAmount" INTEGER NOT NULL,
    "durationMonths" INTEGER NOT NULL,
    "bonusAmount" INTEGER NOT NULL,
    "totalContribution" INTEGER NOT NULL,
    "totalBenefit" INTEGER NOT NULL,
    "giftName" TEXT,
    "giftValue" INTEGER,
    "giftEligible" BOOLEAN NOT NULL DEFAULT false,
    "giftsSnapshot" JSONB,
    "sourceUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SavingsEnquiry_schemeId_fkey" FOREIGN KEY ("schemeId") REFERENCES "SavingsScheme" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_SavingsEnquiry" ("id", "shop", "schemeId", "shopifyProductId", "customerName", "customerEmail", "customerPhone", "monthlyAmount", "durationMonths", "bonusAmount", "totalContribution", "totalBenefit", "giftName", "giftValue", "giftEligible", "giftsSnapshot", "sourceUrl", "createdAt", "updatedAt")
SELECT "id", "shop", "schemeId", "shopifyProductId", "customerName", "customerEmail", "customerPhone", "monthlyAmount", "durationMonths", "bonusAmount", "totalContribution", "totalBenefit", "giftName", "giftValue", "giftEligible", "giftsSnapshot", "sourceUrl", "createdAt", "updatedAt" FROM "SavingsEnquiry";
DROP TABLE "SavingsEnquiry";
ALTER TABLE "new_SavingsEnquiry" RENAME TO "SavingsEnquiry";
CREATE INDEX "SavingsEnquiry_shop_idx" ON "SavingsEnquiry"("shop");
CREATE INDEX "SavingsEnquiry_shop_schemeId_idx" ON "SavingsEnquiry"("shop", "schemeId");
CREATE INDEX "SavingsEnquiry_shop_createdAt_idx" ON "SavingsEnquiry"("shop", "createdAt");
PRAGMA foreign_keys=ON;
