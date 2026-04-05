import { BadGatewayException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SourceRunStatus } from "@prisma/client";
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

    return this.prisma.sourceRun.upsert({
      where: { runKey: input.runKey },
      update: {
        status: input.status,
        startedAt: input.startedAt,
        finishedAt: input.finishedAt ?? null,
        errorMessage: input.errorMessage ?? null,
        itemsDiscovered:
          typeof input.itemsDiscovered === "number" ? input.itemsDiscovered : undefined
      },
      create: {
        sourceId: source.id,
        runKey: input.runKey,
        status: input.status,
        startedAt: input.startedAt,
        finishedAt: input.finishedAt ?? null,
        errorMessage: input.errorMessage ?? null,
        itemsDiscovered: input.itemsDiscovered ?? 0
      }
    });
  }
}
