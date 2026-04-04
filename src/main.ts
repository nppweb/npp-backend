import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { Logger } from "nestjs-pino";
import { AppModule } from "./app.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.setGlobalPrefix("api");
  app.getHttpAdapter().getInstance().set("trust proxy", 1);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidUnknownValues: false,
      forbidNonWhitelisted: true
    })
  );

  const logger = app.get(Logger);
  const configService = app.get(ConfigService);
  const port = configService.get<number>("PORT") ?? Number(process.env.PORT ?? 3000);
  const graphqlPath = configService.get<string>("GRAPHQL_PATH") ?? "/graphql";
  const corsAllowedOrigins =
    configService.get<string[]>("CORS_ALLOWED_ORIGINS") ?? ["http://localhost:8080"];

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || corsAllowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`Origin ${origin} is not allowed by CORS`), false);
    },
    credentials: true
  });

  logger.log(
    `env loaded (node_env=${configService.get<string>("NODE_ENV") ?? "development"}, port=${port})`
  );

  await app.init();
  logger.log(`graphql ready at ${graphqlPath}`);
  logger.log("ingest token mode enabled via x-ingest-token");
  logger.log(`cors origins allowed: ${corsAllowedOrigins.join(", ")}`);

  await app.listen(port, "0.0.0.0");
  logger.log(`backend-api started on http://0.0.0.0:${port}`);
}

void bootstrap();
