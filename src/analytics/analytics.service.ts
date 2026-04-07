import { Injectable } from "@nestjs/common";
import { ProcurementStatus, SourceRunStatus } from "@prisma/client";
import {
  getSourceSpecificData,
  NPP_SOURCE_CODES,
  resolveNppStationName,
  withResolvedNppTargetStation
} from "../common/npp-stations";
import { cleanSupplierName, isMeaningfulSupplierName } from "../common/supplier-hygiene";
import { PrismaService } from "../prisma/prisma.service";

const HIGH_VALUE_THRESHOLD = 1_000_000;
const DAY_MS = 24 * 60 * 60 * 1000;
const NPP_PERIOD_START = new Date("2025-01-01T00:00:00+03:00");

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
      attentionProcurements,
      nppProcurements
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
              name: true,
              metadata: true
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
      }),
      this.prisma.procurement.findMany({
        where: {
          deletedAt: null,
          source: {
            deletedAt: null,
            code: {
              in: [...NPP_SOURCE_CODES]
            }
          },
          OR: [{ publishedAt: { gte: NPP_PERIOD_START } }, { createdAt: { gte: NPP_PERIOD_START } }]
        },
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
      const hasMeaningfulFailureHistory = failedRuns >= 2;

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
        hasMeaningfulFailureHistory ||
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
      const supplierName = cleanSupplierName(item.supplier?.name);

      if (!supplierName || !isMeaningfulSupplierName(supplierName, item.supplier?.metadata)) {
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

    const nppMonthlyStats = new Map<string, { label: string; procurementCount: number; totalAmount: number }>();
    const nppStationStats = new Map<string, { procurementCount: number; totalAmount: number }>();
    const nppSourceStats = new Map<string, { name: string; procurementCount: number; totalAmount: number }>();
    const nppCustomerStats = new Map<string, { procurementCount: number; totalAmount: number }>();
    let nppTotalAmount = 0;
    let nppContractCount = 0;

    for (const item of nppProcurements) {
      const stationName = resolveNppStationName(item.rawPayload, [item.title, item.customerName]);
      const amount = item.amount ?? 0;
      const effectiveDate = item.publishedAt ?? item.createdAt;
      const sourceType = resolveSourceType(item.rawPayload);

      nppTotalAmount += amount;

      if (sourceType === "contract") {
        nppContractCount += 1;
      }

      if (stationName) {
        const current = nppStationStats.get(stationName) ?? {
          procurementCount: 0,
          totalAmount: 0
        };
        current.procurementCount += 1;
        current.totalAmount += amount;
        nppStationStats.set(stationName, current);
      }

      const sourceCurrent = nppSourceStats.get(item.source.code) ?? {
        name: item.source.name,
        procurementCount: 0,
        totalAmount: 0
      };
      sourceCurrent.procurementCount += 1;
      sourceCurrent.totalAmount += amount;
      nppSourceStats.set(item.source.code, sourceCurrent);

      if (item.customerName) {
        const customerCurrent = nppCustomerStats.get(item.customerName) ?? {
          procurementCount: 0,
          totalAmount: 0
        };
        customerCurrent.procurementCount += 1;
        customerCurrent.totalAmount += amount;
        nppCustomerStats.set(item.customerName, customerCurrent);
      }

      const timelineKey = `${effectiveDate.getFullYear()}-${String(effectiveDate.getMonth() + 1).padStart(2, "0")}`;
      const timelineLabel = effectiveDate.toLocaleDateString("ru-RU", {
        month: "short",
        year: "numeric"
      });
      const timelineCurrent = nppMonthlyStats.get(timelineKey) ?? {
        label: timelineLabel,
        procurementCount: 0,
        totalAmount: 0
      };
      timelineCurrent.procurementCount += 1;
      timelineCurrent.totalAmount += amount;
      nppMonthlyStats.set(timelineKey, timelineCurrent);
    }

    const nppMonthlyDynamics = buildMonthRange(NPP_PERIOD_START, now).map((monthKey) => {
      const existing = nppMonthlyStats.get(monthKey.key);
      return {
        label: existing?.label ?? monthKey.label,
        procurementCount: existing?.procurementCount ?? 0,
        totalAmount: roundMetric(existing?.totalAmount ?? 0)
      };
    });

    const nppStationCoverage = Array.from(nppStationStats.entries())
      .map(([station, stats]) => ({
        station,
        procurementCount: stats.procurementCount,
        totalAmount: roundMetric(stats.totalAmount)
      }))
      .sort((left, right) => right.procurementCount - left.procurementCount || left.station.localeCompare(right.station));

    const nppSourceCoverage = Array.from(nppSourceStats.entries())
      .map(([source, stats]) => ({
        source,
        name: stats.name,
        procurementCount: stats.procurementCount,
        totalAmount: roundMetric(stats.totalAmount)
      }))
      .sort((left, right) => right.procurementCount - left.procurementCount || left.source.localeCompare(right.source));

    const nppCustomerCoverage = Array.from(nppCustomerStats.entries())
      .map(([customer, stats]) => ({
        customer,
        procurementCount: stats.procurementCount,
        totalAmount: roundMetric(stats.totalAmount)
      }))
      .sort((left, right) => right.procurementCount - left.procurementCount || left.customer.localeCompare(right.customer))
      .slice(0, 8);

    const nppRecentProcurements = [...nppProcurements]
      .sort(
        (left, right) =>
          (right.publishedAt ?? right.createdAt).getTime() - (left.publishedAt ?? left.createdAt).getTime()
      )
      .slice(0, 8)
      .map((item) => toProcurementGraphql(item));

    return {
      nppPeriodStart: NPP_PERIOD_START,
      nppProcurementCount: nppProcurements.length,
      nppContractCount,
      nppStationsCovered: nppStationCoverage.length,
      nppTotalAmount: roundMetric(nppTotalAmount),
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
      nppMonthlyDynamics,
      nppStationCoverage,
      nppSourceCoverage,
      nppCustomerCoverage,
      nppRecentProcurements,
      attentionProcurements: attentionProcurements.map((item) => toProcurementGraphql(item))
    };
  }
}

function buildMonthRange(start: Date, end: Date): Array<{ key: string; label: string }> {
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const limit = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
  const months: Array<{ key: string; label: string }> = [];

  while (cursor <= limit) {
    months.push({
      key: `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}`,
      label: cursor.toLocaleDateString("ru-RU", {
        month: "short",
        year: "numeric",
        timeZone: "UTC"
      })
    });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return months;
}

function resolveSourceType(rawPayload: unknown): string | undefined {
  const sourceSpecificData = getSourceSpecificData(rawPayload);
  return typeof sourceSpecificData?.sourceType === "string" ? sourceSpecificData.sourceType : undefined;
}

function toProcurementGraphql(item: {
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
}) {
  const targetStationName = resolveNppStationName(item.rawPayload, [item.title, item.customerName]);

  return {
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
    rawPayload: withResolvedNppTargetStation(item.rawPayload, targetStationName)
  };
}

function roundMetric(value: number) {
  return Math.round(value * 10) / 10;
}
