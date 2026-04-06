import { Field, Float, ID, ObjectType, registerEnumType } from "@nestjs/graphql";
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
export class ReportSupplierDueDiligenceItem {
  @Field()
  supplier!: string;

  @Field(() => String, { nullable: true })
  taxId?: string;

  @Field(() => String, { nullable: true })
  ogrn?: string;

  @Field()
  procurementCount!: number;

  @Field()
  activeProcurements!: number;

  @Field()
  totalAmount!: number;

  @Field(() => Date, { nullable: true })
  lastProcurementAt?: Date | null;

  @Field(() => String, { nullable: true })
  companyStatus?: string;

  @Field(() => Date, { nullable: true })
  registrationDate?: Date | null;

  @Field(() => String, { nullable: true })
  region?: string;

  @Field(() => String, { nullable: true })
  okved?: string;

  @Field(() => Boolean, { nullable: true })
  liquidationMark?: boolean | null;

  @Field()
  riskSignalsCount!: number;

  @Field()
  activeRiskSignalsCount!: number;

  @Field()
  rnpEntriesCount!: number;

  @Field()
  activeRnpEntriesCount!: number;

  @Field(() => Date, { nullable: true })
  latestRiskAt?: Date | null;

  @Field()
  integrityScore!: number;

  @Field(() => [String])
  flags!: string[];
}

@ObjectType()
export class ReportNppStationOrderEntry {
  @Field(() => ID)
  procurementId!: string;

  @Field()
  externalId!: string;

  @Field()
  title!: string;

  @Field(() => String, { nullable: true })
  customer?: string;

  @Field(() => String, { nullable: true })
  supplier?: string;

  @Field()
  source!: string;

  @Field(() => Float, { nullable: true })
  amount?: number | null;

  @Field(() => String, { nullable: true })
  currency?: string;

  @Field()
  status!: string;

  @Field(() => Date, { nullable: true })
  publishedAt?: Date | null;

  @Field(() => String, { nullable: true })
  sourceUrl?: string;
}

@ObjectType()
export class ReportNppStationOrderItem {
  @Field()
  station!: string;

  @Field()
  procurementCount!: number;

  @Field()
  contractCount!: number;

  @Field(() => Float)
  totalAmount!: number;

  @Field(() => Date, { nullable: true })
  firstPublishedAt?: Date | null;

  @Field(() => Date, { nullable: true })
  lastPublishedAt?: Date | null;

  @Field(() => [ReportNppStationOrderEntry])
  orders!: ReportNppStationOrderEntry[];
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

  @Field(() => [ReportSupplierDueDiligenceItem])
  supplierDueDiligence!: ReportSupplierDueDiligenceItem[];

  @Field(() => [ReportNppStationOrderItem])
  nppStationOrders!: ReportNppStationOrderItem[];

  @Field(() => [SourceRun])
  recentSourceRuns!: SourceRun[];

  @Field(() => [ProcurementItem])
  recentProcurements!: ProcurementItem[];
}
