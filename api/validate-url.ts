import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  validateMediaUrlSafely,
  type ValidationResult,
  RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_MAX_PER_WINDOW,
  MAX_RATE_LIMIT_MAP_SIZE,
  MAX_CONCURRENT_VALIDATIONS,
} from '../server';

export interface VercelApiRequest extends IncomingMessage {
  query?: Partial<Record<string, string | string[]>>;
  cookies?: Partial<Record<string, string>>;
  body?: any;
}

export interface VercelApiResponse extends ServerResponse {
  send?: (body: any) => VercelApiResponse;
  json?: (jsonBody: any) => VercelApiResponse;
  status?: (statusCode: number) => VercelApiResponse;
  redirect?: (statusOrUrl: string | number, url?: string) => VercelApiResponse;
}

// Estado em memória por instância Serverless para Rate Limiting e Concorrência
let activeValidations = 0;
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();

/**
 * Remove entradas expiradas do mapa de rate limit.
 */
export function cleanupExpiredServerlessRateLimits(now = Date.now()): number {
  let removed = 0;
  for (const [ip, record] of rateLimitMap.entries()) {
    if (now - record.windowStart > RATE_LIMIT_WINDOW_MS) {
      rateLimitMap.delete(ip);
      removed++;
    }
  }

  if (rateLimitMap.size > MAX_RATE_LIMIT_MAP_SIZE) {
    const excess = rateLimitMap.size - MAX_RATE_LIMIT_MAP_SIZE;
    let count = 0;
    for (const key of rateLimitMap.keys()) {
      rateLimitMap.delete(key);
      count++;
      if (count >= excess) break;
    }
    removed += count;
  }

  return removed;
}

export function resetServerlessRateLimits(): void {
  rateLimitMap.clear();
}

export function getServerlessActiveValidationsCount(): number {
  return activeValidations;
}

export function resetServerlessActiveValidations(): void {
  activeValidations = 0;
}

export function setServerlessActiveValidationsCount(count: number): void {
  activeValidations = Math.max(0, count);
}

/**
 * Envia resposta JSON de forma compatível com ambientes Vercel e Node HTTP nativo.
 */
function sendJson(res: VercelApiResponse, statusCode: number, data: any): void {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  if (typeof res.status === 'function') {
    res.status(statusCode);
  }
  if (typeof res.json === 'function') {
    res.json(data);
    return;
  }
  res.end(JSON.stringify(data));
}

/**
 * Extrai e valida o corpo da requisição suportando objetos pré-parseados, strings e streams.
 */
async function parseRequestBody(
  req: VercelApiRequest
): Promise<{ body: any; isInvalidJson: boolean }> {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'object') {
      return { body: req.body, isInvalidJson: false };
    }
    if (typeof req.body === 'string') {
      const trimmed = req.body.trim();
      if (!trimmed) {
        return { body: {}, isInvalidJson: false };
      }
      try {
        return { body: JSON.parse(trimmed), isInvalidJson: false };
      } catch {
        return { body: null, isInvalidJson: true };
      }
    }
    if (Buffer.isBuffer(req.body)) {
      const str = req.body.toString('utf-8').trim();
      if (!str) {
        return { body: {}, isInvalidJson: false };
      }
      try {
        return { body: JSON.parse(str), isInvalidJson: false };
      } catch {
        return { body: null, isInvalidJson: true };
      }
    }
  }

  return new Promise((resolve) => {
    let raw = '';
    req.setEncoding?.('utf-8');
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 32 * 1024) {
        req.destroy();
        resolve({ body: null, isInvalidJson: true });
      }
    });
    req.on('end', () => {
      const trimmed = raw.trim();
      if (!trimmed) {
        resolve({ body: {}, isInvalidJson: false });
        return;
      }
      try {
        resolve({ body: JSON.parse(trimmed), isInvalidJson: false });
      } catch {
        resolve({ body: null, isInvalidJson: true });
      }
    });
    req.on('error', () => {
      resolve({ body: null, isInvalidJson: true });
    });
  });
}

