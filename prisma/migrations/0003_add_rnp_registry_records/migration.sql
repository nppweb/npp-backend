ALTER TYPE "SourceKind" ADD VALUE IF NOT EXISTS 'RNP';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'REGISTRY_RECORD_INGESTED';

CREATE TABLE "RegistryRecord" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "supplierName" TEXT NOT NULL,
    "supplierInn" TEXT,
    "supplierOgrn" TEXT,
    "registryStatus" TEXT,
    "reason" TEXT,
    "decisionDate" TIMESTAMP(3),
    "inclusionDate" TIMESTAMP(3),
    "exclusionDate" TIMESTAMP(3),
    "customerName" TEXT,
    "legalBasis" TEXT,
    "region" TEXT,
    "sourceUrl" TEXT,
    "rawPayload" JSONB,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegistryRecord_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "NormalizedItem" ADD COLUMN "registryEntryId" TEXT;

CREATE UNIQUE INDEX "RegistryRecord_sourceId_externalId_key" ON "RegistryRecord"("sourceId", "externalId");
CREATE INDEX "RegistryRecord_supplierInn_idx" ON "RegistryRecord"("supplierInn");
CREATE INDEX "RegistryRecord_supplierOgrn_idx" ON "RegistryRecord"("supplierOgrn");
CREATE INDEX "RegistryRecord_inclusionDate_idx" ON "RegistryRecord"("inclusionDate" DESC);
CREATE INDEX "NormalizedItem_registryEntryId_idx" ON "NormalizedItem"("registryEntryId");

ALTER TABLE "RegistryRecord" ADD CONSTRAINT "RegistryRecord_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NormalizedItem" ADD CONSTRAINT "NormalizedItem_registryEntryId_fkey" FOREIGN KEY ("registryEntryId") REFERENCES "RegistryRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;
