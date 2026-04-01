import { describe, expect, it, vi } from "vitest";
import { DashboardService } from "./dashboard.service";

describe("DashboardService", () => {
  it("aggregates dashboard cards, charts and recent activity", async () => {
    const prisma = {
      procurement: {
        count: vi.fn().mockResolvedValue(24),
        findFirst: vi.fn().mockResolvedValue({ publishedAt: new Date("2026-03-30T09:15:00.000Z") }),
        groupBy: vi.fn().mockResolvedValue([
          { status: "ACTIVE", _count: { _all: 11 } },
          { status: "CLOSED", _count: { _all: 7 } }
        ]),
        findMany: vi
          .fn()
          .mockResolvedValueOnce([
            { publishedAt: new Date("2026-03-29T09:15:00.000Z") },
            { publishedAt: new Date("2026-03-29T12:30:00.000Z") },
            { publishedAt: new Date("2026-03-30T10:15:00.000Z") }
          ])
          .mockResolvedValueOnce([
            {
              id: "proc-1",
              externalId: "EXT-1",
              title: "Recent Procurement",
              description: "demo",
              customerName: "Demo Customer",
              amount: 120000,
              currency: "RUB",
              publishedAt: new Date("2026-03-30T10:15:00.000Z"),
              deadlineAt: null,
              status: "ACTIVE",
              sourceUrl: "https://example.test/1",
              createdAt: new Date("2026-03-30T10:16:00.000Z"),
              updatedAt: new Date("2026-03-30T10:17:00.000Z"),
              rawPayload: { seed: true },
              source: { code: "find-tender" },
              supplier: { name: "Supplier One" }
            }
          ])
      },
      source: {
        count: vi.fn().mockResolvedValue(3),
        findMany: vi.fn().mockResolvedValue([
          {
            code: "demo",
            name: "Demo Source",
            kind: "DEMO",
            isActive: true,
            runs: [{ startedAt: new Date("2026-03-29T06:00:00.000Z") }],
            _count: { procurements: 4, runs: 2 }
          },
          {
            code: "find-tender",
            name: "Find a Tender",
            kind: "FIND_TENDER",
            isActive: true,
            runs: [{ startedAt: new Date("2026-03-30T09:00:00.000Z") }],
            _count: { procurements: 11, runs: 5 }
          }
        ])
      },
      sourceRun: {
        count: vi.fn().mockResolvedValue(9),
        findMany: vi.fn().mockResolvedValue([
          {
            id: "run-1",
            runKey: "find-tender:2026-03-30T09:00:00Z",
            status: "SUCCESS",
            startedAt: new Date("2026-03-30T09:00:00.000Z"),
            finishedAt: new Date("2026-03-30T09:05:00.000Z"),
            itemsDiscovered: 10,
            itemsPublished: 8,
            itemsFailed: 2,
            errorMessage: null,
            source: { code: "find-tender" }
          }
        ])
      }
    };

    const service = new DashboardService(prisma as never);

    const summary = await service.summary();

    expect(summary).toMatchObject({
      totalProcurements: 24,
      activeSources: 3,
      runsLast24h: 9,
      lastPublishedAt: new Date("2026-03-30T09:15:00.000Z"),
      bySource: [
        { source: "find-tender", count: 11 },
        { source: "demo", count: 4 }
      ],
      procurementsByStatus: [
        { status: "ACTIVE", count: 11 },
        { status: "CLOSED", count: 7 }
      ],
      recentProcurements: [
        expect.objectContaining({
          id: "proc-1",
          source: "find-tender",
          supplier: "Supplier One"
        })
      ],
      sourcesSummary: [
        expect.objectContaining({
          source: "find-tender",
          procurementCount: 11,
          runCount: 5
        }),
        expect.objectContaining({
          source: "demo",
          procurementCount: 4,
          runCount: 2
        })
      ],
      recentSourceRuns: [
        expect.objectContaining({
          id: "run-1",
          sourceCode: "find-tender",
          itemsPublished: 8
        })
      ]
    });

    expect(summary.procurementsOverTime).toEqual(
      expect.arrayContaining([
        { date: "2026-03-29", count: 2 },
        { date: "2026-03-30", count: 1 }
      ])
    );
    expect(prisma.source.findMany).toHaveBeenCalledWith({
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
    });
  });
});
