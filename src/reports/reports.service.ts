import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  listReports() {
    return this.prisma.report.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" }
    });
  }
}
