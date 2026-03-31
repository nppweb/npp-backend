import type { Prisma } from "@prisma/client";

export function toJson(
  value: Record<string, unknown> | undefined
): Prisma.InputJsonValue | undefined {
  if (value === undefined) {
    return undefined;
  }
  return value as Prisma.InputJsonValue;
}

export function toNullableJson(
  value: Record<string, unknown> | undefined
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined {
  return toJson(value);
}
