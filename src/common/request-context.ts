import type { AuthenticatedUser } from "./authenticated-user";

export type RequestLike = {
  headers: Record<string, string | string[] | undefined>;
  id?: string;
  ip?: string;
  user?: AuthenticatedUser;
};

export type RequestContext = {
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
  userId?: string;
};

export function readHeader(
  request: RequestLike | undefined,
  name: string
): string | undefined {
  const value = request?.headers[name];
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

export function extractRequestContext(request?: RequestLike): RequestContext {
  return {
    requestId: request?.id,
    ipAddress: request?.ip,
    userAgent: readHeader(request, "user-agent"),
    userId: request?.user?.id
  };
}
