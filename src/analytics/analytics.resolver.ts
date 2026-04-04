import { Query, Resolver } from "@nestjs/graphql";
import { UserRole } from "@prisma/client";
import { Roles } from "../common/decorators/roles.decorator";
import { AnalyticsSummary } from "./analytics.models";
import { AnalyticsService } from "./analytics.service";

@Resolver(() => AnalyticsSummary)
export class AnalyticsResolver {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Roles(UserRole.ANALYST, UserRole.ADMIN)
  @Query(() => AnalyticsSummary)
  analyticsSummary() {
    return this.analyticsService.summary();
  }
}
