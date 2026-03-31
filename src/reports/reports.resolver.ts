import { Query, Resolver } from "@nestjs/graphql";
import { Report } from "./report.models";
import { ReportsService } from "./reports.service";

@Resolver(() => Report)
export class ReportsResolver {
  constructor(private readonly reportsService: ReportsService) {}

  @Query(() => [Report])
  reports() {
    return this.reportsService.listReports();
  }
}
