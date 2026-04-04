import {
  ConflictException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { AuditAction, UserRole } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import type { AuthenticatedUser } from "../common/authenticated-user";
import type { RequestLike } from "../common/request-context";
import { extractRequestContext } from "../common/request-context";
import { PrismaService } from "../prisma/prisma.service";
import { AuthService } from "../auth/auth.service";

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly auditService: AuditService
  ) {}

  async me(userId: string) {
    return this.requireActiveUser(userId);
  }

  listUsers() {
    return this.prisma.user.findMany({
      where: { deletedAt: null },
      orderBy: [{ role: "desc" }, { createdAt: "desc" }]
    });
  }

  async createUser(
    input: { email: string; fullName: string; password: string; role: UserRole },
    actor: AuthenticatedUser,
    request?: RequestLike
  ) {
    const normalizedEmail = input.email.toLowerCase();
    const passwordHash = await this.authService.hashPassword(input.password);
    const exists = await this.prisma.user.findUnique({
      where: { email: normalizedEmail }
    });

    if (exists && !exists.deletedAt) {
      throw new ConflictException("User already exists");
    }

    const user = await this.prisma.user.upsert({
      where: { email: normalizedEmail },
      update: {
        fullName: input.fullName,
        passwordHash,
        role: input.role,
        isActive: true,
        deletedAt: null
      },
      create: {
        email: normalizedEmail,
        fullName: input.fullName,
        passwordHash,
        role: input.role
      }
    });

    await this.auditService.record(
      AuditAction.USER_CREATED,
      "User",
      user.id,
      { actorId: actor.id, role: user.role },
      this.buildAuditContext(actor, request)
    );

    return user;
  }

  async updateUserRole(
    userId: string,
    role: UserRole,
    actor: AuthenticatedUser,
    request?: RequestLike
  ) {
    await this.requireActiveUser(userId);

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { role }
    });

    await this.auditService.record(
      AuditAction.USER_ROLE_UPDATED,
      "User",
      updated.id,
      { actorId: actor.id, role },
      this.buildAuditContext(actor, request)
    );

    return updated;
  }

  async deactivateUser(userId: string, actor: AuthenticatedUser, request?: RequestLike) {
    if (userId === actor.id) {
      throw new ConflictException("You cannot deactivate your own account");
    }

    await this.requireActiveUser(userId);

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        isActive: false,
        deletedAt: new Date()
      }
    });

    await this.auditService.record(
      AuditAction.USER_ROLE_UPDATED,
      "User",
      user.id,
      { actorId: actor.id, deactivated: true },
      this.buildAuditContext(actor, request)
    );

    return true;
  }

  private async requireActiveUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt) {
      throw new NotFoundException("User not found");
    }

    return user;
  }

  private buildAuditContext(actor: AuthenticatedUser, request?: RequestLike) {
    return {
      ...extractRequestContext(request),
      userId: actor.id
    };
  }
}
