import { Field, ID, InputType, ObjectType } from "@nestjs/graphql";
import { UserRole } from "@prisma/client";
import { IsEmail, IsEnum, IsString, MinLength } from "class-validator";
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
  @IsEmail()
  email!: string;

  @Field()
  @IsString()
  @MinLength(3)
  fullName!: string;

  @Field()
  @IsString()
  @MinLength(5)
  password!: string;

  @Field(() => UserRole)
  @IsEnum(UserRole)
  role!: UserRole;
}

@InputType()
export class UpdateUserRoleInput {
  @Field(() => ID)
  @IsString()
  @MinLength(1)
  userId!: string;

  @Field(() => UserRole)
  @IsEnum(UserRole)
  role!: UserRole;
}
