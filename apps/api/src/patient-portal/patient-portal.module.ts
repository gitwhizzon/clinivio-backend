import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import {
  PatientPortalService,
  OTP_REDIS_CLIENT,
} from './patient-portal.service';
import { PatientPortalController } from './patient-portal.controller';
import { PatientJwtStrategy } from './patient-jwt.strategy';
import { AuthModule } from '../auth/auth.module';
import { PaymentsModule } from '../payments/payments.module';
import { InvoicesModule } from '../invoices/invoices.module';

@Module({
  imports: [PassportModule, AuthModule, PaymentsModule, InvoicesModule],
  providers: [
    {
      provide: OTP_REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Redis => {
        const url = config.get<string>('redis.url');
        if (url) return new Redis(url);
        return new Redis({
          host: config.get<string>('redis.host') ?? 'localhost',
          port: config.get<number>('redis.port') ?? 6379,
          lazyConnect: true,
        });
      },
    },
    PatientPortalService,
    PatientJwtStrategy,
  ],
  controllers: [PatientPortalController],
})
export class PatientPortalModule {}
