import './tracing/otel-sdk'; // Must be first for auto-instrumentation
import { assertProductionConfig } from './config/env.validation';
import { MetricsService } from './obs/metrics.service';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { json, urlencoded } from 'express';
import { NestExpressApplication } from '@nestjs/platform-express';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { join } from 'path';

async function bootstrap() {
  // Phase 7：生产配置 fail-fast——缺失/默认/弱密钥直接拒绝启动
  assertProductionConfig();

  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Phase 7：HTTP 指标中间件（全局计数，method × status）
  const metrics = new MetricsService();
  app.use((req, res, next) => {
    res.on('finish', () => {
      metrics.inc('http.requests', {
        method: req.method,
        status: String(res.statusCode),
      });
    });
    next();
  });
  // Phase 7：指标端点（Prometheus 文本；免认证便于抓取，仅暴露计数）
  app.getHttpAdapter().get('/api/metrics', (_req: any, res: any) => {
    res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.send(metrics.prometheusText());
  });

  // Phase 7：可信代理边界——默认只信任本机回环；反代部署必须显式配置
  // TRUST_PROXY（如 'loopback, 10.0.0.0/8'），否则 req.ip 可被 X-Forwarded-For 伪造。
  const trustProxy = process.env.TRUST_PROXY ?? 'loopback';
  app.set('trust proxy', trustProxy);

  // Register Socket.IO adapter for WebSocket + HTTP polling support
  app.useWebSocketAdapter(new IoAdapter(app));

  app.enableCors(); // allow cross-origin requests

  // Increase payload limits for large image/attachment uploads
  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ extended: true, limit: '50mb' }));

  // Serve static files from 'public' directory
  app.useStaticAssets(join(process.cwd(), 'public'), {
    prefix: '/public/',
  });

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
