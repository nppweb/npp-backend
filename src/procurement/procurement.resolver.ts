import { Args, Context, Int, Mutation, Query, Resolver } from "@nestjs/graphql";
import {
  IngestNormalizedItemInput,
  IngestResult,
  ProcurementFilterInput,
  ProcurementItemPage
} from "./models";
import { ProcurementService } from "./procurement.service";
import { Public } from "../common/decorators/public.decorator";
import { ProcurementItem, ProcurementSortInput } from "./models";
import { AuthService } from "../auth/auth.service";

@Resolver(() => ProcurementItem)
export class ProcurementResolver {
  constructor(
    private readonly procurementService: ProcurementService,
    private readonly authService: AuthService
  ) {}

  @Public()
  @Query(() => String)
  health(): string {
    return "ok";
  }

  @Query(() => ProcurementItemPage)
  procurementItems(
    @Args("filter", { nullable: true, type: () => ProcurementFilterInput })
    filter?: ProcurementFilterInput,
    @Args("sort", { nullable: true, type: () => ProcurementSortInput })
    sort?: ProcurementSortInput,
    @Args("limit", { type: () => Int, defaultValue: 20 }) limit?: number,
    @Args("offset", { type: () => Int, defaultValue: 0 }) offset?: number
  ) {
    return this.procurementService.find(filter, sort, limit, offset);
  }

  @Query(() => ProcurementItem, { nullable: true })
  procurementItem(@Args("id") id: string) {
    return this.procurementService.findById(id);
  }

  @Mutation(() => IngestResult)
  async ingestNormalizedItem(
    @Args("input", { type: () => IngestNormalizedItemInput }) input: IngestNormalizedItemInput,
    @Context() context: { req?: { headers: Record<string, string | string[] | undefined>; ip?: string } }
  ) {
    this.authService.assertIngestToken(context.req);
    return this.procurementService.ingest(input, context.req);
  }
}
