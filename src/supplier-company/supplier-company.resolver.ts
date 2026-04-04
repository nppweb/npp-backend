import { Args, Context, Mutation, Resolver } from "@nestjs/graphql";
import { AuthService } from "../auth/auth.service";
import { Public } from "../common/decorators/public.decorator";
import { IngestResult, IngestSupplierCompanyProfileInput } from "./models";
import { SupplierCompanyService } from "./supplier-company.service";

@Resolver()
export class SupplierCompanyResolver {
  constructor(
    private readonly supplierCompanyService: SupplierCompanyService,
    private readonly authService: AuthService
  ) {}

  @Public()
  @Mutation(() => IngestResult)
  async ingestSupplierCompanyProfile(
    @Args("input", { type: () => IngestSupplierCompanyProfileInput })
    input: IngestSupplierCompanyProfileInput,
    @Context() context: { req?: { headers: Record<string, string | string[] | undefined>; ip?: string } }
  ) {
    this.authService.assertIngestToken(context.req);
    return this.supplierCompanyService.ingest(input, context.req);
  }
}
