ALTER TYPE "SourceKind" ADD VALUE IF NOT EXISTS 'FEDRESURS';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'SUPPLIER_RISK_SIGNAL_INGESTED';

ALTER TABLE "Supplier"
ADD COLUMN IF NOT EXISTS "ogrn" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Supplier_ogrn_key" ON "Supplier"("ogrn");

CREATE TABLE "SupplierRiskSignal" (
  "id" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "supplierId" TEXT,
  "externalId" TEXT NOT NULL,
  "messageType" TEXT,
  "supplierName" TEXT NOT NULL,
  "supplierInn" TEXT,
  "supplierOgrn" TEXT,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "publishedAt" TIMESTAMP(3),
  "eventDate" TIMESTAMP(3),
  "bankruptcyStage" TEXT,
  "caseNumber" TEXT,
  "courtName" TEXT,
  "riskLevel" TEXT,
  "sourceUrl" TEXT,
  "rawPayload" JSONB,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SupplierRiskSignal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SupplierRiskSignal_sourceId_externalId_key"
ON "SupplierRiskSignal"("sourceId", "externalId");

CREATE INDEX "SupplierRiskSignal_supplierId_idx" ON "SupplierRiskSignal"("supplierId");
CREATE INDEX "SupplierRiskSignal_supplierInn_idx" ON "SupplierRiskSignal"("supplierInn");
CREATE INDEX "SupplierRiskSignal_supplierOgrn_idx" ON "SupplierRiskSignal"("supplierOgrn");
CREATE INDEX "SupplierRiskSignal_publishedAt_idx" ON "SupplierRiskSignal"("publishedAt" DESC);

ALTER TABLE "NormalizedItem"
ADD COLUMN IF NOT EXISTS "supplierRiskSignalId" TEXT;

CREATE INDEX IF NOT EXISTS "NormalizedItem_supplierRiskSignalId_idx"
ON "NormalizedItem"("supplierRiskSignalId");

ALTER TABLE "SupplierRiskSignal"
ADD CONSTRAINT "SupplierRiskSignal_sourceId_fkey"
FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SupplierRiskSignal"
ADD CONSTRAINT "SupplierRiskSignal_supplierId_fkey"
FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "NormalizedItem"
ADD CONSTRAINT "NormalizedItem_supplierRiskSignalId_fkey"
FOREIGN KEY ("supplierRiskSignalId") REFERENCES "SupplierRiskSignal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
