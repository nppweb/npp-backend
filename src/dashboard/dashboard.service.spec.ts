import { describe, expect, it, vi } from "vitest";
import { DashboardService } from "./dashboard.service";

describe("DashboardService", () => {
  it("aggregates summary data and sorts sources by procurement volume", async () => {
    const prisma = {
      $transaction: vi.fn(async (operations: Array<Promise<unknown>>) => Promise.all(operations)),
      procurement: {
        count: vi.fn().mockResolvedValue(24),
        findFirst: vi.fn().mockResolvedValue({ publishedAt: new Date("2026-03-30T09:15:00.000Z") })
      },
      source: {
        count: vi.fn().mockResolvedValue(3),
        findMany: vi.fn().mockResolvedValue([
          { code: "demo", _count: { procurements: 4 } },
          { code: "find-tender", _count: { procurements: 11 } }
        ])
      },
      sourceRun: {
        count: vi.fn().mockResolvedValue(9)
      }
    };

    const service = new DashboardService(prisma as never);

    await expect(service.summary()).resolves.toEqual({
      totalProcurements: 24,
      activeSources: 3,
      runsLast24h: 9,
      lastPublishedAt: new Date("2026-03-30T09:15:00.000Z"),
      bySource: [
        { source: "find-tender", count: 11 },
        { source: "demo", count: 4 }
      ]
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.source.findMany).toHaveBeenCalledWith({
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
    });
  });
});
