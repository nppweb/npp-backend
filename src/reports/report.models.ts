import { Field, ID, ObjectType, registerEnumType } from "@nestjs/graphql";
import { ReportStatus } from "@prisma/client";

registerEnumType(ReportStatus, { name: "ReportStatus" });

@ObjectType()
export class Report {
  @Field(() => ID)
  id!: string;

  @Field()
  name!: string;

  @Field({ nullable: true })
  description?: string | null;

  @Field(() => ReportStatus)
  status!: ReportStatus;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => Date)
  updatedAt!: Date;
}
