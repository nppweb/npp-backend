import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class SourcesService {
  constructor(private readonly prisma: PrismaService) {}

  listSources() {
    return this.prisma.source.findMany({
      where: { deletedAt: null },
      orderBy: { code: "asc" }
    });
  }

  async listRuns(sourceCode?: string, limit = 25) {
    const runs = await this.prisma.sourceRun.findMany({
      where: sourceCode ? { source: { code: sourceCode } } : undefined,
      take: limit,
      orderBy: { startedAt: "desc" },
      include: { source: true }
    });

    return runs.map((run) => ({
      ...run,
      sourceCode: run.source.code
    }));
  }
}
