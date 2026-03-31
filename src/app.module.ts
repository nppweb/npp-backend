import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { GraphQLModule } from "@nestjs/graphql";
import { ApolloDriver, ApolloDriverConfig } from "@nestjs/apollo";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { ThrottlerModule } from "@nestjs/throttler";
import { join } from "node:path";
import GraphQLJSON from "graphql-type-json";
import { LoggerModule } from "nestjs-pino";
import { randomUUID } from "node:crypto";
import { AuthResolver } from "./auth/auth.resolver";
import { AuthService } from "./auth/auth.service";
import { envSchema, validateEnv } from "./config/env";
import { HealthController } from "./common/health.controller";
import { HttpExceptionLoggingFilter } from "./common/filters/http-exception.filter";
import { MetricsController } from "./common/metrics.controller";
import { GqlAuthGuard } from "./common/guards/gql-auth.guard";
import { GqlThrottlerGuard } from "./common/guards/gql-throttler.guard";
import { DashboardResolver } from "./dashboard/dashboard.resolver";
import { DashboardService } from "./dashboard/dashboard.service";
import { PrismaModule } from "./prisma/prisma.module";
import { ProcurementResolver } from "./procurement/procurement.resolver";
import { ProcurementService } from "./procurement/procurement.service";
import { ReportsResolver } from "./reports/reports.resolver";
import { ReportsService } from "./reports/reports.service";
import { SourcesResolver } from "./sources/sources.resolver";
import { SourcesService } from "./sources/sources.service";
import { AuditService } from "./audit/audit.service";
import { UsersResolver } from "./users/users.resolver";
import { UsersService } from "./users/users.service";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? "info",
        genReqId: (
          req: { headers: Record<string, string | string[] | undefined> },
          res: { setHeader: (name: string, value: string) => void }
        ) => {
          const requestId = req.headers["x-request-id"];
          const id = Array.isArray(requestId) ? requestId[0] : requestId ?? randomUUID();
          res.setHeader("x-request-id", id);
          return id;
        },
        autoLogging: true,
        redact: ["req.headers.authorization"]
      }
    }),
    ThrottlerModule.forRoot([
      {
        ttl: envSchema.shape.THROTTLE_TTL_MS.parse(process.env.THROTTLE_TTL_MS ?? "60000"),
        limit: envSchema.shape.THROTTLE_LIMIT.parse(process.env.THROTTLE_LIMIT ?? "120")
      }
    ]),
    JwtModule.register({}),
    PrismaModule,
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      path: process.env.GRAPHQL_PATH ?? "/graphql",
      playground: process.env.NODE_ENV !== "production",
      autoSchemaFile: join(process.cwd(), "schema.gql"),
      sortSchema: true,
      context: ({
        req,
        res
      }: {
        req: Record<string, unknown>;
        res: Record<string, unknown>;
      }) => ({ req, res }),
      formatError: (error) => ({
        message: error.message,
        path: error.path,
        extensions: error.extensions
      }),
      resolvers: { JSON: GraphQLJSON }
    })
  ],
  controllers: [HealthController, MetricsController],
  providers: [
    { provide: APP_GUARD, useClass: GqlThrottlerGuard },
    { provide: APP_GUARD, useClass: GqlAuthGuard },
    { provide: APP_FILTER, useClass: HttpExceptionLoggingFilter },
    AuditService,
    AuthResolver,
    AuthService,
    DashboardResolver,
    DashboardService,
    ProcurementResolver,
    ProcurementService,
    ReportsResolver,
    ReportsService,
    SourcesResolver,
    SourcesService,
    UsersResolver,
    UsersService
  ]
})
export class AppModule {}
