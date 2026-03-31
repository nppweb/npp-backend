import { Args, Int, Query, Resolver } from "@nestjs/graphql";
import { Source, SourceRun } from "./source.models";
import { SourcesService } from "./sources.service";

@Resolver()
export class SourcesResolver {
  constructor(private readonly sourcesService: SourcesService) {}

  @Query(() => [Source])
  sources() {
    return this.sourcesService.listSources();
  }

  @Query(() => [SourceRun])
  sourceRuns(
    @Args("source", { nullable: true }) source?: string,
    @Args("limit", { type: () => Int, defaultValue: 25 }) limit?: number
  ) {
    return this.sourcesService.listRuns(source, limit);
  }
}
