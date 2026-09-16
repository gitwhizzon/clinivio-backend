import { Module } from "@nestjs/common";
import { BillableServicesService } from "./billable-services.service";
import { BillableServicesController } from "./billable-services.controller";

@Module({
  providers: [BillableServicesService],
  controllers: [BillableServicesController],
  exports: [BillableServicesService],
})
export class BillableServicesModule {}
