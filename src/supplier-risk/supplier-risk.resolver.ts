import { Args, Context, Mutation, Resolver } from "@nestjs/graphql";
import { AuthService } from "../auth/auth.service";
import { Public } from "../common/decorators/public.decorator";
import { IngestResult, IngestSupplierRiskSignalInput } from "./models";
import { SupplierRiskService } from "./supplier-risk.service";

@Resolver()
export class SupplierRiskResolver {
  constructor(
    private readonly supplierRiskService: SupplierRiskService,
    private readonly authService: AuthService
  ) {}

  @Public()
  @Mutation(() => IngestResult)
  async ingestSupplierRiskSignal(
    @Args("input", { type: () => IngestSupplierRiskSignalInput })
    input: IngestSupplierRiskSignalInput,
    @Context() context: { req?: { headers: Record<string, string | string[] | undefined>; ip?: string } }
  ) {
    this.authService.assertIngestToken(context.req);
    return this.supplierRiskService.ingest(input, context.req);
  }
}
