import { ConflictException } from "@nestjs/common";
import { AuditAction, UserRole } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import type { AuthenticatedUser } from "../common/authenticated-user";
import { UsersService } from "./users.service";

describe("UsersService", () => {
  const actor: AuthenticatedUser = {
    id: "admin-1",
    email: "admin@nppweb.local",
    fullName: "Admin User",
    role: UserRole.ADMIN
  };

  it("normalizes email and hashes password once when creating a user", async () => {
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockResolvedValue({
          id: "user-1",
          email: "new.user@nppweb.local",
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
        email: "New.User@Nppweb.Local",
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
      email: "new.user@nppweb.local",
      role: UserRole.ANALYST
    });
    expect(authService.hashPassword).toHaveBeenCalledTimes(1);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: "new.user@nppweb.local" }
    });
    expect(prisma.user.upsert).toHaveBeenCalledWith({
      where: { email: "new.user@nppweb.local" },
      update: {
        fullName: "New User",
        passwordHash: "hashed-password",
        role: UserRole.ANALYST,
        isActive: true,
        deletedAt: null
      },
      create: {
        email: "new.user@nppweb.local",
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
      },
      userSession: {
        updateMany: vi.fn()
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

  it("rejects self-deletion before touching the database", async () => {
    const prisma = {
      user: {
        update: vi.fn()
      },
      userSession: {
        updateMany: vi.fn()
      }
    };
    const authService = {
      hashPassword: vi.fn()
    };
    const auditService = {
      record: vi.fn()
    };

    const service = new UsersService(prisma as never, authService as never, auditService as never);

    await expect(service.deleteUser(actor.id, actor)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(auditService.record).not.toHaveBeenCalled();
  });

  it("deactivates user without removing the account and revokes sessions", async () => {
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: "user-2",
          email: "analyst@nppweb.local",
          deletedAt: null,
          isActive: true
        }),
        update: vi.fn().mockResolvedValue({
          id: "user-2",
          email: "analyst@nppweb.local",
          isActive: false
        })
      },
      userSession: {
        updateMany: vi.fn().mockResolvedValue({ count: 2 })
      }
    };
    const authService = {
      hashPassword: vi.fn()
    };
    const auditService = {
      record: vi.fn().mockResolvedValue(undefined)
    };

    const service = new UsersService(prisma as never, authService as never, auditService as never);

    await expect(service.deactivateUser("user-2", actor)).resolves.toBe(true);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-2" },
      data: {
        isActive: false
      }
    });
    expect(prisma.userSession.updateMany).toHaveBeenCalledWith({
      where: {
        userId: "user-2",
        revokedAt: null
      },
      data: {
        revokedAt: expect.any(Date)
      }
    });
  });

  it("updates user card fields, normalizes email and revokes sessions when password changes", async () => {
    const prisma = {
      user: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({
            id: "user-9",
            email: "old.user@nppweb.local",
            fullName: "Old User",
            avatarUrl: null,
            role: UserRole.USER,
            deletedAt: null,
            isActive: true
          })
          .mockResolvedValueOnce(null),
        update: vi.fn().mockResolvedValue({
          id: "user-9",
          email: "new.user@nppweb.local",
          fullName: "Updated User",
          avatarUrl: "data:image/png;base64,avatar",
          role: UserRole.DEVELOPER,
          isActive: true
        })
      },
      userSession: {
        updateMany: vi.fn().mockResolvedValue({ count: 2 })
      }
    };
    const authService = {
      hashPassword: vi.fn().mockResolvedValue("updated-password-hash")
    };
    const auditService = {
      record: vi.fn().mockResolvedValue(undefined)
    };

    const service = new UsersService(prisma as never, authService as never, auditService as never);

    const result = await service.updateUser(
      "user-9",
      {
        email: "New.User@Nppweb.Local",
        fullName: "  Updated User  ",
        avatarUrl: "data:image/png;base64,avatar",
        role: UserRole.DEVELOPER,
        newPassword: "new-password"
      },
      actor
    );

    expect(result).toMatchObject({
      id: "user-9",
      email: "new.user@nppweb.local",
      fullName: "Updated User",
      role: UserRole.DEVELOPER
    });
    expect(authService.hashPassword).toHaveBeenCalledWith("new-password");
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-9" },
      data: {
        email: "new.user@nppweb.local",
        fullName: "Updated User",
        avatarUrl: "data:image/png;base64,avatar",
        role: UserRole.DEVELOPER,
        passwordHash: "updated-password-hash"
      }
    });
    expect(prisma.userSession.updateMany).toHaveBeenCalledWith({
      where: {
        userId: "user-9",
        revokedAt: null
      },
      data: {
        revokedAt: expect.any(Date)
      }
    });
    expect(auditService.record).toHaveBeenNthCalledWith(
      1,
      AuditAction.USER_ROLE_UPDATED,
      "User",
      "user-9",
      expect.objectContaining({
        actorId: actor.id,
        role: UserRole.DEVELOPER,
        email: "new.user@nppweb.local",
        passwordChanged: true
      }),
      expect.objectContaining({ userId: actor.id })
    );
    expect(auditService.record).toHaveBeenNthCalledWith(
      2,
      AuditAction.USER_PASSWORD_CHANGED,
      "User",
      "user-9",
      { actorId: actor.id, resetByAdmin: true, viaUpdateUser: true },
      expect.objectContaining({ userId: actor.id })
    );
  });

  it("soft-deletes user and revokes active sessions", async () => {
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: "user-4",
          email: "disabled@nppweb.local",
          deletedAt: null,
          isActive: true
        }),
        update: vi.fn().mockResolvedValue({
          id: "user-4",
          email: "disabled@nppweb.local",
          isActive: false,
          deletedAt: new Date("2026-04-09T09:00:00.000Z")
        })
      },
      userSession: {
        updateMany: vi.fn().mockResolvedValue({ count: 3 })
      }
    };
    const authService = {
      hashPassword: vi.fn()
    };
    const auditService = {
      record: vi.fn().mockResolvedValue(undefined)
    };

    const service = new UsersService(prisma as never, authService as never, auditService as never);

    await expect(service.deleteUser("user-4", actor)).resolves.toBe(true);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-4" },
      data: {
        isActive: false,
        deletedAt: expect.any(Date)
      }
    });
    expect(prisma.userSession.updateMany).toHaveBeenCalledWith({
      where: {
        userId: "user-4",
        revokedAt: null
      },
      data: {
        revokedAt: expect.any(Date)
      }
    });
    expect(auditService.record).toHaveBeenCalledWith(
      AuditAction.USER_ROLE_UPDATED,
      "User",
      "user-4",
      { actorId: actor.id, deleted: true },
      expect.objectContaining({ userId: actor.id })
    );
  });

  it("resets password and revokes active sessions", async () => {
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: "user-3",
          email: "user@nppweb.local",
          deletedAt: null,
          isActive: true
        }),
        update: vi.fn().mockResolvedValue({
          id: "user-3",
          email: "user@nppweb.local",
          role: UserRole.USER,
          isActive: true
        })
      },
      userSession: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 })
      }
    };
    const authService = {
      hashPassword: vi.fn().mockResolvedValue("new-hash")
    };
    const auditService = {
      record: vi.fn().mockResolvedValue(undefined)
    };

    const service = new UsersService(prisma as never, authService as never, auditService as never);

    const result = await service.resetUserPassword("user-3", "new-password", actor);

    expect(result).toMatchObject({ id: "user-3", email: "user@nppweb.local" });
    expect(authService.hashPassword).toHaveBeenCalledWith("new-password");
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-3" },
      data: { passwordHash: "new-hash" }
    });
    expect(prisma.userSession.updateMany).toHaveBeenCalled();
    expect(auditService.record).toHaveBeenCalledWith(
      AuditAction.USER_PASSWORD_CHANGED,
      "User",
      "user-3",
      { actorId: actor.id, resetByAdmin: true },
      expect.objectContaining({ userId: actor.id })
    );
  });
});
