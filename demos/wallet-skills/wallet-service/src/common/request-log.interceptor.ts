import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';
import { log } from './log';

type LoggedRequest = Request & {
  err?: { message: string; name: string };
};

@Injectable()
export class RequestLogInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const req = context.switchToHttp().getRequest<LoggedRequest>();
    const res = context.switchToHttp().getResponse<Response>();
    const started = process.hrtime.bigint();
    const requestId = incomingRequestId(req.headers['x-request-id']);
    res.setHeader('x-request-id', requestId);

    res.on('finish', () => {
      const durationMs = Math.round(Number(process.hrtime.bigint() - started) / 1e6);
      const routePath = req.route?.path ?? req.path;
      const fields: Record<string, unknown> = {
        requestId,
        route: `${req.method} ${routePath}`,
        durationMs,
        statusCode: res.statusCode,
      };
      const walletId = walletIdFrom(req);
      if (walletId) fields.walletId = walletId;
      const externalId = externalIdFrom(req);
      if (externalId) fields.externalId = externalId;
      if (req.err) fields.err = req.err;

      const write =
        res.statusCode >= 500 ? log.error.bind(log) : res.statusCode >= 400 ? log.warn.bind(log) : log.info.bind(log);
      write(fields, 'request');
    });

    return next.handle().pipe(
      tap({
        error: (error: unknown) => {
          req.err = {
            message: error instanceof Error ? error.message : String(error),
            name: error instanceof Error ? error.name : 'Error',
          };
        },
      }),
    );
  }
}

function incomingRequestId(header: string | string[] | undefined): string {
  const raw = Array.isArray(header) ? header[0] : header;
  if (typeof raw === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(raw)) {
    return raw;
  }
  return randomUUID();
}

function walletIdFrom(req: Request): string | undefined {
  const id = req.params?.id;
  if (typeof id === 'string' && req.path.includes('/wallets/')) {
    return id;
  }
  return undefined;
}

function externalIdFrom(req: Request): string | undefined {
  const body: unknown = req.body;
  if (body && typeof body === 'object' && 'externalId' in body) {
    const value = (body as { externalId?: unknown }).externalId;
    if (typeof value === 'string' && value.length > 0 && value.length <= 128) {
      return value;
    }
  }
  return undefined;
}
