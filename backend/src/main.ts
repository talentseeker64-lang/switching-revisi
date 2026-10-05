import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import { json } from 'express';
import type { Request, Response } from 'express';
import { AppModule } from './app.module.js';

async function bootstrap() {
  // Disable Nest's built-in body parser so we can install our own that
  // preserves the raw byte payload as `req.rawBody`. HMAC-SHA256 verification
  // MUST run over the exact bytes the Gateway signed — re-serializing
  // req.body back to JSON would produce a slightly different string and
  // break signature matching 100% of the time.
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    bodyParser: false,
  });

  const JSON_BODY_LIMIT = process.env.JSON_BODY_LIMIT || '5mb';
  app.use(
    json({
      limit: JSON_BODY_LIMIT,
      verify: (req: Request, _res: Response, buf: Buffer, encoding?: BufferEncoding) => {
        try {
          (req as unknown as { rawBody: string }).rawBody = buf.toString(
            (encoding as BufferEncoding) || 'utf8',
          );
        } catch {
          (req as unknown as { rawBody: string }).rawBody = '';
        }
      },
    }),
  );

  app.useLogger(app.get(Logger));
  app.use(helmet());

  const config = app.get(ConfigService);

  app.enableCors({
    origin: config.get<string>('CORS_ORIGIN', 'http://localhost:3001'),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Digital Switching System API')
    .setDescription(
      'Integration hub API for the agribusiness ecosystem. Forwards blockchain-related work to the external Blockchain Gateway; never talks to blockchain directly.',
    )
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'jwt')
    .addApiKey({ type: 'apiKey', name: 'x-api-key', in: 'header' }, 'partnerApiKey')
    .addApiKey({ type: 'apiKey', name: 'x-api-secret', in: 'header' }, 'partnerApiSecret')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  const port = config.get<number>('PORT', 3000);
  await app.listen(port);
}

await bootstrap();
