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

async function upsertSource(input: {
  code: string;
  name: string;
  kind: SourceKind;
  baseUrl: string;
  description: string;
}) {
  return prisma.source.upsert({
    where: { code: input.code },
    update: {
      name: input.name,
      kind: input.kind,
      baseUrl: input.baseUrl,
      description: input.description,
      isActive: true,
      deletedAt: null
    },
    create: {
      code: input.code,
      name: input.name,
      kind: input.kind,
      baseUrl: input.baseUrl,
      description: input.description,
      isActive: true
    }
  });
}

async function main() {
  const defaultPasswordHash = await hash("12345678", 12);
  const optionalAdminEmail = process.env.ADMIN_EMAIL?.toLowerCase();
  const optionalAdminPassword = process.env.ADMIN_PASSWORD;
  const optionalAdminFullName = process.env.ADMIN_FULL_NAME ?? "NPPWEB Administrator";

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
      fullName: "Lead Analyst",
      role: UserRole.ANALYST,
      isActive: true,
      deletedAt: null,
      passwordHash: defaultPasswordHash
    },
    create: {
      email: "analyst@admin.ru",
      fullName: "Lead Analyst",
      role: UserRole.ANALYST,
      passwordHash: defaultPasswordHash
    }
  });

  await prisma.user.upsert({
    where: { email: "developer@admin.ru" },
    update: {
      fullName: "Platform Developer",
      role: UserRole.DEVELOPER,
      isActive: true,
      deletedAt: null,
      passwordHash: defaultPasswordHash
    },
    create: {
      email: "developer@admin.ru",
      fullName: "Platform Developer",
      role: UserRole.DEVELOPER,
      passwordHash: defaultPasswordHash
    }
  });

  await prisma.user.upsert({
    where: { email: "user@admin.ru" },
    update: {
      fullName: "Platform User",
      role: UserRole.USER,
      isActive: true,
      deletedAt: null,
      passwordHash: defaultPasswordHash
    },
    create: {
      email: "user@admin.ru",
      fullName: "Platform User",
      role: UserRole.USER,
      passwordHash: defaultPasswordHash
    }
  });

  if (optionalAdminEmail && optionalAdminPassword && optionalAdminEmail !== "admin@admin.ru") {
    const optionalAdminPasswordHash = await hash(optionalAdminPassword, 12);

    await prisma.user.upsert({
      where: { email: optionalAdminEmail },
      update: {
        fullName: optionalAdminFullName,
        role: UserRole.ADMIN,
        isActive: true,
        deletedAt: null,
        passwordHash: optionalAdminPasswordHash
      },
      create: {
        email: optionalAdminEmail,
        fullName: optionalAdminFullName,
        role: UserRole.ADMIN,
        passwordHash: optionalAdminPasswordHash
      }
    });
  }

  await prisma.source.updateMany({
    where: {
      code: { in: ["demo-source", "find-tender"] }
    },
    data: {
      isActive: false,
      deletedAt: new Date()
    }
  });

  const easuzSource = await upsertSource({
    code: "easuz",
    name: "ЕАСУЗ Московской области",
    kind: SourceKind.EASUZ,
    baseUrl: "https://easuz.mosreg.ru",
    description: "Региональный источник закупок Московской области."
  });
  const eisSource = await upsertSource({
    code: "eis",
    name: "ЕИС / zakupki.gov.ru",
    kind: SourceKind.EIS,
    baseUrl: "https://zakupki.gov.ru",
    description: "Федеральный источник закупок ЕИС."
  });
  const rnpSource = await upsertSource({
    code: "rnp",
    name: "Реестр недобросовестных поставщиков",
    kind: SourceKind.RNP,
    baseUrl: "https://zakupki.gov.ru",
    description: "Реестр недобросовестных поставщиков."
  });
  const fedresursSource = await upsertSource({
    code: "fedresurs",
    name: "Федресурс",
    kind: SourceKind.FEDRESURS,
    baseUrl: "https://bankrot.fedresurs.ru",
    description: "Источник риск-сигналов о банкротстве и иных событиях."
  });
  const fnsSource = await upsertSource({
    code: "fns",
    name: "ФНС ЕГРЮЛ/ЕГРИП",
    kind: SourceKind.FNS,
    baseUrl: "https://egrul.nalog.ru",
    description: "Источник регистрационных и корпоративных данных."
  });
  const gistorgiSource = await upsertSource({
    code: "gistorgi",
    name: "ГИС Торги",
    kind: SourceKind.GISTORGI,
    baseUrl: "https://torgi.gov.ru",
    description: "Источник лотов и торгов с torgi.gov.ru."
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

  const gammaSupplier = await prisma.supplier.upsert({
    where: { normalizedName: "ooo gamma" },
    update: {
      name: "ООО Гамма",
      metadata: { country: "RU", source: "seed" },
      deletedAt: null
    },
    create: {
      name: "ООО Гамма",
      normalizedName: "ooo gamma",
      metadata: { country: "RU", source: "seed" }
    }
  });

  const sourceRuns = [
    {
      runKey: "eis:2026-03-30T11:00:00.000Z",
      sourceId: eisSource.id,
      status: SourceRunStatus.SUCCESS,
      startedAt: new Date("2026-03-30T11:00:00.000Z"),
      finishedAt: new Date("2026-03-30T11:08:00.000Z"),
      triggeredById: admin.id,
      itemsDiscovered: 8,
      itemsPublished: 7,
      itemsFailed: 1,
      errorMessage: null,
      metadata: { mode: "seed", channel: "eis" }
    },
    {
      runKey: "easuz:2026-03-31T07:00:00.000Z",
      sourceId: easuzSource.id,
      status: SourceRunStatus.PARTIAL,
      startedAt: new Date("2026-03-31T07:00:00.000Z"),
      finishedAt: new Date("2026-03-31T07:06:00.000Z"),
      triggeredById: admin.id,
      itemsDiscovered: 5,
      itemsPublished: 3,
      itemsFailed: 2,
      errorMessage: "Часть карточек не прошла нормализацию",
      metadata: { mode: "seed", channel: "easuz" }
    },
    {
      runKey: "gistorgi:2026-04-01T09:00:00.000Z",
      sourceId: gistorgiSource.id,
      status: SourceRunStatus.SUCCESS,
      startedAt: new Date("2026-04-01T09:00:00.000Z"),
      finishedAt: new Date("2026-04-01T09:03:00.000Z"),
      triggeredById: admin.id,
      itemsDiscovered: 4,
      itemsPublished: 4,
      itemsFailed: 0,
      errorMessage: null,
      metadata: { mode: "seed", channel: "gistorgi" }
    },
    {
      runKey: "fedresurs:2026-04-01T10:30:00.000Z",
      sourceId: fedresursSource.id,
      status: SourceRunStatus.SUCCESS,
      startedAt: new Date("2026-04-01T10:30:00.000Z"),
      finishedAt: new Date("2026-04-01T10:32:00.000Z"),
      triggeredById: admin.id,
      itemsDiscovered: 3,
      itemsPublished: 3,
      itemsFailed: 0,
      errorMessage: null,
      metadata: { mode: "seed", channel: "fedresurs" }
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
      externalId: "EIS-2026-001",
      sourceId: eisSource.id,
      supplierId: alfaSupplier.id,
      title: "Поставка серверного оборудования",
      description: "Закупка стоечного оборудования для регионального дата-центра.",
      customerName: "ГУП Технопарк",
      amount: 1250000,
      currency: "RUB",
      publishedAt: new Date("2026-03-24T09:00:00.000Z"),
      deadlineAt: new Date("2026-04-04T18:00:00.000Z"),
      status: ProcurementStatus.ACTIVE,
      sourceUrl: "https://zakupki.gov.ru/epz/order/notice/ea44/view/common-info.html?regNumber=EIS-2026-001"
    },
    {
      externalId: "EIS-2026-002",
      sourceId: eisSource.id,
      supplierId: betaSupplier.id,
      title: "Техническая поддержка контакт-центра",
      description: "Годовой контракт на поддержку сервисов 24/7.",
      customerName: "МФЦ Город",
      amount: 540000,
      currency: "RUB",
      publishedAt: new Date("2026-03-26T12:30:00.000Z"),
      deadlineAt: new Date("2026-03-31T15:00:00.000Z"),
      status: ProcurementStatus.CLOSED,
      sourceUrl: "https://zakupki.gov.ru/epz/order/notice/ea44/view/common-info.html?regNumber=EIS-2026-002"
    },
    {
      externalId: "EASUZ-2026-015",
      sourceId: easuzSource.id,
      supplierId: gammaSupplier.id,
      title: "Разработка модуля аналитической отчётности",
      description: "Развитие региональной платформы аналитики закупок.",
      customerName: "Комитет цифрового развития МО",
      amount: 2985000,
      currency: "RUB",
      publishedAt: new Date("2026-03-30T08:00:00.000Z"),
      deadlineAt: new Date("2026-04-10T17:00:00.000Z"),
      status: ProcurementStatus.ACTIVE,
      sourceUrl: "https://easuz.mosreg.ru/tenders/EASUZ-2026-015"
    },
    {
      externalId: "GISTORGI-2026-041",
      sourceId: gistorgiSource.id,
      supplierId: null,
      title: "Аукцион на аренду имущественного комплекса",
      description: "Публичные торги по имущественному комплексу муниципального уровня.",
      customerName: "Администрация городского округа",
      amount: 870000,
      currency: "RUB",
      publishedAt: new Date("2026-03-29T10:15:00.000Z"),
      deadlineAt: new Date("2026-04-05T12:00:00.000Z"),
      status: ProcurementStatus.ACTIVE,
      sourceUrl: "https://torgi.gov.ru/new/public/lots/lot/GISTORGI-2026-041"
    },
    {
      externalId: "GISTORGI-2026-042",
      sourceId: gistorgiSource.id,
      supplierId: betaSupplier.id,
      title: "Закрытый аукцион на складскую инфраструктуру",
      description: "Архивная запись завершённых торгов для исторической аналитики.",
      customerName: "ГУП Логистика региона",
      amount: 315000,
      currency: "RUB",
      publishedAt: new Date("2026-03-20T08:45:00.000Z"),
      deadlineAt: new Date("2026-03-24T12:00:00.000Z"),
      status: ProcurementStatus.ARCHIVED,
      sourceUrl: "https://torgi.gov.ru/new/public/lots/lot/GISTORGI-2026-042"
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

  const gistorgiProcurement = await prisma.procurement.findUniqueOrThrow({
    where: {
      sourceId_externalId: {
        sourceId: gistorgiSource.id,
        externalId: "GISTORGI-2026-042"
      }
    }
  });

  const reports = [
    {
      id: "00000000-0000-0000-0000-000000000001",
      name: "Daily Procurement Overview",
      description: "Ежедневный обзор закупок и активности источников.",
      status: ReportStatus.READY,
      metadata: { generatedBy: "seed", type: "daily-overview" }
    },
    {
      id: "00000000-0000-0000-0000-000000000002",
      name: "Supplier Risk Watch",
      description: "Отчёт по отслеживанию рисков и контрагентов.",
      status: ReportStatus.READY,
      metadata: { generatedBy: "seed", type: "supplier-risk" }
    },
    {
      id: "00000000-0000-0000-0000-000000000003",
      name: "Pipeline Incident Digest",
      description: "Сводка частичных и неуспешных прогонов сборщиков.",
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
      entityId: gistorgiProcurement.id,
      details: { seed: true, source: "gistorgi", externalId: "GISTORGI-2026-042" },
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

  await prisma.procurement.updateMany({
    where: {
      source: {
        code: { in: ["demo-source", "find-tender"] }
      }
    },
    data: {
      deletedAt: new Date()
    }
  });
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
