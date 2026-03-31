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
import {
  IngestNormalizedItemInput,
  IngestResult,
  ProcurementFilterInput,
  ProcurementItem,
  ProcurementSortField,
  ProcurementSortInput,
  ProcurementItemPage
} from "./models";

@Injectable()
export class ProcurementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService
  ) {}

  async find(
    filter?: ProcurementFilterInput,
    sort?: ProcurementSortInput,
    limit = 20,
    offset = 0
  ): Promise<ProcurementItemPage> {
    const where = {
      deletedAt: null,
      source: filter?.source ? { code: filter.source } : undefined,
      status: filter?.status,
      OR: filter?.search
        ? [
            { title: { contains: filter.search, mode: "insensitive" as const } },
            { customerName: { contains: filter.search, mode: "insensitive" as const } },
            {
              supplier: {
                name: { contains: filter.search, mode: "insensitive" as const }
              }
            }
          ]
        : undefined
    };

    const orderBy = {
      [sort?.field ?? ProcurementSortField.PUBLISHED_AT]: sort?.direction ?? "desc"
    };

    const [total, items] = await this.prisma.$transaction([
      this.prisma.procurement.count({ where }),
      this.prisma.procurement.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy,
        include: {
          source: true,
          supplier: true
        }
      })
    ]);

    return {
      total,
      items: items.map((item) => this.toGraphql(item))
    };
  }

  async findById(id: string): Promise<ProcurementItem | null> {
    const item = await this.prisma.procurement.findFirst({
      where: { id, deletedAt: null },
      include: { source: true, supplier: true }
    });

    return item ? this.toGraphql(item) : null;
  }

  async ingest(
    input: IngestNormalizedItemInput,
    request?: RequestLike
  ): Promise<IngestResult> {
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
      where: { idempotencyKey },
      include: {
        procurement: {
          include: {
            source: true,
            supplier: true
          }
        }
      }
    });

    if (existing?.procurementId) {
      return {
        accepted: true,
        idempotencyKey,
        procurementId: existing.procurementId
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
          kind: input.source === "find-tender" ? SourceKind.FIND_TENDER : SourceKind.DEMO
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

      let supplierId: string | undefined;
      if (input.supplier) {
        const supplier = await tx.supplier.upsert({
          where: { normalizedName: input.supplier.toLowerCase() },
          update: { name: input.supplier },
          create: {
            name: input.supplier,
            normalizedName: input.supplier.toLowerCase()
          }
        });
        supplierId = supplier.id;
      }

      const procurement = await tx.procurement.upsert({
        where: {
          sourceId_externalId: {
            sourceId: source.id,
            externalId: input.externalId
          }
        },
        update: {
          title: input.title,
          description: input.description,
          customerName: input.customer,
          supplierId,
          amount: input.amount,
          currency: input.currency ?? "RUB",
          publishedAt: input.publishedAt,
          deadlineAt: input.deadlineAt,
          status: input.status ?? ProcurementStatus.ACTIVE,
          sourceUrl: input.sourceUrl,
          rawPayload: toNullableJson(input.rawPayload)
        },
        create: {
          sourceId: source.id,
          externalId: input.externalId,
          title: input.title,
          description: input.description,
          customerName: input.customer,
          supplierId,
          amount: input.amount,
          currency: input.currency ?? "RUB",
          publishedAt: input.publishedAt,
          deadlineAt: input.deadlineAt,
          status: input.status ?? ProcurementStatus.ACTIVE,
          sourceUrl: input.sourceUrl,
          rawPayload: toNullableJson(input.rawPayload)
        }
      });

      await tx.normalizedItem.create({
        data: {
          sourceId: source.id,
          rawEventId,
          procurementId: procurement.id,
          externalId: input.externalId,
          payloadVersion: input.payloadVersion,
          idempotencyKey,
          contentHash,
          normalizedPayload: toJson(input as unknown as Record<string, unknown>) ?? {},
          normalizedAt: new Date()
        }
      });

      return procurement.id;
    });

    await this.auditService.record(
      AuditAction.PROCUREMENT_INGESTED,
      "Procurement",
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

  private toGraphql(item: {
    id: string;
    externalId: string;
    title: string;
    description: string | null;
    customerName: string | null;
    amount: number | null;
    currency: string | null;
    publishedAt: Date | null;
    deadlineAt: Date | null;
    status: ProcurementStatus;
    sourceUrl: string | null;
    createdAt: Date;
    updatedAt: Date;
    rawPayload: unknown;
    source: { code: string };
    supplier: { name: string } | null;
  }): ProcurementItem {
    return {
      id: item.id,
      externalId: item.externalId,
      source: item.source.code,
      title: item.title,
      description: item.description,
      customer: item.customerName,
      supplier: item.supplier?.name ?? null,
      amount: item.amount,
      currency: item.currency,
      status: item.status,
      publishedAt: item.publishedAt,
      deadlineAt: item.deadlineAt,
      sourceUrl: item.sourceUrl,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      rawPayload: (item.rawPayload ?? undefined) as Record<string, unknown> | undefined
    };
  }
}
