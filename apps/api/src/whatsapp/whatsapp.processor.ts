import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Job } from 'bull';
import { Tenant } from '@mediflow/database';
import { WhatsappService, WhatsappCredentials } from './whatsapp.service';
import { WHATSAPP_TEMPLATES } from '../notifications/whatsapp-templates';
import { NotificationsService } from '../notifications/notifications.service';

export interface SendWhatsappJobData {
  notificationLogId: string;
  tenantId: string;
  patientId?: string;
  phone?: string;
  notificationType: string;
  payload: Record<string, any>;
}

@Processor('notifications')
export class WhatsappProcessor {
  private readonly logger = new Logger(WhatsappProcessor.name);

  constructor(
    @InjectDataSource() private readonly platformDs: DataSource,
    private readonly whatsappService: WhatsappService,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Process('send-whatsapp')
  async handleSendWhatsapp(job: Job<SendWhatsappJobData>): Promise<void> {
    const { notificationLogId, tenantId, phone, notificationType, payload } = job.data;

    const template = WHATSAPP_TEMPLATES[notificationType];
    if (!template) {
      this.logger.warn(
        `No WhatsApp template configured for notificationType=${notificationType} — skipping job ${job.id} (see whatsapp-templates.ts)`,
      );
      return;
    }

    const to = phone || payload?.to || payload?.data?.to;
    if (!to) {
      this.logger.warn(`send-whatsapp job ${job.id} has no destination phone number — skipping`);
      await this.notificationsService.markFailed(notificationLogId, 'No destination phone number');
      return;
    }

    try {
      const credentials = await this.resolveCredentials(tenantId);
      const components = template.buildComponents(payload);

      const wamid = await this.whatsappService.sendTemplateMessage(
        to,
        template.templateName,
        template.languageCode,
        components,
        credentials,
      );

      if (wamid) {
        await this.notificationsService.markSent(notificationLogId, wamid);
        this.logger.log(`WhatsApp ${notificationType} sent to ${to} (job ${job.id}, wamid ${wamid})`);
      } else {
        await this.notificationsService.markFailed(
          notificationLogId,
          'WhatsApp provider did not return a message id — check credentials are configured',
        );
      }
    } catch (err: any) {
      this.logger.error(`send-whatsapp job ${job.id} failed: ${err.message}`);
      await this.notificationsService.markFailed(notificationLogId, err.message ?? 'Unknown error');
      throw err; // let Bull's retry/backoff (configured at enqueue time) handle it
    }
  }

  /**
   * A tenant with its own whatsappPhoneNumberId + whatsappAccessToken uses
   * its own WhatsApp Business number; otherwise falls back to the
   * platform-shared Fast2SMS config WhatsappService already reads from env.
   * whatsappAccessToken is select:false on the entity, so it must be
   * explicitly selected here — this is the one place that's meant to happen.
   */
  private async resolveCredentials(tenantId: string): Promise<WhatsappCredentials | undefined> {
    const tenant = await this.platformDs
      .getRepository(Tenant)
      .createQueryBuilder('tenant')
      .addSelect('tenant.whatsappAccessToken')
      .where('tenant.id = :tenantId', { tenantId })
      .getOne();

    if (!tenant?.whatsappPhoneNumberId || !tenant?.whatsappAccessToken) {
      return undefined; // WhatsappService falls back to platform-shared config
    }

    return {
      phoneNumberId: tenant.whatsappPhoneNumberId,
      accessToken: tenant.whatsappAccessToken,
    };
  }
}
