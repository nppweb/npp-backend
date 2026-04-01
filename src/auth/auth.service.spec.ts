import { UnauthorizedException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { hash } from "bcryptjs";
import { describe, expect, it, vi } from "vitest";
import { AuthService } from "./auth.service";

describe("AuthService", () => {
  it("issues access tokens bound to a user session", async () => {
    const prisma = {
      user: {
        findFirst: vi.fn().mockResolvedValue({
          id: "user-1",
          email: "admin@admin.ru",
          passwordHash: await hash("admin", 4),
          fullName: "Local Administrator",
          role: UserRole.ADMIN,
          isActive: true,
          deletedAt: null
        }),
        update: vi.fn().mockResolvedValue(undefined)
      },
      userSession: {
        create: vi.fn().mockResolvedValue({ id: "session-1" })
      }
    };
    const jwtService = {
      signAsync: vi.fn().mockResolvedValue("access-token")
    };
    const configService = {
      get: vi.fn((key: string) => {
        if (key === "JWT_ACCESS_TTL") {
          return "15m";
        }
        if (key === "REFRESH_TOKEN_TTL_DAYS") {
          return 30;
        }
        return undefined;
      }),
      getOrThrow: vi.fn(() => "local-dev-jwt-secret-12345")
    };
    const auditService = {
      record: vi.fn().mockResolvedValue(undefined)
    };

    const service = new AuthService(
      prisma as never,
      jwtService as never,
      configService as never,
      auditService as never
    );

    const result = await service.login("admin@admin.ru", "admin", {
      headers: { "user-agent": "vitest" },
      ip: "127.0.0.1"
    });

    expect(result).toMatchObject({
      accessToken: "access-token",
      expiresInSeconds: 900,
      user: {
        id: "user-1",
        role: UserRole.ADMIN
      }
    });
    expect(prisma.userSession.create).toHaveBeenCalledTimes(1);
    expect(jwtService.signAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        sub: "user-1",
        sid: "session-1"
      }),
      expect.objectContaining({
        expiresIn: "15m"
      })
    );
  });

  it("rejects access tokens for revoked sessions", async () => {
    const prisma = {
      user: {
        findFirst: vi.fn().mockResolvedValue({
          id: "user-1",
          email: "admin@admin.ru",
          fullName: "Local Administrator",
          role: UserRole.ADMIN,
          isActive: true,
          deletedAt: null
        })
      },
      userSession: {
        findFirst: vi.fn().mockResolvedValue(null)
      }
    };
    const jwtService = {
      verifyAsync: vi.fn().mockResolvedValue({
        sub: "user-1",
        sid: "session-1",
        email: "admin@admin.ru",
        fullName: "Local Administrator",
        role: UserRole.ADMIN
      })
    };
    const configService = {
      getOrThrow: vi.fn(() => "local-dev-jwt-secret-12345")
    };
    const auditService = {
      record: vi.fn()
    };

    const service = new AuthService(
      prisma as never,
      jwtService as never,
      configService as never,
      auditService as never
    );

    await expect(service.verifyAccessToken("access-token")).rejects.toBeInstanceOf(
      UnauthorizedException
    );
    expect(prisma.userSession.findFirst).toHaveBeenCalledWith({
      where: {
        id: "session-1",
        userId: "user-1",
        revokedAt: null,
        expiresAt: { gt: expect.any(Date) }
      }
    });
  });

  it("revokes refresh-token session on logout", async () => {
    const prisma = {
      userSession: {
        findFirst: vi.fn().mockResolvedValue({
          id: "session-1"
        }),
        update: vi.fn().mockResolvedValue(undefined)
      }
    };
    const jwtService = {};
    const configService = {};
    const auditService = {
      record: vi.fn().mockResolvedValue(undefined)
    };

    const service = new AuthService(
      prisma as never,
      jwtService as never,
      configService as never,
      auditService as never
    );

    await expect(service.logout("refresh-token", { headers: {} })).resolves.toBe(true);
    expect(prisma.userSession.update).toHaveBeenCalledWith({
      where: { id: "session-1" },
      data: { revokedAt: expect.any(Date) }
    });
  });
});
