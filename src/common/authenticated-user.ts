import type { UserRole } from "@prisma/client";

export type AuthenticatedUser = {
  id: string;
  email: string;
  fullName: string;
  avatarUrl?: string | null;
  role: UserRole;
};
