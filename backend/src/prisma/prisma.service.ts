import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor(configService: ConfigService) {
    const connectionString = configService.getOrThrow<string>('DATABASE_URL');

    super({
      adapter: new PrismaPg({
        connectionString,
      }),
      log: ['warn', 'error'],
    });
  }

  async onModuleInit() {
    this.logger.log('Connecting to PostgreSQL via Prisma.');
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
