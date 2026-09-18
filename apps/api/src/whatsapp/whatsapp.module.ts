import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { WhatsappService } from './whatsapp.service';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappProcessor } from './whatsapp.processor';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [BullModule.registerQueue({ name: 'notifications' }), NotificationsModule],
  providers: [WhatsappService, WhatsappProcessor],
  controllers: [WhatsappController],
  exports: [WhatsappService],
})
export class WhatsappModule {}
