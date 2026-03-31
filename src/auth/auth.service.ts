import {
  Injectable,
  UnauthorizedException
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { AuditAction, type UserRole } from "@prisma/client";
import { compare, hash } from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import { AuditService } from "../audit/audit.service";
import type { AuthenticatedUser } from "../common/authenticated-user";
import { extractRequestContext, readHeader, type RequestLike } from "../common/request-context";
import { PrismaService } from "../prisma/prisma.service";

type TokenPayload = {
  sub: string;
  email: string;
  fullName: string;
  role: UserRole;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService
  ) {}

  async login(email: string, password: string, request?: RequestLike) {
    const user = await this.prisma.user.findFirst({
      where: {
        email: email.toLowerCase(),
        deletedAt: null
      }
    });

    if (!user || !user.isActive || !(await compare(password, user.passwordHash))) {
      throw new UnauthorizedException("Invalid email or password");
    }

    const tokens = await this.issueTokens({
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role
    }, request);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() }
    });

    await this.auditService.record(
      AuditAction.USER_LOGIN,
      "User",
      user.id,
      { email: user.email },
      extractRequestContext(request)
    );

    return tokens;
  }

  async refresh(refreshToken: string, request?: RequestLike) {
    const session = await this.prisma.userSession.findFirst({
      where: {
        refreshTokenHash: this.hashRefreshToken(refreshToken),
        revokedAt: null,
        expiresAt: { gt: new Date() }
      },
      include: { user: true }
    });

    if (!session || !session.user.isActive || session.user.deletedAt) {
      throw new UnauthorizedException("Refresh token is invalid or expired");
    }

    await this.prisma.userSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date() }
    });

    return this.issueTokens(
      {
        id: session.user.id,
        email: session.user.email,
        fullName: session.user.fullName,
        role: session.user.role
      },
      request
    );
  }

  async logout(refreshToken: string, request?: RequestLike): Promise<boolean> {
    const refreshTokenHash = this.hashRefreshToken(refreshToken);
    const session = await this.prisma.userSession.findFirst({
      where: { refreshTokenHash, revokedAt: null }
    });

    if (!session) {
      return true;
    }

    await this.prisma.userSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date() }
    });

    await this.auditService.record(
      AuditAction.USER_LOGOUT,
      "UserSession",
      session.id,
      undefined,
      extractRequestContext(request)
    );

    return true;
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    request?: RequestLike
  ): Promise<boolean> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !(await compare(currentPassword, user.passwordHash))) {
      throw new UnauthorizedException("Current password is invalid");
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: await hash(newPassword, 12)
      }
    });

    await this.auditService.record(
      AuditAction.USER_PASSWORD_CHANGED,
      "User",
      userId,
      undefined,
      extractRequestContext(request)
    );

    return true;
  }

  async verifyAccessToken(token: string): Promise<AuthenticatedUser> {
    const payload = await this.jwtService.verifyAsync<TokenPayload>(token, {
      secret: this.configService.getOrThrow<string>("JWT_ACCESS_SECRET")
    });

    const user = await this.prisma.user.findFirst({
      where: {
        id: payload.sub,
        deletedAt: null
      }
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException("User account is not active");
    }

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role
    };
  }

  assertIngestToken(request?: RequestLike): void {
    const token = readHeader(request, "x-ingest-token");
    const expected = this.configService.getOrThrow<string>("INGEST_API_TOKEN");
    if (!token || token !== expected) {
      throw new UnauthorizedException("Ingest token is invalid");
    }
  }

  async hashPassword(password: string): Promise<string> {
    return hash(password, 12);
  }

  private async issueTokens(user: AuthenticatedUser, request?: RequestLike) {
    const payload: TokenPayload = {
      sub: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role
    };

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.getOrThrow<string>("JWT_ACCESS_SECRET"),
      expiresIn: this.configService.get<string>("JWT_ACCESS_TTL") ?? "15m"
    });

    const refreshToken = randomBytes(48).toString("hex");
    const refreshTokenHash = this.hashRefreshToken(refreshToken);
    const refreshTokenTtlDays =
      this.configService.get<number>("REFRESH_TOKEN_TTL_DAYS") ?? 30;
    const expiresAt = new Date(Date.now() + refreshTokenTtlDays * 24 * 60 * 60 * 1000);

    await this.prisma.userSession.create({
      data: {
        userId: user.id,
        refreshTokenHash,
        expiresAt,
        ipAddress: request?.ip,
        userAgent: readHeader(request, "user-agent")
      }
    });

    return {
      accessToken,
      refreshToken,
      expiresInSeconds: 15 * 60,
      user
    };
  }

  private hashRefreshToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }
}
