import { Args, Mutation, Query, Resolver } from "@nestjs/graphql";
import { UserRole } from "@prisma/client";
import type { AuthenticatedUser } from "../common/authenticated-user";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Report, ReportDetail } from "./report.models";
import { ReportsService } from "./reports.service";

@Resolver(() => Report)
export class ReportsResolver {
  constructor(private readonly reportsService: ReportsService) {}

  @Roles(UserRole.ANALYST, UserRole.DEVELOPER, UserRole.ADMIN)
  @Query(() => [Report])
  reports(@CurrentUser() user: AuthenticatedUser) {
    return this.reportsService.listReports(user.role);
  }

  @Roles(UserRole.ANALYST, UserRole.DEVELOPER, UserRole.ADMIN)
  @Query(() => ReportDetail)
  report(@Args("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.reportsService.getReportDetail(user.role, id);
  }

  @Roles(UserRole.ANALYST, UserRole.DEVELOPER, UserRole.ADMIN)
  @Mutation(() => [Report])
  refreshReports(
    @CurrentUser() user: AuthenticatedUser,
    @Args("types", { type: () => [String], nullable: true }) types?: string[]
  ) {
    return this.reportsService.refreshReports(user.role, types);
  }

  @Roles(UserRole.ADMIN)
  @Mutation(() => Boolean)
  archiveReport(@Args("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.reportsService.archiveReport(user.role, id);
  }
}
