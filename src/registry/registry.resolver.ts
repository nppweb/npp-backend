import { Args, Context, Mutation, Resolver } from "@nestjs/graphql";
import { AuthService } from "../auth/auth.service";
import { Public } from "../common/decorators/public.decorator";
import { IngestRegistryRecordInput, IngestResult } from "./models";
import { RegistryService } from "./registry.service";

@Resolver()
export class RegistryResolver {
  constructor(
    private readonly registryService: RegistryService,
    private readonly authService: AuthService
  ) {}

  @Public()
  @Mutation(() => IngestResult)
  async ingestRegistryRecord(
    @Args("input", { type: () => IngestRegistryRecordInput }) input: IngestRegistryRecordInput,
    @Context() context: { req?: { headers: Record<string, string | string[] | undefined>; ip?: string } }
  ) {
    this.authService.assertIngestToken(context.req);
    return this.registryService.ingest(input, context.req);
  }
}
