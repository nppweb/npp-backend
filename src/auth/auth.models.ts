import { Field, InputType, ObjectType } from "@nestjs/graphql";
import { IsEmail, IsString, MinLength } from "class-validator";
import { User } from "../users/user.models";

@InputType()
export class LoginInput {
  @Field()
  @IsEmail()
  email!: string;

  @Field()
  @IsString()
  @MinLength(1)
  password!: string;
}

@InputType()
export class RefreshTokenInput {
  @Field()
  @IsString()
  @MinLength(1)
  refreshToken!: string;
}

@InputType()
export class ChangePasswordInput {
  @Field()
  @IsString()
  @MinLength(1)
  currentPassword!: string;

  @Field()
  @IsString()
  @MinLength(5)
  newPassword!: string;
}

@ObjectType()
export class AuthTokens {
  @Field()
  accessToken!: string;

  @Field()
  refreshToken!: string;

  @Field()
  expiresInSeconds!: number;

  @Field(() => User)
  user!: User;
}
