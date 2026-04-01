import { Injectable } from "@nestjs/common";
import { ProcurementStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async summary() {
    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const timelineWindowDays = 14;
    const timelineStart = new Date(Date.now() - (timelineWindowDays - 1) * 24 * 60 * 60 * 1000);

    const [
      totalProcurements,
      activeSources,
      runsLast24h,
      latest,
      sources,
      statusCounts,
      timelineRows,
      recentProcurements,
      recentSourceRuns
    ] = await Promise.all([
      this.prisma.procurement.count({ where: { deletedAt: null } }),
      this.prisma.source.count({ where: { deletedAt: null, isActive: true } }),
      this.prisma.sourceRun.count({ where: { startedAt: { gte: last24Hours } } }),
      this.prisma.procurement.findFirst({
        where: { deletedAt: null },
        orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
        select: { publishedAt: true }
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
              runs: true
            }
          }
        }
      }),
      this.prisma.procurement.groupBy({
        by: ["status"],
        where: { deletedAt: null },
        _count: { _all: true }
      }),
      this.prisma.procurement.findMany({
        where: {
          deletedAt: null,
          publishedAt: { not: null, gte: timelineStart }
        },
        select: { publishedAt: true }
      }),
      this.prisma.procurement.findMany({
        where: { deletedAt: null },
        take: 5,
        orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
        include: {
          source: true,
          supplier: true
        }
      }),
      this.prisma.sourceRun.findMany({
        take: 5,
        orderBy: { startedAt: "desc" },
        include: { source: true }
      })
    ]);

    const sourcesSummary = sources
      .map((item) => ({
        source: item.code,
        name: item.name,
        kind: item.kind,
        isActive: item.isActive,
        procurementCount: item._count.procurements,
        runCount: item._count.runs,
        lastRunAt: item.runs[0]?.startedAt ?? null
      }))
      .sort((left, right) => right.procurementCount - left.procurementCount);

    return {
      totalProcurements,
      activeSources,
      runsLast24h,
      lastPublishedAt: latest?.publishedAt ?? null,
      bySource: sourcesSummary.map((item) => ({
        source: item.source,
        count: item.procurementCount
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
