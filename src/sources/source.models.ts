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

  @Field({ nullable: true })
  description?: string | null;

  @Field(() => SourceKind)
  kind!: SourceKind;

  @Field({ nullable: true })
  baseUrl?: string | null;

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

  @Field({ nullable: true })
  errorMessage?: string | null;

  @Field()
  sourceCode!: string;
}
