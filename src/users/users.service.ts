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

  async updateProfile(
    userId: string,
    input: { email: string; fullName: string; avatarUrl?: string | null }
  ) {
    const user = await this.requireActiveUser(userId);
    const normalizedEmail = input.email.trim().toLowerCase();
    const fullName = input.fullName.trim();

    const existingByEmail = await this.prisma.user.findUnique({
      where: { email: normalizedEmail }
    });

    if (existingByEmail && existingByEmail.id !== user.id && !existingByEmail.deletedAt) {
      throw new ConflictException("User with this email already exists");
    }

    const avatarUrl =
      input.avatarUrl === undefined
        ? user.avatarUrl
        : input.avatarUrl && input.avatarUrl.trim().length > 0
          ? input.avatarUrl.trim()
          : null;

    if (avatarUrl && avatarUrl.length > 2_000_000) {
      throw new ConflictException("Avatar image is too large");
    }

    return this.prisma.user.update({
      where: { id: user.id },
      data: {
        email: normalizedEmail,
        fullName,
        avatarUrl
      }
    });
  }

  listUsers() {
    return this.prisma.user.findMany({
      where: { deletedAt: null },
      orderBy: [{ isActive: "desc" }, { role: "desc" }, { createdAt: "desc" }]
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

  async updateUser(
    userId: string,
    input: {
      email: string;
      fullName: string;
      avatarUrl?: string | null;
      role: UserRole;
      newPassword?: string | null;
    },
    actor: AuthenticatedUser,
    request?: RequestLike
  ) {
    const existingUser = await this.requireExistingUser(userId);
    const normalizedEmail = input.email.trim().toLowerCase();
    const fullName = input.fullName.trim();

    const existingByEmail = await this.prisma.user.findUnique({
      where: { email: normalizedEmail }
    });

    if (existingByEmail && existingByEmail.id !== existingUser.id && !existingByEmail.deletedAt) {
      throw new ConflictException("User with this email already exists");
    }

    const avatarUrl =
      input.avatarUrl === undefined
        ? existingUser.avatarUrl
        : input.avatarUrl && input.avatarUrl.trim().length > 0
          ? input.avatarUrl.trim()
          : null;

    if (avatarUrl && avatarUrl.length > 2_000_000) {
      throw new ConflictException("Avatar image is too large");
    }

    const normalizedPassword = input.newPassword?.trim();
    const passwordHash =
      normalizedPassword && normalizedPassword.length > 0
        ? await this.authService.hashPassword(normalizedPassword)
        : undefined;

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        email: normalizedEmail,
        fullName,
        avatarUrl,
        role: input.role,
        ...(passwordHash ? { passwordHash } : {})
      }
    });

    if (passwordHash) {
      await this.revokeUserSessions(updated.id);
    }

    await this.auditService.record(
      AuditAction.USER_ROLE_UPDATED,
      "User",
      updated.id,
      {
        actorId: actor.id,
        role: input.role,
        email: normalizedEmail,
        fullName,
        avatarChanged: avatarUrl !== existingUser.avatarUrl,
        passwordChanged: Boolean(passwordHash)
      },
      this.buildAuditContext(actor, request)
    );

    if (passwordHash) {
      await this.auditService.record(
        AuditAction.USER_PASSWORD_CHANGED,
        "User",
        updated.id,
        { actorId: actor.id, resetByAdmin: true, viaUpdateUser: true },
        this.buildAuditContext(actor, request)
      );
    }

    return updated;
  }

  async updateUserRole(
    userId: string,
    role: UserRole,
    actor: AuthenticatedUser,
    request?: RequestLike
  ) {
    await this.requireExistingUser(userId);

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

    await this.requireExistingUser(userId);

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        isActive: false
      }
    });
    await this.revokeUserSessions(user.id);

    await this.auditService.record(
      AuditAction.USER_ROLE_UPDATED,
      "User",
      user.id,
      { actorId: actor.id, deactivated: true },
      this.buildAuditContext(actor, request)
    );

    return true;
  }

  async deleteUser(userId: string, actor: AuthenticatedUser, request?: RequestLike) {
    if (userId === actor.id) {
      throw new ConflictException("You cannot delete your own account");
    }

    await this.requireExistingUser(userId);

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        isActive: false,
        deletedAt: new Date()
      }
    });
    await this.revokeUserSessions(user.id);

    await this.auditService.record(
      AuditAction.USER_ROLE_UPDATED,
      "User",
      user.id,
      { actorId: actor.id, deleted: true },
      this.buildAuditContext(actor, request)
    );

    return true;
  }

  async setUserActive(
    userId: string,
    isActive: boolean,
    actor: AuthenticatedUser,
    request?: RequestLike
  ) {
    const existingUser = await this.requireExistingUser(userId);

    if (existingUser.id === actor.id && !isActive) {
      throw new ConflictException("You cannot deactivate your own account");
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { isActive }
    });

    if (!isActive) {
      await this.revokeUserSessions(user.id);
    }

    await this.auditService.record(
      AuditAction.USER_ROLE_UPDATED,
      "User",
      user.id,
      { actorId: actor.id, isActive },
      this.buildAuditContext(actor, request)
    );

    return user;
  }

  async resetUserPassword(
    userId: string,
    newPassword: string,
    actor: AuthenticatedUser,
    request?: RequestLike
  ) {
    await this.requireExistingUser(userId);

    const passwordHash = await this.authService.hashPassword(newPassword);
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash }
    });

    await this.revokeUserSessions(user.id);

    await this.auditService.record(
      AuditAction.USER_PASSWORD_CHANGED,
      "User",
      user.id,
      { actorId: actor.id, resetByAdmin: true },
      this.buildAuditContext(actor, request)
    );

    return user;
  }

  private async requireActiveUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt || !user.isActive) {
      throw new NotFoundException("User not found");
    }

    return user;
  }

  private async requireExistingUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt) {
      throw new NotFoundException("User not found");
    }

    return user;
  }

  private async revokeUserSessions(userId: string) {
    await this.prisma.userSession.updateMany({
      where: {
        userId,
        revokedAt: null
      },
      data: {
        revokedAt: new Date()
      }
    });
  }

  private buildAuditContext(actor: AuthenticatedUser, request?: RequestLike) {
    return {
      ...extractRequestContext(request),
      userId: actor.id
    };
  }
}
