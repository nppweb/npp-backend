import { ConflictException } from "@nestjs/common";
import { AuditAction, UserRole } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import type { AuthenticatedUser } from "../common/authenticated-user";
import { UsersService } from "./users.service";

describe("UsersService", () => {
  const actor: AuthenticatedUser = {
    id: "admin-1",
    email: "admin@aimsora.local",
    fullName: "Admin User",
    role: UserRole.ADMIN
  };

  it("normalizes email and hashes password once when creating a user", async () => {
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockResolvedValue({
          id: "user-1",
          email: "new.user@aimsora.local",
          fullName: "New User",
          role: UserRole.ANALYST
        })
      }
    };
    const authService = {
      hashPassword: vi.fn().mockResolvedValue("hashed-password")
    };
    const auditService = {
      record: vi.fn().mockResolvedValue(undefined)
    };

    const service = new UsersService(prisma as never, authService as never, auditService as never);

    const result = await service.createUser(
      {
        email: "New.User@Aimsora.Local",
        fullName: "New User",
        password: "super-secret-password",
        role: UserRole.ANALYST
      },
      actor,
      {
        headers: { "user-agent": "vitest" },
        id: "req-1",
        ip: "127.0.0.1"
      }
    );

    expect(result).toMatchObject({
      id: "user-1",
      email: "new.user@aimsora.local",
      role: UserRole.ANALYST
    });
    expect(authService.hashPassword).toHaveBeenCalledTimes(1);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: "new.user@aimsora.local" }
    });
    expect(prisma.user.upsert).toHaveBeenCalledWith({
      where: { email: "new.user@aimsora.local" },
      update: {
        fullName: "New User",
        passwordHash: "hashed-password",
        role: UserRole.ANALYST,
        isActive: true,
        deletedAt: null
      },
      create: {
        email: "new.user@aimsora.local",
        fullName: "New User",
        passwordHash: "hashed-password",
        role: UserRole.ANALYST
      }
    });
    expect(auditService.record).toHaveBeenCalledWith(
      AuditAction.USER_CREATED,
      "User",
      "user-1",
      { actorId: actor.id, role: UserRole.ANALYST },
      {
        requestId: "req-1",
        ipAddress: "127.0.0.1",
        userAgent: "vitest",
        userId: actor.id
      }
    );
  });

  it("rejects self-deactivation before touching the database", async () => {
    const prisma = {
      user: {
        update: vi.fn()
      }
    };
    const authService = {
      hashPassword: vi.fn()
    };
    const auditService = {
      record: vi.fn()
    };

    const service = new UsersService(prisma as never, authService as never, auditService as never);

    await expect(service.deactivateUser(actor.id, actor)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(auditService.record).not.toHaveBeenCalled();
  });
});
