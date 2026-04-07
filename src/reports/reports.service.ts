import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit
} from "@nestjs/common";
import { Prisma, ProcurementStatus, ReportStatus, SourceRunStatus, UserRole } from "@prisma/client";
import { AnalyticsService } from "../analytics/analytics.service";
import {
  getSourceSpecificData,
  NPP_SOURCE_CODES,
  NPP_STATION_NAMES,
  resolveNppStationName
} from "../common/npp-stations";
import { isMeaningfulSupplierName, normalizeSupplierName } from "../common/supplier-hygiene";
import { DashboardService } from "../dashboard/dashboard.service";
import { PrismaService } from "../prisma/prisma.service";

type ReportRecord = {
  id: string;
  name: string;
  description: string | null;
  status: ReportStatus;
  query: unknown | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
};

type ProblematicRun = {
  id: string;
  runKey: string;
  status: SourceRunStatus;
  startedAt: Date;
  finishedAt: Date | null;
  itemsDiscovered: number;
  itemsPublished: number;
  itemsFailed: number;
  errorMessage: string | null;
  sourceCode: string;
};

type LiveProcurementSignal = {
  id: string;
  externalId: string;
  title: string;
  status: string;
  amount: number | null;
  currency: string | null;
  deadlineAt: Date | null;
  publishedAt: Date | null;
  customerName: string | null;
  sourceCode: string;
  sourceName: string;
  supplierName: string | null;
};

type ReportDefinition = {
  type: string;
  title: string;
  description: string;
  cadenceHours: number;
};

type StoredReportSnapshot = {
  generatedAt: string;
  metrics: ReturnType<ReportsService["buildDailyOverviewMetrics"]>;
  highlights: ReturnType<ReportsService["buildDailyOverviewHighlights"]>;
  scores: ReturnType<ReportsService["buildDailyOverviewScores"]>;
  actions: ReturnType<ReportsService["buildDailyOverviewActions"]>;
  deadlinePressure: Awaited<ReturnType<AnalyticsService["summary"]>>["deadlinePressure"];
  statusMix: ReturnType<ReportsService["buildStatusMix"]>;
  amountDistribution: ReturnType<ReportsService["buildAmountDistribution"]>;
  customerExposure: ReturnType<ReportsService["buildCustomerExposure"]>;
  sourceContribution: ReturnType<ReportsService["buildSourceContribution"]>;
  sourceHealth: Array<{
    source: string;
    name: string;
    kind: string;
    isActive: boolean;
    lastRunAt?: string | null;
    lastRunStatus?: string | null;
    successRate: number;
    publicationRate: number;
    failedRuns: number;
    hoursSinceLastRun?: number | null;
    riskLevel: string;
  }>;
  supplierExposure: Awaited<ReturnType<AnalyticsService["summary"]>>["supplierExposure"];
  supplierDueDiligence: Array<{
    supplier: string;
    taxId?: string;
    ogrn?: string;
    procurementCount: number;
    activeProcurements: number;
    totalAmount: number;
    lastProcurementAt?: string | null;
    companyStatus?: string;
    registrationDate?: string | null;
    region?: string;
    okved?: string;
    liquidationMark?: boolean | null;
    riskSignalsCount: number;
    activeRiskSignalsCount: number;
    rnpEntriesCount: number;
    activeRnpEntriesCount: number;
    latestRiskAt?: string | null;
    integrityScore: number;
    flags: string[];
  }>;
  nppStationOrders: Array<{
    station: string;
    procurementCount: number;
    contractCount: number;
    totalAmount: number;
    firstPublishedAt?: string | null;
    lastPublishedAt?: string | null;
    orders: Array<{
      procurementId: string;
      externalId: string;
      title: string;
      customer?: string | null;
      supplier?: string | null;
      source: string;
      amount?: number | null;
      currency?: string | null;
      status: string;
      publishedAt?: string | null;
      sourceUrl?: string | null;
    }>;
  }>;
  recentSourceRuns: Array<{
    id: string;
    runKey: string;
    sourceCode: string;
    status: SourceRunStatus;
    startedAt: string;
    finishedAt?: string | null;
    itemsDiscovered: number;
    itemsPublished: number;
    itemsFailed: number;
    errorMessage?: string | null;
  }>;
  recentProcurements: Array<{
    id: string;
    externalId: string;
    source: string;
    title: string;
    description?: string | null;
    customer?: string | null;
    supplier?: string | null;
    amount?: number | null;
    currency?: string | null;
    status: string;
    publishedAt?: string | null;
    deadlineAt?: string | null;
    sourceUrl?: string | null;
    createdAt?: string;
    updatedAt?: string;
    rawPayload?: unknown;
  }>;
};

const REPORT_TYPE_LABELS: Record<string, string> = {
  "daily-overview": "Аналитическая сводка по закупкам",
  "supplier-risk": "Риски и концентрация поставщиков",
  "supplier-due-diligence": "Проверка благонадёжности поставщиков",
  "npp-station-orders": "Закупочная активность АЭС",
  "pipeline-incident": "Стабильность парсеров и публикации"
};

const REPORT_TEMPLATES: ReportDefinition[] = [
  {
    type: "daily-overview",
    title: "Аналитическая сводка по закупкам",
    description: "Сводный отчет по объёму закупок, срокам, публикациям и актуальности данных.",
    cadenceHours: 12
  },
  {
    type: "supplier-risk",
    title: "Риски и концентрация поставщиков",
    description: "Отчет по концентрации, контрагентским сигналам и закупкам, требующим внимания.",
    cadenceHours: 24
  },
  {
    type: "supplier-due-diligence",
    title: "Проверка благонадёжности поставщиков",
    description: "Проверка поставщиков по ФНС, Федресурсу, РНП и собственной закупочной активности.",
    cadenceHours: 24
  },
  {
    type: "npp-station-orders",
    title: "Закупочная активность АЭС",
    description: "Отчет по станциям: какие закупки и договоры публиковались, где и в какой период.",
    cadenceHours: 12
  },
  {
    type: "pipeline-incident",
    title: "Стабильность парсеров и публикации",
    description: "Контроль проблемных запусков, потерь публикации и деградации источников.",
    cadenceHours: 6
  }
];

const ROLE_REPORT_TYPES: Record<UserRole, string[]> = {
  USER: [],
  ANALYST: ["daily-overview", "supplier-risk", "supplier-due-diligence", "npp-station-orders"],
  DEVELOPER: ["pipeline-incident"],
  ADMIN: ["daily-overview", "supplier-risk", "supplier-due-diligence", "npp-station-orders"]
};

const DAY_MS = 24 * 60 * 60 * 1000;
const NPP_PERIOD_START = new Date("2025-01-01T00:00:00+03:00");

