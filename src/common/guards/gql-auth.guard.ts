import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { GqlExecutionContext } from "@nestjs/graphql";
import type { UserRole } from "@prisma/client";
import { AuthService } from "../../auth/auth.service";
import { IS_PUBLIC_KEY, ROLES_KEY } from "../constants";
import type { RequestLike } from "../request-context";

@Injectable()
export class GqlAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType<string>() !== "graphql") {
      return true;
    }

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass()
    ]);

    const gqlContext = GqlExecutionContext.create(context).getContext<{ req?: RequestLike }>();
    const request = gqlContext.req;
    const token = this.extractBearerToken(request);

    if (isPublic) {
      if (token && request) {
        try {
          request.user = await this.authService.verifyAccessToken(token);
        } catch {
          request.user = undefined;
        }
      }
      return true;
    }

    if (!token || !request) {
      throw new UnauthorizedException("Authentication is required");
    }

    const user = await this.authService.verifyAccessToken(token);
    request.user = user;

    const allowedRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass()
    ]);

    if (allowedRoles?.length && !allowedRoles.includes(user.role)) {
      throw new ForbiddenException("Insufficient permissions");
    }

    return true;
  }

  private extractBearerToken(request?: RequestLike): string | undefined {
    const authorization = request?.headers.authorization;
    const value = Array.isArray(authorization) ? authorization[0] : authorization;
    if (!value?.startsWith("Bearer ")) {
      return undefined;
    }
    return value.slice("Bearer ".length);
  }
}
