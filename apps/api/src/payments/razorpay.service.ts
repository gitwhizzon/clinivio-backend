import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

interface RazorpayOrderOptions {
  amount: number; // in paise
  currency?: string;
  receipt?: string;
  notes?: Record<string, string>;
}

interface RazorpayOrder {
  id: string;
  entity: string;
  amount: number;
  currency: string;
  receipt: string;
  status: string;
  created_at: number;
}

@Injectable()
export class RazorpayService {
  private readonly logger = new Logger(RazorpayService.name);
  private razorpay: any;

  constructor(private configService: ConfigService) {
    const keyId = this.configService.get<string>('razorpay.keyId');
    const keySecret = this.configService.get<string>('razorpay.keySecret');

    if (keyId && keySecret) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const Razorpay = require('razorpay');
        this.razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
      } catch {
        this.logger.warn(
          'Razorpay SDK not installed — payment orders will be skipped',
        );
      }
    } else {
      this.logger.warn(
        'Razorpay credentials not configured — payment orders will be skipped',
      );
    }
  }

  async createOrder(
    options: RazorpayOrderOptions,
  ): Promise<RazorpayOrder | null> {
    if (!this.razorpay) {
      this.logger.debug('Razorpay not configured — skipping order creation');
      return null;
    }
    try {
      const order = await this.razorpay.orders.create({
        amount: options.amount,
        currency: options.currency ?? 'INR',
        receipt: options.receipt ?? `rcpt_${Date.now()}`,
        notes: options.notes ?? {},
      });
      return order as RazorpayOrder;
    } catch (err: any) {
      this.logger.error(`Failed to create Razorpay order: ${err.message}`);
      return null;
    }
  }

  async fetchOrder(orderId: string): Promise<RazorpayOrder | null> {
    if (!this.razorpay) return null;
    try {
      return await this.razorpay.orders.fetch(orderId);
    } catch (err: any) {
      this.logger.error(
        `Failed to fetch Razorpay order ${orderId}: ${err.message}`,
      );
      return null;
    }
  }

  verifySignature(
    orderId: string,
    paymentId: string,
    signature: string,
  ): boolean {
    if (!this.razorpay) return false;
    try {
      const keySecret =
        this.configService.get<string>('razorpay.keySecret') ?? '';
      const body = `${orderId}|${paymentId}`;
      const expectedSignature = crypto
        .createHmac('sha256', keySecret)
        .update(body)
        .digest('hex');
      return expectedSignature === signature;
    } catch {
      return false;
    }
  }
}
