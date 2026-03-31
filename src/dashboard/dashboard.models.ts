import { Field, Int, ObjectType } from "@nestjs/graphql";

@ObjectType()
export class DashboardSourceStat {
  @Field()
  source!: string;

  @Field(() => Int)
  count!: number;
}

@ObjectType()
export class DashboardSummary {
  @Field(() => Int)
  totalProcurements!: number;

  @Field(() => Int)
  activeSources!: number;

  @Field(() => Int)
  runsLast24h!: number;

  @Field(() => Date, { nullable: true })
  lastPublishedAt?: Date | null;

  @Field(() => [DashboardSourceStat])
  bySource!: DashboardSourceStat[];
}
