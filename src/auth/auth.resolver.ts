import { Args, Context, Mutation, Resolver } from "@nestjs/graphql";
import { Public } from "../common/decorators/public.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../common/authenticated-user";
import { ChangePasswordInput, AuthTokens, LoginInput, RefreshTokenInput } from "./auth.models";
import { AuthService } from "./auth.service";

@Resolver()
export class AuthResolver {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Mutation(() => AuthTokens)
  login(
    @Args("input") input: LoginInput,
    @Context() context: { req?: { headers: Record<string, string | string[] | undefined>; ip?: string } }
  ) {
    return this.authService.login(input.email, input.password, context.req);
  }

  @Public()
  @Mutation(() => AuthTokens)
  refreshSession(
    @Args("input") input: RefreshTokenInput,
    @Context() context: { req?: { headers: Record<string, string | string[] | undefined>; ip?: string } }
  ) {
    return this.authService.refresh(input.refreshToken, context.req);
  }

  @Public()
  @Mutation(() => Boolean)
  logout(
    @Args("input") input: RefreshTokenInput,
    @Context() context: { req?: { headers: Record<string, string | string[] | undefined>; ip?: string } }
  ) {
    return this.authService.logout(input.refreshToken, context.req);
  }

  @Mutation(() => Boolean)
  changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Args("input") input: ChangePasswordInput,
    @Context() context: { req?: { headers: Record<string, string | string[] | undefined>; ip?: string; user?: AuthenticatedUser } }
  ) {
    return this.authService.changePassword(
      user.id,
      input.currentPassword,
      input.newPassword,
      context.req
    );
  }
}
