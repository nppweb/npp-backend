import { Field, ID, Int, ObjectType, registerEnumType } from "@nestjs/graphql";
import { SourceKind, SourceRunStatus } from "@prisma/client";

registerEnumType(SourceKind, { name: "SourceKind" });
registerEnumType(SourceRunStatus, { name: "SourceRunStatus" });

@ObjectType()
export class SourceRun {
  @Field(() => ID)
  id!: string;

  @Field()
  runKey!: string;

  @Field(() => SourceRunStatus)
  status!: SourceRunStatus;

  @Field(() => Date)
  startedAt!: Date;

  @Field(() => Date, { nullable: true })
  finishedAt?: Date | null;

  @Field(() => Int)
  itemsDiscovered!: number;

  @Field(() => Int)
  itemsPublished!: number;

  @Field(() => Int)
  itemsFailed!: number;

  @Field(() => String, { nullable: true })
  errorMessage?: string;

  @Field()
  sourceCode!: string;
}

@ObjectType()
export class Source {
  @Field(() => ID)
  id!: string;

  @Field()
  code!: string;

  @Field()
  name!: string;

  @Field(() => String, { nullable: true })
  description?: string;

  @Field(() => SourceKind)
  kind!: SourceKind;

  @Field(() => String, { nullable: true })
  baseUrl?: string;

  @Field()
  isActive!: boolean;

  @Field(() => SourceRun, { nullable: true })
  lastRun?: SourceRun | null;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => Date)
  updatedAt!: Date;
}

@ObjectType()
export class CollectorTriggerItem {
  @Field()
  sourceCode!: string;

  @Field()
  sourceName!: string;

  @Field()
  accepted!: boolean;

  @Field(() => String, { nullable: true })
  runKey?: string;

  @Field(() => Date, { nullable: true })
  startedAt?: Date | null;

  @Field(() => String, { nullable: true })
  message?: string;
}

@ObjectType()
export class CollectorTriggerResult {
  @Field(() => Date)
  triggeredAt!: Date;

  @Field(() => Boolean)
  allAccepted!: boolean;

  @Field(() => [CollectorTriggerItem])
  items!: CollectorTriggerItem[];
}
