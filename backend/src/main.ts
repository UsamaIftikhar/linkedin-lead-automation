import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import express from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';

const localDevOriginPattern = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });
  app.use(
    express.json({
      limit: '2mb',
      verify: (req: express.Request & { rawBody?: Buffer }, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));
  const configService = app.get(ConfigService);
  const corsOrigins =
    configService
      .get<string>('CORS_ORIGIN')
      ?.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean) ?? [];

  app.setGlobalPrefix('api');
  app.use(helmet());
  app.enableCors({
    origin: corsOrigins.length ? [...corsOrigins, localDevOriginPattern] : true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    }),
  );

  await app.listen(configService.get<number>('PORT') ?? 3001);
}
void bootstrap();
