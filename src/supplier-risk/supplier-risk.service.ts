import { Injectable } from "@nestjs/common";
import {
  ArtifactKind,
  AuditAction,
  Prisma,
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
import type { IngestSupplierRiskSignalInput } from "./models";

@Injectable()
export class SupplierRiskService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService
  ) {}

  async ingest(
    input: IngestSupplierRiskSignalInput,
    request?: RequestLike
  ): Promise<IngestResult> {
    const contentHash = createHash("sha256")
      .update(
        JSON.stringify({
          externalId: input.externalId,
          source: input.source,
          payloadVersion: input.payloadVersion,
          supplierName: input.supplierName,
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

    if (existing?.supplierRiskSignalId) {
      return {
        accepted: true,
        idempotencyKey,
        procurementId: existing.supplierRiskSignalId
      };
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const source = await tx.source.upsert({
        where: { code: input.source },
        update: {
          isActive: true
        },
        create: {
          code: input.source,
          name: input.source,
          kind: SourceKind.FEDRESURS
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

      const supplier = await upsertSupplier(tx, {
        supplierName: input.supplierName,
        supplierInn: input.supplierInn,
        supplierOgrn: input.supplierOgrn
      });

      const signal = await tx.supplierRiskSignal.upsert({
        where: {
          sourceId_externalId: {
            sourceId: source.id,
            externalId: input.externalId
          }
        },
        update: {
          supplierId: supplier?.id,
          messageType: input.messageType,
          supplierName: input.supplierName,
          supplierInn: input.supplierInn,
          supplierOgrn: input.supplierOgrn,
          title: input.title,
          description: input.description,
          publishedAt: input.publishedAt,
          eventDate: input.eventDate,
          bankruptcyStage: input.bankruptcyStage,
          caseNumber: input.caseNumber,
          courtName: input.courtName,
          riskLevel: input.riskLevel,
          sourceUrl: input.sourceUrl,
          rawPayload: toNullableJson(input.rawPayload)
        },
        create: {
          sourceId: source.id,
          supplierId: supplier?.id,
          externalId: input.externalId,
          messageType: input.messageType,
          supplierName: input.supplierName,
          supplierInn: input.supplierInn,
          supplierOgrn: input.supplierOgrn,
          title: input.title,
          description: input.description,
          publishedAt: input.publishedAt,
          eventDate: input.eventDate,
          bankruptcyStage: input.bankruptcyStage,
          caseNumber: input.caseNumber,
          courtName: input.courtName,
          riskLevel: input.riskLevel,
          sourceUrl: input.sourceUrl,
          rawPayload: toNullableJson(input.rawPayload)
        }
      });

      await tx.normalizedItem.create({
        data: {
          sourceId: source.id,
          rawEventId,
          supplierRiskSignalId: signal.id,
          externalId: input.externalId,
          payloadVersion: input.payloadVersion,
          idempotencyKey,
          contentHash,
          normalizedPayload: toJson(input as unknown as Record<string, unknown>) ?? {},
          normalizedAt: new Date()
        }
      });

      return signal.id;
    });

    await this.auditService.record(
      AuditAction.SUPPLIER_RISK_SIGNAL_INGESTED,
      "SupplierRiskSignal",
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

async function upsertSupplier(
  tx: Prisma.TransactionClient,
  input: {
    supplierName: string;
    supplierInn?: string;
    supplierOgrn?: string;
  }
) {
  const normalizedName = input.supplierName.trim().toLowerCase();
  const orConditions: Prisma.SupplierWhereInput[] = [{ normalizedName }];

  if (input.supplierInn) {
    orConditions.unshift({ taxId: input.supplierInn });
  }

  if (input.supplierOgrn) {
    orConditions.unshift({ ogrn: input.supplierOgrn });
  }

  const existing = await tx.supplier.findFirst({
    where: {
      OR: orConditions
    }
  });

  if (existing) {
    return tx.supplier.update({
      where: { id: existing.id },
      data: {
        name: input.supplierName,
        normalizedName,
        taxId: existing.taxId ?? input.supplierInn,
        ogrn: existing.ogrn ?? input.supplierOgrn
      }
    });
  }

  return tx.supplier.create({
    data: {
      name: input.supplierName,
      normalizedName,
      taxId: input.supplierInn,
      ogrn: input.supplierOgrn
    }
  });
}
