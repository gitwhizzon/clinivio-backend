import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

export interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly transporter: nodemailer.Transporter;

  constructor(private readonly config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: config.get<string>('smtp.host') ?? 'localhost',
      port: config.get<number>('smtp.port') ?? 587,
      secure: config.get<boolean>('smtp.secure') ?? false,
      auth: {
        user: config.get<string>('smtp.user'),
        pass: config.get<string>('smtp.pass'),
      },
    });
  }

  async sendMail(options: SendMailOptions): Promise<void> {
    const from = this.config.get<string>('smtp.from') ?? 'noreply@clinivio.ai';
    try {
      const info = await this.transporter.sendMail({ from, ...options });
      this.logger.log(`Email sent to ${options.to} [${info.messageId}]`);
    } catch (err) {
      this.logger.error(
        `Failed to send email to ${options.to}: ${(err as Error).message}`,
      );
      throw err;
    }
  }

  buildPasswordResetEmail(
    firstName: string,
    resetUrl: string,
  ): { html: string; text: string } {
    const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:system-ui,sans-serif;background:#f4f7fb;margin:0;padding:32px 0">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 6px rgba(0,0,0,.08)">
    <div style="background:linear-gradient(135deg,#4f46e5,#3b82f6);padding:28px 36px">
      <p style="color:#fff;font-size:22px;font-weight:700;margin:0">Megnim</p>
      <p style="color:rgba(255,255,255,.8);font-size:13px;margin:4px 0 0">Hospital Management Platform</p>
    </div>
    <div style="padding:32px 36px">
      <h2 style="color:#1e293b;font-size:18px;margin:0 0 12px">Password Reset Request</h2>
      <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 20px">
        Hi ${firstName},<br><br>
        We received a request to reset your Megnim account password.
        Click the button below to set a new password. This link expires in <strong>1 hour</strong>.
      </p>
      <a href="${resetUrl}"
         style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600">
        Reset My Password
      </a>
      <p style="color:#94a3b8;font-size:12px;margin:24px 0 0;line-height:1.6">
        If you didn't request this, you can safely ignore this email — your password will remain unchanged.<br>
        Can't click the button? Copy and paste this URL:<br>
        <span style="color:#4f46e5;word-break:break-all">${resetUrl}</span>
      </p>
    </div>
    <div style="background:#f8fafc;padding:16px 36px;border-top:1px solid #e2e8f0">
      <p style="color:#94a3b8;font-size:11px;margin:0">© ${new Date().getFullYear()} Megnim by Whizzon.ai · All activity is logged</p>
    </div>
  </div>
</body>
</html>`;

    const text = `Hi ${firstName},\n\nWe received a request to reset your Megnim account password.\n\nReset your password here (expires in 1 hour):\n${resetUrl}\n\nIf you didn't request this, ignore this email.\n\n— Megnim`;

    return { html, text };
  }
}
