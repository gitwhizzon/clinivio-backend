import { Module } from '@nestjs/common';
import { KafkaModule } from '../kafka/kafka.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PatientsService } from './patients.service';
import { PatientsController } from './patients.controller';

@Module({
  imports: [KafkaModule, NotificationsModule],
  providers: [PatientsService],
  controllers: [PatientsController],
  exports: [PatientsService],
})
export class PatientsModule {}
