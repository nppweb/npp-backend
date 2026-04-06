import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ProcurementStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { syncEnabledSourcesCatalog } from "../sources/source-catalog";

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService
  ) {}

  async summary() {
    await syncEnabledSourcesCatalog(
      this.prisma,
      this.configService.get<string[]>("ENABLED_SOURCES") ?? []
    );

    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const timelineWindowDays = 14;
    const timelineStart = new Date(Date.now() - (timelineWindowDays - 1) * 24 * 60 * 60 * 1000);

    const [
      totalAuctions,
      totalRegistryEntries,
      totalSupplierRiskSignals,
      totalSupplierCompanyProfiles,
      totalProcurements,
      activeSources,
      runsLast24h,
      latestPublished,
      latestUpdated,
      sources,
      statusCounts,
      timelineRows,
      recentProcurements,
      recentSourceRuns
    ] = await Promise.all([
      this.prisma.auctionItem.count(),
      this.prisma.registryRecord.count(),
      this.prisma.supplierRiskSignal.count(),
      this.prisma.supplierCompanyProfile.count(),
      this.prisma.procurement.count({ where: { deletedAt: null, source: { deletedAt: null } } }),
      this.prisma.source.count({ where: { deletedAt: null, isActive: true } }),
      this.prisma.sourceRun.count({
        where: { startedAt: { gte: last24Hours }, source: { deletedAt: null } }
      }),
      this.prisma.procurement.findFirst({
        where: { deletedAt: null, source: { deletedAt: null } },
        orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
        select: { publishedAt: true }
      }),
      this.prisma.procurement.findFirst({
        where: { deletedAt: null, source: { deletedAt: null } },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        select: { updatedAt: true }
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
            take: 1,
            orderBy: { startedAt: "desc" },
            select: { startedAt: true }
          },
          _count: {
            select: {
              procurements: {
                where: { deletedAt: null }
              },
              auctions: true,
              registryEntries: true,
              supplierRiskSignals: true,
              supplierCompanyProfiles: true,
              runs: true
            }
          }
        }
      }),
      this.prisma.procurement.groupBy({
        by: ["status"],
        where: { deletedAt: null, source: { deletedAt: null } },
        _count: { _all: true }
      }),
      this.prisma.procurement.findMany({
        where: {
          deletedAt: null,
          source: { deletedAt: null },
          publishedAt: { not: null, gte: timelineStart }
        },
        select: { publishedAt: true }
      }),
      this.prisma.procurement.findMany({
        where: { deletedAt: null, source: { deletedAt: null } },
        take: 10,
        orderBy: [{ updatedAt: "desc" }, { publishedAt: "desc" }, { createdAt: "desc" }],
        include: {
          source: true,
          supplier: true
        }
      }),
      this.prisma.sourceRun.findMany({
        where: { source: { deletedAt: null } },
        take: 5,
        orderBy: { startedAt: "desc" },
        include: { source: true }
      })
    ]);

    const sourcesSummary = sources
      .map((item) => {
        const recordCount =
          item._count.procurements +
          item._count.auctions +
          item._count.registryEntries +
          item._count.supplierRiskSignals +
          item._count.supplierCompanyProfiles;

        return {
          source: item.code,
          name: item.name,
          kind: item.kind,
          isActive: item.isActive,
          procurementCount: item._count.procurements,
          recordCount,
          runCount: item._count.runs,
          lastRunAt: item.runs[0]?.startedAt ?? null
        };
      })
      .sort((left, right) => right.recordCount - left.recordCount);

    const totalRecords =
      totalProcurements +
      totalAuctions +
      totalRegistryEntries +
      totalSupplierRiskSignals +
      totalSupplierCompanyProfiles;

    return {
      totalRecords,
      totalProcurements,
      activeSources,
      runsLast24h,
      lastPublishedAt: latestPublished?.publishedAt ?? null,
      lastUpdatedAt: latestUpdated?.updatedAt ?? null,
      bySource: sourcesSummary.map((item) => ({
        source: item.source,
        count: item.recordCount
      })),
      procurementsByStatus: this.toStatusStats(statusCounts),
      procurementsOverTime: this.buildTimeline(timelineRows, timelineStart, timelineWindowDays),
      recentProcurements: recentProcurements.map((item) => ({
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
      })),
      sourcesSummary,
      recentSourceRuns: recentSourceRuns.map((run) => ({
        ...run,
        sourceCode: run.source.code
      }))
    };
  }

  private toStatusStats(
    rows: Array<{ status: ProcurementStatus; _count: { _all: number } }>
  ): Array<{ status: ProcurementStatus; count: number }> {
    return rows
      .map((row) => ({
        status: row.status,
        count: row._count._all
      }))
      .sort((left, right) => right.count - left.count);
  }

  private buildTimeline(
    rows: Array<{ publishedAt: Date | null }>,
    startDate: Date,
    windowDays: number
  ): Array<{ date: string; count: number }> {
    const byDay = new Map<string, number>();

    for (const row of rows) {
      if (!row.publishedAt) {
        continue;
      }

      const key = row.publishedAt.toISOString().slice(0, 10);
      byDay.set(key, (byDay.get(key) ?? 0) + 1);
    }

    return Array.from({ length: windowDays }, (_value, index) => {
      const date = new Date(startDate);
      date.setUTCDate(startDate.getUTCDate() + index);
      const key = date.toISOString().slice(0, 10);

      return {
        date: key,
        count: byDay.get(key) ?? 0
      };
    });
  }
}
