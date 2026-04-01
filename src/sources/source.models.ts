import { Field, ID, Int, ObjectType, registerEnumType } from "@nestjs/graphql";
import { SourceKind, SourceRunStatus } from "@prisma/client";

registerEnumType(SourceKind, { name: "SourceKind" });
registerEnumType(SourceRunStatus, { name: "SourceRunStatus" });

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

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => Date)
  updatedAt!: Date;
}

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
