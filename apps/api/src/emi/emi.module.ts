import { Module } from "@nestjs/common";
import { EmiService } from "./emi.service";
import { EmiController } from "./emi.controller";

@Module({
  providers: [EmiService],
  controllers: [EmiController],
  exports: [EmiService],
})
export class EmiModule {}
