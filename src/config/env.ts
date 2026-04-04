import { z } from "zod";

const optionalNonEmptyString = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema.optional());

const parseStringList = (value: string | undefined, fallback: string[]): string[] => {
  const items = (value ?? "")
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);

  return items.length > 0 ? [...new Set(items)] : fallback;
};

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  GRAPHQL_PATH: z.string().default("/graphql"),
  SCRAPER_CONTROL_URL: z.string().url().default("http://scraper-service:3001"),
  SCRAPE_SCHEDULE: z.string().default("*/20 * * * *"),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_ACCESS_TTL: z.string().default("15m"),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  INGEST_API_TOKEN: z.string().min(16),
  ADMIN_EMAIL: optionalNonEmptyString(z.string().email()),
  ADMIN_PASSWORD: optionalNonEmptyString(z.string().min(5)),
  ADMIN_FULL_NAME: optionalNonEmptyString(z.string().min(3)),
  LOG_LEVEL: z.string().default("info"),
  THROTTLE_TTL_MS: z.coerce.number().int().positive().default(60000),
  THROTTLE_LIMIT: z.coerce.number().int().positive().default(120),
  ENABLED_SOURCES: z
    .string()
    .optional()
    .transform((value) => parseStringList(value, [])),
  CORS_ALLOWED_ORIGINS: z
    .string()
    .optional()
    .transform((value) => parseStringList(value, ["http://localhost:8080"]))
});

export type AppEnv = z.infer<typeof envSchema>;

export function validateEnv(input: Record<string, unknown>): AppEnv {
  const result = envSchema.safeParse(input);

  if (result.success) {
    return result.data;
  }

  const details = result.error.issues
    .map((issue) => `${issue.path.join(".") || "env"}: ${issue.message}`)
    .join("; ");

  throw new Error(`Invalid environment configuration. ${details}`);
}
