import { Field, ID, ObjectType, registerEnumType } from "@nestjs/graphql";
import { ReportStatus } from "@prisma/client";
import { AnalyticsDeadlineBucket, AnalyticsSourceHealthItem, AnalyticsSupplierExposureItem } from "../analytics/analytics.models";
import { ProcurementItem } from "../procurement/models";
import { SourceRun } from "../sources/source.models";

registerEnumType(ReportStatus, { name: "ReportStatus" });

@ObjectType()
export class Report {
  @Field(() => ID)
  id!: string;

  @Field()
  name!: string;

  @Field(() => String, { nullable: true })
  description?: string;

  @Field(() => ReportStatus)
  status!: ReportStatus;

  @Field()
  reportType!: string;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => Date)
  updatedAt!: Date;
}

@ObjectType()
export class ReportMetric {
  @Field()
  label!: string;

  @Field()
  value!: string;

  @Field()
  hint!: string;
}

@ObjectType()
export class ReportHighlight {
  @Field()
  title!: string;

  @Field()
  description!: string;

  @Field()
  severity!: string;
}

@ObjectType()
export class ReportScore {
  @Field()
  label!: string;

  @Field()
  value!: number;

  @Field()
  detail!: string;

  @Field()
  severity!: string;
}

@ObjectType()
export class ReportAction {
  @Field()
  title!: string;

  @Field()
  description!: string;

  @Field()
  priority!: string;
}

@ObjectType()
export class ReportStatusMixItem {
  @Field()
  label!: string;

  @Field()
  count!: number;

  @Field()
  sharePercent!: number;
}

@ObjectType()
export class ReportAmountDistributionItem {
  @Field()
  label!: string;

  @Field()
  procurementCount!: number;

  @Field()
  totalAmount!: number;

  @Field()
  sharePercent!: number;
}

@ObjectType()
export class ReportCustomerExposureItem {
  @Field()
  customer!: string;

  @Field()
  procurementCount!: number;

  @Field()
  totalAmount!: number;

  @Field()
  sharePercent!: number;
}

@ObjectType()
export class ReportSourceContributionItem {
  @Field()
  sourceCode!: string;

  @Field()
  sourceName!: string;

  @Field()
  procurementCount!: number;

  @Field()
  totalAmount!: number;

  @Field()
  sharePercent!: number;
}

@ObjectType()
export class ReportDetail {
  @Field(() => ID)
  id!: string;

  @Field()
  name!: string;

  @Field(() => String, { nullable: true })
  description?: string;

  @Field(() => ReportStatus)
  status!: ReportStatus;

  @Field()
  reportType!: string;

  @Field(() => Date)
  generatedAt!: Date;

  @Field(() => [ReportMetric])
  metrics!: ReportMetric[];

  @Field(() => [ReportHighlight])
  highlights!: ReportHighlight[];

  @Field(() => [ReportScore])
  scores!: ReportScore[];

  @Field(() => [ReportAction])
  actions!: ReportAction[];

  @Field(() => [AnalyticsDeadlineBucket])
  deadlinePressure!: AnalyticsDeadlineBucket[];

  @Field(() => [ReportStatusMixItem])
  statusMix!: ReportStatusMixItem[];

  @Field(() => [ReportAmountDistributionItem])
  amountDistribution!: ReportAmountDistributionItem[];

  @Field(() => [ReportCustomerExposureItem])
  customerExposure!: ReportCustomerExposureItem[];

  @Field(() => [ReportSourceContributionItem])
  sourceContribution!: ReportSourceContributionItem[];

  @Field(() => [AnalyticsSourceHealthItem])
  sourceHealth!: AnalyticsSourceHealthItem[];

  @Field(() => [AnalyticsSupplierExposureItem])
  supplierExposure!: AnalyticsSupplierExposureItem[];

  @Field(() => [SourceRun])
  recentSourceRuns!: SourceRun[];

  @Field(() => [ProcurementItem])
  recentProcurements!: ProcurementItem[];
}
