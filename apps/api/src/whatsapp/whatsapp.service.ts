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

/** Optional per-tenant override — falls back to the platform-shared Fast2SMS number/token when omitted. */
export interface WhatsappCredentials {
  phoneNumberId?: string;
  accessToken?: string;
}

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private readonly phoneNumberId: string;
  private readonly accessToken: string;
  private readonly apiBaseUrl: string;
  private readonly apiVersion: string;
  private readonly authScheme: string;

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
    this.apiBaseUrl =
      this.configService.get<string>('whatsapp.apiBaseUrl') ??
      'https://www.fast2sms.com/dev/whatsapp';
    this.apiVersion =
      this.configService.get<string>('whatsapp.apiVersion') ?? 'v26.0';
    this.authScheme =
      this.configService.get<string>('whatsapp.authScheme') ?? 'raw';
  }

  private authHeader(accessToken?: string): string {
    const token = accessToken || this.accessToken;
    return this.authScheme === 'bearer' ? `Bearer ${token}` : token;
  }

  /** phoneNumberId can be overridden per-tenant (Tenant.whatsappPhoneNumberId); falls back to the shared platform number. */
  private messagesUrl(phoneNumberId?: string): string {
    const id = phoneNumberId || this.phoneNumberId;
    return `${this.apiBaseUrl}/${this.apiVersion}/${id}/messages`;
  }

  private mediaUrl(phoneNumberId?: string): string {
    const id = phoneNumberId || this.phoneNumberId;
    return `${this.apiBaseUrl}/${this.apiVersion}/${id}/media`;
  }

  /**
   * Send a WhatsApp text message (session messages only — outside the 24h
   * customer service window this will be rejected by the provider; use
   * sendTemplateMessage for proactive/business-initiated notifications).
   */
  async sendTextMessage(
    to: string,
    body: string,
    credentials?: WhatsappCredentials,
  ): Promise<string | null> {
    const phoneNumberId = credentials?.phoneNumberId;
    const accessToken = credentials?.accessToken;
    if (!this.phoneNumberId && !phoneNumberId) {
      this.logger.warn('WhatsApp phoneNumberId not configured — skipping send');
      return null;
    }
    if (!this.accessToken && !accessToken) {
      this.logger.warn('WhatsApp access token not configured — skipping send');
      return null;
    }
    try {
      const response = await axios.post(
        this.messagesUrl(phoneNumberId),
        {
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { body },
        },
        {
          headers: {
            Authorization: this.authHeader(accessToken),
            'Content-Type': 'application/json',
          },
        },
      );
      const wamid: string = response.data?.messages?.[0]?.id ?? null;
      this.logger.log(`WhatsApp message sent to ${to}, wamid: ${wamid}`);
      return wamid;
    } catch (err: any) {
      this.logger.error(
        `Failed to send WhatsApp message to ${to}: ${err.response?.data ? JSON.stringify(err.response.data) : err.message}`,
      );
      return null;
    }
  }

  /**
   * Send a pre-approved WhatsApp template message.
   */
  async sendTemplateMessage(
    to: string,
    templateName: string,
    languageCode: string,
    components: any[],
    credentials?: WhatsappCredentials,
  ): Promise<string | null> {
    const phoneNumberId = credentials?.phoneNumberId;
    const accessToken = credentials?.accessToken;
    if (!this.phoneNumberId && !phoneNumberId) {
      this.logger.warn('WhatsApp phoneNumberId not configured — skipping send');
      return null;
    }
    if (!this.accessToken && !accessToken) {
      this.logger.warn('WhatsApp access token not configured — skipping send');
      return null;
    }
    try {
      const response = await axios.post(
        this.messagesUrl(phoneNumberId),
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
            Authorization: this.authHeader(accessToken),
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
        `Failed to send WhatsApp template '${templateName}' to ${to}: ${err.response?.data ? JSON.stringify(err.response.data) : err.message}`,
      );
      return null;
    }
  }

  /**
   * Upload a media file (e.g. a lab report PDF) so it can be referenced by
   * id in a template's header document component. Returns the media id, or
   * null on failure. Uses the runtime's built-in FormData/Blob (Node 18+)
   * rather than an extra dependency.
   */
  async uploadMedia(
    buffer: Buffer,
    filename: string,
    mimeType: string,
    credentials?: WhatsappCredentials,
  ): Promise<string | null> {
    const phoneNumberId = credentials?.phoneNumberId;
    const accessToken = credentials?.accessToken;
    if (!this.phoneNumberId && !phoneNumberId) {
      this.logger.warn('WhatsApp phoneNumberId not configured — skipping upload');
      return null;
    }
    if (!this.accessToken && !accessToken) {
      this.logger.warn('WhatsApp access token not configured — skipping upload');
      return null;
    }
    try {
      const form = new FormData();
      form.append('messaging_product', 'whatsapp');
      form.append(
        'file',
        new Blob([new Uint8Array(buffer)], { type: mimeType }),
        filename,
      );
      form.append('type', mimeType);

      const response = await axios.post(this.mediaUrl(phoneNumberId), form, {
        headers: { Authorization: this.authHeader(accessToken) },
      });
      const mediaId: string = response.data?.id ?? null;
      this.logger.log(`Uploaded WhatsApp media '${filename}', id: ${mediaId}`);
      return mediaId;
    } catch (err: any) {
      this.logger.error(
        `Failed to upload WhatsApp media '${filename}': ${err.response?.data ? JSON.stringify(err.response.data) : err.message}`,
      );
      return null;
    }
  }

  /**
   * Handle incoming webhook payload from the provider (Meta-compatible
   * status/inbound-message shape).
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
