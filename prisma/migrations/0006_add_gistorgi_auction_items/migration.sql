ALTER TYPE "SourceKind" ADD VALUE IF NOT EXISTS 'GISTORGI';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'AUCTION_ITEM_INGESTED';

CREATE TABLE "AuctionItem" (
  "id" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "organizerName" TEXT,
  "organizerInn" TEXT,
  "auctionType" TEXT,
  "status" "ProcurementStatus" NOT NULL DEFAULT 'ACTIVE',
  "publishedAt" TIMESTAMP(3),
  "applicationDeadline" TIMESTAMP(3),
  "biddingDate" TIMESTAMP(3),
  "startPrice" DOUBLE PRECISION,
  "currency" TEXT,
  "region" TEXT,
  "lotInfo" TEXT,
  "sourceUrl" TEXT,
  "rawPayload" JSONB,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AuctionItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AuctionItem_sourceId_externalId_key"
ON "AuctionItem"("sourceId", "externalId");

CREATE INDEX "AuctionItem_sourceId_status_idx" ON "AuctionItem"("sourceId", "status");
CREATE INDEX "AuctionItem_publishedAt_idx" ON "AuctionItem"("publishedAt" DESC);

ALTER TABLE "NormalizedItem"
ADD COLUMN IF NOT EXISTS "auctionItemId" TEXT;

CREATE INDEX IF NOT EXISTS "NormalizedItem_auctionItemId_idx"
ON "NormalizedItem"("auctionItemId");

ALTER TABLE "AuctionItem"
ADD CONSTRAINT "AuctionItem_sourceId_fkey"
FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NormalizedItem"
ADD CONSTRAINT "NormalizedItem_auctionItemId_fkey"
FOREIGN KEY ("auctionItemId") REFERENCES "AuctionItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
