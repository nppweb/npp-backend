import { describe, expect, it, vi } from "vitest";
import { DashboardService } from "./dashboard.service";

describe("DashboardService", () => {
  it("aggregates dashboard cards, charts and recent activity", async () => {
    const prisma = {
      auctionItem: {
        count: vi.fn().mockResolvedValue(3)
      },
      registryRecord: {
        count: vi.fn().mockResolvedValue(5)
      },
      supplierRiskSignal: {
        count: vi.fn().mockResolvedValue(2)
      },
      supplierCompanyProfile: {
        count: vi.fn().mockResolvedValue(7)
      },
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
              description: "real-source",
              customerName: "ГУП Технопарк",
              amount: 120000,
              currency: "RUB",
              publishedAt: new Date("2026-03-30T10:15:00.000Z"),
              deadlineAt: null,
              status: "ACTIVE",
              sourceUrl: "https://example.test/1",
              createdAt: new Date("2026-03-30T10:16:00.000Z"),
              updatedAt: new Date("2026-03-30T10:17:00.000Z"),
              rawPayload: { seed: true },
              source: { code: "eis" },
              supplier: { name: "Supplier One" }
            }
          ])
      },
      source: {
        count: vi.fn().mockResolvedValue(3),
        findMany: vi.fn().mockResolvedValue([
          {
            code: "easuz",
            name: "ЕАСУЗ Московской области",
            kind: "EASUZ",
            isActive: true,
            runs: [{ startedAt: new Date("2026-03-29T06:00:00.000Z") }],
            _count: {
              procurements: 4,
              auctions: 0,
              registryEntries: 0,
              supplierRiskSignals: 0,
              supplierCompanyProfiles: 0,
              runs: 2
            }
          },
          {
            code: "eis",
            name: "ЕИС / zakupki.gov.ru",
            kind: "EIS",
            isActive: true,
            runs: [{ startedAt: new Date("2026-03-30T09:00:00.000Z") }],
            _count: {
              procurements: 11,
              auctions: 3,
              registryEntries: 5,
              supplierRiskSignals: 2,
              supplierCompanyProfiles: 7,
              runs: 5
            }
          }
        ])
      },
      sourceRun: {
        count: vi.fn().mockResolvedValue(9),
        findMany: vi.fn().mockResolvedValue([
          {
            id: "run-1",
            runKey: "eis:2026-03-30T09:00:00Z",
            status: "SUCCESS",
            startedAt: new Date("2026-03-30T09:00:00.000Z"),
            finishedAt: new Date("2026-03-30T09:05:00.000Z"),
            itemsDiscovered: 10,
            itemsPublished: 8,
            itemsFailed: 2,
            errorMessage: null,
            source: { code: "eis" }
          }
        ])
      }
    };

    const configService = {
      get: vi.fn().mockReturnValue([])
    };

    const service = new DashboardService(prisma as never, configService as never);

    const summary = await service.summary();

    expect(summary).toMatchObject({
      totalRecords: 41,
      totalProcurements: 24,
      activeSources: 3,
      runsLast24h: 9,
      lastPublishedAt: new Date("2026-03-30T09:15:00.000Z"),
      bySource: [
        { source: "eis", count: 28 },
        { source: "easuz", count: 4 }
      ],
      procurementsByStatus: [
        { status: "ACTIVE", count: 11 },
        { status: "CLOSED", count: 7 }
      ],
      recentProcurements: [
        expect.objectContaining({
          id: "proc-1",
          source: "eis",
          supplier: "Supplier One"
        })
      ],
      sourcesSummary: [
        expect.objectContaining({
          source: "eis",
          procurementCount: 11,
          recordCount: 28,
          runCount: 5
        }),
        expect.objectContaining({
          source: "easuz",
          procurementCount: 4,
          recordCount: 4,
          runCount: 2
        })
      ],
      recentSourceRuns: [
        expect.objectContaining({
          id: "run-1",
          sourceCode: "eis",
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
            auctions: true,
            registryEntries: true,
            supplierRiskSignals: true,
            supplierCompanyProfiles: true,
            runs: true
          }
        }
      }
    });
  });
});
