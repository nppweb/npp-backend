import { PrismaClient, ReportStatus, SourceKind, UserRole } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  await prisma.source.upsert({
    where: { code: "demo-source" },
    update: {
      name: "Demo Source",
      kind: SourceKind.DEMO,
      baseUrl: "https://example.org"
    },
    create: {
      code: "demo-source",
      name: "Demo Source",
      kind: SourceKind.DEMO,
      baseUrl: "https://example.org",
      description: "Safe demo adapter used for local verification."
    }
  });

  await prisma.source.upsert({
    where: { code: "find-tender" },
    update: {
      name: "Find a Tender (UK)",
      kind: SourceKind.FIND_TENDER,
      baseUrl: "https://www.find-tender.service.gov.uk"
    },
    create: {
      code: "find-tender",
      name: "Find a Tender (UK)",
      kind: SourceKind.FIND_TENDER,
      baseUrl: "https://www.find-tender.service.gov.uk",
      description: "Official public OCDS procurement API used as the production-grade example adapter."
    }
  });

  await prisma.report.upsert({
    where: { id: "00000000-0000-0000-0000-000000000001" },
    update: {
      name: "Daily Procurement Overview",
      status: ReportStatus.READY
    },
    create: {
      id: "00000000-0000-0000-0000-000000000001",
      name: "Daily Procurement Overview",
      description: "Seed metadata entry for the reports screen.",
      status: ReportStatus.READY,
      metadata: { generatedBy: "seed" }
    }
  });

  const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD;
  const adminFullName = process.env.ADMIN_FULL_NAME ?? "AIMSORA Administrator";

  if (adminEmail && adminPassword) {
    await prisma.user.upsert({
      where: { email: adminEmail },
      update: {
        fullName: adminFullName,
        role: UserRole.ADMIN,
        isActive: true,
        deletedAt: null,
        passwordHash: await hash(adminPassword, 12)
      },
      create: {
        email: adminEmail,
        fullName: adminFullName,
        role: UserRole.ADMIN,
        passwordHash: await hash(adminPassword, 12)
      }
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
