import { UserRole } from "@prisma/client";
import { Args, Int, Mutation, Query, Resolver } from "@nestjs/graphql";
import { Roles } from "../common/decorators/roles.decorator";
import { CollectorTriggerResult, Source, SourceRun, SourceRunPage } from "./source.models";
import { SourcesService } from "./sources.service";

@Resolver()
export class SourcesResolver {
  constructor(private readonly sourcesService: SourcesService) {}

  @Roles(UserRole.ANALYST, UserRole.DEVELOPER, UserRole.ADMIN)
  @Query(() => [Source])
  sources() {
    return this.sourcesService.listSources();
  }

  @Roles(UserRole.DEVELOPER, UserRole.ADMIN)
  @Query(() => [SourceRun])
  sourceRuns(
    @Args("source", { nullable: true }) source?: string,
    @Args("limit", { type: () => Int, defaultValue: 25 }) limit?: number
  ) {
    return this.sourcesService.listRuns(source, limit);
  }

  @Roles(UserRole.DEVELOPER, UserRole.ADMIN)
  @Query(() => SourceRunPage)
  sourceRunsPage(
    @Args("source", { nullable: true }) source?: string,
    @Args("limit", { type: () => Int, defaultValue: 20 }) limit?: number,
    @Args("offset", { type: () => Int, defaultValue: 0 }) offset?: number
  ) {
    return this.sourcesService.listRunsPage(source, limit, offset);
  }

  @Roles(UserRole.ADMIN, UserRole.DEVELOPER)
  @Mutation(() => CollectorTriggerResult)
  triggerCollectors(
    @Args("sourceCodes", { type: () => [String], nullable: true }) sourceCodes?: string[]
  ) {
    return this.sourcesService.triggerCollectors(sourceCodes);
  }
}