/**
 * Handler Serverless Function compatível com Vercel para o endpoint /api/validate-url.
 * Reutiliza rigorosamente a lógica segura de validação de mídia de server.ts.
 */
export default async function handler(
  req: VercelApiRequest,
  res: VercelApiResponse
): Promise<void> {
  // 1. Verificação de Método HTTP (Apenas POST é aceito)
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    sendJson(res, 405, {
      error: 'Método não permitido. Utilize POST.',
      code: 'METHOD_NOT_ALLOWED',
    });
    return;
  }

  // 2. Extração e validação do JSON do corpo
  const { body, isInvalidJson } = await parseRequestBody(req);
  if (isInvalidJson) {
    sendJson(res, 400, {
      error: 'Corpo da requisição contém JSON inválido.',
      code: 'INVALID_JSON',
    });
    return;
  }

  // 3. Validação do campo 'url'
  const { url } = body || {};
  if (!url || typeof url !== 'string') {
    sendJson(res, 400, {
      error: "O campo 'url' é obrigatório e deve ser uma string.",
      code: 'INVALID_INPUT',
    });
    return;
  }

  if (url.length > 2048) {
    sendJson(res, 400, {
      error: 'A URL excede o tamanho máximo permitido de 2048 caracteres.',
      code: 'URL_TOO_LONG',
    });
    return;
  }

  // 4. Limpeza de rate limits expirados
  cleanupExpiredServerlessRateLimits();

  // 5. Controle de concorrência simultânea
  if (activeValidations >= MAX_CONCURRENT_VALIDATIONS) {
    sendJson(res, 429, {
      error: 'Limite de validações simultâneas atingido. Tente novamente em instantes.',
      code: 'CONCURRENCY_LIMIT',
    });
    return;
  }

  // 6. Rate Limit por IP (suporta x-forwarded-for no ambiente Vercel)
  const forwarded = req.headers['x-forwarded-for'];
  const clientIp =
    (typeof forwarded === 'string'
      ? forwarded.split(',')[0].trim()
      : Array.isArray(forwarded)
      ? forwarded[0]
      : req.socket?.remoteAddress) || 'unknown';

  const now = Date.now();
  const clientRecord = rateLimitMap.get(clientIp);

  if (!clientRecord || now - clientRecord.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(clientIp, { count: 1, windowStart: now });
  } else {
    if (clientRecord.count >= RATE_LIMIT_MAX_PER_WINDOW) {
      sendJson(res, 429, {
        error: 'Muitas requisições de validação deste endereço. Aguarde 1 minuto.',
        code: 'RATE_LIMIT_EXCEEDED',
      });
      return;
    }
    clientRecord.count++;
  }

  // 7. Gestão atômica de concorrência e suporte a cancelamento de cliente
  let released = false;
  const releaseSlot = () => {
    if (!released) {
      released = true;
      activeValidations = Math.max(0, activeValidations - 1);
    }
  };

  const abortController = new AbortController();
  const onClientClose = () => {
    if (!res.writableEnded) {
      abortController.abort();
      releaseSlot();
    }
  };

  res.on?.('close', onClientClose);
  activeValidations++;

  try {
    // Executa validação segura reutilizando o validador original existente
    const result: ValidationResult = await validateMediaUrlSafely(url, {
      signal: abortController.signal,
    });

    if (!res.writableEnded && !abortController.signal.aborted) {
      const logHost = (() => {
        try {
          return new URL(url).host;
        } catch {
          return 'invalid-url';
        }
      })();
      console.log(
        `[NOVA STREAM API Serverless] Validado host: ${logHost} -> Diagnostic: ${result.diagnostic.level} (HTTP ${result.httpStatus || 'N/A'})`
      );

      sendJson(res, 200, result);
    }
  } catch (err: any) {
    if (!res.writableEnded && !abortController.signal.aborted) {
      console.error('[NOVA STREAM API Serverless] Erro durante validação:', err?.message || err);
      sendJson(res, 500, {
        error: 'Falha interna ao processar a validação da URL.',
        code: 'INTERNAL_ERROR',
      });
    }
  } finally {
    res.off?.('close', onClientClose);
    releaseSlot();
  }
}

export { handler };
