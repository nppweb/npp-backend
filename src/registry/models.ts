import { Field, ID, InputType, ObjectType } from "@nestjs/graphql";
import { Type } from "class-transformer";
import {
  IsDate,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested
} from "class-validator";
import GraphQLJSON from "graphql-type-json";
import { IngestRawEventInput, IngestResult } from "../procurement/models";

@ObjectType()
export class RegistryRecordItem {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  externalId!: string;

  @Field()
  source!: string;

  @Field()
  supplierName!: string;

  @Field(() => String, { nullable: true })
  supplierInn?: string;

  @Field(() => String, { nullable: true })
  supplierOgrn?: string;

  @Field(() => String, { nullable: true })
  registryStatus?: string;

  @Field(() => String, { nullable: true })
  reason?: string;

  @Field(() => Date, { nullable: true })
  decisionDate?: Date | null;

  @Field(() => Date, { nullable: true })
  inclusionDate?: Date | null;

  @Field(() => Date, { nullable: true })
  exclusionDate?: Date | null;

  @Field(() => String, { nullable: true })
  customerName?: string;

  @Field(() => String, { nullable: true })
  legalBasis?: string;

  @Field(() => String, { nullable: true })
  region?: string;

  @Field(() => String, { nullable: true })
  sourceUrl?: string;

  @Field(() => GraphQLJSON, { nullable: true })
  rawPayload?: Record<string, unknown>;
}

@InputType()
export class IngestRegistryRecordInput {
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
  supplierName!: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  supplierInn?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  supplierOgrn?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  registryStatus?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  reason?: string;

  @Field(() => Date, { nullable: true })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  decisionDate?: Date;

  @Field(() => Date, { nullable: true })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  inclusionDate?: Date;

  @Field(() => Date, { nullable: true })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  exclusionDate?: Date;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  customerName?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  legalBasis?: string;

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
