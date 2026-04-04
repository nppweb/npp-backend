import { Field, Float, ID, InputType, ObjectType } from "@nestjs/graphql";
import { ProcurementStatus } from "@prisma/client";
import { Type } from "class-transformer";
import {
  IsDate,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested
} from "class-validator";
import GraphQLJSON from "graphql-type-json";
import { IngestRawEventInput, IngestResult } from "../procurement/models";

@ObjectType()
export class AuctionItemRecord {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  externalId!: string;

  @Field()
  source!: string;

  @Field()
  title!: string;

  @Field(() => String, { nullable: true })
  description?: string;

  @Field(() => String, { nullable: true })
  organizerName?: string;

  @Field(() => String, { nullable: true })
  organizerInn?: string;

  @Field(() => String, { nullable: true })
  auctionType?: string;

  @Field(() => ProcurementStatus)
  status!: ProcurementStatus;

  @Field(() => Date, { nullable: true })
  publishedAt?: Date | null;

  @Field(() => Date, { nullable: true })
  applicationDeadline?: Date | null;

  @Field(() => Date, { nullable: true })
  biddingDate?: Date | null;

  @Field(() => Float, { nullable: true })
  startPrice?: number | null;

  @Field(() => String, { nullable: true })
  currency?: string;

  @Field(() => String, { nullable: true })
  region?: string;

  @Field(() => String, { nullable: true })
  lotInfo?: string;

  @Field(() => String, { nullable: true })
  sourceUrl?: string;

  @Field(() => GraphQLJSON, { nullable: true })
  rawPayload?: Record<string, unknown>;
}

@InputType()
export class IngestAuctionItemInput {
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
  title!: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  description?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  organizerName?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  organizerInn?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  auctionType?: string;

  @Field(() => ProcurementStatus, { nullable: true })
  @IsOptional()
  @IsEnum(ProcurementStatus)
  status?: ProcurementStatus;

  @Field(() => Date, { nullable: true })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  publishedAt?: Date;

  @Field(() => Date, { nullable: true })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  applicationDeadline?: Date;

  @Field(() => Date, { nullable: true })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  biddingDate?: Date;

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  startPrice?: number;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  currency?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  region?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  lotInfo?: string;

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
