import { BadGatewayException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ArtifactKind, RawEventStatus, SourceRunStatus } from "@prisma/client";
import { toJson, toNullableJson } from "../prisma/json";
import { PrismaService } from "../prisma/prisma.service";
import { syncEnabledSourcesCatalog } from "./source-catalog";

type UpsertSourceRunInput = {
  sourceCode: string;
  runKey: string;
  status: SourceRunStatus;
  startedAt: Date;
  finishedAt?: Date | null;
  errorMessage?: string | null;
  itemsDiscovered?: number;
};

type QuarantineRawEventInput = {
  sourceCode: string;
  eventId: string;
  runKey: string;
  collectedAt: Date;
  sourceUrl: string;
  payloadVersion: string;
  externalId?: string;
  quarantineReason: string;
  rawPayload: Record<string, unknown>;
  artifacts: Array<{
    kind: string;
    bucket: string;
    objectKey: string;
    mimeType?: string;
    checksum?: string;
    sizeBytes?: number;
    metadata?: Record<string, unknown>;
  }>;
};

@Injectable()
export class SourcesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService
  ) {}

  async listSources() {
    await syncEnabledSourcesCatalog(
      this.prisma,
      this.configService.get<string[]>("ENABLED_SOURCES") ?? []
    );

    const sources = await this.prisma.source.findMany({
      where: { deletedAt: null },
      orderBy: { code: "asc" },
      include: {
        runs: {
          take: 1,
          orderBy: { startedAt: "desc" }
        }
      }
    });

    return sources.map((source) => ({
      ...source,
      lastRun: source.runs[0]
        ? {
            ...source.runs[0],
            sourceCode: source.code
          }
        : null
    }));
  }

  async listRuns(sourceCode?: string, limit = 25) {
    const runs = await this.prisma.sourceRun.findMany({
      where: sourceCode
        ? { source: { code: sourceCode, deletedAt: null } }
        : { source: { deletedAt: null } },
      take: limit,
      orderBy: { startedAt: "desc" },
      include: { source: true }
    });

    return runs.map((run) => ({
      ...run,
      sourceCode: run.source.code
    }));
  }

  async listRunsPage(sourceCode?: string, limit = 20, offset = 0) {
    const where = sourceCode
      ? { source: { code: sourceCode, deletedAt: null } }
      : { source: { deletedAt: null } };

    const [total, runs] = await Promise.all([
      this.prisma.sourceRun.count({ where }),
      this.prisma.sourceRun.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: { startedAt: "desc" },
        include: { source: true }
      })
    ]);

    return {
      total,
      items: runs.map((run) => ({
        ...run,
        sourceCode: run.source.code
      }))
    };
  }

  async triggerCollectors(sourceCodes?: string[]) {
    await syncEnabledSourcesCatalog(
      this.prisma,
      this.configService.get<string[]>("ENABLED_SOURCES") ?? []
    );

    const response = await fetch(
      `${this.configService.get<string>("SCRAPER_CONTROL_URL") ?? "http://scraper-service:3001"}/api/source-runs`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          sourceCodes: Array.isArray(sourceCodes) && sourceCodes.length > 0 ? sourceCodes : undefined
        })
      }
    ).catch((error) => {
      throw new BadGatewayException(
        error instanceof Error ? error.message : "Не удалось связаться с сервисом сборщиков"
      );
    });

    if (!response.ok) {
      const message = await response.text();
      throw new BadGatewayException(
        message || "Сервис сборщиков вернул ошибку при ручном запуске"
      );
    }

    const payload = (await response.json()) as {
      triggeredAt: string;
      items: Array<{
        sourceCode: string;
        sourceName: string;
        accepted: boolean;
        runKey?: string;
        startedAt?: string;
        message?: string;
      }>;
    };

    return {
      triggeredAt: new Date(payload.triggeredAt),
      allAccepted: payload.items.every((item) => item.accepted),
      items: await Promise.all(
        payload.items.map(async (item) => {
          const startedAt = item.startedAt ? new Date(item.startedAt) : null;

          if (item.accepted && item.runKey && startedAt) {
            await this.upsertSourceRun({
              sourceCode: item.sourceCode,
              runKey: item.runKey,
              status: SourceRunStatus.RUNNING,
              startedAt
            });
          }

          return {
            ...item,
            startedAt
          };
        })
      )
    };
  }

  async upsertSourceRun(input: UpsertSourceRunInput) {
    await syncEnabledSourcesCatalog(
      this.prisma,
      this.configService.get<string[]>("ENABLED_SOURCES") ?? []
    );

    const source = await this.prisma.source.findFirst({
      where: {
        code: input.sourceCode,
        deletedAt: null
      },
      select: { id: true }
    });

    if (!source) {
      return null;
    }

    const existingRun = await this.prisma.sourceRun.findUnique({
      where: { runKey: input.runKey },
      select: { status: true }
    });
    const nextStatus =
      existingRun && input.status === SourceRunStatus.SUCCESS &&
      (existingRun.status === SourceRunStatus.PARTIAL || existingRun.status === SourceRunStatus.FAILED)
        ? existingRun.status
        : input.status;

    return this.prisma.sourceRun.upsert({
      where: { runKey: input.runKey },
      update: {
        status: nextStatus,
        startedAt: input.startedAt,
        finishedAt: input.finishedAt ?? null,
        errorMessage: input.errorMessage ?? null,
        itemsDiscovered:
          typeof input.itemsDiscovered === "number" ? input.itemsDiscovered : undefined
      },
      create: {
        sourceId: source.id,
        runKey: input.runKey,
        status: nextStatus,
        startedAt: input.startedAt,
        finishedAt: input.finishedAt ?? null,
        errorMessage: input.errorMessage ?? null,
        itemsDiscovered: input.itemsDiscovered ?? 0
      }
    });
  }

  async quarantineRawEvent(input: QuarantineRawEventInput) {
    await syncEnabledSourcesCatalog(
      this.prisma,
      this.configService.get<string[]>("ENABLED_SOURCES") ?? []
    );

    const source = await this.prisma.source.findFirst({
      where: {
        code: input.sourceCode,
        deletedAt: null
      },
      select: { id: true }
    });

    if (!source) {
      return null;
    }

    return this.prisma.$transaction(async (tx) => {
      const existingRawEvent = await tx.rawEvent.findUnique({
        where: { eventId: input.eventId },
        select: { id: true, status: true, sourceRunId: true }
      });

      if (existingRawEvent?.status === RawEventStatus.NORMALIZED) {
        return existingRawEvent;
      }

      let sourceRun = await tx.sourceRun.findUnique({
        where: { runKey: input.runKey },
        select: { id: true, status: true }
      });

      if (!sourceRun) {
        sourceRun = await tx.sourceRun.create({
          data: {
            sourceId: source.id,
            runKey: input.runKey,
            status: SourceRunStatus.PARTIAL,
            startedAt: input.collectedAt,
            finishedAt: input.collectedAt,
            itemsFailed: 1,
            errorMessage: input.quarantineReason
          },
          select: { id: true, status: true }
        });
      } else if (!existingRawEvent) {
        const shouldStayFailed = sourceRun.status === SourceRunStatus.FAILED;
        sourceRun = await tx.sourceRun.update({
          where: { runKey: input.runKey },
          data: {
            status: shouldStayFailed ? SourceRunStatus.FAILED : SourceRunStatus.PARTIAL,
            finishedAt: new Date(),
            itemsFailed: { increment: 1 },
            errorMessage: input.quarantineReason
          },
          select: { id: true, status: true }
        });
      }

      const rawEvent = await tx.rawEvent.upsert({
        where: { eventId: input.eventId },
        update: {
          sourceRunId: sourceRun.id,
          externalId: input.externalId,
          payloadVersion: input.payloadVersion,
          collectedAt: input.collectedAt,
          sourceUrl: input.sourceUrl,
          rawPayload: toJson(input.rawPayload) ?? {},
          status: RawEventStatus.QUARANTINED,
          quarantineReason: input.quarantineReason
        },
        create: {
          sourceId: source.id,
          sourceRunId: sourceRun.id,
          eventId: input.eventId,
          externalId: input.externalId,
          payloadVersion: input.payloadVersion,
          collectedAt: input.collectedAt,
          sourceUrl: input.sourceUrl,
          rawPayload: toJson(input.rawPayload) ?? {},
          status: RawEventStatus.QUARANTINED,
          quarantineReason: input.quarantineReason,
          checksum: input.eventId
        }
      });

      for (const artifact of input.artifacts) {
        await tx.artifact.upsert({
          where: {
            bucket_objectKey: {
              bucket: artifact.bucket,
              objectKey: artifact.objectKey
            }
          },
          update: {
            rawEventId: rawEvent.id,
            sourceRunId: sourceRun.id,
            mimeType: artifact.mimeType,
            checksum: artifact.checksum,
            sizeBytes: artifact.sizeBytes,
            metadata: toNullableJson(artifact.metadata)
          },
          create: {
            rawEventId: rawEvent.id,
            sourceRunId: sourceRun.id,
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

      return rawEvent;
    });
  }
}
