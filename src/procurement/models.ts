import { Field, Float, ID, InputType, Int, ObjectType, registerEnumType } from "@nestjs/graphql";
import { ProcurementStatus } from "@prisma/client";
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

  @Field({ nullable: true })
  description?: string | null;

  @Field({ nullable: true })
  customer?: string | null;

  @Field({ nullable: true })
  supplier?: string | null;

  @Field(() => Float, { nullable: true })
  amount?: number | null;

  @Field({ nullable: true })
  currency?: string | null;

  @Field(() => ProcurementStatus)
  status!: ProcurementStatus;

  @Field(() => Date, { nullable: true })
  publishedAt?: Date | null;

  @Field(() => Date, { nullable: true })
  deadlineAt?: Date | null;

  @Field({ nullable: true })
  sourceUrl?: string | null;

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
  @Field({ nullable: true })
  search?: string;

  @Field({ nullable: true })
  source?: string;

  @Field(() => ProcurementStatus, { nullable: true })
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

@InputType()
export class ProcurementSortInput {
  @Field(() => ProcurementSortField, {
    defaultValue: ProcurementSortField.PUBLISHED_AT
  })
  field!: ProcurementSortField;

  @Field(() => SortDirection, { defaultValue: SortDirection.DESC })
  direction!: SortDirection;
}

@InputType()
export class IngestArtifactInput {
  @Field()
  kind!: string;

  @Field()
  bucket!: string;

  @Field()
  objectKey!: string;

  @Field({ nullable: true })
  mimeType?: string;

  @Field({ nullable: true })
  checksum?: string;

  @Field(() => Int, { nullable: true })
  sizeBytes?: number;

  @Field(() => GraphQLJSON, { nullable: true })
  metadata?: Record<string, unknown>;
}

@InputType()
export class IngestRawEventInput {
  @Field()
  eventId!: string;

  @Field({ nullable: true })
  runKey?: string;

  @Field(() => Date)
  collectedAt!: Date;

  @Field()
  url!: string;

  @Field(() => [IngestArtifactInput], { nullable: true })
  artifacts?: IngestArtifactInput[];
}

@InputType()
export class IngestNormalizedItemInput {
  @Field(() => ID)
  externalId!: string;

  @Field()
  source!: string;

  @Field()
  title!: string;

  @Field({ nullable: true })
  description?: string;

  @Field({ nullable: true })
  customer?: string;

  @Field({ nullable: true })
  supplier?: string;

  @Field(() => Float, { nullable: true })
  amount?: number;

  @Field({ nullable: true })
  currency?: string;

  @Field(() => Date, { nullable: true })
  publishedAt?: Date;

  @Field(() => Date, { nullable: true })
  deadlineAt?: Date;

  @Field()
  payloadVersion!: string;

  @Field({ nullable: true })
  sourceUrl?: string;

  @Field(() => ProcurementStatus, {
    nullable: true,
    defaultValue: ProcurementStatus.ACTIVE
  })
  status?: ProcurementStatus;

  @Field(() => GraphQLJSON, { nullable: true })
  rawPayload?: Record<string, unknown>;

  @Field(() => IngestRawEventInput, { nullable: true })
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
