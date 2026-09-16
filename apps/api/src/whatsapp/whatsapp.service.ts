import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import {
  NotificationLog,
  NotificationStatus,
  TenantDataSourceRegistry,
} from '@mediflow/database';
import axios from 'axios';

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private readonly phoneNumberId: string;
  private readonly accessToken: string;

  constructor(
    private configService: ConfigService,
    private readonly registry: TenantDataSourceRegistry,
    @InjectQueue('notifications')
    private notificationsQueue: Queue,
  ) {
    this.phoneNumberId =
      this.configService.get<string>('whatsapp.phoneNumberId') ?? '';
    this.accessToken =
      this.configService.get<string>('whatsapp.accessToken') ?? '';
  }

  /**
   * Send a WhatsApp text message via Meta Cloud API.
   */
  async sendTextMessage(to: string, body: string): Promise<string | null> {
    if (!this.phoneNumberId || !this.accessToken) {
      this.logger.warn('WhatsApp credentials not configured — skipping send');
      return null;
    }
    try {
      const url = `https://graph.facebook.com/v19.0/${this.phoneNumberId}/messages`;
      const response = await axios.post(
        url,
        {
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { body },
        },
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
        },
      );
      const wamid: string = response.data?.messages?.[0]?.id ?? null;
      this.logger.log(`WhatsApp message sent to ${to}, wamid: ${wamid}`);
      return wamid;
    } catch (err: any) {
      this.logger.error(
        `Failed to send WhatsApp message to ${to}: ${err.message}`,
      );
      return null;
    }
  }

  /**
   * Send a WhatsApp template message via Meta Cloud API.
   */
  async sendTemplateMessage(
    to: string,
    templateName: string,
    languageCode: string,
    components: any[],
  ): Promise<string | null> {
    if (!this.phoneNumberId || !this.accessToken) {
      this.logger.warn('WhatsApp credentials not configured — skipping send');
      return null;
    }
    try {
      const url = `https://graph.facebook.com/v19.0/${this.phoneNumberId}/messages`;
      const response = await axios.post(
        url,
        {
          messaging_product: 'whatsapp',
          to,
          type: 'template',
          template: {
            name: templateName,
            language: { code: languageCode },
            components,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
        },
      );
      const wamid: string = response.data?.messages?.[0]?.id ?? null;
      this.logger.log(
        `WhatsApp template '${templateName}' sent to ${to}, wamid: ${wamid}`,
      );
      return wamid;
    } catch (err: any) {
      this.logger.error(
        `Failed to send WhatsApp template to ${to}: ${err.message}`,
      );
      return null;
    }
  }

  /**
   * Handle incoming webhook payload from Meta.
   * Processes status updates and inbound messages.
   */
  async handleWebhook(body: any): Promise<void> {
    const entry = body?.entry?.[0];
    const changes = entry?.changes?.[0]?.value;
    if (!changes) return;

    // Status updates (delivered, read, failed, etc.)
    const statuses: any[] = changes.statuses ?? [];
    for (const status of statuses) {
      await this.processStatusUpdate(status);
    }

    // Inbound messages
    const messages: any[] = changes.messages ?? [];
    for (const message of messages) {
      await this.processInboundMessage(message, changes.contacts?.[0]);
    }
  }

  private async processStatusUpdate(status: any): Promise<void> {
    const { id: wamid, status: statusStr, timestamp } = status;
    let newStatus: NotificationStatus;

    switch (statusStr) {
      case 'sent':
        newStatus = NotificationStatus.SENT;
        break;
      case 'delivered':
        newStatus = NotificationStatus.DELIVERED;
        break;
      case 'read':
        newStatus = NotificationStatus.READ;
        break;
      case 'failed':
        newStatus = NotificationStatus.FAILED;
        break;
      default:
        return;
    }

    try {
      // WhatsApp webhooks carry no tenant context — search all registered tenant
      // DataSources for the notification log identified by its wamid.
      const allDs = this.registry.getAll();
      let found = false;

      for (const ds of allDs) {
        const log = await ds
          .getRepository(NotificationLog)
          .createQueryBuilder('log')
          .where('log.wamid = :wamid', { wamid })
          .getOne();

        if (!log) continue;
        found = true;

        const updateData: Partial<NotificationLog> = { status: newStatus };
        const ts = new Date(parseInt(timestamp, 10) * 1000);

        if (newStatus === NotificationStatus.SENT) updateData.sentAt = ts;
        else if (newStatus === NotificationStatus.DELIVERED)
          updateData.deliveredAt = ts;
        else if (newStatus === NotificationStatus.READ) updateData.readAt = ts;
        else if (newStatus === NotificationStatus.FAILED) {
          updateData.failureReason =
            status.errors?.[0]?.message ?? 'Unknown error';
        }

        await ds.getRepository(NotificationLog).update(log.id, updateData);
        this.logger.debug(
          `Updated notification log ${log.id} to status ${newStatus}`,
        );
        break;
      }

      if (!found) {
        this.logger.debug(`No notification log found for wamid: ${wamid}`);
      }
    } catch (err: any) {
      this.logger.error(
        `Failed to process status update for wamid ${wamid}: ${err.message}`,
      );
    }
  }

  private async processInboundMessage(
    message: any,
    contact: any,
  ): Promise<void> {
    // Enqueue inbound message processing
    try {
      await this.notificationsQueue.add(
        'inbound-whatsapp',
        {
          from: message.from,
          messageId: message.id,
          timestamp: message.timestamp,
          type: message.type,
          text: message.text?.body,
          contact,
        },
        { attempts: 2, backoff: { type: 'exponential', delay: 3000 } },
      );
      this.logger.log(`Enqueued inbound WhatsApp message from ${message.from}`);
    } catch (err: any) {
      this.logger.error(`Failed to enqueue inbound message: ${err.message}`);
    }
  }
}
