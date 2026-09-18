import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Producer, CompressionTypes, logLevel } from 'kafkajs';

@Injectable()
export class KafkaProducerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaProducerService.name);
  private producer: Producer;
  private connected = false;

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    const brokers = this.configService.get<string[]>('kafka.brokers') ?? [];
    if (brokers.length === 0) {
      this.logger.log(
        'KAFKA_BROKERS not set — skipping Kafka connection, events will be skipped',
      );
      return;
    }
    const sasl = this.configService.get<any>('kafka.sasl');
    const ssl = this.configService.get<boolean>('kafka.ssl') ?? false;
    const clientId =
      this.configService.get<string>('kafka.clientId') ?? 'mediflow-api';

    const kafka = new Kafka({
      clientId,
      brokers,
      ...(sasl ? { sasl } : {}),
      ssl,
      logLevel: logLevel.ERROR,
    });

    this.producer = kafka.producer({
      allowAutoTopicCreation: true,
      retry: { initialRetryTime: 300, retries: 5 },
    });

    try {
      await this.producer.connect();
      this.connected = true;
      this.logger.log('Kafka producer connected');
    } catch (err: any) {
      this.logger.warn(
        `Kafka unavailable — events will be skipped: ${err.message}`,
      );
    }
  }

  async onModuleDestroy() {
    if (this.connected) {
      await this.producer.disconnect();
    }
  }

  async emit(topic: string, payload: Record<string, unknown>): Promise<void> {
    if (!this.connected) {
      this.logger.debug(
        `Kafka not connected — skipping event on topic ${topic}`,
      );
      return;
    }
    try {
      await this.producer.send({
        topic,
        compression: CompressionTypes.GZIP,
        messages: [
          { value: JSON.stringify(payload), timestamp: String(Date.now()) },
        ],
      });
    } catch (err: any) {
      this.logger.error(
        `Failed to emit Kafka event on ${topic}: ${err.message}`,
      );
    }
  }
}
