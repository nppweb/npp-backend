import { Body, Controller, HttpCode, Post, Req } from "@nestjs/common";
import { SourceRunStatus } from "@prisma/client";
import type { Request } from "express";
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Min,
  ValidateNested
} from "class-validator";
import { Type } from "class-transformer";
import { AuthService } from "../auth/auth.service";
import type { RequestLike } from "../common/request-context";
import { SourcesService } from "./sources.service";

class UpsertSourceRunDto {
  @IsString()
  sourceCode!: string;

  @IsString()
  runKey!: string;

  @IsEnum(SourceRunStatus)
  status!: SourceRunStatus;

  @IsDateString()
  startedAt!: string;

  @IsOptional()
  @IsDateString()
  finishedAt?: string | null;

  @IsOptional()
  @IsString()
  errorMessage?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  itemsDiscovered?: number;
}

class QuarantineArtifactDto {
  @IsString()
  kind!: string;

  @IsString()
  bucket!: string;

  @IsString()
  objectKey!: string;

  @IsOptional()
  @IsString()
  mimeType?: string;

  @IsOptional()
  @IsString()
  checksum?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sizeBytes?: number;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

class QuarantineRawEventDto {
  @IsString()
  source!: string;

  @IsString()
  eventId!: string;

  @IsString()
  runKey!: string;

  @IsDateString()
  collectedAt!: string;

  @IsString()
  sourceUrl!: string;

  @IsString()
  payloadVersion!: string;

  @IsOptional()
  @IsString()
  externalId?: string;

  @IsString()
  quarantineReason!: string;

  @IsObject()
  rawPayload!: Record<string, unknown>;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuarantineArtifactDto)
  artifacts!: QuarantineArtifactDto[];
}

@Controller("internal/scraper")
export class SourcesController {
  constructor(
    private readonly authService: AuthService,
    private readonly sourcesService: SourcesService
  ) {}

  @Post("source-runs")
  @HttpCode(200)
  async upsertSourceRun(@Body() body: UpsertSourceRunDto, @Req() request: Request) {
    this.authService.assertIngestToken({
      headers: request.headers as RequestLike["headers"],
      id: typeof request.id === "string" ? request.id : undefined,
      ip: request.ip
    });

    await this.sourcesService.upsertSourceRun({
      sourceCode: body.sourceCode,
      runKey: body.runKey,
      status: body.status,
      startedAt: new Date(body.startedAt),
      finishedAt: body.finishedAt ? new Date(body.finishedAt) : null,
      errorMessage: body.errorMessage ?? null,
      itemsDiscovered: body.itemsDiscovered
    });

    return { ok: true };
  }

  @Post("quarantine-events")
  @HttpCode(200)
  async quarantineRawEvent(@Body() body: QuarantineRawEventDto, @Req() request: Request) {
    this.authService.assertIngestToken({
      headers: request.headers as RequestLike["headers"],
      id: typeof request.id === "string" ? request.id : undefined,
      ip: request.ip
    });

    await this.sourcesService.quarantineRawEvent({
      sourceCode: body.source,
      eventId: body.eventId,
      runKey: body.runKey,
      collectedAt: new Date(body.collectedAt),
      sourceUrl: body.sourceUrl,
      payloadVersion: body.payloadVersion,
      externalId: body.externalId,
      quarantineReason: body.quarantineReason,
      rawPayload: body.rawPayload,
      artifacts: body.artifacts
    });

    return { ok: true };
  }
}
