import {
  AuditAction,
  PrismaClient,
  ProcurementStatus,
  ReportStatus,
  SourceKind,
  SourceRunStatus,
  UserRole
} from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const defaultPasswordHash = await hash("12345678", 12);
  const optionalAdminEmail = process.env.ADMIN_EMAIL?.toLowerCase();
  const optionalAdminPassword = process.env.ADMIN_PASSWORD;
  const optionalAdminFullName = process.env.ADMIN_FULL_NAME ?? "AIMSORA Administrator";

  const admin = await prisma.user.upsert({
    where: { email: "admin@admin.ru" },
    update: {
      fullName: "Super Administrator",
      role: UserRole.ADMIN,
      isActive: true,
      deletedAt: null,
      passwordHash: defaultPasswordHash
    },
    create: {
      email: "admin@admin.ru",
      fullName: "Super Administrator",
      role: UserRole.ADMIN,
      passwordHash: defaultPasswordHash
    }
  });

  await prisma.user.upsert({
    where: { email: "analyst@admin.ru" },
    update: {
      fullName: "Demo Analyst",
      role: UserRole.ANALYST,
      isActive: true,
      deletedAt: null,
      passwordHash: defaultPasswordHash
    },
    create: {
      email: "analyst@admin.ru",
      fullName: "Demo Analyst",
      role: UserRole.ANALYST,
      passwordHash: defaultPasswordHash
    }
  });

  await prisma.user.upsert({
    where: { email: "user@admin.ru" },
    update: {
      fullName: "Demo User",
      role: UserRole.USER,
      isActive: true,
      deletedAt: null,
      passwordHash: defaultPasswordHash
    },
    create: {
      email: "user@admin.ru",
      fullName: "Demo User",
      role: UserRole.USER,
      passwordHash: defaultPasswordHash
    }
  });

  if (optionalAdminEmail && optionalAdminPassword && optionalAdminEmail !== "admin@admin.ru") {
    await prisma.user.upsert({
      where: { email: optionalAdminEmail },
      update: {
        fullName: optionalAdminFullName,
        role: UserRole.ADMIN,
        isActive: true,
        deletedAt: null,
        passwordHash: await hash(optionalAdminPassword, 12)
      },
      create: {
        email: optionalAdminEmail,
        fullName: optionalAdminFullName,
        role: UserRole.ADMIN,
        passwordHash: await hash(optionalAdminPassword, 12)
      }
    });
  }

  const demoSource = await prisma.source.upsert({
    where: { code: "demo-source" },
    update: {
      name: "Demo Source",
      kind: SourceKind.DEMO,
      baseUrl: "https://example.org",
      isActive: true,
      deletedAt: null,
      description: "Safe demo adapter used for local verification."
    },
    create: {
      code: "demo-source",
      name: "Demo Source",
      kind: SourceKind.DEMO,
      baseUrl: "https://example.org",
      isActive: true,
      description: "Safe demo adapter used for local verification."
    }
  });

  const findTenderSource = await prisma.source.upsert({
    where: { code: "find-tender" },
    update: {
      name: "Find a Tender (UK)",
      kind: SourceKind.FIND_TENDER,
      baseUrl: "https://www.find-tender.service.gov.uk",
      isActive: true,
      deletedAt: null,
      description: "Official public OCDS procurement API used as the production-grade example adapter."
    },
    create: {
      code: "find-tender",
      name: "Find a Tender (UK)",
      kind: SourceKind.FIND_TENDER,
      baseUrl: "https://www.find-tender.service.gov.uk",
      isActive: true,
      description: "Official public OCDS procurement API used as the production-grade example adapter."
    }
  });

  const alfaSupplier = await prisma.supplier.upsert({
    where: { normalizedName: "ooo alfa" },
    update: {
      name: "ООО Альфа",
      metadata: { country: "RU", source: "seed" },
      deletedAt: null
    },
    create: {
      name: "ООО Альфа",
      normalizedName: "ooo alfa",
      metadata: { country: "RU", source: "seed" }
    }
  });

  const betaSupplier = await prisma.supplier.upsert({
    where: { normalizedName: "ooo beta" },
    update: {
      name: "ООО Бета",
      metadata: { country: "RU", source: "seed" },
      deletedAt: null
    },
    create: {
      name: "ООО Бета",
      normalizedName: "ooo beta",
      metadata: { country: "RU", source: "seed" }
    }
  });

  const acmeSupplier = await prisma.supplier.upsert({
    where: { normalizedName: "acme analytics" },
    update: {
      name: "Acme Analytics",
      metadata: { country: "UK", source: "seed" },
      deletedAt: null
    },
    create: {
      name: "Acme Analytics",
      normalizedName: "acme analytics",
      metadata: { country: "UK", source: "seed" }
    }
  });

  const sourceRuns = [
    {
      runKey: "demo-source:2026-03-29T09:00:00.000Z",
      sourceId: demoSource.id,
      status: SourceRunStatus.SUCCESS,
      startedAt: new Date("2026-03-29T09:00:00.000Z"),
      finishedAt: new Date("2026-03-29T09:06:00.000Z"),
      triggeredById: admin.id,
      itemsDiscovered: 4,
      itemsPublished: 3,
      itemsFailed: 1,
      errorMessage: null,
      metadata: { mode: "seed", channel: "demo" }
    },
    {
      runKey: "find-tender:2026-03-30T11:00:00.000Z",
      sourceId: findTenderSource.id,
      status: SourceRunStatus.SUCCESS,
      startedAt: new Date("2026-03-30T11:00:00.000Z"),
      finishedAt: new Date("2026-03-30T11:08:00.000Z"),
      triggeredById: admin.id,
      itemsDiscovered: 8,
      itemsPublished: 8,
      itemsFailed: 0,
      errorMessage: null,
      metadata: { mode: "seed", channel: "find-tender" }
    },
    {
      runKey: "find-tender:2026-03-31T07:00:00.000Z",
      sourceId: findTenderSource.id,
      status: SourceRunStatus.FAILED,
      startedAt: new Date("2026-03-31T07:00:00.000Z"),
      finishedAt: new Date("2026-03-31T07:04:00.000Z"),
      triggeredById: admin.id,
      itemsDiscovered: 2,
      itemsPublished: 0,
      itemsFailed: 2,
      errorMessage: "Temporary upstream schema mismatch",
      metadata: { mode: "seed", channel: "find-tender" }
    }
  ];

  for (const run of sourceRuns) {
    await prisma.sourceRun.upsert({
      where: { runKey: run.runKey },
      update: run,
      create: run
    });
  }

  const procurements = [
    {
      externalId: "DEMO-2026-001",
      sourceId: demoSource.id,
      supplierId: alfaSupplier.id,
      title: "Поставка серверного оборудования",
      description: "Закупка стоечного оборудования для дата-центра.",
      customerName: "ГУП Технопарк",
      amount: 1250000,
      currency: "RUB",
      publishedAt: new Date("2026-03-24T09:00:00.000Z"),
      deadlineAt: new Date("2026-04-04T18:00:00.000Z"),
      status: ProcurementStatus.ACTIVE,
      sourceUrl: "https://example.org/procurements/demo-2026-001"
    },
    {
      externalId: "DEMO-2026-002",
      sourceId: demoSource.id,
      supplierId: betaSupplier.id,
      title: "Техническая поддержка контакт-центра",
      description: "Годовой контракт на поддержку 24/7.",
      customerName: "МФЦ Город",
      amount: 540000,
      currency: "RUB",
      publishedAt: new Date("2026-03-26T12:30:00.000Z"),
      deadlineAt: new Date("2026-03-31T15:00:00.000Z"),
      status: ProcurementStatus.CLOSED,
      sourceUrl: "https://example.org/procurements/demo-2026-002"
    },
    {
      externalId: "DEMO-2026-003",
      sourceId: demoSource.id,
      supplierId: null,
      title: "Пилотный R&D тендер",
      description: "Черновая публикация для внутреннего сценария.",
      customerName: "Инновационный фонд",
      amount: 210000,
      currency: "RUB",
      publishedAt: new Date("2026-03-30T08:00:00.000Z"),
      deadlineAt: new Date("2026-04-10T17:00:00.000Z"),
      status: ProcurementStatus.DRAFT,
      sourceUrl: "https://example.org/procurements/demo-2026-003"
    },
    {
      externalId: "FAT-2026-100",
      sourceId: findTenderSource.id,
      supplierId: acmeSupplier.id,
      title: "Regional analytics platform rollout",
      description: "Cross-region analytics and compliance reporting rollout.",
      customerName: "North Borough Council",
      amount: 985000,
      currency: "GBP",
      publishedAt: new Date("2026-03-29T10:15:00.000Z"),
      deadlineAt: new Date("2026-04-05T12:00:00.000Z"),
      status: ProcurementStatus.ACTIVE,
      sourceUrl: "https://www.find-tender.service.gov.uk/Notice/FAT-2026-100"
    },
    {
      externalId: "FAT-2026-101",
      sourceId: findTenderSource.id,
      supplierId: acmeSupplier.id,
      title: "Legacy contract migration audit",
      description: "Archived historical procurement used for dashboard history.",
      customerName: "South Borough Council",
      amount: 315000,
      currency: "GBP",
      publishedAt: new Date("2026-03-20T08:45:00.000Z"),
      deadlineAt: new Date("2026-03-24T12:00:00.000Z"),
      status: ProcurementStatus.ARCHIVED,
      sourceUrl: "https://www.find-tender.service.gov.uk/Notice/FAT-2026-101"
    },
    {
      externalId: "FAT-2026-102",
      sourceId: findTenderSource.id,
      supplierId: betaSupplier.id,
      title: "Cloud support framework",
      description: "Closed procurement for cloud support and observability.",
      customerName: "Central Health Agency",
      amount: 730000,
      currency: "GBP",
      publishedAt: new Date("2026-03-31T07:30:00.000Z"),
      deadlineAt: new Date("2026-04-07T12:00:00.000Z"),
      status: ProcurementStatus.CLOSED,
      sourceUrl: "https://www.find-tender.service.gov.uk/Notice/FAT-2026-102"
    }
  ];

  for (const procurement of procurements) {
    await prisma.procurement.upsert({
      where: {
        sourceId_externalId: {
          sourceId: procurement.sourceId,
          externalId: procurement.externalId
        }
      },
      update: {
        supplierId: procurement.supplierId,
        title: procurement.title,
        description: procurement.description,
        customerName: procurement.customerName,
        amount: procurement.amount,
        currency: procurement.currency,
        publishedAt: procurement.publishedAt,
        deadlineAt: procurement.deadlineAt,
        status: procurement.status,
        sourceUrl: procurement.sourceUrl,
        rawPayload: { seed: true, externalId: procurement.externalId },
        deletedAt: null
      },
      create: {
        ...procurement,
        rawPayload: { seed: true, externalId: procurement.externalId }
      }
    });
  }

  const fat102 = await prisma.procurement.findUniqueOrThrow({
    where: {
      sourceId_externalId: {
        sourceId: findTenderSource.id,
        externalId: "FAT-2026-102"
      }
    }
  });

  const reports = [
    {
      id: "00000000-0000-0000-0000-000000000001",
      name: "Daily Procurement Overview",
      description: "Snapshot for the main dashboard cards and trends.",
      status: ReportStatus.READY,
      metadata: { generatedBy: "seed", type: "daily-overview" }
    },
    {
      id: "00000000-0000-0000-0000-000000000002",
      name: "Supplier Risk Watch",
      description: "Demo analytical report for supplier monitoring.",
      status: ReportStatus.READY,
      metadata: { generatedBy: "seed", type: "supplier-risk" }
    },
    {
      id: "00000000-0000-0000-0000-000000000003",
      name: "Pipeline Incident Digest",
      description: "Failed and partial ingest runs for troubleshooting.",
      status: ReportStatus.FAILED,
      metadata: { generatedBy: "seed", type: "pipeline-incident" }
    }
  ];

  for (const report of reports) {
    await prisma.report.upsert({
      where: { id: report.id },
      update: {
        name: report.name,
        description: report.description,
        status: report.status,
        metadata: report.metadata,
        createdById: admin.id,
        deletedAt: null
      },
      create: {
        ...report,
        createdById: admin.id
      }
    });
  }

  const auditLogs = [
    {
      id: "10000000-0000-0000-0000-000000000001",
      userId: admin.id,
      action: AuditAction.USER_LOGIN,
      entityType: "User",
      entityId: admin.id,
      details: { seed: true, email: admin.email },
      ipAddress: "127.0.0.1",
      userAgent: "seed-script"
    },
    {
      id: "10000000-0000-0000-0000-000000000002",
      userId: admin.id,
      action: AuditAction.PROCUREMENT_INGESTED,
      entityType: "Procurement",
      entityId: fat102.id,
      details: { seed: true, source: "find-tender", externalId: "FAT-2026-102" },
      ipAddress: "127.0.0.1",
      userAgent: "seed-script"
    },
    {
      id: "10000000-0000-0000-0000-000000000003",
      userId: admin.id,
      action: AuditAction.USER_CREATED,
      entityType: "User",
      entityId: undefined,
      details: { seed: true, createdEmail: "analyst@admin.ru" },
      ipAddress: "127.0.0.1",
      userAgent: "seed-script"
    }
  ];

  for (const auditLog of auditLogs) {
    await prisma.auditLog.upsert({
      where: { id: auditLog.id },
      update: auditLog,
      create: auditLog
    });
  }
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
