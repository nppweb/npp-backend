import { Field, Float, Int, ObjectType } from "@nestjs/graphql";
import { SourceKind, SourceRunStatus } from "@prisma/client";
import { ProcurementItem } from "../procurement/models";

@ObjectType()
export class AnalyticsDeadlineBucket {
  @Field()
  label!: string;

  @Field(() => Int)
  count!: number;
}

@ObjectType()
export class AnalyticsSupplierExposureItem {
  @Field()
  supplier!: string;

  @Field(() => Int)
  procurementCount!: number;

  @Field(() => Float)
  totalAmount!: number;

  @Field(() => Float)
  sharePercent!: number;
}

@ObjectType()
export class AnalyticsSourceHealthItem {
  @Field()
  source!: string;

  @Field()
  name!: string;

  @Field(() => SourceKind)
  kind!: SourceKind;

  @Field()
  isActive!: boolean;

  @Field(() => Date, { nullable: true })
  lastRunAt?: Date | null;

  @Field(() => SourceRunStatus, { nullable: true })
  lastRunStatus?: SourceRunStatus | null;

  @Field(() => Float)
  successRate!: number;

  @Field(() => Float)
  publicationRate!: number;

  @Field(() => Int)
  failedRuns!: number;

  @Field(() => Int, { nullable: true })
  hoursSinceLastRun?: number | null;

  @Field()
  riskLevel!: string;
}

@ObjectType()
export class AnalyticsSummary {
  @Field(() => Int)
  closingSoonCount!: number;

  @Field(() => Int)
  overdueCount!: number;

  @Field(() => Int)
  highValueCount!: number;

  @Field(() => Float)
  averageProcurementValue!: number;

  @Field(() => Int)
  atRiskSources!: number;

  @Field(() => Float)
  runSuccessRate!: number;

  @Field(() => Float)
  publicationEfficiency!: number;

  @Field(() => Int)
  riskSignalsLast30d!: number;

  @Field(() => [AnalyticsDeadlineBucket])
  deadlinePressure!: AnalyticsDeadlineBucket[];

  @Field(() => [AnalyticsSourceHealthItem])
  sourceHealth!: AnalyticsSourceHealthItem[];

  @Field(() => [AnalyticsSupplierExposureItem])
  supplierExposure!: AnalyticsSupplierExposureItem[];

  @Field(() => [ProcurementItem])
  attentionProcurements!: ProcurementItem[];
}
