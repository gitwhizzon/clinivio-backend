import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Req,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { createHmac } from 'crypto';
import { WhatsappService } from './whatsapp.service';

@ApiTags('WhatsApp')
@Controller('webhooks/whatsapp')
export class WhatsappController {
  private readonly logger = new Logger(WhatsappController.name);

  constructor(
    private whatsappService: WhatsappService,
    private configService: ConfigService,
  ) {}

  /**
   * Meta webhook verification challenge (GET).
   */
  @Get()
  @ApiOperation({ summary: 'WhatsApp webhook verification' })
  verify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ): string {
    const verifyToken = this.configService.get<string>('whatsapp.verifyToken');
    if (mode === 'subscribe' && token === verifyToken) {
      this.logger.log('WhatsApp webhook verified successfully');
      return challenge;
    }
    this.logger.warn(`WhatsApp webhook verification failed — token mismatch`);
    return 'Forbidden';
  }

  /**
   * Meta webhook event receiver (POST).
   * Validates X-Hub-Signature-256 before processing.
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Receive WhatsApp webhook events' })
  async receive(@Body() body: any, @Req() req: Request): Promise<string> {
    const appSecret = this.configService.get<string>('whatsapp.appSecret');

    if (appSecret) {
      const signature = req.headers['x-hub-signature-256'] as string;
      if (!signature) {
        this.logger.warn('Missing X-Hub-Signature-256 header — rejecting');
        return 'EVENT_RECEIVED';
      }

      const rawBody = (req as any).rawBody as Buffer;
      if (rawBody) {
        const expectedSig =
          'sha256=' +
          createHmac('sha256', appSecret).update(rawBody).digest('hex');

        if (signature !== expectedSig) {
          this.logger.warn('WhatsApp signature mismatch — rejecting webhook');
          return 'EVENT_RECEIVED';
        }
      }
    }

    await this.whatsappService.handleWebhook(body);
    return 'EVENT_RECEIVED';
  }
}
