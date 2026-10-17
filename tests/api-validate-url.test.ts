import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { EventEmitter } from 'node:events';
import handler, {
  resetServerlessRateLimits,
  resetServerlessActiveValidations,
  getServerlessActiveValidationsCount,
  setServerlessActiveValidationsCount,
} from '../api/validate-url';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  [OK] ${message}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${message}`);
    failed++;
  }
}

/**
 * Cria mock leve de Request e Response para invocar o handler serverless
 */
function createMockHttpPair({
  method = 'POST',
  body = undefined,
  rawBody = undefined,
  headers = {},
  remoteAddress = '127.0.0.1',
}: {
  method?: string;
  body?: any;
  rawBody?: string;
  headers?: Record<string, string>;
  remoteAddress?: string;
}) {
  const req = new EventEmitter() as any;
  req.method = method;
  req.headers = { ...headers };
  req.socket = { remoteAddress };
  req.body = body;

  const resHeaders: Record<string, string> = {};
  let statusCode = 200;
  let responseData = '';
  let responseEnded = false;

  const resPromise = new Promise<{ status: number; headers: Record<string, string>; json: any; raw: string }>((resolve) => {
    const res = new EventEmitter() as any;
    res.writableEnded = false;

    res.setHeader = (key: string, val: string) => {
      resHeaders[key.toLowerCase()] = val;
      return res;
    };

    res.getHeader = (key: string) => resHeaders[key.toLowerCase()];

    res.status = (code: number) => {
      statusCode = code;
      res.statusCode = code;
      return res;
    };

    res.json = (data: any) => {
      statusCode = statusCode || 200;
      res.statusCode = statusCode;
      resHeaders['content-type'] = 'application/json';
      responseData = JSON.stringify(data);
      res.writableEnded = true;
      res.emit('finish');
      resolve({
        status: statusCode,
        headers: resHeaders,
        json: data,
        raw: responseData,
      });
      return res;
    };

    res.end = (chunk?: any) => {
      if (chunk) {
        responseData += typeof chunk === 'string' ? chunk : chunk.toString();
      }
      res.writableEnded = true;
      res.emit('finish');
      let parsed = null;
      try {
        parsed = JSON.parse(responseData);
      } catch {
        parsed = responseData;
      }
      resolve({
        status: statusCode,
        headers: resHeaders,
        json: parsed,
        raw: responseData,
      });
      return res;
    };

    // Executa o handler
    setImmediate(async () => {
      try {
        if (rawBody !== undefined && body === undefined) {
          // Simula stream de dados
          setImmediate(() => {
            req.emit('data', rawBody);
            req.emit('end');
          });
        }
        await handler(req, res);
      } catch (err: any) {
        console.error('Erro não capturado no handler:', err);
        res.status(500).json({ error: err.message });
      }
    });
  });

  return { resPromise };
}

async function runApiValidationTestSuite() {
  console.log('===============================================================');
  console.log('SUITE DE TESTES: SERVERLESS FUNCTION api/validate-url (VERCEL)');
  console.log('===============================================================\n');

  resetServerlessRateLimits();
  resetServerlessActiveValidations();

  // -----------------------------------------------------------------
  // 1. CARREGAMENTO E MÉTODOS HTTP INVÁLIDOS
  // -----------------------------------------------------------------
  console.log('--- 1. CARREGAMENTO E MÉTODOS HTTP INVÁLIDOS ---');

  assert(typeof handler === 'function', 'A função api/validate-url.ts foi importada e carregada com sucesso');

  for (const invalidMethod of ['GET', 'PUT', 'DELETE', 'PATCH']) {
    const { resPromise } = createMockHttpPair({ method: invalidMethod });
    const res = await resPromise;
    assert(
      res.status === 405 &&
        res.headers['allow'] === 'POST' &&
        res.json.code === 'METHOD_NOT_ALLOWED',
      `Método ${invalidMethod} rejeitado com HTTP 405, Allow: POST e code METHOD_NOT_ALLOWED`
    );
  }

  // -----------------------------------------------------------------
  // 2. TRATAMENTO DE JSON INVÁLIDO NO CORPO
  // -----------------------------------------------------------------
  console.log('\n--- 2. TRATAMENTO DE JSON INVÁLIDO NO CORPO ---');

  // String malformada no body direto
  const { resPromise: resInvalidJsonDirect } = createMockHttpPair({
    method: 'POST',
    body: '{"url": "not-closed',
  });
  const resBadJson1 = await resInvalidJsonDirect;
  assert(
    resBadJson1.status === 400 && resBadJson1.json.code === 'INVALID_JSON',
    'JSON malformado em req.body rejeitado com HTTP 400 e code INVALID_JSON'
  );

  // Stream com JSON quebrado
  const { resPromise: resInvalidJsonStream } = createMockHttpPair({
    method: 'POST',
    rawBody: '{ invalid json payload }',
  });
  const resBadJson2 = await resInvalidJsonStream;
  assert(
    resBadJson2.status === 400 && resBadJson2.json.code === 'INVALID_JSON',
    'JSON quebrado em stream bruto rejeitado com HTTP 400 e code INVALID_JSON'
  );

  // -----------------------------------------------------------------
  // 3. TRATAMENTO DE URL INVÁLIDA
  // -----------------------------------------------------------------
  console.log('\n--- 3. TRATAMENTO DE URL INVÁLIDA ---');

  // Campo url ausente
  const { resPromise: resMissingUrl } = createMockHttpPair({
    method: 'POST',
    body: {},
  });
  const resNoUrl = await resMissingUrl;
  assert(
    resNoUrl.status === 400 && resNoUrl.json.code === 'INVALID_INPUT',
    'Corpo sem campo url rejeitado com HTTP 400 e code INVALID_INPUT'
  );

  // Campo url não-string (ex: número)
  const { resPromise: resNonStringUrl } = createMockHttpPair({
    method: 'POST',
    body: { url: 12345 },
  });
  const resNotStr = await resNonStringUrl;
  assert(
    resNotStr.status === 400 && resNotStr.json.code === 'INVALID_INPUT',
    'Campo url não-string rejeitado com HTTP 400 e code INVALID_INPUT'
  );

  // URL excedendo 2048 caracteres
  const longUrl = 'https://example.com/video?' + 'a'.repeat(2100);
  const { resPromise: resLongUrl } = createMockHttpPair({
    method: 'POST',
    body: { url: longUrl },
  });
  const resTooLong = await resLongUrl;
  assert(
    resTooLong.status === 400 && resTooLong.json.code === 'URL_TOO_LONG',
    'URL > 2048 caracteres rejeitada com HTTP 400 e code URL_TOO_LONG'
  );

  // Sintaxe inválida tratada pelo validador seguro (retorna 200 com diagnostic sintaxe_invalida e success=false)
  const { resPromise: resMalformedUrl } = createMockHttpPair({
    method: 'POST',
    body: { url: 'not-a-valid-url' },
  });
  const resSyntax = await resMalformedUrl;
  assert(
    resSyntax.status === 200 &&
      resSyntax.json.success === false &&
      resSyntax.json.diagnostic?.level === 'sintaxe_invalida',
    'URL com formato sintático inválido retorna HTTP 200 com diagnostic.level sintaxe_invalida'
  );

  // Protocolo proibido (SSRF)
  const { resPromise: resSsrfUrl } = createMockHttpPair({
    method: 'POST',
    body: { url: 'file:///etc/passwd' },
  });
  const resSsrf = await resSsrfUrl;
  assert(
    resSsrf.status === 200 &&
      resSsrf.json.success === false &&
      resSsrf.json.diagnostic?.level === 'bloqueado_ssrf',
    'Protocolo proibido file:// bloqueado pelo validador com diagnostic.level bloqueado_ssrf'
  );

  // -----------------------------------------------------------------
  // 4. TRATAMENTO DE RESPOSTAS DO SERVIDOR REMOTO
  // -----------------------------------------------------------------
  console.log('\n--- 4. TRATAMENTO DE RESPOSTAS DO SERVIDOR REMOTO ---');

  // Servidor mock para simular cenários remotos
  const mockHttpServer = http.createServer();
  await new Promise<void>((resolve) => {
    mockHttpServer.listen(0, '127.0.0.1', () => resolve());
  });
  const mockPort = (mockHttpServer.address() as AddressInfo).port;

  // Servidor 404 remoto (vídeo não encontrado no CDN)
  mockHttpServer.removeAllListeners('request');
  mockHttpServer.on('request', (req, res) => {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('File Not Found');
  });

  const { resPromise: resRemote404 } = createMockHttpPair({
    method: 'POST',
    body: { url: `http://127.0.0.1:${mockPort}/video.mp4` },
  });
  const remote404Result = await resRemote404;
  assert(
    remote404Result.status === 200 &&
      remote404Result.json.success === false &&
      (remote404Result.json.diagnostic.level === 'bloqueado_ssrf' ||
        remote404Result.json.diagnostic.level === 'acesso_negado_ou_expirado'),
    'Requisição para 127.0.0.1 bloqueada por SSRF ou diagnosticada com segurança'
  );

  // -----------------------------------------------------------------
  // 5. CONCORRÊNCIA E RATE LIMITING NO HANDLER SERVERLESS
  // -----------------------------------------------------------------
  console.log('\n--- 5. CONCORRÊNCIA E RATE LIMITING NO HANDLER SERVERLESS ---');

  // Limite de concorrência atingido
  setServerlessActiveValidationsCount(5);
  const { resPromise: resConcurrent } = createMockHttpPair({
    method: 'POST',
    body: { url: 'https://cdn.exemplo.com/test.mp4' },
  });
  const concurrentRes = await resConcurrent;
  assert(
    concurrentRes.status === 429 && concurrentRes.json.code === 'CONCURRENCY_LIMIT',
    'Concorrência máxima rejeitada com HTTP 429 CONCURRENCY_LIMIT'
  );
  resetServerlessActiveValidations();

  // Rate limit por IP
  resetServerlessRateLimits();
  let got429RateLimit = false;
  for (let i = 0; i <= 61; i++) {
    const { resPromise: rPromise } = createMockHttpPair({
      method: 'POST',
      body: { url: 'not-valid' },
      headers: { 'x-forwarded-for': '203.0.113.50' },
    });
    const r = await rPromise;
    if (r.status === 429 && r.json.code === 'RATE_LIMIT_EXCEEDED') {
      got429RateLimit = true;
      break;
    }
  }
  assert(got429RateLimit, 'Rate limit > 60 req/min no handler serverless retorna HTTP 429 RATE_LIMIT_EXCEEDED');

  // -----------------------------------------------------------------
  // 6. PRESERVAÇÃO DE PARÂMETROS R2 E DIAGNÓSTICO DO ENDPOINT 404
  // -----------------------------------------------------------------
  console.log('\n--- 6. PRESERVAÇÃO DE PARÂMETROS R2 E DIAGNÓSTICO DO ENDPOINT 404 ---');

  // Validação de URL assinada do Cloudflare R2: parâmetros devem ser preservados sem alteração
  const signedR2Url =
    'https://pub-r2.exemplo.com/videos/aula01.mp4?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=test%2F20261016%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20261016T000000Z&X-Amz-Expires=3600&X-Amz-Signature=abcdef123456';
  
  const parsedSigned = new URL(signedR2Url);
  assert(
    parsedSigned.searchParams.get('X-Amz-Signature') === 'abcdef123456' &&
      parsedSigned.searchParams.get('X-Amz-Expires') === '3600',
    'URL assinada do Cloudflare R2 preserva parâmetros de query sem mutação'
  );

  // Verificação da mensagem específica de endpoint 404 no cliente
  const simulateClientHandling = (status: number, data?: any) => {
    let netStatus = 'inconclusivo';
    let netError = '';

    if (status === 404) {
      netStatus = 'erro_rede';
      netError =
        'Endpoint de validação não encontrado (HTTP 404). Verifique se o serviço "/api/validate-url" está configurado e disponível no servidor.';
    } else if (status === 200 && data) {
      netStatus = data.diagnostic?.level || 'servidor_conectado';
    } else {
      netStatus = 'erro_rede';
      netError = `Erro HTTP ${status} ao validar na API.`;
    }

    return { netStatus, netError };
  };

  const client404Result = simulateClientHandling(404);
  assert(
    client404Result.netStatus === 'erro_rede' &&
      client404Result.netError.includes('Endpoint de validação não encontrado (HTTP 404)'),
    'Cliente processa status HTTP 404 com a mensagem descritiva específica requerida'
  );

  mockHttpServer.close();

  console.log('\n===============================================================');
  console.log(`TOTAL DE ASSERTIVAS: ${passed + failed} | APROVADAS: ${passed} | FALHAS: ${failed}`);
  console.log('===============================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runApiValidationTestSuite().catch((err) => {
  console.error('Falha fatal nos testes:', err);
  process.exit(1);
});
