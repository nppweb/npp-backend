import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit
} from "@nestjs/common";
import { Prisma, ReportStatus, SourceRunStatus, UserRole } from "@prisma/client";
import { AnalyticsService } from "../analytics/analytics.service";
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
  "daily-overview": "Ежедневный обзор",
  "supplier-risk": "Риски поставщиков",
  "pipeline-incident": "Инциденты пайплайна"
};

const REPORT_TEMPLATES: ReportDefinition[] = [
  {
    type: "daily-overview",
    title: "Оперативная сводка по закупкам",
    description: "Живой обзор объёма закупок, дедлайнов, публикаций и свежести данных.",
    cadenceHours: 12
  },
  {
    type: "supplier-risk",
    title: "Риски поставщиков и концентрация",
    description: "Отчёт по концентрации, контрагентским сигналам и клиентской экспозиции.",
    cadenceHours: 24
  },
  {
    type: "pipeline-incident",
    title: "Надёжность парсеров и пайплайна",
    description: "Контроль проблемных запусков, потерь публикации и деградации источников.",
    cadenceHours: 6
  }
];

const ROLE_REPORT_TYPES: Record<UserRole, string[]> = {
  USER: [],
  ANALYST: ["daily-overview", "supplier-risk"],
  DEVELOPER: ["pipeline-incident"],
  ADMIN: REPORT_TEMPLATES.map((item) => item.type)
};

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
    return {
      ...this.toSummary(report),
      generatedAt: new Date(snapshot.generatedAt),
      metrics: snapshot.metrics,
      highlights: snapshot.highlights,
      scores: snapshot.scores,
      actions: snapshot.actions,
      deadlinePressure: snapshot.deadlinePressure,
      statusMix: snapshot.statusMix,
      amountDistribution: snapshot.amountDistribution,
      customerExposure: snapshot.customerExposure,
      sourceContribution: snapshot.sourceContribution,
      sourceHealth: snapshot.sourceHealth.map((item) => ({
        ...item,
        lastRunAt: item.lastRunAt ? new Date(item.lastRunAt) : null
      })),
      supplierExposure: snapshot.supplierExposure,
      recentSourceRuns: snapshot.recentSourceRuns.map((item) => ({
        ...item,
        startedAt: new Date(item.startedAt),
        finishedAt: item.finishedAt ? new Date(item.finishedAt) : null
      })),
      recentProcurements: snapshot.recentProcurements.map((item) => ({
        ...item,
        publishedAt: item.publishedAt ? new Date(item.publishedAt) : null,
        deadlineAt: item.deadlineAt ? new Date(item.deadlineAt) : null,
        createdAt: item.createdAt ? new Date(item.createdAt) : undefined,
        updatedAt: item.updatedAt ? new Date(item.updatedAt) : undefined
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
          recentSourceRuns: recentProblematicRuns,
          recentProcurements: this.selectLargestProcurements(analytics.attentionProcurements)
        };
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
