import express, { type Request, type Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Reexportação completa das funções e constantes para manter retrocompatibilidade com testes e servidor local
export {
  REQUEST_TIMEOUT_MS,
  MAX_REDIRECTS,
  MAX_BYTES_TO_READ,
  RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_MAX_PER_WINDOW,
  MAX_RATE_LIMIT_MAP_SIZE,
  MAX_CONCURRENT_VALIDATIONS,
  parseIpv6ToHextets,
  isPrivateOrSpecialIp,
  isProhibitedHostname,
  performSafeHttpCheck,
  validateMediaUrlSafely,
  type ValidationResult,
  type ValidateOptions,
} from './src/services/mediaUrlValidator.ts';

import {
  RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_MAX_PER_WINDOW,
  MAX_RATE_LIMIT_MAP_SIZE,
  MAX_CONCURRENT_VALIDATIONS,
  validateMediaUrlSafely,
} from './src/services/mediaUrlValidator.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let activeValidations = 0;
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();

/**
 * Remove entradas expiradas do mapa de rate limit para prevenir vazamento de memória.
 * Também expurga entradas excedentes se o mapa ultrapassar o tamanho máximo de segurança.
 */
export function cleanupExpiredRateLimits(now = Date.now()): number {
  let removed = 0;
  for (const [ip, record] of rateLimitMap.entries()) {
    if (now - record.windowStart > RATE_LIMIT_WINDOW_MS) {
      rateLimitMap.delete(ip);
      removed++;
    }
  }

  // Se o mapa ultrapassar o limite máximo de entradas, remove preventivamente os registros mais antigos
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

// Limpeza periódica em segundo plano (unref para não bloquear finalização de processo/testes)
const cleanupInterval = setInterval(() => {
  cleanupExpiredRateLimits();
}, RATE_LIMIT_WINDOW_MS);
if (cleanupInterval.unref) {
  cleanupInterval.unref();
}

export function getRateLimitMapSize(): number {
  return rateLimitMap.size;
}

export function resetRateLimits(): void {
  rateLimitMap.clear();
}

export function getActiveValidationsCount(): number {
  return activeValidations;
}

export function resetActiveValidations(): void {
  activeValidations = 0;
}

export function setActiveValidationsCount(val: number): void {
  activeValidations = Math.max(0, val);
}

/**
 * Criação da aplicação Express com endpoint seguro e integração Vite SPA.
 */
export async function createExpressApp() {
  const app = express();

  // Limite estrito de body parser
  app.use(express.json({ limit: '32kb' }));

  // Endpoint de Validação Segura de URLs
  app.post('/api/validate-url', async (req: Request, res: Response): Promise<void> => {
    // 1. Limpeza de rate limits expirados a cada requisição
    cleanupExpiredRateLimits();

    // 2. Controle de concorrência global no processo
    if (activeValidations >= MAX_CONCURRENT_VALIDATIONS) {
      res.status(429).json({
        error: 'Limite de validações simultâneas atingido. Tente novamente em instantes.',
        code: 'CONCURRENCY_LIMIT',
      });
      return;
    }

    // 3. Rate limit por IP de transporte seguro
    // NOTA DE SEGURANÇA SOBRE PROXIES E CABEÇALHOS:
    // Por padrão estrito contra falsificação (spoofing) de cabeçalhos HTTP, utilizamos a conexão TCP direta (req.socket.remoteAddress).
    // Não confiamos cegamente no cabeçalho 'X-Forwarded-For' porque em ambientes onde o proxy reverso não é autenticado
    // ou pré-configurado de maneira segura, atacantes podem forjar múltiplos valores de IP para contornar qualquer limitação.
    // LIMITAÇÃO DOCUMENTADA: Em ambientes operando atrás de proxies reversos intermediários ou gateways compartilhados
    // sem infraestrutura de identificação upstream, múltiplos clientes atrás do mesmo proxy compartilharão
    // a mesma cota máxima de 60 requisições por minuto.
    const clientIp = req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const clientRecord = rateLimitMap.get(clientIp);

    if (!clientRecord || now - clientRecord.windowStart > RATE_LIMIT_WINDOW_MS) {
      rateLimitMap.set(clientIp, { count: 1, windowStart: now });
    } else {
      if (clientRecord.count >= RATE_LIMIT_MAX_PER_WINDOW) {
        res.status(429).json({
          error: 'Muitas requisições de validação deste endereço. Aguarde 1 minuto.',
          code: 'RATE_LIMIT_EXCEEDED',
        });
        return;
      }
      clientRecord.count++;
    }

    // 4. Validação do corpo da requisição
    const { url } = req.body || {};
    if (!url || typeof url !== 'string') {
      res.status(400).json({
        error: "O campo 'url' é obrigatório e deve ser uma string.",
        code: 'INVALID_INPUT',
      });
      return;
    }

    if (url.length > 2048) {
      res.status(400).json({
        error: 'A URL excede o tamanho máximo permitido de 2048 caracteres.',
        code: 'URL_TOO_LONG',
      });
      return;
    }

    // 5. Gestão atômica de concorrência e suporte a cancelamento de cliente
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

    res.on('close', onClientClose);

    activeValidations++;

    try {
      const result = await validateMediaUrlSafely(url, { signal: abortController.signal });

      if (!res.writableEnded && !abortController.signal.aborted) {
        // Log seguro sem tokens ou credenciais
        const logHost = (() => {
          try {
            return new URL(url).host;
          } catch {
            return 'invalid-url';
          }
        })();
        console.log(
          `[NOVA STREAM API] Validado host: ${logHost} -> Diagnostic: ${result.diagnostic.level} (HTTP ${result.httpStatus || 'N/A'})`
        );

        res.status(200).json(result);
      }
    } catch (err: any) {
      if (!res.writableEnded && !abortController.signal.aborted) {
        console.error('[NOVA STREAM API] Erro durante validação:', err.message);
        res.status(500).json({
          error: 'Falha interna ao processar a validação da URL.',
          code: 'INTERNAL_ERROR',
        });
      }
    } finally {
      res.off('close', onClientClose);
      releaseSlot();
    }
  });

  return app;
}

/**
 * Ponto de entrada do servidor.
 */
export async function startServer() {
  const app = await createExpressApp();
  const PORT = Number(process.env.PORT) || 3000;
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    // Monta o Vite em modo middleware para preservar 100% da experiência de preview
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`[NOVA STREAM] Servidor Full-Stack rodando em http://0.0.0.0:${PORT}`);
  });

  return server;
}

// Inicializar automaticamente se executado como script principal
if (process.argv[1] && process.argv[1].endsWith('server.ts')) {
  startServer().catch((err) => {
    console.error('[NOVA STREAM] Falha fatal ao inicializar servidor:', err);
    process.exit(1);
  });
}
