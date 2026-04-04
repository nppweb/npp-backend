import { Field, ID, InputType, ObjectType } from "@nestjs/graphql";
import { Type } from "class-transformer";
import {
  IsBoolean,
  IsDate,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested
} from "class-validator";
import GraphQLJSON from "graphql-type-json";
import { IngestRawEventInput, IngestResult } from "../procurement/models";

@ObjectType()
export class SupplierCompanyProfileItem {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  externalId!: string;

  @Field()
  source!: string;

  @Field()
  companyName!: string;

  @Field(() => String, { nullable: true })
  shortName?: string;

  @Field(() => String, { nullable: true })
  inn?: string;

  @Field(() => String, { nullable: true })
  kpp?: string;

  @Field(() => String, { nullable: true })
  ogrn?: string;

  @Field(() => String, { nullable: true })
  companyStatus?: string;

  @Field(() => Date, { nullable: true })
  registrationDate?: Date | null;

  @Field(() => String, { nullable: true })
  address?: string;

  @Field(() => String, { nullable: true })
  okved?: string;

  @Field(() => Boolean, { nullable: true })
  liquidationMark?: boolean | null;

  @Field(() => String, { nullable: true })
  region?: string;

  @Field(() => String, { nullable: true })
  sourceUrl?: string;

  @Field(() => GraphQLJSON, { nullable: true })
  rawPayload?: Record<string, unknown>;
}

@InputType()
export class IngestSupplierCompanyProfileInput {
  @Field(() => ID)
  @IsString()
  @MinLength(1)
  externalId!: string;

  @Field()
  @IsString()
  @MinLength(1)
  source!: string;

  @Field()
  @IsString()
  @MinLength(1)
  companyName!: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  shortName?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  inn?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  kpp?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  ogrn?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  companyStatus?: string;

  @Field(() => Date, { nullable: true })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  registrationDate?: Date;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  address?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  okved?: string;

  @Field(() => Boolean, { nullable: true })
  @IsOptional()
  @IsBoolean()
  liquidationMark?: boolean;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  region?: string;

  @Field()
  @IsString()
  @MinLength(1)
  payloadVersion!: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  sourceUrl?: string;

  @Field(() => GraphQLJSON, { nullable: true })
  @IsOptional()
  rawPayload?: Record<string, unknown>;

  @Field(() => IngestRawEventInput, { nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => IngestRawEventInput)
  rawEvent?: IngestRawEventInput;
}

export { IngestResult };
