import { Args, Context, Mutation, Query, Resolver } from "@nestjs/graphql";
import { UserRole } from "@prisma/client";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../common/authenticated-user";
import {
  CreateUserInput,
  ResetUserPasswordInput,
  SetUserActiveInput,
  UpdateProfileInput,
  UpdateUserRoleInput,
  User
} from "./user.models";
import { UsersService } from "./users.service";

@Resolver(() => User)
export class UsersResolver {
  constructor(private readonly usersService: UsersService) {}

  @Query(() => User)
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.me(user.id);
  }

  @Mutation(() => User)
  updateProfile(
    @Args("input") input: UpdateProfileInput,
    @CurrentUser() actor: AuthenticatedUser
  ) {
    return this.usersService.updateProfile(actor.id, input);
  }

  @Roles(UserRole.ADMIN)
  @Query(() => [User])
  users() {
    return this.usersService.listUsers();
  }

  @Roles(UserRole.ADMIN)
  @Mutation(() => User)
  createUser(
    @Args("input") input: CreateUserInput,
    @CurrentUser() actor: AuthenticatedUser,
    @Context() context: { req?: { headers: Record<string, string | string[] | undefined>; ip?: string } }
  ) {
    return this.usersService.createUser(input, actor, context.req);
  }

  @Roles(UserRole.ADMIN)
  @Mutation(() => User)
  updateUserRole(
    @Args("input") input: UpdateUserRoleInput,
    @CurrentUser() actor: AuthenticatedUser,
    @Context() context: { req?: { headers: Record<string, string | string[] | undefined>; ip?: string } }
  ) {
    return this.usersService.updateUserRole(input.userId, input.role, actor, context.req);
  }

  @Roles(UserRole.ADMIN)
  @Mutation(() => Boolean)
  deactivateUser(
    @Args("userId") userId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Context() context: { req?: { headers: Record<string, string | string[] | undefined>; ip?: string } }
  ) {
    return this.usersService.deactivateUser(userId, actor, context.req);
  }

  @Roles(UserRole.ADMIN)
  @Mutation(() => User)
  setUserActive(
    @Args("input") input: SetUserActiveInput,
    @CurrentUser() actor: AuthenticatedUser,
    @Context() context: { req?: { headers: Record<string, string | string[] | undefined>; ip?: string } }
  ) {
    return this.usersService.setUserActive(input.userId, input.isActive, actor, context.req);
  }

  @Roles(UserRole.ADMIN)
  @Mutation(() => User)
  resetUserPassword(
    @Args("input") input: ResetUserPasswordInput,
    @CurrentUser() actor: AuthenticatedUser,
    @Context() context: { req?: { headers: Record<string, string | string[] | undefined>; ip?: string } }
  ) {
    return this.usersService.resetUserPassword(input.userId, input.newPassword, actor, context.req);
  }
}
