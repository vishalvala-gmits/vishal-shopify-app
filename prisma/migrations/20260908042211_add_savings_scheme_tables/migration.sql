-- CreateTable
CREATE TABLE "SavingsScheme" (
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
    "currencySymbol" TEXT NOT NULL DEFAULT '₹',
    "primaryColor" TEXT NOT NULL DEFAULT '#5C4642',
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SavingsSchemeProduct" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "schemeId" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "shopifyProductId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SavingsSchemeProduct_schemeId_fkey" FOREIGN KEY ("schemeId") REFERENCES "SavingsScheme" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SavingsEnquiry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "schemeId" TEXT NOT NULL,
    "shopifyProductId" TEXT NOT NULL,
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
    "sourceUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SavingsEnquiry_schemeId_fkey" FOREIGN KEY ("schemeId") REFERENCES "SavingsScheme" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "SavingsScheme_shop_idx" ON "SavingsScheme"("shop");

-- CreateIndex
CREATE INDEX "SavingsScheme_shop_status_idx" ON "SavingsScheme"("shop", "status");

-- CreateIndex
CREATE INDEX "SavingsSchemeProduct_shop_idx" ON "SavingsSchemeProduct"("shop");

-- CreateIndex
CREATE INDEX "SavingsSchemeProduct_schemeId_idx" ON "SavingsSchemeProduct"("schemeId");

-- CreateIndex
CREATE UNIQUE INDEX "SavingsSchemeProduct_shop_shopifyProductId_key" ON "SavingsSchemeProduct"("shop", "shopifyProductId");

-- CreateIndex
CREATE INDEX "SavingsEnquiry_shop_idx" ON "SavingsEnquiry"("shop");

-- CreateIndex
CREATE INDEX "SavingsEnquiry_shop_schemeId_idx" ON "SavingsEnquiry"("shop", "schemeId");

-- CreateIndex
CREATE INDEX "SavingsEnquiry_shop_createdAt_idx" ON "SavingsEnquiry"("shop", "createdAt");
