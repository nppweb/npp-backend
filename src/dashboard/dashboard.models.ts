import { Field, Int, ObjectType } from "@nestjs/graphql";
import { ProcurementStatus, SourceKind } from "@prisma/client";
import { ProcurementItem } from "../procurement/models";
import { SourceRun } from "../sources/source.models";

@ObjectType()
export class DashboardSourceStat {
  @Field()
  source!: string;

  @Field(() => Int)
  count!: number;
}

@ObjectType()
export class DashboardProcurementStatusStat {
  @Field(() => ProcurementStatus)
  status!: ProcurementStatus;

  @Field(() => Int)
  count!: number;
}

@ObjectType()
export class DashboardTimelinePoint {
  @Field()
  date!: string;

  @Field(() => Int)
  count!: number;
}

@ObjectType()
export class DashboardSourceSummaryItem {
  @Field()
  source!: string;

  @Field()
  name!: string;

  @Field(() => SourceKind)
  kind!: SourceKind;

  @Field()
  isActive!: boolean;

  @Field(() => Int)
  procurementCount!: number;

  @Field(() => Int)
  runCount!: number;

  @Field(() => Date, { nullable: true })
  lastRunAt?: Date | null;
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

  @Field(() => [DashboardProcurementStatusStat])
  procurementsByStatus!: DashboardProcurementStatusStat[];

  @Field(() => [DashboardTimelinePoint])
  procurementsOverTime!: DashboardTimelinePoint[];

  @Field(() => [ProcurementItem])
  recentProcurements!: ProcurementItem[];

  @Field(() => [DashboardSourceSummaryItem])
  sourcesSummary!: DashboardSourceSummaryItem[];

  @Field(() => [SourceRun])
  recentSourceRuns!: SourceRun[];
}
