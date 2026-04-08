import { BadGatewayException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SourceRunStatus } from "@prisma/client";
import { AnalyticsService } from "../analytics/analytics.service";
import { PrismaService } from "../prisma/prisma.service";
import type {
  ScraperAdminConfig,
  ScraperAdminOverview,
  ScraperRuntimeState,
  UpdateScraperAdminConfigInput
} from "./scraper-admin.models";

const SCRAPER_CONFIG_KEY = "scraper.runtime.config";
const RUNNING_ATTENTION_THRESHOLD_MS = 2 * 60 * 60 * 1000;

type RuntimeConfigRecord = {
  schedule: string;
  autoRunEnabled: boolean;
};

@Injectable()
export class ScraperAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly analyticsService: AnalyticsService
  ) {}

  async getOverview(): Promise<ScraperAdminOverview> {
    const [config, runtime, analytics, sources] = await Promise.all([
      this.getCurrentConfig(),
      this.fetchRuntimeState(),
      this.analyticsService.summary(),
      this.prisma.source.findMany({
        where: { deletedAt: null },
        orderBy: { code: "asc" },
        include: {
          runs: {
            take: 5,
            orderBy: { startedAt: "desc" }
          }
        }
      })
    ]);

    const analyticsBySource = new Map(analytics.sourceHealth.map((item) => [item.source, item]));
    const runtimeRunning = new Set(runtime.runningSources);
    const circuitBySource = new Map(runtime.circuitStates.map((item) => [item.sourceCode, item]));

    return {
      config,
      runtime,
      sources: sources.map((source) => {
        const now = Date.now();
        const health = analyticsBySource.get(source.code);
        const lastRun = source.runs[0];
        const lastSuccess = source.runs.find((item) => item.status === SourceRunStatus.SUCCESS);
        const circuitState = circuitBySource.get(source.code);
        const isRunning = runtimeRunning.has(source.code);
        const circuitOpen = Boolean(
          circuitState?.openUntil && circuitState.openUntil.getTime() > Date.now()
        );
        const hasStaleRunningStatus =
          lastRun?.status === SourceRunStatus.RUNNING && !isRunning;
        const runningTooLong = Boolean(
          isRunning &&
            lastRun?.startedAt &&
            now - lastRun.startedAt.getTime() >= RUNNING_ATTENTION_THRESHOLD_MS
        );

        let attentionReason = "Работает стабильно";

        if (!runtime.reachable) {
          attentionReason = "Контур управления scraper-service недоступен";
        } else if (circuitOpen) {
          attentionReason = "Circuit breaker открыт после серии ошибок";
        } else if (runningTooLong) {
          attentionReason = "Источник выполняется дольше ожидаемого и похож на зависший прогон";
        } else if (hasStaleRunningStatus) {
          attentionReason = "В БД остался статус RUNNING, но scraper-service не подтверждает активный прогон";
        } else if (!lastRun) {
          attentionReason = "Запусков ещё не было";
        } else if (
          lastRun.status === SourceRunStatus.FAILED ||
          lastRun.status === SourceRunStatus.PARTIAL
        ) {
          attentionReason = lastRun.errorMessage || "Последний запуск завершился с ошибкой";
        } else if ((health?.riskLevel ?? "STABLE") !== "STABLE") {
          attentionReason =
            (health?.failedRuns ?? 0) > 0
              ? `${health?.failedRuns ?? 0} неуспешных или частичных запусков в недавнем окне при текущем успешном прогоне`
              : "Источник отмечен как требующий внимания";
        } else if (isRunning) {
          attentionReason = "Источник сейчас выполняется";
        }

        return {
          sourceCode: source.code,
          sourceName: source.name,
          isActive: source.isActive,
          lastRunStatus: lastRun?.status ?? null,
          lastRunAt: lastRun?.startedAt ?? null,
          lastSuccessAt: lastSuccess?.startedAt ?? null,
          lastErrorMessage: lastRun?.errorMessage ?? undefined,
          riskLevel: health?.riskLevel ?? "STABLE",
          successRate: health?.successRate ?? 0,
          publicationRate: health?.publicationRate ?? 0,
          failedRuns: health?.failedRuns ?? 0,
          hoursSinceLastRun: health?.hoursSinceLastRun ?? null,
          isRunning,
          circuitOpen,
          consecutiveFailures: circuitState?.failures ?? 0,
          circuitOpenUntil: circuitState?.openUntil ?? null,
          attentionRequired:
            !runtime.reachable ||
            !source.isActive ||
            !lastRun ||
            runningTooLong ||
            hasStaleRunningStatus ||
            circuitOpen ||
            lastRun.status === SourceRunStatus.FAILED ||
            lastRun.status === SourceRunStatus.PARTIAL ||
            (health?.riskLevel ?? "STABLE") !== "STABLE",
          attentionReason
        };
      })
    };
  }

  async updateConfig(input: UpdateScraperAdminConfigInput): Promise<ScraperAdminConfig> {
    const applied = await this.applyRuntimeConfig(input);

    const setting = await this.prisma.systemSetting.upsert({
      where: { key: SCRAPER_CONFIG_KEY },
      update: {
        value: {
          schedule: input.schedule,
          autoRunEnabled: input.autoRunEnabled
        }
      },
      create: {
        key: SCRAPER_CONFIG_KEY,
        description: "Runtime configuration for scraper-service schedule",
        value: {
          schedule: input.schedule,
          autoRunEnabled: input.autoRunEnabled
        }
      }
    });

    return {
      schedule: applied.schedule,
      autoRunEnabled: applied.autoRunEnabled,
      updatedAt: setting.updatedAt,
      source: "database"
    };
  }

  async getBootstrapConfig(): Promise<RuntimeConfigRecord> {
    const setting = await this.prisma.systemSetting.findUnique({
      where: { key: SCRAPER_CONFIG_KEY }
    });

    if (!setting) {
      return this.getDefaultConfig();
    }

    return this.normalizeConfig(setting.value);
  }

  private async getCurrentConfig(): Promise<ScraperAdminConfig> {
    const setting = await this.prisma.systemSetting.findUnique({
      where: { key: SCRAPER_CONFIG_KEY }
    });

    if (!setting) {
      const defaults = this.getDefaultConfig();

      return {
        ...defaults,
        updatedAt: new Date(0),
        source: "default"
      };
    }

    const normalized = this.normalizeConfig(setting.value);

    return {
      ...normalized,
      updatedAt: setting.updatedAt,
      source: "database"
    };
  }

  private getDefaultConfig(): RuntimeConfigRecord {
    return {
      schedule: this.configService.get<string>("SCRAPE_SCHEDULE") ?? "*/20 * * * *",
      autoRunEnabled: true
    };
  }

  private normalizeConfig(value: unknown): RuntimeConfigRecord {
    const defaults = this.getDefaultConfig();
    const raw =
      value && typeof value === "object" ? (value as Record<string, unknown>) : ({} as Record<string, unknown>);

    return {
      schedule: typeof raw.schedule === "string" && raw.schedule.trim().length > 0
        ? raw.schedule.trim()
        : defaults.schedule,
      autoRunEnabled:
        typeof raw.autoRunEnabled === "boolean" ? raw.autoRunEnabled : defaults.autoRunEnabled
    };
  }

  private async fetchRuntimeState(): Promise<ScraperRuntimeState> {
    const controlUrl =
      this.configService.get<string>("SCRAPER_CONTROL_URL") ?? "http://scraper-service:3001";

    try {
      const response = await fetch(`${controlUrl}/api/runtime-status`);

      if (!response.ok) {
        throw new Error(`scraper-service returned ${response.status}`);
      }

      const payload = (await response.json()) as {
        schedule?: string;
        autoRunEnabled?: boolean;
        running?: boolean;
        runningSources?: string[];
        loadedSources?: string[];
        circuitStates?: Array<{ sourceCode: string; failures: number; openUntil?: string | null }>;
      };

      return {
        reachable: true,
        schedule: payload.schedule ?? this.getDefaultConfig().schedule,
        autoRunEnabled: payload.autoRunEnabled ?? true,
        running: payload.running ?? false,
        runningSources: payload.runningSources ?? [],
        loadedSources: payload.loadedSources ?? [],
        circuitStates: (payload.circuitStates ?? []).map((item) => ({
          sourceCode: item.sourceCode,
          failures: item.failures,
          openUntil: item.openUntil ? new Date(item.openUntil) : null
        })),
        message: undefined
      };
    } catch (error) {
      return {
        reachable: false,
        schedule: this.getDefaultConfig().schedule,
        autoRunEnabled: true,
        running: false,
        runningSources: [],
        loadedSources: [],
        circuitStates: [],
        message:
          error instanceof Error
            ? error.message
            : "Не удалось получить состояние scraper-service"
      };
    }
  }

  private async applyRuntimeConfig(input: UpdateScraperAdminConfigInput): Promise<RuntimeConfigRecord> {
    const controlUrl =
      this.configService.get<string>("SCRAPER_CONTROL_URL") ?? "http://scraper-service:3001";

    const response = await fetch(`${controlUrl}/api/runtime-config`, {
      method: "PUT",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(input)
    }).catch((error) => {
      throw new BadGatewayException(
        error instanceof Error ? error.message : "Не удалось связаться с scraper-service"
      );
    });

    if (!response.ok) {
      const message = await response.text();
      throw new BadGatewayException(
        message || "scraper-service не принял новое расписание"
      );
    }

    const payload = (await response.json()) as RuntimeConfigRecord;

    return {
      schedule: payload.schedule,
      autoRunEnabled: payload.autoRunEnabled
    };
  }
}
