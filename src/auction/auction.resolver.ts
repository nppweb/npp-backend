import { Args, Context, Mutation, Resolver } from "@nestjs/graphql";
import { AuthService } from "../auth/auth.service";
import { Public } from "../common/decorators/public.decorator";
import { IngestAuctionItemInput, IngestResult } from "./models";
import { AuctionService } from "./auction.service";

@Resolver()
export class AuctionResolver {
  constructor(
    private readonly auctionService: AuctionService,
    private readonly authService: AuthService
  ) {}

  @Public()
  @Mutation(() => IngestResult)
  async ingestAuctionItem(
    @Args("input", { type: () => IngestAuctionItemInput }) input: IngestAuctionItemInput,
    @Context() context: { req?: { headers: Record<string, string | string[] | undefined>; ip?: string } }
  ) {
    this.authService.assertIngestToken(context.req);
    return this.auctionService.ingest(input, context.req);
  }
}
