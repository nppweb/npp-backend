import { Injectable } from "@nestjs/common";
import {
  ArtifactKind,
  AuditAction,
  ProcurementStatus,
  RawEventStatus,
  SourceKind,
  SourceRunStatus
} from "@prisma/client";
import { createHash } from "node:crypto";
import { AuditService } from "../audit/audit.service";
import type { RequestLike } from "../common/request-context";
import { extractRequestContext } from "../common/request-context";
import { toJson, toNullableJson } from "../prisma/json";
import { PrismaService } from "../prisma/prisma.service";
import type { IngestResult } from "../procurement/models";
import { getSourceCatalogItem } from "../sources/source-catalog";
import type { IngestAuctionItemInput } from "./models";

@Injectable()
export class AuctionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService
  ) {}

  async ingest(input: IngestAuctionItemInput, request?: RequestLike): Promise<IngestResult> {
    const contentHash = createHash("sha256")
      .update(
        JSON.stringify({
          externalId: input.externalId,
          source: input.source,
          payloadVersion: input.payloadVersion,
          title: input.title,
          rawPayload: input.rawPayload ?? null
        })
      )
      .digest("hex");
    const idempotencyKey = createHash("sha256")
      .update(`${input.source}:${input.externalId}:${input.payloadVersion}:${contentHash}`)
      .digest("hex");

    const existing = await this.prisma.normalizedItem.findUnique({
      where: { idempotencyKey }
    });

    if (existing?.auctionItemId) {
      return {
        accepted: true,
        idempotencyKey,
        procurementId: existing.auctionItemId
      };
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const sourceCatalogItem = getSourceCatalogItem(input.source);
      const source = await tx.source.upsert({
        where: { code: input.source },
        update: {
          isActive: true,
          name: sourceCatalogItem?.name ?? input.source,
          description: sourceCatalogItem?.description,
          kind: sourceCatalogItem?.kind ?? SourceKind.GISTORGI,
          baseUrl: sourceCatalogItem?.baseUrl
        },
        create: {
          code: input.source,
          name: sourceCatalogItem?.name ?? input.source,
          description: sourceCatalogItem?.description,
          kind: sourceCatalogItem?.kind ?? SourceKind.GISTORGI,
          baseUrl: sourceCatalogItem?.baseUrl
        }
      });

      let sourceRunId: string | undefined;
      if (input.rawEvent?.runKey) {
        const run = await tx.sourceRun.upsert({
          where: { runKey: input.rawEvent.runKey },
          update: {
            status: SourceRunStatus.SUCCESS,
            finishedAt: new Date(),
            itemsPublished: { increment: 1 }
          },
          create: {
            runKey: input.rawEvent.runKey,
            sourceId: source.id,
            status: SourceRunStatus.SUCCESS,
            startedAt: input.rawEvent.collectedAt,
            finishedAt: new Date(),
            itemsPublished: 1,
            itemsDiscovered: 1
          }
        });
        sourceRunId = run.id;
      }

      let rawEventId: string | undefined;
      if (input.rawEvent) {
        const rawEvent = await tx.rawEvent.upsert({
          where: { eventId: input.rawEvent.eventId },
          update: {
            sourceUrl: input.rawEvent.url,
            payloadVersion: input.payloadVersion,
            status: RawEventStatus.NORMALIZED,
            collectedAt: input.rawEvent.collectedAt,
            rawPayload: toJson(input.rawPayload) ?? {}
          },
          create: {
            sourceId: source.id,
            sourceRunId,
            eventId: input.rawEvent.eventId,
            externalId: input.externalId,
            payloadVersion: input.payloadVersion,
            collectedAt: input.rawEvent.collectedAt,
            sourceUrl: input.rawEvent.url,
            rawPayload: toJson(input.rawPayload) ?? {},
            status: RawEventStatus.NORMALIZED,
            checksum: contentHash
          }
        });
        rawEventId = rawEvent.id;

        for (const artifact of input.rawEvent.artifacts ?? []) {
          await tx.artifact.upsert({
            where: {
              bucket_objectKey: {
                bucket: artifact.bucket,
                objectKey: artifact.objectKey
              }
            },
            update: {
              rawEventId,
              sourceRunId,
              mimeType: artifact.mimeType,
              checksum: artifact.checksum,
              sizeBytes: artifact.sizeBytes,
              metadata: toNullableJson(artifact.metadata)
            },
            create: {
              rawEventId,
              sourceRunId,
              bucket: artifact.bucket,
              objectKey: artifact.objectKey,
              kind:
                artifact.kind === "RAW_HTML"
                  ? ArtifactKind.RAW_HTML
                  : artifact.kind === "REPORT_FILE"
                    ? ArtifactKind.REPORT_FILE
                    : artifact.kind === "RAW_JSON"
                      ? ArtifactKind.RAW_JSON
                      : ArtifactKind.OTHER,
              mimeType: artifact.mimeType,
              checksum: artifact.checksum,
              sizeBytes: artifact.sizeBytes,
              metadata: toNullableJson(artifact.metadata)
            }
          });
        }
      }

      const auctionItem = await tx.auctionItem.upsert({
        where: {
          sourceId_externalId: {
            sourceId: source.id,
            externalId: input.externalId
          }
        },
        update: {
          title: input.title,
          description: input.description,
          organizerName: input.organizerName,
          organizerInn: input.organizerInn,
          auctionType: input.auctionType,
          status: input.status ?? ProcurementStatus.ACTIVE,
          publishedAt: input.publishedAt,
          applicationDeadline: input.applicationDeadline,
          biddingDate: input.biddingDate,
          startPrice: input.startPrice,
          currency: input.currency,
          region: input.region,
          lotInfo: input.lotInfo,
          sourceUrl: input.sourceUrl,
          rawPayload: toNullableJson(input.rawPayload)
        },
        create: {
          sourceId: source.id,
          externalId: input.externalId,
          title: input.title,
          description: input.description,
          organizerName: input.organizerName,
          organizerInn: input.organizerInn,
          auctionType: input.auctionType,
          status: input.status ?? ProcurementStatus.ACTIVE,
          publishedAt: input.publishedAt,
          applicationDeadline: input.applicationDeadline,
          biddingDate: input.biddingDate,
          startPrice: input.startPrice,
          currency: input.currency,
          region: input.region,
          lotInfo: input.lotInfo,
          sourceUrl: input.sourceUrl,
          rawPayload: toNullableJson(input.rawPayload)
        }
      });

      await tx.normalizedItem.create({
        data: {
          sourceId: source.id,
          rawEventId,
          auctionItemId: auctionItem.id,
          externalId: input.externalId,
          payloadVersion: input.payloadVersion,
          idempotencyKey,
          contentHash,
          normalizedPayload: toJson(input as unknown as Record<string, unknown>) ?? {},
          normalizedAt: new Date()
        }
      });

      return auctionItem.id;
    });

    await this.auditService.record(
      AuditAction.AUCTION_ITEM_INGESTED,
      "AuctionItem",
      result,
      { source: input.source, externalId: input.externalId },
      extractRequestContext(request)
    );

    return {
      accepted: true,
      idempotencyKey,
      procurementId: result
    };
  }
}
