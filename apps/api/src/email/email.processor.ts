import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { EmailService } from './email.service';

export interface SendEmailJobData {
  to: string;
  subject: string;
  html: string;
  text?: string;
  notificationLogId?: string;
  tenantId?: string;
}

@Processor('notifications')
export class EmailProcessor {
  private readonly logger = new Logger(EmailProcessor.name);

  constructor(private readonly emailService: EmailService) {}

  @Process('send-email')
  async handleSendEmail(job: Job<SendEmailJobData>): Promise<void> {
    const { to, subject, html, text } = job.data;
    this.logger.log(`Processing send-email job ${job.id} → ${to}`);
    await this.emailService.sendMail({ to, subject, html, text });
    this.logger.log(`Email job ${job.id} delivered → ${to}`);
  }
}
