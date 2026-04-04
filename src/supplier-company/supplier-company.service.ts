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
import { getSourceCatalogItem } from "../sources/source-catalog";
import type { IngestSupplierCompanyProfileInput } from "./models";

@Injectable()
export class SupplierCompanyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService
  ) {}

  async ingest(
    input: IngestSupplierCompanyProfileInput,
    request?: RequestLike
  ): Promise<IngestResult> {
    const contentHash = createHash("sha256")
      .update(
        JSON.stringify({
          externalId: input.externalId,
          source: input.source,
          payloadVersion: input.payloadVersion,
          companyName: input.companyName,
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

    if (existing?.supplierCompanyProfileId) {
      return {
        accepted: true,
        idempotencyKey,
        procurementId: existing.supplierCompanyProfileId
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
          kind: sourceCatalogItem?.kind ?? SourceKind.FNS,
          baseUrl: sourceCatalogItem?.baseUrl
        },
        create: {
          code: input.source,
          name: sourceCatalogItem?.name ?? input.source,
          description: sourceCatalogItem?.description,
          kind: sourceCatalogItem?.kind ?? SourceKind.FNS,
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

      const supplier = await upsertSupplier(tx, {
        companyName: input.companyName,
        inn: input.inn,
        ogrn: input.ogrn
      });

      const profile = await tx.supplierCompanyProfile.upsert({
        where: {
          sourceId_externalId: {
            sourceId: source.id,
            externalId: input.externalId
          }
        },
        update: {
          supplierId: supplier?.id,
          companyName: input.companyName,
          shortName: input.shortName,
          inn: input.inn,
          kpp: input.kpp,
          ogrn: input.ogrn,
          companyStatus: input.companyStatus,
          registrationDate: input.registrationDate,
          address: input.address,
          okved: input.okved,
          liquidationMark: input.liquidationMark,
          region: input.region,
          sourceUrl: input.sourceUrl,
          rawPayload: toNullableJson(input.rawPayload)
        },
        create: {
          sourceId: source.id,
          supplierId: supplier?.id,
          externalId: input.externalId,
          companyName: input.companyName,
          shortName: input.shortName,
          inn: input.inn,
          kpp: input.kpp,
          ogrn: input.ogrn,
          companyStatus: input.companyStatus,
          registrationDate: input.registrationDate,
          address: input.address,
          okved: input.okved,
          liquidationMark: input.liquidationMark,
          region: input.region,
          sourceUrl: input.sourceUrl,
          rawPayload: toNullableJson(input.rawPayload)
        }
      });

      await tx.normalizedItem.create({
        data: {
          sourceId: source.id,
          rawEventId,
          supplierCompanyProfileId: profile.id,
          externalId: input.externalId,
          payloadVersion: input.payloadVersion,
          idempotencyKey,
          contentHash,
          normalizedPayload: toJson(input as unknown as Record<string, unknown>) ?? {},
          normalizedAt: new Date()
        }
      });

      return profile.id;
    });

    await this.auditService.record(
      AuditAction.SUPPLIER_COMPANY_PROFILE_INGESTED,
      "SupplierCompanyProfile",
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
    companyName: string;
    inn?: string;
    ogrn?: string;
  }
) {
  const normalizedName = input.companyName.trim().toLowerCase();
  const orConditions: Prisma.SupplierWhereInput[] = [{ normalizedName }];

  if (input.inn) {
    orConditions.unshift({ taxId: input.inn });
  }

  if (input.ogrn) {
    orConditions.unshift({ ogrn: input.ogrn });
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
        name: input.companyName,
        normalizedName,
        taxId: existing.taxId ?? input.inn,
        ogrn: existing.ogrn ?? input.ogrn
      }
    });
  }

  return tx.supplier.create({
    data: {
      name: input.companyName,
      normalizedName,
      taxId: input.inn,
      ogrn: input.ogrn
    }
  });
}
