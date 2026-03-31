import { Controller, Get, Header } from "@nestjs/common";
import { collectDefaultMetrics, register } from "prom-client";

collectDefaultMetrics({ register, prefix: "aimsora_backend_" });

@Controller("metrics")
export class MetricsController {
  @Get()
  @Header("Content-Type", register.contentType)
  metrics(): Promise<string> {
    return register.metrics();
  }
}
