import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import {
  ExpressAdapter,
  NestExpressApplication,
} from '@nestjs/platform-express';
import express, { type RequestHandler } from 'express';
import helmet from 'helmet';
import serverless from 'serverless-http';
import { AppModule } from '../src/app.module';

const localDevOriginPattern = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;
const normalizeOrigin = (origin: string) => origin.replace(/\/+$/, '');

let cachedHandler: RequestHandler | null = null;

async function bootstrapServerless(): Promise<RequestHandler> {
  const expressApp = express();
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule,
    new ExpressAdapter(expressApp),
    { bodyParser: false },
  );

  expressApp.use(
    express.json({
      limit: '2mb',
      verify: (req: express.Request & { rawBody?: Buffer }, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );
  expressApp.use(express.urlencoded({ extended: true, limit: '2mb' }));

  const configService = app.get(ConfigService);
  const corsOrigins =
    configService
      .get<string>('CORS_ORIGIN')
      ?.split(',')
      .map((origin) => normalizeOrigin(origin.trim()))
      .filter(Boolean) ?? [];

  app.setGlobalPrefix('api');
  app.use(helmet());
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }
      const normalizedOrigin = normalizeOrigin(origin);
      if (
        localDevOriginPattern.test(normalizedOrigin) ||
        !corsOrigins.length ||
        corsOrigins.includes(normalizedOrigin)
      ) {
        callback(null, true);
        return;
      }
      callback(new Error(`CORS blocked for origin ${origin}`), false);
    },
  });
  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    }),
  );
  await app.init();

  return serverless(expressApp);
}

export default async function handler(req: Parameters<RequestHandler>[0], res: Parameters<RequestHandler>[1]) {
  if (!cachedHandler) {
    cachedHandler = await bootstrapServerless();
  }
  return cachedHandler(req, res, () => undefined);
}
