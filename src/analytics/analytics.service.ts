import { Injectable } from "@nestjs/common";
import { ProcurementStatus, SourceRunStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

const HIGH_VALUE_THRESHOLD = 1_000_000;
const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async summary() {
    const now = new Date();
    const in3Days = new Date(now.getTime() + 3 * DAY_MS);
    const in7Days = new Date(now.getTime() + 7 * DAY_MS);
    const last30Days = new Date(now.getTime() - 30 * DAY_MS);
    const last90Days = new Date(now.getTime() - 90 * DAY_MS);

    const [
      closingSoonCount,
      overdueCount,
      next3DaysCount,
      next4to7DaysCount,
      highValueCount,
      procurementAggregate,
      riskSignalsLast30d,
      recentRuns,
      sources,
      supplierProcurements,
      attentionProcurements
    ] = await Promise.all([
      this.prisma.procurement.count({
        where: {
          deletedAt: null,
          source: { deletedAt: null },
          status: ProcurementStatus.ACTIVE,
          deadlineAt: {
            gte: now,
            lte: in7Days
          }
        }
      }),
      this.prisma.procurement.count({
        where: {
          deletedAt: null,
          source: { deletedAt: null },
          status: ProcurementStatus.ACTIVE,
          deadlineAt: {
            lt: now
          }
        }
      }),
      this.prisma.procurement.count({
        where: {
          deletedAt: null,
          source: { deletedAt: null },
          status: ProcurementStatus.ACTIVE,
          deadlineAt: {
            gte: now,
            lt: in3Days
          }
        }
      }),
      this.prisma.procurement.count({
        where: {
          deletedAt: null,
          source: { deletedAt: null },
          status: ProcurementStatus.ACTIVE,
          deadlineAt: {
            gte: in3Days,
            lte: in7Days
          }
        }
      }),
      this.prisma.procurement.count({
        where: {
          deletedAt: null,
          source: { deletedAt: null },
          amount: {
            gte: HIGH_VALUE_THRESHOLD
          }
        }
      }),
      this.prisma.procurement.aggregate({
        where: {
          deletedAt: null,
          source: { deletedAt: null },
          amount: {
            not: null
          }
        },
        _avg: {
          amount: true
        }
      }),
      this.prisma.supplierRiskSignal.count({
        where: {
          deletedAt: null,
          OR: [{ publishedAt: { gte: last30Days } }, { createdAt: { gte: last30Days } }]
        }
      }),
      this.prisma.sourceRun.findMany({
        where: {
          source: { deletedAt: null },
          startedAt: {
            gte: last30Days
          }
        },
        select: {
          status: true,
          itemsDiscovered: true,
          itemsPublished: true
        }
      }),
      this.prisma.source.findMany({
        where: { deletedAt: null },
        orderBy: { code: "asc" },
        select: {
          code: true,
          name: true,
          kind: true,
          isActive: true,
          runs: {
            take: 10,
            orderBy: { startedAt: "desc" },
            select: {
              status: true,
              startedAt: true,
              itemsDiscovered: true,
              itemsPublished: true
            }
          }
        }
      }),
      this.prisma.procurement.findMany({
        where: {
          deletedAt: null,
          source: { deletedAt: null },
          supplierId: {
            not: null
          },
          OR: [{ publishedAt: { gte: last90Days } }, { createdAt: { gte: last90Days } }]
        },
        select: {
          amount: true,
          supplier: {
            select: {
              name: true
            }
          }
        }
      }),
      this.prisma.procurement.findMany({
        where: {
          deletedAt: null,
          source: { deletedAt: null },
          status: ProcurementStatus.ACTIVE,
          deadlineAt: {
            not: null,
            lte: in7Days
          }
        },
        take: 6,
        orderBy: [{ deadlineAt: "asc" }, { publishedAt: "desc" }],
        include: {
          source: true,
          supplier: true
        }
      })
    ]);

    const discoveredTotal = recentRuns.reduce((sum, run) => sum + run.itemsDiscovered, 0);
    const publishedTotal = recentRuns.reduce((sum, run) => sum + run.itemsPublished, 0);
    const successfulRuns = recentRuns.filter((run) => run.status === SourceRunStatus.SUCCESS).length;
    const publicationEfficiency = discoveredTotal > 0 ? (publishedTotal / discoveredTotal) * 100 : 0;
    const runSuccessRate = recentRuns.length > 0 ? (successfulRuns / recentRuns.length) * 100 : 0;

    const sourceHealth = sources.map((source) => {
      const totalRuns = source.runs.length;
      const successCount = source.runs.filter((run) => run.status === SourceRunStatus.SUCCESS).length;
      const failedRuns = source.runs.filter(
        (run) => run.status === SourceRunStatus.FAILED || run.status === SourceRunStatus.PARTIAL
      ).length;
      const sourceDiscovered = source.runs.reduce((sum, run) => sum + run.itemsDiscovered, 0);
      const sourcePublished = source.runs.reduce((sum, run) => sum + run.itemsPublished, 0);
      const lastRun = source.runs[0];
      const hoursSinceLastRun = lastRun
        ? Math.max(0, Math.round((now.getTime() - lastRun.startedAt.getTime()) / (60 * 60 * 1000)))
        : null;
      const successRate = totalRuns > 0 ? (successCount / totalRuns) * 100 : 0;
      const sourcePublicationRate =
        sourceDiscovered > 0 ? (sourcePublished / sourceDiscovered) * 100 : 0;

      let riskLevel = "STABLE";

      if (
        !lastRun ||
        lastRun.status === SourceRunStatus.FAILED ||
        (hoursSinceLastRun !== null && hoursSinceLastRun >= 72) ||
        successRate < 50
      ) {
        riskLevel = "CRITICAL";
      } else if (
        lastRun.status === SourceRunStatus.PARTIAL ||
        (hoursSinceLastRun !== null && hoursSinceLastRun >= 24) ||
        failedRuns > 0 ||
        successRate < 80
      ) {
        riskLevel = "WATCH";
      }

      return {
        source: source.code,
        name: source.name,
        kind: source.kind,
        isActive: source.isActive,
        lastRunAt: lastRun?.startedAt ?? null,
        lastRunStatus: lastRun?.status ?? null,
        successRate: roundMetric(successRate),
        publicationRate: roundMetric(sourcePublicationRate),
        failedRuns,
        hoursSinceLastRun,
        riskLevel
      };
    });

    const atRiskSources = sourceHealth.filter((item) => item.riskLevel !== "STABLE").length;

    const supplierStats = new Map<
      string,
      {
        procurementCount: number;
        totalAmount: number;
      }
    >();

    for (const item of supplierProcurements) {
      const supplierName = item.supplier?.name;

      if (!supplierName) {
        continue;
      }

      const current = supplierStats.get(supplierName) ?? {
        procurementCount: 0,
        totalAmount: 0
      };

      current.procurementCount += 1;
      current.totalAmount += item.amount ?? 0;
      supplierStats.set(supplierName, current);
    }

    const supplierTotalCount = Array.from(supplierStats.values()).reduce(
      (sum, item) => sum + item.procurementCount,
      0
    );

    const supplierExposure = Array.from(supplierStats.entries())
      .map(([supplier, stats]) => ({
        supplier,
        procurementCount: stats.procurementCount,
        totalAmount: stats.totalAmount,
        sharePercent:
          supplierTotalCount > 0 ? roundMetric((stats.procurementCount / supplierTotalCount) * 100) : 0
      }))
      .sort((left, right) => right.procurementCount - left.procurementCount)
      .slice(0, 5);

    const deadlinePressure = [
      {
        label: "Просрочены",
        count: overdueCount
      },
      {
        label: "0-3 дня",
        count: next3DaysCount
      },
      {
        label: "4-7 дней",
        count: next4to7DaysCount
      }
    ];

    return {
      closingSoonCount,
      overdueCount,
      highValueCount,
      averageProcurementValue: roundMetric(procurementAggregate._avg.amount ?? 0),
      atRiskSources,
      runSuccessRate: roundMetric(runSuccessRate),
      publicationEfficiency: roundMetric(publicationEfficiency),
      riskSignalsLast30d,
      deadlinePressure,
      sourceHealth: sourceHealth.sort((left, right) => {
        const riskOrder = { CRITICAL: 0, WATCH: 1, STABLE: 2 };
        return (
          riskOrder[left.riskLevel as keyof typeof riskOrder] -
            riskOrder[right.riskLevel as keyof typeof riskOrder] ||
          left.source.localeCompare(right.source)
        );
      }),
      supplierExposure,
      attentionProcurements: attentionProcurements.map((item) => ({
        id: item.id,
        externalId: item.externalId,
        source: item.source.code,
        title: item.title,
        description: item.description ?? undefined,
        customer: item.customerName ?? undefined,
        supplier: item.supplier?.name ?? undefined,
        amount: item.amount,
        currency: item.currency ?? undefined,
        status: item.status,
        publishedAt: item.publishedAt,
        deadlineAt: item.deadlineAt,
        sourceUrl: item.sourceUrl ?? undefined,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        rawPayload: (item.rawPayload ?? undefined) as Record<string, unknown> | undefined
      }))
    };
  }
}

function roundMetric(value: number) {
  return Math.round(value * 10) / 10;
}
