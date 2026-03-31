import { Query, Resolver } from "@nestjs/graphql";
import { DashboardSummary } from "./dashboard.models";
import { DashboardService } from "./dashboard.service";

@Resolver(() => DashboardSummary)
export class DashboardResolver {
  constructor(private readonly dashboardService: DashboardService) {}

  @Query(() => DashboardSummary)
  dashboardSummary() {
    return this.dashboardService.summary();
  }
}
