import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { GqlExecutionContext } from "@nestjs/graphql";
import type { AuthenticatedUser } from "../authenticated-user";

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser | undefined => {
    const gqlContext = GqlExecutionContext.create(context).getContext<{ req?: { user?: AuthenticatedUser } }>();
    return gqlContext.req?.user;
  }
);
