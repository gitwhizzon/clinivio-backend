import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { AiService, AI_REDIS_CLIENT } from './ai.service';
import { AiController } from './ai.controller';

@Module({
  providers: [
    {
      provide: AI_REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Redis => {
        const url = config.get<string>('redis.url');
        if (url) return new Redis(url, { lazyConnect: true });
        return new Redis({
          host: config.get<string>('redis.host') ?? 'localhost',
          port: config.get<number>('redis.port') ?? 6379,
          lazyConnect: true,
        });
      },
    },
    AiService,
  ],
  controllers: [AiController],
  exports: [AiService],
})
export class AiModule {}
