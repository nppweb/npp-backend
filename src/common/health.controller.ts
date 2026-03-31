import { Controller, Get, HttpCode, HttpStatus } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async health() {
    const database = await this.checkDatabase();
    return {
      service: "backend-api",
      status: database ? "ok" : "degraded",
      database,
      timestamp: new Date().toISOString()
    };
  }

  @Get("live")
  @HttpCode(HttpStatus.OK)
  liveness() {
    return { status: "ok" };
  }

  @Get("ready")
  async readiness() {
    const database = await this.checkDatabase();
    return {
      status: database ? "ready" : "not-ready",
      checks: { database }
    };
  }

  private async checkDatabase(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
