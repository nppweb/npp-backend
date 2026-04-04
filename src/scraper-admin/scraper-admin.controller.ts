import { Controller, Get, Req } from "@nestjs/common";
import type { Request } from "express";
import { AuthService } from "../auth/auth.service";
import type { RequestLike } from "../common/request-context";
import { ScraperAdminService } from "./scraper-admin.service";

@Controller("internal/scraper")
export class ScraperAdminController {
  constructor(
    private readonly authService: AuthService,
    private readonly scraperAdminService: ScraperAdminService
  ) {}

  @Get("config")
  async getConfig(@Req() request: Request) {
    this.authService.assertIngestToken({
      headers: request.headers as RequestLike["headers"],
      id: typeof request.id === "string" ? request.id : undefined,
      ip: request.ip
    });
    return this.scraperAdminService.getBootstrapConfig();
  }
}
