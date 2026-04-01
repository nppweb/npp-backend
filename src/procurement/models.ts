import { Field, Float, ID, InputType, Int, ObjectType, registerEnumType } from "@nestjs/graphql";
import { ProcurementStatus } from "@prisma/client";
import { Transform, Type } from "class-transformer";
import {
  IsArray,
  IsDate,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested
} from "class-validator";
import GraphQLJSON from "graphql-type-json";

registerEnumType(ProcurementStatus, { name: "ProcurementStatus" });

@ObjectType()
export class ProcurementItem {
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
  customer?: string;

  @Field(() => String, { nullable: true })
  supplier?: string;

  @Field(() => Float, { nullable: true })
  amount?: number | null;

  @Field(() => String, { nullable: true })
  currency?: string;

  @Field(() => ProcurementStatus)
  status!: ProcurementStatus;

  @Field(() => Date, { nullable: true })
  publishedAt?: Date | null;

  @Field(() => Date, { nullable: true })
  deadlineAt?: Date | null;

  @Field(() => String, { nullable: true })
  sourceUrl?: string;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => Date)
  updatedAt!: Date;

  @Field(() => GraphQLJSON, { nullable: true })
  rawPayload?: Record<string, unknown>;
}

@ObjectType()
export class ProcurementItemPage {
  @Field(() => Int)
  total!: number;

  @Field(() => [ProcurementItem])
  items!: ProcurementItem[];
}

@InputType()
export class ProcurementFilterInput {
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  search?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  source?: string;

  @Field(() => ProcurementStatus, { nullable: true })
  @IsOptional()
  @IsEnum(ProcurementStatus)
  status?: ProcurementStatus;
}

export enum ProcurementSortField {
  PUBLISHED_AT = "publishedAt",
  UPDATED_AT = "updatedAt",
  AMOUNT = "amount",
  TITLE = "title"
}

export enum SortDirection {
  ASC = "asc",
  DESC = "desc"
}

registerEnumType(ProcurementSortField, { name: "ProcurementSortField" });
registerEnumType(SortDirection, { name: "SortDirection" });

const procurementSortFieldInputMap: Record<string, ProcurementSortField> = {
  PUBLISHED_AT: ProcurementSortField.PUBLISHED_AT,
  UPDATED_AT: ProcurementSortField.UPDATED_AT,
  AMOUNT: ProcurementSortField.AMOUNT,
  TITLE: ProcurementSortField.TITLE
};

const sortDirectionInputMap: Record<string, SortDirection> = {
  ASC: SortDirection.ASC,
  DESC: SortDirection.DESC
};

@InputType()
export class ProcurementSortInput {
  @Field(() => ProcurementSortField, {
    defaultValue: ProcurementSortField.PUBLISHED_AT
  })
  @Transform(({ value }) => procurementSortFieldInputMap[String(value)] ?? value)
  @IsEnum(ProcurementSortField)
  field!: ProcurementSortField;

  @Field(() => SortDirection, { defaultValue: SortDirection.DESC })
  @Transform(({ value }) => sortDirectionInputMap[String(value)] ?? value)
  @IsEnum(SortDirection)
  direction!: SortDirection;
}

@InputType()
export class IngestArtifactInput {
  @Field()
  @IsString()
  @MinLength(1)
  kind!: string;

  @Field()
  @IsString()
  @MinLength(1)
  bucket!: string;

  @Field()
  @IsString()
  @MinLength(1)
  objectKey!: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  mimeType?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  checksum?: string;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsNumber()
  sizeBytes?: number;

  @Field(() => GraphQLJSON, { nullable: true })
  @IsOptional()
  metadata?: Record<string, unknown>;
}

@InputType()
export class IngestRawEventInput {
  @Field()
  @IsString()
  @MinLength(1)
  eventId!: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  runKey?: string;

  @Field(() => Date)
  @Type(() => Date)
  @IsDate()
  collectedAt!: Date;

  @Field()
  @IsString()
  @MinLength(1)
  url!: string;

  @Field(() => [IngestArtifactInput], { nullable: true })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IngestArtifactInput)
  artifacts?: IngestArtifactInput[];
}

@InputType()
export class IngestNormalizedItemInput {
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
  customer?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  supplier?: string;

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  amount?: number;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  currency?: string;

  @Field(() => Date, { nullable: true })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  publishedAt?: Date;

  @Field(() => Date, { nullable: true })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  deadlineAt?: Date;

  @Field()
  @IsString()
  @MinLength(1)
  payloadVersion!: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  sourceUrl?: string;

  @Field(() => ProcurementStatus, {
    nullable: true,
    defaultValue: ProcurementStatus.ACTIVE
  })
  @IsOptional()
  @IsEnum(ProcurementStatus)
  status?: ProcurementStatus;

  @Field(() => GraphQLJSON, { nullable: true })
  @IsOptional()
  rawPayload?: Record<string, unknown>;

  @Field(() => IngestRawEventInput, { nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => IngestRawEventInput)
  rawEvent?: IngestRawEventInput;
}

@ObjectType()
export class IngestResult {
  @Field()
  accepted!: boolean;

  @Field()
  idempotencyKey!: string;

  @Field(() => ID)
  procurementId!: string;
}
