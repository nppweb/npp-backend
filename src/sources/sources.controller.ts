import { Body, Controller, HttpCode, Post, Req } from "@nestjs/common";
import { SourceRunStatus } from "@prisma/client";
import type { Request } from "express";
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Min } from "class-validator";
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
}
