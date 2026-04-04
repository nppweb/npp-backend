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
export class SupplierRiskSignalItem {
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
  messageType?: string;

  @Field()
  title!: string;

  @Field(() => String, { nullable: true })
  description?: string;

  @Field(() => Date, { nullable: true })
  publishedAt?: Date | null;

  @Field(() => Date, { nullable: true })
  eventDate?: Date | null;

  @Field(() => String, { nullable: true })
  bankruptcyStage?: string;

  @Field(() => String, { nullable: true })
  caseNumber?: string;

  @Field(() => String, { nullable: true })
  courtName?: string;

  @Field(() => String, { nullable: true })
  riskLevel?: string;

  @Field(() => String, { nullable: true })
  sourceUrl?: string;

  @Field(() => GraphQLJSON, { nullable: true })
  rawPayload?: Record<string, unknown>;
}

@InputType()
export class IngestSupplierRiskSignalInput {
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
  messageType?: string;

  @Field()
  @IsString()
  @MinLength(1)
  title!: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  description?: string;

  @Field(() => Date, { nullable: true })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  publishedAt?: Date;

  @Field(() => Date, { nullable: true })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  eventDate?: Date;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  bankruptcyStage?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  caseNumber?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  courtName?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  riskLevel?: string;

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
