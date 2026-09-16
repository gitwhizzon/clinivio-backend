import { Module } from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsGateway } from './appointments.gateway';
import { RazorpayService } from '../payments/razorpay.service';
import { ConsultationModule } from '../consultation/consultation.module';

@Module({
  imports: [ConsultationModule],
  providers: [AppointmentsService, AppointmentsGateway, RazorpayService],
  controllers: [AppointmentsController],
  exports: [AppointmentsService, AppointmentsGateway],
})
export class AppointmentsModule {}
