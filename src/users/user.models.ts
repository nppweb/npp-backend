import { Field, ID, InputType, ObjectType } from "@nestjs/graphql";
import { UserRole } from "@prisma/client";
import { registerEnumType } from "@nestjs/graphql";

registerEnumType(UserRole, { name: "UserRole" });

@ObjectType()
export class User {
  @Field(() => ID)
  id!: string;

  @Field()
  email!: string;

  @Field()
  fullName!: string;

  @Field(() => UserRole)
  role!: UserRole;

  @Field()
  isActive!: boolean;

  @Field(() => Date, { nullable: true })
  lastLoginAt?: Date | null;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => Date)
  updatedAt!: Date;
}

@InputType()
export class CreateUserInput {
  @Field()
  email!: string;

  @Field()
  fullName!: string;

  @Field()
  password!: string;

  @Field(() => UserRole)
  role!: UserRole;
}

@InputType()
export class UpdateUserRoleInput {
  @Field(() => ID)
  userId!: string;

  @Field(() => UserRole)
  role!: UserRole;
}
