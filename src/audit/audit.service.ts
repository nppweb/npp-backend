import { Injectable } from "@nestjs/common";
import { AuditAction } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { RequestContext } from "../common/request-context";
import { toNullableJson } from "../prisma/json";

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(
    action: AuditAction,
    entityType: string,
    entityId?: string,
    details?: Record<string, unknown>,
    context?: RequestContext
  ): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        action,
        entityType,
        entityId,
        details: toNullableJson(details),
        ipAddress: context?.ipAddress,
        userAgent: context?.userAgent,
        userId: context?.userId
      }
    });
  }
}
