ALTER TYPE "SourceKind" ADD VALUE IF NOT EXISTS 'FNS';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'SUPPLIER_COMPANY_PROFILE_INGESTED';

CREATE TABLE "SupplierCompanyProfile" (
  "id" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "supplierId" TEXT,
  "externalId" TEXT NOT NULL,
  "companyName" TEXT NOT NULL,
  "shortName" TEXT,
  "inn" TEXT,
  "kpp" TEXT,
  "ogrn" TEXT,
  "companyStatus" TEXT,
  "registrationDate" TIMESTAMP(3),
  "address" TEXT,
  "okved" TEXT,
  "liquidationMark" BOOLEAN,
  "region" TEXT,
  "sourceUrl" TEXT,
  "rawPayload" JSONB,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SupplierCompanyProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SupplierCompanyProfile_sourceId_externalId_key"
ON "SupplierCompanyProfile"("sourceId", "externalId");

CREATE INDEX "SupplierCompanyProfile_supplierId_idx" ON "SupplierCompanyProfile"("supplierId");
CREATE INDEX "SupplierCompanyProfile_inn_idx" ON "SupplierCompanyProfile"("inn");
CREATE INDEX "SupplierCompanyProfile_ogrn_idx" ON "SupplierCompanyProfile"("ogrn");
CREATE INDEX "SupplierCompanyProfile_registrationDate_idx" ON "SupplierCompanyProfile"("registrationDate" DESC);

ALTER TABLE "NormalizedItem"
ADD COLUMN IF NOT EXISTS "supplierCompanyProfileId" TEXT;

CREATE INDEX IF NOT EXISTS "NormalizedItem_supplierCompanyProfileId_idx"
ON "NormalizedItem"("supplierCompanyProfileId");

ALTER TABLE "SupplierCompanyProfile"
ADD CONSTRAINT "SupplierCompanyProfile_sourceId_fkey"
FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SupplierCompanyProfile"
ADD CONSTRAINT "SupplierCompanyProfile_supplierId_fkey"
FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "NormalizedItem"
ADD CONSTRAINT "NormalizedItem_supplierCompanyProfileId_fkey"
FOREIGN KEY ("supplierCompanyProfileId") REFERENCES "SupplierCompanyProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
