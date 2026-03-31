import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async summary() {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [totalProcurements, activeSources, runsLast24h, latest, sources] =
      await this.prisma.$transaction([
        this.prisma.procurement.count({ where: { deletedAt: null } }),
        this.prisma.source.count({ where: { deletedAt: null, isActive: true } }),
        this.prisma.sourceRun.count({ where: { startedAt: { gte: since } } }),
        this.prisma.procurement.findFirst({
          where: { deletedAt: null },
          orderBy: { publishedAt: "desc" },
          select: { publishedAt: true }
        }),
        this.prisma.source.findMany({
          where: { deletedAt: null },
          select: {
            code: true,
            _count: {
              select: {
                procurements: {
                  where: { deletedAt: null }
                }
              }
            }
          }
        })
      ]);

    return {
      totalProcurements,
      activeSources,
      runsLast24h,
      lastPublishedAt: latest?.publishedAt ?? null,
      bySource: sources
        .map((item) => ({
          source: item.code,
          count: item._count.procurements
        }))
        .sort((left, right) => right.count - left.count)
    };
  }
}
