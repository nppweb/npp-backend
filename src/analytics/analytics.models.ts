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
export class AnalyticsNppTimelineItem {
  @Field()
  label!: string;

  @Field(() => Int)
  procurementCount!: number;

  @Field(() => Float)
  totalAmount!: number;
}

@ObjectType()
export class AnalyticsNppStationItem {
  @Field()
  station!: string;

  @Field(() => Int)
  procurementCount!: number;

  @Field(() => Float)
  totalAmount!: number;
}

@ObjectType()
export class AnalyticsNppSourceItem {
  @Field()
  source!: string;

  @Field()
  name!: string;

  @Field(() => Int)
  procurementCount!: number;

  @Field(() => Float)
  totalAmount!: number;
}

@ObjectType()
export class AnalyticsNppCustomerItem {
  @Field()
  customer!: string;

  @Field(() => Int)
  procurementCount!: number;

  @Field(() => Float)
  totalAmount!: number;
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
  @Field(() => Date)
  nppPeriodStart!: Date;

  @Field(() => Int)
  nppProcurementCount!: number;

  @Field(() => Int)
  nppContractCount!: number;

  @Field(() => Int)
  nppStationsCovered!: number;

  @Field(() => Float)
  nppTotalAmount!: number;

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

  @Field(() => [AnalyticsNppTimelineItem])
  nppMonthlyDynamics!: AnalyticsNppTimelineItem[];

  @Field(() => [AnalyticsNppStationItem])
  nppStationCoverage!: AnalyticsNppStationItem[];

  @Field(() => [AnalyticsNppSourceItem])
  nppSourceCoverage!: AnalyticsNppSourceItem[];

  @Field(() => [AnalyticsNppCustomerItem])
  nppCustomerCoverage!: AnalyticsNppCustomerItem[];

  @Field(() => [ProcurementItem])
  nppRecentProcurements!: ProcurementItem[];

  @Field(() => [ProcurementItem])
  attentionProcurements!: ProcurementItem[];
}