@Injectable()
export class ReportsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReportsService.name);
  private generationTimer: NodeJS.Timeout | null = null;
  private generationInProgress = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly dashboardService: DashboardService,
    private readonly analyticsService: AnalyticsService
  ) {}

  onModuleInit() {
    void this.generateScheduledReportsIfDue();
    this.generationTimer = setInterval(() => {
      void this.generateScheduledReportsIfDue();
    }, 5 * 60 * 1000);
  }

  onModuleDestroy() {
    if (this.generationTimer) {
      clearInterval(this.generationTimer);
      this.generationTimer = null;
    }
  }

  async listReports(viewerRole: UserRole) {
    await this.generateScheduledReportsIfDue();
    const allowedTypes = new Set(this.getAllowedReportTypes(viewerRole));

    const reports = await this.prisma.report.findMany({
      where: { deletedAt: null },
      orderBy: [{ createdAt: "desc" }]
    });

    return reports
      .filter((report) => allowedTypes.has(this.getReportType(report)))
      .map((report) => this.toSummary(report));
  }

  async refreshReports(viewerRole: UserRole, requestedTypes?: string[]) {
    const templates = this.resolveTemplatesForRole(viewerRole, requestedTypes);

    if (templates.length === 0) {
      throw new ForbiddenException("Для текущей роли нет доступных сценариев отчётности");
    }

    await this.generateReports(templates, "manual");

    return this.listReports(viewerRole);
  }

  async getReportDetail(viewerRole: UserRole, id: string) {
    const report = await this.prisma.report.findFirst({
      where: {
        id,
        deletedAt: null
      }
    });

    if (!report) {
      throw new NotFoundException("Отчёт не найден");
    }

    if (!this.isReportTypeAllowed(viewerRole, this.getReportType(report))) {
      throw new ForbiddenException("Отчёт недоступен для текущей роли");
    }

    const storedSnapshot = this.readStoredSnapshot(report);

    if (storedSnapshot) {
      return this.hydrateStoredDetail(report, storedSnapshot);
    }

    return this.buildLiveReportDetail(report);
  }

  async archiveReport(viewerRole: UserRole, id: string) {
    if (viewerRole !== UserRole.ADMIN) {
      throw new ForbiddenException("Архивирование отчётов доступно только администратору");
    }

    const report = await this.prisma.report.findFirst({
      where: {
        id,
        deletedAt: null
      }
    });

    if (!report) {
      throw new NotFoundException("Отчёт не найден");
    }

    await this.prisma.report.update({
      where: { id },
      data: {
        deletedAt: new Date()
      }
    });

    return true;
  }

  private async generateScheduledReportsIfDue() {
    if (this.generationInProgress) {
      return;
    }

    this.generationInProgress = true;

    try {
      const existingReports = await this.prisma.report.findMany({
        where: { deletedAt: null },
        orderBy: [{ createdAt: "desc" }]
      });
      const reportsByType = new Map<string, ReportRecord>();

      for (const report of existingReports) {
        const reportType = this.getReportType(report);

        if (!reportsByType.has(reportType)) {
          reportsByType.set(reportType, report);
        }
      }

      const dueTemplates = REPORT_TEMPLATES.filter((template) => {
        const lastReport = reportsByType.get(template.type);

        if (!lastReport) {
          return true;
        }

        return Date.now() - lastReport.createdAt.getTime() >= template.cadenceHours * 60 * 60 * 1000;
      });

      if (dueTemplates.length === 0) {
        return;
      }

      await this.generateReports(dueTemplates, "schedule");
    } catch (error) {
      this.logger.error("Automatic report generation failed", error instanceof Error ? error.stack : undefined);
    } finally {
      this.generationInProgress = false;
    }
  }

  private async generateReports(templates: ReportDefinition[], mode: "schedule" | "manual") {
    for (const template of templates) {
      await this.generateReportInstance(template, mode);
    }
  }

  private resolveTemplatesForRole(viewerRole: UserRole, requestedTypes?: string[]) {
    const allowedTypes = new Set(this.getAllowedReportTypes(viewerRole));
    const filteredRequestedTypes = (requestedTypes ?? []).filter((type) => allowedTypes.has(type));
    const targetTypes = filteredRequestedTypes.length > 0 ? filteredRequestedTypes : [...allowedTypes];

    return REPORT_TEMPLATES.filter((template) => targetTypes.includes(template.type));
  }

  private getAllowedReportTypes(viewerRole: UserRole) {
    return ROLE_REPORT_TYPES[viewerRole] ?? [];
  }

  private isReportTypeAllowed(viewerRole: UserRole, reportType: string) {
    return this.getAllowedReportTypes(viewerRole).includes(reportType);
  }

  private async generateReportInstance(
    template: ReportDefinition,
    mode: "schedule" | "manual"
  ) {
    const liveDetail = await this.buildLiveReportDetailSnapshot(template.type, new Date());
    const snapshot = this.serializeSnapshot(liveDetail) as Prisma.InputJsonValue;

    return this.prisma.report.create({
      data: {
        name: this.buildReportInstanceName(template.title, liveDetail.generatedAt),
        description: template.description,
        status: liveDetail.status,
        metadata: {
          type: template.type,
          cadenceHours: template.cadenceHours,
          generatedBy: mode,
          generatedAt: liveDetail.generatedAt.toISOString()
        },
        query: snapshot
      }
    });
  }

  private buildReportInstanceName(title: string, generatedAt: Date) {
    return `${title} · ${generatedAt.toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    })}`;
  }

  private readStoredSnapshot(report: ReportRecord) {
    if (!report.query || typeof report.query !== "object" || Array.isArray(report.query)) {
      return null;
    }

    return report.query as StoredReportSnapshot;
  }

  private hydrateStoredDetail(report: ReportRecord, snapshot: StoredReportSnapshot) {
    const generatedAt = new Date(snapshot.generatedAt);
    const metrics = Array.isArray(snapshot.metrics) ? snapshot.metrics : [];
    const highlights = Array.isArray(snapshot.highlights) ? snapshot.highlights : [];
    const scores = Array.isArray(snapshot.scores) ? snapshot.scores : [];
    const actions = Array.isArray(snapshot.actions) ? snapshot.actions : [];
    const deadlinePressure = Array.isArray(snapshot.deadlinePressure) ? snapshot.deadlinePressure : [];
    const statusMix = Array.isArray(snapshot.statusMix) ? snapshot.statusMix : [];
    const amountDistribution = Array.isArray(snapshot.amountDistribution) ? snapshot.amountDistribution : [];
    const customerExposure = Array.isArray(snapshot.customerExposure) ? snapshot.customerExposure : [];
    const sourceContribution = Array.isArray(snapshot.sourceContribution) ? snapshot.sourceContribution : [];
    const sourceHealth = Array.isArray(snapshot.sourceHealth) ? snapshot.sourceHealth : [];
    const supplierExposure = Array.isArray(snapshot.supplierExposure) ? snapshot.supplierExposure : [];
    const supplierDueDiligence = Array.isArray(snapshot.supplierDueDiligence)
      ? snapshot.supplierDueDiligence
      : [];
    const nppStationOrders = Array.isArray(snapshot.nppStationOrders) ? snapshot.nppStationOrders : [];
    const recentSourceRuns = Array.isArray(snapshot.recentSourceRuns) ? snapshot.recentSourceRuns : [];
    const recentProcurements = Array.isArray(snapshot.recentProcurements) ? snapshot.recentProcurements : [];

    return {
      ...this.toSummary(report),
      generatedAt,
      metrics,
      highlights,
      scores,
      actions,
      deadlinePressure,
      statusMix,
      amountDistribution,
      customerExposure,
      sourceContribution,
      sourceHealth: sourceHealth.map((item) => ({
        ...item,
        lastRunAt: item.lastRunAt ? new Date(item.lastRunAt) : null
      })),
      supplierExposure,
      supplierDueDiligence: supplierDueDiligence.map((item) => ({
        ...item,
        lastProcurementAt: item.lastProcurementAt ? new Date(item.lastProcurementAt) : null,
        registrationDate: item.registrationDate ? new Date(item.registrationDate) : null,
        latestRiskAt: item.latestRiskAt ? new Date(item.latestRiskAt) : null,
        flags: Array.isArray(item.flags) ? item.flags : []
      })),
      nppStationOrders: nppStationOrders.map((item) => ({
        ...item,
        firstPublishedAt: item.firstPublishedAt ? new Date(item.firstPublishedAt) : null,
        lastPublishedAt: item.lastPublishedAt ? new Date(item.lastPublishedAt) : null,
        orders: (Array.isArray(item.orders) ? item.orders : []).map((order) => ({
          ...order,
          publishedAt: order.publishedAt ? new Date(order.publishedAt) : null
        }))
      })),
      recentSourceRuns: recentSourceRuns.map((item) => ({
        ...item,
        startedAt: new Date(item.startedAt),
        finishedAt: item.finishedAt ? new Date(item.finishedAt) : null
      })),
      recentProcurements: recentProcurements.map((item) => ({
        ...item,
        publishedAt: item.publishedAt ? new Date(item.publishedAt) : null,
        deadlineAt: item.deadlineAt ? new Date(item.deadlineAt) : null,
        createdAt: item.createdAt
          ? new Date(item.createdAt)
          : item.publishedAt
            ? new Date(item.publishedAt)
            : generatedAt,
        updatedAt: item.updatedAt
          ? new Date(item.updatedAt)
          : item.createdAt
            ? new Date(item.createdAt)
            : item.publishedAt
              ? new Date(item.publishedAt)
              : generatedAt
      }))
    };
  }

  private serializeSnapshot(
    detail: Awaited<ReturnType<ReportsService["buildLiveReportDetailSnapshot"]>>
  ): StoredReportSnapshot {
    return {
      generatedAt: detail.generatedAt.toISOString(),
      metrics: detail.metrics,
      highlights: detail.highlights,
      scores: detail.scores,
      actions: detail.actions,
      deadlinePressure: detail.deadlinePressure,
      statusMix: detail.statusMix,
      amountDistribution: detail.amountDistribution,
      customerExposure: detail.customerExposure,
      sourceContribution: detail.sourceContribution,
      sourceHealth: detail.sourceHealth.map((item) => ({
        ...item,
        lastRunAt: item.lastRunAt ? item.lastRunAt.toISOString() : null
      })),
      supplierExposure: detail.supplierExposure,
      supplierDueDiligence: detail.supplierDueDiligence.map((item) => ({
        ...item,
        lastProcurementAt: item.lastProcurementAt ? item.lastProcurementAt.toISOString() : null,
        registrationDate: item.registrationDate ? item.registrationDate.toISOString() : null,
        latestRiskAt: item.latestRiskAt ? item.latestRiskAt.toISOString() : null
      })),
      nppStationOrders: detail.nppStationOrders.map((item) => ({
        ...item,
        firstPublishedAt: item.firstPublishedAt ? item.firstPublishedAt.toISOString() : null,
        lastPublishedAt: item.lastPublishedAt ? item.lastPublishedAt.toISOString() : null,
        orders: item.orders.map((order) => ({
          ...order,
          publishedAt: order.publishedAt ? order.publishedAt.toISOString() : null
        }))
      })),
      recentSourceRuns: detail.recentSourceRuns.map((item) => ({
        ...item,
        startedAt: item.startedAt.toISOString(),
        finishedAt: item.finishedAt ? item.finishedAt.toISOString() : null
      })),
      recentProcurements: detail.recentProcurements.map((item) => ({
        ...item,
        publishedAt: item.publishedAt ? item.publishedAt.toISOString() : null,
        deadlineAt: item.deadlineAt ? item.deadlineAt.toISOString() : null,
        createdAt: item.createdAt ? item.createdAt.toISOString() : undefined,
        updatedAt: item.updatedAt ? item.updatedAt.toISOString() : undefined
      }))
    };
  }

  private async buildLiveReportDetail(report: ReportRecord) {
    const liveDetail = await this.buildLiveReportDetailSnapshot(this.getReportType(report), report.updatedAt);

    return {
      ...this.toSummary(report, liveDetail.status, liveDetail.generatedAt),
      generatedAt: liveDetail.generatedAt,
      metrics: liveDetail.metrics,
      highlights: liveDetail.highlights,
      scores: liveDetail.scores,
      actions: liveDetail.actions,
      deadlinePressure: liveDetail.deadlinePressure,
      statusMix: liveDetail.statusMix,
      amountDistribution: liveDetail.amountDistribution,
      customerExposure: liveDetail.customerExposure,
      sourceContribution: liveDetail.sourceContribution,
      sourceHealth: liveDetail.sourceHealth,
      supplierExposure: liveDetail.supplierExposure,
      supplierDueDiligence: liveDetail.supplierDueDiligence,
      nppStationOrders: liveDetail.nppStationOrders,
      recentSourceRuns: liveDetail.recentSourceRuns,
      recentProcurements: liveDetail.recentProcurements
    };
  }

  private async buildLiveReportDetailSnapshot(reportType: string, fallbackDate: Date) {
    const [dashboard, analytics, problematicRuns, procurementSignals] = await Promise.all([
      this.dashboardService.summary(),
      this.analyticsService.summary(),
      this.prisma.sourceRun.findMany({
        where: {
          source: { deletedAt: null },
          OR: [{ status: SourceRunStatus.FAILED }, { status: SourceRunStatus.PARTIAL }]
        },
        include: { source: true },
        orderBy: { startedAt: "desc" },
        take: 8
      }),
      this.prisma.procurement.findMany({
        where: {
          deletedAt: null,
          source: { deletedAt: null }
        },
        select: {
          id: true,
          externalId: true,
          title: true,
          status: true,
          amount: true,
          currency: true,
          deadlineAt: true,
          publishedAt: true,
          customerName: true,
          source: {
            select: {
              code: true,
              name: true
            }
          },
          supplier: {
            select: {
              name: true
            }
          }
        }
      })
    ]);

    const recentProblematicRuns = problematicRuns.map((run) => ({
      ...run,
      sourceCode: run.source.code
    }));
    const liveProcurements = procurementSignals.map((item) => ({
      id: item.id,
      externalId: item.externalId,
      title: item.title,
      status: item.status,
      amount: item.amount,
      currency: item.currency,
      deadlineAt: item.deadlineAt,
      publishedAt: item.publishedAt,
      customerName: item.customerName,
      sourceCode: item.source.code,
      sourceName: item.source.name,
      supplierName: item.supplier?.name ?? null
    }));
    const statusMix = this.buildStatusMix(liveProcurements);
    const amountDistribution = this.buildAmountDistribution(liveProcurements);
    const customerExposure = this.buildCustomerExposure(liveProcurements);
    const sourceContribution = this.buildSourceContribution(liveProcurements);
    const liveStatus = this.resolveReportStatus(reportType, dashboard, analytics, recentProblematicRuns.length);
    const generatedAt = this.resolveReportGeneratedAt(reportType, fallbackDate, dashboard, analytics);

    switch (reportType) {
      case "supplier-risk":
        return {
          status: liveStatus,
          generatedAt,
          metrics: this.buildSupplierRiskMetrics(analytics),
          highlights: this.buildSupplierRiskHighlights(analytics),
          scores: this.buildSupplierRiskScores(analytics, liveProcurements),
          actions: this.buildSupplierRiskActions(analytics, customerExposure),
          deadlinePressure: analytics.deadlinePressure,
          statusMix,
          amountDistribution,
          customerExposure,
          sourceContribution,
          sourceHealth: analytics.sourceHealth.filter((item) => item.riskLevel !== "STABLE"),
          supplierExposure: analytics.supplierExposure,
          supplierDueDiligence: [],
          nppStationOrders: [],
          recentSourceRuns: recentProblematicRuns,
          recentProcurements: this.selectLargestProcurements(analytics.attentionProcurements)
        };
      case "supplier-due-diligence": {
        const supplierDueDiligence = await this.buildSupplierDueDiligenceItems();

        return {
          status: liveStatus,
          generatedAt,
          metrics: this.buildSupplierDueDiligenceMetrics(supplierDueDiligence),
          highlights: this.buildSupplierDueDiligenceHighlights(supplierDueDiligence),
          scores: this.buildSupplierDueDiligenceScores(supplierDueDiligence),
          actions: this.buildSupplierDueDiligenceActions(supplierDueDiligence),
          deadlinePressure: analytics.deadlinePressure,
          statusMix,
          amountDistribution,
          customerExposure,
          sourceContribution,
          sourceHealth: analytics.sourceHealth.filter((item) => item.riskLevel !== "STABLE"),
          supplierExposure: analytics.supplierExposure,
          supplierDueDiligence,
          nppStationOrders: [],
          recentSourceRuns: recentProblematicRuns,
          recentProcurements: this.selectLargestProcurements(analytics.attentionProcurements)
        };
      }
      case "npp-station-orders": {
        const nppStationOrders = await this.buildNppStationOrderItems();
        const nppProcurementSignals = nppStationOrders.flatMap((station) =>
          station.orders.map((order) => ({
            id: order.procurementId,
            externalId: order.externalId,
            title: order.title,
            status: order.status,
            amount: order.amount ?? null,
            currency: order.currency ?? null,
            deadlineAt: null,
            publishedAt: order.publishedAt ?? null,
            customerName: order.customer ?? null,
            sourceCode: order.source,
            sourceName: order.source,
            supplierName: order.supplier ?? null
          }))
        );

        return {
          status: liveStatus,
          generatedAt,
          metrics: this.buildNppStationOrderMetrics(nppStationOrders),
          highlights: this.buildNppStationOrderHighlights(nppStationOrders),
          scores: this.buildNppStationOrderScores(nppStationOrders),
          actions: this.buildNppStationOrderActions(nppStationOrders),
          deadlinePressure: analytics.deadlinePressure,
          statusMix: this.buildStatusMix(nppProcurementSignals),
          amountDistribution: this.buildAmountDistribution(nppProcurementSignals),
          customerExposure: this.buildCustomerExposure(nppProcurementSignals),
          sourceContribution: this.buildSourceContribution(nppProcurementSignals),
          sourceHealth: analytics.sourceHealth.filter((item) =>
            (NPP_SOURCE_CODES as readonly string[]).includes(item.source)
          ),
          supplierExposure: analytics.supplierExposure,
          supplierDueDiligence: [],
          nppStationOrders,
          recentSourceRuns: recentProblematicRuns.filter((run) =>
            (NPP_SOURCE_CODES as readonly string[]).includes(run.sourceCode)
          ),
          recentProcurements: nppStationOrders.flatMap((station) =>
            station.orders.map((order) => ({
              id: order.procurementId,
              externalId: order.externalId,
              source: order.source,
              title: order.title,
              description: undefined,
              customer: order.customer ?? undefined,
              supplier: order.supplier ?? undefined,
              amount: order.amount ?? undefined,
              currency: order.currency ?? undefined,
              status: order.status as ProcurementStatus,
              publishedAt: order.publishedAt ?? undefined,
              deadlineAt: undefined,
              sourceUrl: order.sourceUrl ?? undefined,
              createdAt: order.publishedAt ?? generatedAt,
              updatedAt: order.publishedAt ?? generatedAt,
              rawPayload: { sourceSpecificData: { targetStationName: station.station } }
            }))
          ).slice(0, 12)
        };
      }
      case "pipeline-incident":
        return {
          status: liveStatus,
          generatedAt,
          metrics: this.buildPipelineMetrics(analytics, recentProblematicRuns),
          highlights: this.buildPipelineHighlights(analytics, recentProblematicRuns),
          scores: this.buildPipelineScores(analytics, recentProblematicRuns, liveProcurements),
          actions: this.buildPipelineActions(analytics, recentProblematicRuns),
          deadlinePressure: analytics.deadlinePressure,
          statusMix,
          amountDistribution,
          customerExposure,
          sourceContribution,
          sourceHealth: analytics.sourceHealth.filter((item) => item.riskLevel !== "STABLE"),
          supplierExposure: analytics.supplierExposure.slice(0, 3),
          supplierDueDiligence: [],
          nppStationOrders: [],
          recentSourceRuns: recentProblematicRuns,
          recentProcurements: analytics.attentionProcurements.slice(0, 4)
        };
      case "daily-overview":
      default:
        return {
          status: liveStatus,
          generatedAt,
          metrics: this.buildDailyOverviewMetrics(dashboard, analytics),
          highlights: this.buildDailyOverviewHighlights(dashboard, analytics),
          scores: this.buildDailyOverviewScores(dashboard, analytics, liveProcurements),
          actions: this.buildDailyOverviewActions(analytics, customerExposure),
          deadlinePressure: analytics.deadlinePressure,
          statusMix,
          amountDistribution,
          customerExposure,
          sourceContribution,
          sourceHealth: analytics.sourceHealth,
          supplierExposure: analytics.supplierExposure,
          supplierDueDiligence: [],
          nppStationOrders: [],
          recentSourceRuns: dashboard.recentSourceRuns,
          recentProcurements: this.selectLargestProcurements(dashboard.recentProcurements)
        };
    }
  }

  private toSummary(report: ReportRecord, status = report.status, updatedAt = report.updatedAt) {
    return {
      id: report.id,
      name: report.name,
      description: report.description ?? undefined,
      status,
      reportType: this.getReportType(report),
      createdAt: report.createdAt,
      updatedAt
    };
  }

  private getReportType(report: ReportRecord): string {
    const metadata =
      report.metadata && typeof report.metadata === "object" ? (report.metadata as Record<string, unknown>) : {};
    const typeValue = typeof metadata.type === "string" ? metadata.type : "daily-overview";

    return REPORT_TYPE_LABELS[typeValue] ? typeValue : "daily-overview";
  }

  private resolveReportStatus(
    reportType: string,
    dashboard: Awaited<ReturnType<DashboardService["summary"]>>,
    analytics: Awaited<ReturnType<AnalyticsService["summary"]>>,
    problematicRunsCount: number
  ) {
    if (reportType === "pipeline-incident") {
      if (analytics.sourceHealth.length === 0) {
        return ReportStatus.PENDING;
      }

      return problematicRunsCount > 0 || analytics.atRiskSources > 0 ? ReportStatus.FAILED : ReportStatus.READY;
    }

    if (reportType === "supplier-risk") {
      const hasSupplierRiskData =
        analytics.supplierExposure.length > 0 ||
        analytics.riskSignalsLast30d > 0 ||
        analytics.attentionProcurements.length > 0 ||
        dashboard.totalProcurements > 0;

      return hasSupplierRiskData ? ReportStatus.READY : ReportStatus.PENDING;
    }

    if (reportType === "supplier-due-diligence" || reportType === "npp-station-orders") {
      return dashboard.totalProcurements > 0 ? ReportStatus.READY : ReportStatus.PENDING;
    }

    return dashboard.totalRecords > 0 || dashboard.totalProcurements > 0 ? ReportStatus.READY : ReportStatus.PENDING;
  }

  private resolveReportGeneratedAt(
    reportType: string,
    fallback: Date,
    dashboard: Awaited<ReturnType<DashboardService["summary"]>>,
    analytics: Awaited<ReturnType<AnalyticsService["summary"]>>
  ) {
    const dates = [fallback];

    if (reportType === "daily-overview") {
      dates.push(...dashboard.recentSourceRuns.map((item) => item.startedAt));

      if (dashboard.lastPublishedAt) {
        dates.push(dashboard.lastPublishedAt);
      }
    }

    if (reportType === "supplier-risk") {
      dates.push(
        ...analytics.sourceHealth
          .map((item) => item.lastRunAt)
          .filter((value): value is Date => value instanceof Date)
      );
      dates.push(
        ...analytics.attentionProcurements
          .map((item) => item.publishedAt ?? item.deadlineAt)
          .filter((value): value is Date => value instanceof Date)
      );
    }

    if (reportType === "pipeline-incident") {
      dates.push(
        ...analytics.sourceHealth
          .map((item) => item.lastRunAt)
          .filter((value): value is Date => value instanceof Date)
      );
      dates.push(...dashboard.recentSourceRuns.map((item) => item.startedAt));
    }

    if (reportType === "supplier-due-diligence" || reportType === "npp-station-orders") {
      dates.push(...dashboard.recentSourceRuns.map((item) => item.startedAt));

      if (dashboard.lastPublishedAt) {
        dates.push(dashboard.lastPublishedAt);
      }
    }

    return new Date(Math.max(...dates.map((value) => value.getTime())));
  }

  private buildDailyOverviewMetrics(
    dashboard: Awaited<ReturnType<DashboardService["summary"]>>,
    analytics: Awaited<ReturnType<AnalyticsService["summary"]>>
  ) {
    const activeProcurements =
      dashboard.procurementsByStatus.find((item) => item.status === "ACTIVE")?.count ?? 0;

    return [
      {
        label: "Объекты в базе",
        value: this.formatInteger(dashboard.totalRecords),
        hint: `Закупки: ${this.formatInteger(dashboard.totalProcurements)}`
      },
      {
        label: "Активные закупки",
        value: this.formatInteger(activeProcurements),
        hint: `Срочные: ${this.formatInteger(analytics.closingSoonCount)}`
      },
      {
        label: "Активные источники",
        value: this.formatInteger(dashboard.activeSources),
        hint: `Под риском: ${this.formatInteger(analytics.atRiskSources)}`
      },
      {
        label: "Запуски за 24 часа",
        value: this.formatInteger(dashboard.runsLast24h),
        hint: `Эффективность публикации: ${this.formatPercent(analytics.publicationEfficiency)}`
      }
    ];
  }

  private buildSupplierRiskMetrics(
    analytics: Awaited<ReturnType<AnalyticsService["summary"]>>
  ) {
    const topSupplierShare = analytics.supplierExposure[0]?.sharePercent ?? 0;

    return [
      {
        label: "Риск-сигналы за 30 дней",
        value: this.formatInteger(analytics.riskSignalsLast30d),
        hint: "События риска и негативные сигналы по контрагентам."
      },
      {
        label: "Источники под риском",
        value: this.formatInteger(analytics.atRiskSources),
        hint: `Успешность запусков: ${this.formatPercent(analytics.runSuccessRate)}`
      },
      {
        label: "Просроченные закупки",
        value: this.formatInteger(analytics.overdueCount),
        hint: `Срочных в ближайшие 7 дней: ${this.formatInteger(analytics.closingSoonCount)}`
      },
      {
        label: "Концентрация топ-поставщика",
        value: this.formatPercent(topSupplierShare),
        hint: "Доля крупнейшего поставщика в потоке закупок за 90 дней."
      }
    ];
  }

  private buildPipelineMetrics(
    analytics: Awaited<ReturnType<AnalyticsService["summary"]>>,
    problematicRuns: ProblematicRun[]
  ) {
    const failedRuns = problematicRuns.filter((item) => item.status === SourceRunStatus.FAILED).length;
    const partialRuns = problematicRuns.filter((item) => item.status === SourceRunStatus.PARTIAL).length;

    return [
      {
        label: "Проблемные запуски",
        value: this.formatInteger(problematicRuns.length),
        hint: `Ошибки: ${this.formatInteger(failedRuns)}, частичные: ${this.formatInteger(partialRuns)}`
      },
      {
        label: "Источники под риском",
        value: this.formatInteger(analytics.atRiskSources),
        hint: "Источники, требующие внимания по свежести или качеству данных."
      },
      {
        label: "Успешность запусков",
        value: this.formatPercent(analytics.runSuccessRate),
        hint: "Доля полностью успешных прогонов за последние 30 дней."
      },
      {
        label: "Публикация после сбора",
        value: this.formatPercent(analytics.publicationEfficiency),
        hint: "Сколько собранных элементов дошло до публикации."
      }
    ];
  }

  private buildDailyOverviewHighlights(
    dashboard: Awaited<ReturnType<DashboardService["summary"]>>,
    analytics: Awaited<ReturnType<AnalyticsService["summary"]>>
  ) {
    return [
      {
        title: "Последняя активность",
        description: dashboard.lastPublishedAt
          ? `Последняя публикация зафиксирована ${new Date(dashboard.lastPublishedAt).toLocaleString("ru-RU")}.`
          : "Свежих публикаций пока нет.",
        severity: "info"
      },
      {
        title: "Контур внимания",
        description:
          analytics.overdueCount > 0
            ? `Есть ${this.formatInteger(analytics.overdueCount)} просроченных закупок, их стоит разобрать в первую очередь.`
            : "Просроченных закупок не обнаружено.",
        severity: analytics.overdueCount > 0 ? "warning" : "success"
      },
      {
        title: "Качество потока",
        description:
          analytics.atRiskSources > 0
            ? `${this.formatInteger(analytics.atRiskSources)} источников требуют внимания по свежести или качеству публикации.`
            : "Источники выглядят стабильно, явных проблем не видно.",
        severity: analytics.atRiskSources > 0 ? "warning" : "success"
      }
    ];
  }

  private buildDailyOverviewScores(
    dashboard: Awaited<ReturnType<DashboardService["summary"]>>,
    analytics: Awaited<ReturnType<AnalyticsService["summary"]>>,
    procurements: LiveProcurementSignal[]
  ) {
    const totalProcurements = Math.max(procurements.length, 1);
    const activeCount = procurements.filter((item) => item.status === "ACTIVE").length;
    const amountCoverage =
      procurements.filter((item) => item.amount !== null && item.amount !== undefined).length / totalProcurements;
    const topSupplierShare = analytics.supplierExposure[0]?.sharePercent ?? 0;

    return [
      {
        label: "Операционная устойчивость",
        value: this.clampScore(analytics.runSuccessRate * 0.55 + analytics.publicationEfficiency * 0.45),
        detail: "Комбинация успешности запусков и прохождения данных до публикации.",
        severity: analytics.runSuccessRate < 75 || analytics.publicationEfficiency < 70 ? "warning" : "success"
      },
      {
        label: "Давление по срокам",
        value: this.clampScore(100 - ((analytics.overdueCount + analytics.closingSoonCount) / totalProcurements) * 100),
        detail: "Показывает, насколько портфель закупок зажат дедлайнами и просрочкой.",
        severity: analytics.overdueCount > 0 ? "destructive" : analytics.closingSoonCount > 1 ? "warning" : "success"
      },
      {
        label: "Заполненность бюджета",
        value: this.clampScore(amountCoverage * 100),
        detail: "Доля закупок, где уже есть сумма и можно оценивать бюджетную нагрузку.",
        severity: amountCoverage < 0.6 ? "warning" : "success"
      },
      {
        label: "Диверсификация потока",
        value: this.clampScore(100 - topSupplierShare),
        detail: `Активных закупок: ${this.formatInteger(activeCount)}, активных источников: ${this.formatInteger(dashboard.activeSources)}.`,
        severity: topSupplierShare >= 45 ? "warning" : "success"
      }
    ];
  }

  private buildSupplierRiskScores(
    analytics: Awaited<ReturnType<AnalyticsService["summary"]>>,
    procurements: LiveProcurementSignal[]
  ) {
    const totalProcurements = Math.max(procurements.length, 1);
    const topSupplierShare = analytics.supplierExposure[0]?.sharePercent ?? 0;
    const identifiedSuppliers =
      procurements.filter((item) => Boolean(item.supplierName)).length / totalProcurements;

    return [
      {
        label: "Концентрационный риск",
        value: this.clampScore(100 - topSupplierShare),
        detail: "Чем выше доля крупнейшего поставщика, тем сильнее зависимость потока.",
        severity: topSupplierShare >= 40 ? "destructive" : topSupplierShare >= 25 ? "warning" : "success"
      },
      {
        label: "Интенсивность риск-сигналов",
        value: this.clampScore(100 - analytics.riskSignalsLast30d * 8),
        detail: "Оценка давления по негативным сигналам за последние 30 дней.",
        severity: analytics.riskSignalsLast30d >= 5 ? "destructive" : analytics.riskSignalsLast30d > 0 ? "warning" : "success"
      },
      {
        label: "Экспозиция по срокам",
        value: this.clampScore(100 - ((analytics.overdueCount + analytics.closingSoonCount) / totalProcurements) * 100),
        detail: "Насколько риск по поставщикам пересекается с горящими сроками закупок.",
        severity: analytics.overdueCount > 0 ? "destructive" : analytics.closingSoonCount > 0 ? "warning" : "success"
      },
      {
        label: "Прозрачность контрагентов",
        value: this.clampScore(identifiedSuppliers * 100),
        detail: "Доля закупок, где уже идентифицирован поставщик и можно вести риск-мониторинг.",
        severity: identifiedSuppliers < 0.5 ? "warning" : "success"
      }
    ];
  }

  private buildPipelineScores(
    analytics: Awaited<ReturnType<AnalyticsService["summary"]>>,
    problematicRuns: ProblematicRun[],
    procurements: LiveProcurementSignal[]
  ) {
    const staleSources = analytics.sourceHealth.filter((item) => (item.hoursSinceLastRun ?? 0) >= 24).length;
    const totalSources = Math.max(analytics.sourceHealth.length, 1);
    const problematicShare = problematicRuns.length / Math.max(totalSources, 1);
    const activeProcurements = procurements.filter((item) => item.status === "ACTIVE").length;

    return [
      {
        label: "Надёжность конвейера",
        value: this.clampScore(analytics.runSuccessRate),
        detail: "Процент полностью успешных запусков за последние 30 дней.",
        severity: analytics.runSuccessRate < 70 ? "destructive" : analytics.runSuccessRate < 85 ? "warning" : "success"
      },
      {
        label: "Потери на публикации",
        value: this.clampScore(analytics.publicationEfficiency),
        detail: "Сколько собранных элементов действительно проходят до публикации.",
        severity: analytics.publicationEfficiency < 70 ? "destructive" : analytics.publicationEfficiency < 85 ? "warning" : "success"
      },
      {
        label: "Свежесть источников",
        value: this.clampScore(100 - (staleSources / totalSources) * 100),
        detail: `В активном слое ${this.formatInteger(activeProcurements)} закупок, зависящих от регулярной синхронизации.`,
        severity: staleSources >= 2 ? "warning" : "success"
      },
      {
        label: "Шум инцидентов",
        value: this.clampScore(100 - problematicShare * 100),
        detail: "Отражает, насколько часто инциденты захватывают пул источников.",
        severity: problematicRuns.length >= 3 ? "destructive" : problematicRuns.length > 0 ? "warning" : "success"
      }
    ];
  }

  private buildDailyOverviewActions(
    analytics: Awaited<ReturnType<AnalyticsService["summary"]>>,
    customerExposure: Array<{ customer: string; procurementCount: number; totalAmount: number; sharePercent: number }>
  ) {
    const actions = [];

    if (analytics.overdueCount > 0) {
      actions.push({
        title: "Разобрать просроченные закупки",
        description: `В активном портфеле ${this.formatInteger(analytics.overdueCount)} просроченных позиций, их стоит снять с риска в первую очередь.`,
        priority: "Высокий"
      });
    }

    if (analytics.atRiskSources > 0) {
      actions.push({
        title: "Проверить проблемные источники",
        description: `${this.formatInteger(analytics.atRiskSources)} источников уже просели по свежести или качеству данных.`,
        priority: "Высокий"
      });
    }

    if (customerExposure[0]) {
      actions.push({
        title: "Сверить нагрузку по ключевому заказчику",
        description: `${customerExposure[0].customer} формирует ${this.formatPercent(customerExposure[0].sharePercent)} текущего потока закупок.`,
        priority: "Средний"
      });
    }

    return actions.slice(0, 3);
  }

  private buildSupplierRiskActions(
    analytics: Awaited<ReturnType<AnalyticsService["summary"]>>,
    customerExposure: Array<{ customer: string; procurementCount: number; totalAmount: number; sharePercent: number }>
  ) {
    const actions = [];
    const topSupplier = analytics.supplierExposure[0];

    if (topSupplier && topSupplier.sharePercent >= 35) {
      actions.push({
        title: "Отработать концентрацию по поставщикам",
        description: `${topSupplier.supplier} занимает ${this.formatPercent(topSupplier.sharePercent)} потока и требует отдельного мониторинга.`,
        priority: "Высокий"
      });
    }

    if (analytics.riskSignalsLast30d > 0) {
      actions.push({
        title: "Проверить свежие риск-сигналы",
        description: `За последние 30 дней накоплено ${this.formatInteger(analytics.riskSignalsLast30d)} сигналов по контрагентам.`,
        priority: "Высокий"
      });
    }

    if (customerExposure[0]) {
      actions.push({
        title: "Согласовать портфель с заказчиками",
        description: `У лидирующего заказчика ${customerExposure[0].customer} высокая концентрация и её стоит сверить с supplier watchlist.`,
        priority: "Средний"
      });
    }

    return actions.slice(0, 3);
  }

  private buildPipelineActions(
    analytics: Awaited<ReturnType<AnalyticsService["summary"]>>,
    problematicRuns: ProblematicRun[]
  ) {
    const actions = [];
    const latestRun = problematicRuns[0];
    const criticalSource = analytics.sourceHealth.find((item) => item.riskLevel === "CRITICAL");

    if (latestRun) {
      actions.push({
        title: "Разобрать последний инцидент",
        description: `${latestRun.sourceCode} завершился проблемно: ${latestRun.errorMessage || "нужен разбор лога выполнения"}.`,
        priority: "Высокий"
      });
    }

    if (criticalSource) {
      actions.push({
        title: "Стабилизировать критичный источник",
        description: `${criticalSource.name} уже вышел в критическую зону по свежести или ошибкам.`,
        priority: "Высокий"
      });
    }

    if (analytics.publicationEfficiency < 85) {
      actions.push({
        title: "Проверить потери между сбором и публикацией",
        description: `Эффективность публикации сейчас ${this.formatPercent(analytics.publicationEfficiency)}, значит часть данных теряется в pipeline.`,
        priority: "Средний"
      });
    }

    return actions.slice(0, 3);
  }

  private async buildSupplierDueDiligenceItems() {
    const [suppliers, registryEntries] = await Promise.all([
      this.prisma.supplier.findMany({
        where: {
          deletedAt: null,
          OR: [
            { procurements: { some: { deletedAt: null, source: { deletedAt: null } } } },
            { riskSignals: { some: { deletedAt: null } } },
            { companyProfiles: { some: { deletedAt: null } } }
          ]
        },
        include: {
          procurements: {
            where: {
              deletedAt: null,
              source: { deletedAt: null }
            },
            select: {
              id: true,
              amount: true,
              status: true,
              publishedAt: true,
              createdAt: true
            }
          },
          riskSignals: {
            where: { deletedAt: null },
            select: {
              publishedAt: true,
              eventDate: true,
              createdAt: true
            }
          },
          companyProfiles: {
            where: { deletedAt: null },
            orderBy: [{ updatedAt: "desc" }],
            take: 1,
            select: {
              companyStatus: true,
              registrationDate: true,
              region: true,
              okved: true,
              liquidationMark: true
            }
          }
        }
      }),
      this.prisma.registryRecord.findMany({
        where: { deletedAt: null },
        select: {
          supplierName: true,
          supplierInn: true,
          supplierOgrn: true,
          registryStatus: true,
          inclusionDate: true,
          exclusionDate: true,
          createdAt: true
        }
      })
    ]);

    const registryByKey = new Map<
      string,
      Array<{
        supplierName: string;
        supplierInn: string | null;
        supplierOgrn: string | null;
        registryStatus: string | null;
        inclusionDate: Date | null;
        exclusionDate: Date | null;
        createdAt: Date;
      }>
    >();

    for (const entry of registryEntries) {
      if (!isMeaningfulSupplierName(entry.supplierName)) {
        continue;
      }

      const key = resolveSupplierKey({
        supplier: entry.supplierName,
        taxId: entry.supplierInn ?? undefined,
        ogrn: entry.supplierOgrn ?? undefined
      });

      if (!registryByKey.has(key)) {
        registryByKey.set(key, []);
      }

      registryByKey.get(key)?.push(entry);
    }

    const activeRiskThreshold = new Date(Date.now() - 180 * DAY_MS);

    const supplierItems = suppliers
      .filter((supplier) => isMeaningfulSupplierName(supplier.name, supplier.metadata))
      .map((supplier) => {
        const key = resolveSupplierKey({
          supplier: supplier.name,
          taxId: supplier.taxId ?? undefined,
          ogrn: supplier.ogrn ?? undefined
        });
        const latestProfile = supplier.companyProfiles[0];
        const relatedRegistryEntries = registryByKey.get(key) ?? [];
        const procurementCount = supplier.procurements.length;
        const activeProcurements = supplier.procurements.filter(
          (item) => item.status === ProcurementStatus.ACTIVE
        ).length;
        const totalAmount = supplier.procurements.reduce((sum, item) => sum + (item.amount ?? 0), 0);
        const lastProcurementAt = supplier.procurements.reduce<Date | null>((latest, item) => {
          const candidate = item.publishedAt ?? item.createdAt;
          if (!latest || candidate.getTime() > latest.getTime()) {
            return candidate;
          }

          return latest;
        }, null);
        const latestRiskAt = supplier.riskSignals.reduce<Date | null>((latest, item) => {
          const candidate = item.eventDate ?? item.publishedAt ?? item.createdAt;
          if (!latest || candidate.getTime() > latest.getTime()) {
            return candidate;
          }

          return latest;
        }, null);
        const activeRiskSignalsCount = supplier.riskSignals.filter((item) => {
          const eventAt = item.eventDate ?? item.publishedAt ?? item.createdAt;
          return eventAt.getTime() >= activeRiskThreshold.getTime();
        }).length;
        const activeRnpEntriesCount = relatedRegistryEntries.filter((item) =>
          isRegistryEntryActive(item.registryStatus, item.exclusionDate)
        ).length;
        const flags = buildSupplierDueDiligenceFlags({
          taxId: supplier.taxId ?? undefined,
          ogrn: supplier.ogrn ?? undefined,
          latestProfile,
          activeRiskSignalsCount,
          activeRnpEntriesCount,
          procurementCount
        });

        return {
          supplier: supplier.name,
          taxId: supplier.taxId ?? undefined,
          ogrn: supplier.ogrn ?? undefined,
          procurementCount,
          activeProcurements,
          totalAmount: this.roundMetric(totalAmount),
          lastProcurementAt,
          companyStatus: latestProfile?.companyStatus ?? undefined,
          registrationDate: latestProfile?.registrationDate ?? null,
          region: latestProfile?.region ?? undefined,
          okved: latestProfile?.okved ?? undefined,
          liquidationMark: latestProfile?.liquidationMark ?? null,
          riskSignalsCount: supplier.riskSignals.length,
          activeRiskSignalsCount,
          rnpEntriesCount: relatedRegistryEntries.length,
          activeRnpEntriesCount,
          latestRiskAt,
          integrityScore: this.calculateSupplierIntegrityScore({
            hasTaxId: Boolean(supplier.taxId),
            hasOgrn: Boolean(supplier.ogrn),
            hasProfile: Boolean(latestProfile),
            liquidationMark: latestProfile?.liquidationMark === true,
            activeRiskSignalsCount,
            activeRnpEntriesCount
          }),
          flags
        };
      })
      .sort(
        (left, right) =>
          right.activeRnpEntriesCount - left.activeRnpEntriesCount ||
          right.activeRiskSignalsCount - left.activeRiskSignalsCount ||
          left.integrityScore - right.integrityScore ||
          right.totalAmount - left.totalAmount
      );
    const existingKeys = new Set(
      supplierItems.map((item) =>
        resolveSupplierKey({
          supplier: item.supplier,
          taxId: item.taxId,
          ogrn: item.ogrn
        })
      )
    );
    const registryOnlyItems = Array.from(registryByKey.entries())
      .filter(([key]) => !existingKeys.has(key))
      .map(([_key, entries]) => {
        const latest = [...entries].sort(
          (left, right) =>
            (right.inclusionDate?.getTime() ?? right.createdAt.getTime()) -
            (left.inclusionDate?.getTime() ?? left.createdAt.getTime())
        )[0];
        const activeRnpEntriesCount = entries.filter((item) =>
          isRegistryEntryActive(item.registryStatus, item.exclusionDate)
        ).length;
        const supplier = latest?.supplierName ?? "Поставщик без карточки";

        if (!isMeaningfulSupplierName(supplier)) {
          return null;
        }

        return {
          supplier,
          taxId: latest?.supplierInn ?? undefined,
          ogrn: latest?.supplierOgrn ?? undefined,
          procurementCount: 0,
          activeProcurements: 0,
          totalAmount: 0,
          lastProcurementAt: null,
          companyStatus: undefined,
          registrationDate: null,
          region: undefined,
          okved: undefined,
          liquidationMark: null,
          riskSignalsCount: 0,
          activeRiskSignalsCount: 0,
          rnpEntriesCount: entries.length,
          activeRnpEntriesCount,
          latestRiskAt: latest?.inclusionDate ?? latest?.createdAt ?? null,
          integrityScore: this.calculateSupplierIntegrityScore({
            hasTaxId: Boolean(latest?.supplierInn),
            hasOgrn: Boolean(latest?.supplierOgrn),
            hasProfile: false,
            liquidationMark: false,
            activeRiskSignalsCount: 0,
            activeRnpEntriesCount
          }),
          flags: buildSupplierDueDiligenceFlags({
            taxId: latest?.supplierInn ?? undefined,
            ogrn: latest?.supplierOgrn ?? undefined,
            latestProfile: undefined,
            activeRiskSignalsCount: 0,
            activeRnpEntriesCount,
            procurementCount: 0
          })
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    return [...supplierItems, ...registryOnlyItems].sort(
      (left, right) =>
        right.activeRnpEntriesCount - left.activeRnpEntriesCount ||
        right.activeRiskSignalsCount - left.activeRiskSignalsCount ||
        left.integrityScore - right.integrityScore ||
        right.totalAmount - left.totalAmount
    );
  }

  private buildSupplierDueDiligenceMetrics(
    items: Awaited<ReturnType<ReportsService["buildSupplierDueDiligenceItems"]>>
  ) {
    const withProfiles = items.filter((item) => item.companyStatus || item.registrationDate || item.okved).length;
    const withRedFlags = items.filter((item) => item.flags.length > 0).length;
    const activeRnp = items.filter((item) => item.activeRnpEntriesCount > 0).length;

    return [
      {
        label: "Поставщиков в мониторинге",
        value: this.formatInteger(items.length),
        hint: "Учитываются собранные поставщики из закупок и контрагентских источников."
      },
      {
        label: "Профили ФНС найдены",
        value: this.formatInteger(withProfiles),
        hint: "Есть регистрационные данные, статус или отраслевой профиль."
      },
      {
        label: "Поставщики с флагами",
        value: this.formatInteger(withRedFlags),
        hint: "Требуют проверки по РНП, Федресурсу, ликвидации или неполным реквизитам."
      },
      {
        label: "Активный риск по РНП",
        value: this.formatInteger(activeRnp),
        hint: "Поставщики с действующими или не закрытыми записями в реестре."
      }
    ];
  }

  private buildSupplierDueDiligenceHighlights(
    items: Awaited<ReturnType<ReportsService["buildSupplierDueDiligenceItems"]>>
  ) {
    const highestRisk = items[0];
    const liquidationCompanies = items.filter((item) => item.liquidationMark).length;
    const incompleteProfiles = items.filter((item) => !item.taxId || !item.ogrn || !item.companyStatus).length;

    return [
      {
        title: "Самый рискованный поставщик",
        description: highestRisk
          ? `${highestRisk.supplier}: score ${this.formatInteger(highestRisk.integrityScore)}, флаги: ${highestRisk.flags.join(", ") || "нет"}.`
          : "Поставщики для проверки пока не накоплены.",
        severity: highestRisk && highestRisk.flags.length > 0 ? "warning" : "info"
      },
      {
        title: "Признаки ликвидации",
        description:
          liquidationCompanies > 0
            ? `У ${this.formatInteger(liquidationCompanies)} поставщиков есть отметка о ликвидации или прекращении деятельности.`
            : "Признаков ликвидации по текущим профилям не найдено.",
        severity: liquidationCompanies > 0 ? "destructive" : "success"
      },
      {
        title: "Полнота карточек",
        description:
          incompleteProfiles > 0
            ? `У ${this.formatInteger(incompleteProfiles)} поставщиков не хватает ключевых реквизитов или статуса компании.`
            : "Карточки поставщиков заполнены достаточно полно для базовой проверки.",
        severity: incompleteProfiles > 0 ? "warning" : "success"
      }
    ];
  }

  private buildSupplierDueDiligenceScores(
    items: Awaited<ReturnType<ReportsService["buildSupplierDueDiligenceItems"]>>
  ) {
    const total = Math.max(items.length, 1);
    const withProfiles = items.filter((item) => item.companyStatus || item.registrationDate || item.okved).length;
    const withIdentifiers = items.filter((item) => item.taxId && item.ogrn).length;
    const withFlags = items.filter((item) => item.flags.length > 0).length;
    const activeRnp = items.filter((item) => item.activeRnpEntriesCount > 0).length;

    return [
      {
        label: "Покрытие профилями",
        value: this.clampScore((withProfiles / total) * 100),
        detail: "Доля поставщиков, по которым уже есть профиль компании или регистрационные признаки.",
        severity: withProfiles / total < 0.7 ? "warning" : "success"
      },
      {
        label: "Качество реквизитов",
        value: this.clampScore((withIdentifiers / total) * 100),
        detail: "Показывает, насколько слой поставщиков пригоден для уверенного матчинга и комплаенса.",
        severity: withIdentifiers / total < 0.6 ? "warning" : "success"
      },
      {
        label: "Давление негативных сигналов",
        value: this.clampScore(100 - (withFlags / total) * 100),
        detail: "Чем больше флагов в карточках поставщиков, тем ниже итоговый балл.",
        severity: withFlags / total > 0.35 ? "warning" : "success"
      },
      {
        label: "Чистота по РНП",
        value: this.clampScore(100 - (activeRnp / total) * 100),
        detail: "Доля поставщиков без активных записей в реестре недобросовестных поставщиков.",
        severity: activeRnp > 0 ? "destructive" : "success"
      }
    ];
  }

  private buildSupplierDueDiligenceActions(
    items: Awaited<ReturnType<ReportsService["buildSupplierDueDiligenceItems"]>>
  ) {
    const actions = [];
    const rnpSuppliers = items.filter((item) => item.activeRnpEntriesCount > 0);
    const incompleteSuppliers = items.filter((item) => !item.taxId || !item.ogrn || !item.companyStatus);
    const liquidationSuppliers = items.filter((item) => item.liquidationMark);

    if (rnpSuppliers.length > 0) {
      actions.push({
        title: "Перепроверить поставщиков из РНП",
        description: `В мониторинге ${this.formatInteger(rnpSuppliers.length)} поставщиков с активными записями или незакрытым риском по РНП.`,
        priority: "Высокий"
      });
    }

    if (liquidationSuppliers.length > 0) {
      actions.push({
        title: "Проверить компании с признаками ликвидации",
        description: `У ${this.formatInteger(liquidationSuppliers.length)} карточек есть риск ликвидации или прекращения деятельности.`,
        priority: "Высокий"
      });
    }

    if (incompleteSuppliers.length > 0) {
      actions.push({
        title: "Добрать идентификаторы и профили",
        description: `Для ${this.formatInteger(incompleteSuppliers.length)} поставщиков не хватает ИНН, ОГРН или статуса компании для качественной аналитики.`,
        priority: "Средний"
      });
    }

    return actions.slice(0, 3);
  }

  private async buildNppStationOrderItems() {
    const procurements = await this.prisma.procurement.findMany({
      where: {
        deletedAt: null,
        source: {
          deletedAt: null,
          code: { in: [...NPP_SOURCE_CODES] }
        },
        OR: [{ publishedAt: { gte: NPP_PERIOD_START } }, { createdAt: { gte: NPP_PERIOD_START } }]
      },
      include: {
        source: true,
        supplier: true
      },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }]
    });

    const grouped = new Map<
      string,
      {
        station: string;
        procurementCount: number;
        contractCount: number;
        totalAmount: number;
        firstPublishedAt: Date | null;
        lastPublishedAt: Date | null;
        orders: Array<{
          procurementId: string;
          externalId: string;
          title: string;
          customer?: string;
          supplier?: string;
          source: string;
          amount?: number | null;
          currency?: string | null;
          status: ProcurementStatus;
          publishedAt?: Date | null;
          sourceUrl?: string | null;
        }>;
      }
    >();

    for (const item of procurements) {
      const station = resolveNppStationName(item.rawPayload, [item.title, item.customerName]);

      if (!station) {
        continue;
      }

      const effectiveDate = item.publishedAt ?? item.createdAt;
      const sourceType = resolveSourceType(item.rawPayload);
      const current = grouped.get(station) ?? {
        station,
        procurementCount: 0,
        contractCount: 0,
        totalAmount: 0,
        firstPublishedAt: null,
        lastPublishedAt: null,
        orders: []
      };

      current.procurementCount += 1;
      current.contractCount += sourceType === "contract" ? 1 : 0;
      current.totalAmount += item.amount ?? 0;
      current.firstPublishedAt =
        !current.firstPublishedAt || effectiveDate.getTime() < current.firstPublishedAt.getTime()
          ? effectiveDate
          : current.firstPublishedAt;
      current.lastPublishedAt =
        !current.lastPublishedAt || effectiveDate.getTime() > current.lastPublishedAt.getTime()
          ? effectiveDate
          : current.lastPublishedAt;
      current.orders.push({
        procurementId: item.id,
        externalId: item.externalId,
        title: item.title,
        customer: item.customerName ?? undefined,
        supplier: item.supplier?.name ?? undefined,
        source: item.source.code,
        amount: item.amount,
        currency: item.currency,
        status: item.status,
        publishedAt: item.publishedAt ?? item.createdAt,
        sourceUrl: item.sourceUrl
      });
      grouped.set(station, current);
    }

    return Array.from(grouped.values())
      .map((item) => ({
        station: item.station,
        procurementCount: item.procurementCount,
        contractCount: item.contractCount,
        totalAmount: this.roundMetric(item.totalAmount),
        firstPublishedAt: item.firstPublishedAt,
        lastPublishedAt: item.lastPublishedAt,
        orders: item.orders.sort(
          (left, right) => (right.publishedAt?.getTime() ?? 0) - (left.publishedAt?.getTime() ?? 0)
        )
      }))
      .sort((left, right) => right.procurementCount - left.procurementCount || left.station.localeCompare(right.station));
  }

  private buildNppStationOrderMetrics(
    items: Awaited<ReturnType<ReportsService["buildNppStationOrderItems"]>>
  ) {
    const procurementCount = items.reduce((sum, item) => sum + item.procurementCount, 0);
    const contractCount = items.reduce((sum, item) => sum + item.contractCount, 0);
    const totalAmount = items.reduce((sum, item) => sum + item.totalAmount, 0);

    return [
      {
        label: "АЭС в контуре",
        value: this.formatInteger(items.length),
        hint: "Станции, по которым уже найдены релевантные закупки или договоры."
      },
      {
        label: "Всего заказов",
        value: this.formatInteger(procurementCount),
        hint: `Договоров: ${this.formatInteger(contractCount)}`
      },
      {
        label: "Сумма контура",
        value: new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(totalAmount),
        hint: "Суммарный объём закупок и контрактов по АЭС с заполненной суммой."
      },
      {
        label: "Покрытие станций",
        value: this.formatPercent((items.length / NPP_STATION_NAMES.length) * 100),
        hint: "Сколько станций уже попало в атомный аналитический слой."
      }
    ];
  }

  private buildNppStationOrderHighlights(
    items: Awaited<ReturnType<ReportsService["buildNppStationOrderItems"]>>
  ) {
    const topByAmount = [...items].sort((left, right) => right.totalAmount - left.totalAmount)[0];
    const latestStation = [...items].sort(
      (left, right) => (right.lastPublishedAt?.getTime() ?? 0) - (left.lastPublishedAt?.getTime() ?? 0)
    )[0];
    const uncoveredStations = NPP_STATION_NAMES.length - items.length;

    return [
      {
        title: "Лидер по сумме заказов",
        description: topByAmount
          ? `${topByAmount.station}: ${this.formatInteger(topByAmount.procurementCount)} записей на ${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(topByAmount.totalAmount)} RUB.`
          : "Данных по АЭС пока недостаточно.",
        severity: topByAmount ? "info" : "warning"
      },
      {
        title: "Последняя активность",
        description: latestStation?.lastPublishedAt
          ? `${latestStation.station} публиковала закупки до ${latestStation.lastPublishedAt.toLocaleDateString("ru-RU")}.`
          : "Свежей активности по АЭС пока не найдено.",
        severity: latestStation?.lastPublishedAt ? "success" : "warning"
      },
      {
        title: "Пробелы покрытия",
        description:
          uncoveredStations > 0
            ? `В атомном контуре пока не хватает данных по ${this.formatInteger(uncoveredStations)} станциям.`
            : "По всем базовым АЭС уже есть данные в аналитическом контуре.",
        severity: uncoveredStations > 0 ? "warning" : "success"
      }
    ];
  }

  private buildNppStationOrderScores(
    items: Awaited<ReturnType<ReportsService["buildNppStationOrderItems"]>>
  ) {
    const procurementCount = Math.max(
      items.reduce((sum, item) => sum + item.procurementCount, 0),
      1
    );
    const amountFilled = items
      .flatMap((item) => item.orders)
      .filter((order) => typeof order.amount === "number").length;
    const contractCount = items.reduce((sum, item) => sum + item.contractCount, 0);
    const recentStations = items.filter(
      (item) => (item.lastPublishedAt?.getTime() ?? 0) >= Date.now() - 90 * DAY_MS
    ).length;

    return [
      {
        label: "Покрытие станций",
        value: this.clampScore((items.length / NPP_STATION_NAMES.length) * 100),
        detail: "Доля АЭС, по которым в системе уже есть закупочные записи.",
        severity: items.length < NPP_STATION_NAMES.length / 2 ? "warning" : "success"
      },
      {
        label: "Заполненность сумм",
        value: this.clampScore((amountFilled / procurementCount) * 100),
        detail: "Можно ли сравнивать станции не только по числу записей, но и по деньгам.",
        severity: amountFilled / procurementCount < 0.65 ? "warning" : "success"
      },
      {
        label: "Контрактный слой",
        value: this.clampScore((contractCount / procurementCount) * 100),
        detail: "Показывает, насколько глубоко контур покрывает не только закупки, но и договоры.",
        severity: contractCount === 0 ? "warning" : "success"
      },
      {
        label: "Свежесть покрытия",
        value: this.clampScore((recentStations / Math.max(items.length, 1)) * 100),
        detail: "Доля станций, по которым есть активность в последние 90 дней.",
        severity: recentStations < Math.max(1, Math.ceil(items.length / 2)) ? "warning" : "success"
      }
    ];
  }

  private buildNppStationOrderActions(
    items: Awaited<ReturnType<ReportsService["buildNppStationOrderItems"]>>
  ) {
    const actions = [];
    const uncoveredStations = NPP_STATION_NAMES.filter((station) => !items.some((item) => item.station === station));
    const staleStations = items.filter(
      (item) => (item.lastPublishedAt?.getTime() ?? 0) < Date.now() - 120 * DAY_MS
    );
    const noContracts = items.filter((item) => item.contractCount === 0);

    if (uncoveredStations.length > 0) {
      actions.push({
        title: "Расширить покрытие АЭС",
        description: `Пока нет данных по станциям: ${uncoveredStations.join(", ")}.`,
        priority: "Высокий"
      });
    }

    if (staleStations.length > 0) {
      actions.push({
        title: "Проверить станции без свежей активности",
        description: `У ${this.formatInteger(staleStations.length)} АЭС давно не было новых публикаций в аналитическом контуре.`,
        priority: "Средний"
      });
    }

    if (noContracts.length > 0) {
      actions.push({
        title: "Добрать слой контрактов",
        description: `Для ${this.formatInteger(noContracts.length)} станций видны закупки, но пока не хватает договорного следа.`,
        priority: "Средний"
      });
    }

    return actions.slice(0, 3);
  }

  private calculateSupplierIntegrityScore(input: {
    hasTaxId: boolean;
    hasOgrn: boolean;
    hasProfile: boolean;
    liquidationMark: boolean;
    activeRiskSignalsCount: number;
    activeRnpEntriesCount: number;
  }) {
    let score = 100;

    if (!input.hasTaxId) {
      score -= 10;
    }

    if (!input.hasOgrn) {
      score -= 10;
    }

    if (!input.hasProfile) {
      score -= 15;
    }

    if (input.liquidationMark) {
      score -= 25;
    }

    score -= Math.min(input.activeRiskSignalsCount * 8, 24);
    score -= Math.min(input.activeRnpEntriesCount * 45, 45);

    return this.clampScore(score);
  }

  private buildStatusMix(procurements: LiveProcurementSignal[]) {
    const total = Math.max(procurements.length, 1);
    const counts = new Map<string, number>();

    for (const procurement of procurements) {
      counts.set(procurement.status, (counts.get(procurement.status) ?? 0) + 1);
    }

    return Array.from(counts.entries())
      .map(([status, count]) => ({
        label: status,
        count,
        sharePercent: this.roundMetric((count / total) * 100)
      }))
      .sort((left, right) => right.count - left.count);
  }

  private buildAmountDistribution(procurements: LiveProcurementSignal[]) {
    const buckets = [
      { label: "До 100 тыс.", min: 0, max: 100_000 },
      { label: "100 тыс. - 1 млн", min: 100_000, max: 1_000_000 },
      { label: "1 - 10 млн", min: 1_000_000, max: 10_000_000 },
      { label: "Свыше 10 млн", min: 10_000_000, max: Number.POSITIVE_INFINITY }
    ].map((bucket) => ({
      ...bucket,
      procurementCount: 0,
      totalAmount: 0
    }));

    let grandTotal = 0;

    for (const procurement of procurements) {
      const amount = procurement.amount ?? 0;
      const targetBucket = buckets.find((bucket) => amount >= bucket.min && amount < bucket.max);

      if (!targetBucket) {
        continue;
      }

      targetBucket.procurementCount += 1;
      targetBucket.totalAmount += amount;
      grandTotal += amount;
    }

    return buckets.map((bucket) => ({
      label: bucket.label,
      procurementCount: bucket.procurementCount,
      totalAmount: bucket.totalAmount,
      sharePercent: grandTotal > 0 ? this.roundMetric((bucket.totalAmount / grandTotal) * 100) : 0
    }));
  }

  private buildCustomerExposure(procurements: LiveProcurementSignal[]) {
    const total = Math.max(procurements.length, 1);
    const byCustomer = new Map<string, { procurementCount: number; totalAmount: number }>();

    for (const procurement of procurements) {
      const customer = procurement.customerName?.trim();

      if (!customer) {
        continue;
      }

      const current = byCustomer.get(customer) ?? { procurementCount: 0, totalAmount: 0 };
      current.procurementCount += 1;
      current.totalAmount += procurement.amount ?? 0;
      byCustomer.set(customer, current);
    }

    return Array.from(byCustomer.entries())
      .map(([customer, stats]) => ({
        customer,
        procurementCount: stats.procurementCount,
        totalAmount: stats.totalAmount,
        sharePercent: this.roundMetric((stats.procurementCount / total) * 100)
      }))
      .sort((left, right) => right.procurementCount - left.procurementCount || right.totalAmount - left.totalAmount)
      .slice(0, 5);
  }

  private buildSourceContribution(procurements: LiveProcurementSignal[]) {
    const total = Math.max(procurements.length, 1);
    const bySource = new Map<string, { sourceName: string; procurementCount: number; totalAmount: number }>();

    for (const procurement of procurements) {
      const current = bySource.get(procurement.sourceCode) ?? {
        sourceName: procurement.sourceName,
        procurementCount: 0,
        totalAmount: 0
      };
      current.procurementCount += 1;
      current.totalAmount += procurement.amount ?? 0;
      bySource.set(procurement.sourceCode, current);
    }

    return Array.from(bySource.entries())
      .map(([sourceCode, stats]) => ({
        sourceCode,
        sourceName: stats.sourceName,
        procurementCount: stats.procurementCount,
        totalAmount: stats.totalAmount,
        sharePercent: this.roundMetric((stats.procurementCount / total) * 100)
      }))
      .sort((left, right) => right.procurementCount - left.procurementCount || right.totalAmount - left.totalAmount);
  }

  private selectLargestProcurements<T extends { amount?: number | null }>(items: T[]) {
    return [...items]
      .sort((left, right) => (right.amount ?? 0) - (left.amount ?? 0))
      .slice(0, 5);
  }

  private clampScore(value: number) {
    return this.roundMetric(Math.max(0, Math.min(100, value)));
  }

  private roundMetric(value: number) {
    return Math.round(value * 10) / 10;
  }

  private buildSupplierRiskHighlights(
    analytics: Awaited<ReturnType<AnalyticsService["summary"]>>
  ) {
    const criticalSources = analytics.sourceHealth.filter((item) => item.riskLevel === "CRITICAL");
    const topSupplier = analytics.supplierExposure[0];

    return [
      {
        title: "Критические источники",
        description:
          criticalSources.length > 0
            ? `Критический риск у источников: ${criticalSources.map((item) => item.name).join(", ")}.`
            : "Критических источников сейчас нет.",
        severity: criticalSources.length > 0 ? "destructive" : "success"
      },
      {
        title: "Концентрация поставщиков",
        description: topSupplier
          ? `${topSupplier.supplier} формирует ${this.formatPercent(topSupplier.sharePercent)} потока закупок в верхней части выборки.`
          : "Недостаточно данных для анализа концентрации поставщиков.",
        severity: topSupplier && topSupplier.sharePercent >= 40 ? "warning" : "info"
      },
      {
        title: "Закупки под наблюдением",
        description:
          analytics.attentionProcurements.length > 0
            ? `В отчёт попало ${this.formatInteger(analytics.attentionProcurements.length)} закупок, требующих внимания по срокам.`
            : "Срочных закупок в зоне внимания сейчас нет.",
        severity: analytics.attentionProcurements.length > 0 ? "warning" : "success"
      }
    ];
  }

  private buildPipelineHighlights(
    analytics: Awaited<ReturnType<AnalyticsService["summary"]>>,
    problematicRuns: ProblematicRun[]
  ) {
    const latestRun = problematicRuns[0];
    const worstSource = analytics.sourceHealth
      .filter((item) => item.riskLevel !== "STABLE")
      .sort((left, right) => right.failedRuns - left.failedRuns)[0];

    return [
      {
        title: "Последний инцидент",
        description: latestRun
          ? `${latestRun.sourceCode}: ${latestRun.errorMessage || `ошибок ${this.formatInteger(latestRun.itemsFailed)}`}.`
          : "Последних проблемных запусков не найдено.",
        severity: latestRun ? "destructive" : "success"
      },
      {
        title: "Самый проблемный источник",
        description: worstSource
          ? `${worstSource.name} — ${this.formatInteger(worstSource.failedRuns)} неуспешных или частичных запусков.`
          : "По текущей выборке проблемные источники не выделяются.",
        severity: worstSource ? "warning" : "success"
      },
      {
        title: "Публикация данных",
        description:
          analytics.publicationEfficiency < 70
            ? `Эффективность публикации снизилась до ${this.formatPercent(analytics.publicationEfficiency)}.`
            : `Эффективность публикации держится на уровне ${this.formatPercent(analytics.publicationEfficiency)}.`,
        severity: analytics.publicationEfficiency < 70 ? "warning" : "info"
      }
    ];
  }

  private formatInteger(value: number) {
    return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(value);
  }

  private formatPercent(value: number) {
    return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(value)}%`;
  }
}

function buildSupplierDueDiligenceFlags(input: {
  taxId?: string;
  ogrn?: string;
  latestProfile?: {
    companyStatus: string | null;
    registrationDate: Date | null;
    region: string | null;
    okved: string | null;
    liquidationMark: boolean | null;
  };
  activeRiskSignalsCount: number;
  activeRnpEntriesCount: number;
  procurementCount: number;
}) {
  const flags: string[] = [];

  if (input.activeRnpEntriesCount > 0) {
    flags.push("Активная запись в РНП");
  }

  if (input.activeRiskSignalsCount > 0) {
    flags.push("Есть свежие риск-сигналы");
  }

  if (input.latestProfile?.liquidationMark) {
    flags.push("Есть признак ликвидации");
  }

  if (!input.latestProfile) {
    flags.push("Нет профиля ФНС");
  }

  if (!input.taxId || !input.ogrn) {
    flags.push("Не хватает ИНН/ОГРН");
  }

  if (input.procurementCount === 0) {
    flags.push("Нет закупочной истории");
  }

  return flags;
}

function isRegistryEntryActive(registryStatus: string | null, exclusionDate: Date | null) {
  const normalizedStatus = (registryStatus ?? "").toLowerCase();

  if (normalizedStatus.includes("исключ")) {
    return false;
  }

  if (!exclusionDate) {
    return true;
  }

  return exclusionDate.getTime() > Date.now();
}

function resolveSourceType(rawPayload: unknown): string | undefined {
  const sourceSpecificData = getSourceSpecificData(rawPayload);
  return typeof sourceSpecificData?.sourceType === "string" ? sourceSpecificData.sourceType : undefined;
}

function resolveSupplierKey(input: { supplier?: string; taxId?: string; ogrn?: string }) {
  if (input.taxId?.trim()) {
    return `inn:${input.taxId.trim()}`;
  }

  if (input.ogrn?.trim()) {
    return `ogrn:${input.ogrn.trim()}`;
  }

  return `name:${normalizeSupplierName(input.supplier ?? "")}`;
}
