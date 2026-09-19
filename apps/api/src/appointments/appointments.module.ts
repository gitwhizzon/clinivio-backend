import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AppointmentsService } from './appointments.service';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsGateway } from './appointments.gateway';
import { RazorpayService } from '../payments/razorpay.service';
import { ConsultationModule } from '../consultation/consultation.module';

@Module({
  imports: [
    ConsultationModule,
    // The gateway verifies the patient JWT on WebSocket connect — it was
    // previously not authenticating connections at all.
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwt.secret'),
      }),
    }),
  ],
  providers: [AppointmentsService, AppointmentsGateway, RazorpayService],
  controllers: [AppointmentsController],
  exports: [AppointmentsService, AppointmentsGateway],
})
export class AppointmentsModule {}
