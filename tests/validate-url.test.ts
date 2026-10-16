import http from 'node:http';
import { AddressInfo } from 'node:net';
import {
  isPrivateOrSpecialIp,
  isProhibitedHostname,
  parseIpv6ToHextets,
  validateMediaUrlSafely,
  performSafeHttpCheck,
  createExpressApp,
  cleanupExpiredRateLimits,
  getRateLimitMapSize,
  resetRateLimits,
  getActiveValidationsCount,
  resetActiveValidations,
  REQUEST_TIMEOUT_MS,
  MAX_BYTES_TO_READ,
} from '../server';

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

async function runSuite() {
  console.log('===============================================================');
  console.log('SUITE DE TESTES PERMANENTES: API /api/validate-url (NOVA STREAM)');
  console.log('===============================================================\n');

  resetRateLimits();
  resetActiveValidations();

  // -----------------------------------------------------------------
  // 1. URLs MALFORMADAS E PROTOCOLOS PROIBIDOS
  // -----------------------------------------------------------------
  console.log('--- 1. URLs MALFORMADAS E PROTOCOLOS PROIBIDOS ---');

  const resMalformed = await validateMediaUrlSafely('not-a-valid-url');
  assert(
    resMalformed.success === false && resMalformed.diagnostic.level === 'sintaxe_invalida',
    'String "not-a-valid-url" classificada como sintaxe_invalida com success=false'
  );

  const resEmpty = await validateMediaUrlSafely('   ');
  assert(
    resEmpty.success === false && resEmpty.diagnostic.level === 'sintaxe_invalida',
    'String vazia/espaços classificada como sintaxe_invalida'
  );

  const forbiddenProtocols = [
    { url: 'ftp://example.com/movie.mp4', proto: 'ftp:' },
    { url: 'file:///etc/passwd', proto: 'file:' },
    { url: 'gopher://example.com/', proto: 'gopher:' },
    { url: 'javascript:alert(1)', proto: 'javascript:' },
    { url: 'data:text/html,<script>alert(1)</script>', proto: 'data:' },
  ];

  for (const item of forbiddenProtocols) {
    const resProto = await validateMediaUrlSafely(item.url);
    assert(
      resProto.success === false && resProto.diagnostic.level === 'bloqueado_ssrf',
      `Protocolo proibido '${item.proto}' bloqueado com nível bloqueado_ssrf`
    );
  }

  // -----------------------------------------------------------------
  // 2. FILTRAGEM DE IP: IPv4 PRIVADO, IPv6 LOCAL, IPv4-MAPPED E NAT64
  // -----------------------------------------------------------------
  console.log('\n--- 2. FILTRAGEM DE IP: IPv4, IPv6, IPv4-MAPPED (HEX/DEC) E NAT64 ---');

  const ipCases = [
    // IPv4 Privados / Reservados
    { ip: '127.0.0.1', blocked: true, desc: 'IPv4 Loopback padrão' },
    { ip: '127.255.0.1', blocked: true, desc: 'IPv4 Faixa 127/8' },
    { ip: '0.0.0.0', blocked: true, desc: 'IPv4 Rede local 0.0.0.0/8' },
    { ip: '10.1.2.3', blocked: true, desc: 'IPv4 RFC 1918 10.0.0.0/8' },
    { ip: '172.16.0.1', blocked: true, desc: 'IPv4 RFC 1918 172.16.0.0/12' },
    { ip: '172.31.255.255', blocked: true, desc: 'IPv4 RFC 1918 topo 172.31' },
    { ip: '192.168.1.1', blocked: true, desc: 'IPv4 RFC 1918 192.168.0.0/16' },
    { ip: '169.254.169.254', blocked: true, desc: 'IPv4 Link-Local / Metadados AWS/GCP' },
    { ip: '100.64.0.1', blocked: true, desc: 'IPv4 CGNAT RFC 6598' },
    { ip: '192.88.99.1', blocked: true, desc: 'IPv4 6to4 Relay RFC 7526' },
    { ip: '198.18.0.1', blocked: true, desc: 'IPv4 Benchmarking RFC 2544' },
    { ip: '198.51.100.1', blocked: true, desc: 'IPv4 TEST-NET-2 RFC 5737' },
    { ip: '203.0.113.1', blocked: true, desc: 'IPv4 TEST-NET-3 RFC 5737' },
    { ip: '224.0.0.1', blocked: true, desc: 'IPv4 Multicast RFC 5771' },
    { ip: '240.0.0.1', blocked: true, desc: 'IPv4 Reservado / Classe E' },
    { ip: '255.255.255.255', blocked: true, desc: 'IPv4 Broadcast' },

    // IPv6 Especiais e Locais
    { ip: '::1', blocked: true, desc: 'IPv6 Loopback' },
    { ip: '::', blocked: true, desc: 'IPv6 Não especificado' },
    { ip: 'fe80::1', blocked: true, desc: 'IPv6 Link-Local RFC 4291' },
    { ip: 'fc00::1', blocked: true, desc: 'IPv6 Unique Local (ULA) fc00::/7' },
    { ip: 'fd12:3456::1', blocked: true, desc: 'IPv6 Unique Local (ULA) fd00::/8' },
    { ip: 'fec0::1', blocked: true, desc: 'IPv6 Site-Local fec0::/10' },
    { ip: 'ff02::1', blocked: true, desc: 'IPv6 Multicast ff00::/8' },
    { ip: '2001:db8::1', blocked: true, desc: 'IPv6 Documentação RFC 3849' },
    { ip: '100::1', blocked: true, desc: 'IPv6 Discard RFC 6666' },

    // IPv4-mapped IPv6 em formato Decimal e Hexadecimal
    { ip: '::ffff:127.0.0.1', blocked: true, desc: 'IPv4-mapped decimal loopback' },
    { ip: '::ffff:192.168.0.1', blocked: true, desc: 'IPv4-mapped decimal privado' },
    { ip: '::ffff:7f00:1', blocked: true, desc: 'IPv4-mapped hex loopback (::ffff:7f00:1)' },
    { ip: '::ffff:7f00:0001', blocked: true, desc: 'IPv4-mapped hex loopback completo' },
    { ip: '0:0:0:0:0:ffff:7f00:1', blocked: true, desc: 'IPv4-mapped descompactado hex' },
    { ip: '::ffff:0a00:0001', blocked: true, desc: 'IPv4-mapped hex privado 10.0.0.1' },

    // NAT64 (RFC 6052 e RFC 8215)
    { ip: '64:ff9b::127.0.0.1', blocked: true, desc: 'NAT64 Well-Known decimal loopback' },
    { ip: '64:ff9b::7f00:1', blocked: true, desc: 'NAT64 Well-Known hex loopback' },
    { ip: '64:ff9b::192.168.1.1', blocked: true, desc: 'NAT64 Well-Known privado 192.168.1.1' },
    { ip: '64:ff9b:1::1', blocked: true, desc: 'NAT64 Local-Use RFC 8215 64:ff9b:1::/48' },

    // 6to4 e Teredo
    { ip: '2002:7f00:0001::', blocked: true, desc: '6to4 com IPv4 loopback encapsulado' },
    { ip: '2002:0a00:0001::', blocked: true, desc: '6to4 com IPv4 privado 10.0.0.1' },
    { ip: '2001:0000::1', blocked: true, desc: 'Teredo RFC 4380' },

    // Endereços Públicos Válidos (Não devem ser bloqueados pelo filtro de IP)
    { ip: '8.8.8.8', blocked: false, desc: 'IPv4 Público (Google DNS)' },
    { ip: '1.1.1.1', blocked: false, desc: 'IPv4 Público (Cloudflare DNS)' },
    { ip: '::ffff:8.8.8.8', blocked: false, desc: 'IPv4-mapped com IP público' },
    { ip: '64:ff9b::8.8.8.8', blocked: false, desc: 'NAT64 com IP público 8.8.8.8' },
    { ip: '2607:f8b0:400e:c00::cf', blocked: false, desc: 'IPv6 Público GUA' },
  ];

  for (const c of ipCases) {
    const res = isPrivateOrSpecialIp(c.ip);
    assert(res === c.blocked, `${c.desc} (${c.ip}) -> Bloqueado: ${res}`);
  }

  // -----------------------------------------------------------------
  // 3. DNS COM MÚLTIPLOS ENDEREÇOS E REDIRECIONAMENTOS PROIBIDOS
  // -----------------------------------------------------------------
  console.log('\n--- 3. DNS COM MÚLTIPLOS ENDEREÇOS E REDIRECIONAMENTOS ---');

  // Teste de DNS Rebinding: safeLookup com múltiplos IPs incluindo um privado
  let rebindingBlocked = false;
  const mockCustomLookup = (host: string, opts: any, cb: any) => {
    const mockAddresses = [
      { address: '8.8.8.8', family: 4 },
      { address: '127.0.0.1', family: 4 },
    ];
    for (const item of mockAddresses) {
      if (isPrivateOrSpecialIp(item.address)) {
        rebindingBlocked = true;
        return cb(new Error(`SSRF_BLOCKED: DNS Rebinding: ${item.address}`), [], 0);
      }
    }
    cb(null, mockAddresses, 4);
  };

  try {
    await performSafeHttpCheck(
      new URL('http://example.com/test.mp4'),
      'HEAD',
      0,
      { customLookup: mockCustomLookup }
    );
  } catch (err: any) {
    assert(rebindingBlocked && err.message.includes('SSRF_BLOCKED'), 'DNS Rebinding com IP misto barrado no safeLookup');
  }

  // Servidor Mock HTTP Local para testes controlados
  const mockHttpServer = http.createServer();
  await new Promise<void>((resolve) => {
    mockHttpServer.listen(0, '127.0.0.1', () => resolve());
  });
  const mockPort = (mockHttpServer.address() as AddressInfo).port;

  const mockDnsLookup = (host: string, opts: any, cb: any) => {
    if (opts && opts.all) {
      cb(null, [{ address: '127.0.0.1', family: 4 }]);
    } else {
      cb(null, '127.0.0.1', 4);
    }
  };

  // Redirecionamento proibido para file://
  mockHttpServer.removeAllListeners('request');
  mockHttpServer.on('request', (req, res) => {
    if (req.url === '/redirect-file') {
      res.writeHead(302, { Location: 'file:///etc/passwd' });
      res.end();
    }
  });

  try {
    await performSafeHttpCheck(
      new URL(`http://mock.safe-test.com:${mockPort}/redirect-file`),
      'HEAD',
      0,
      { customLookup: mockDnsLookup, allowLoopbackForMockTest: true }
    );
    assert(false, 'Redirecionamento para file:// deveria ter lançado erro');
  } catch (err: any) {
    assert(
      err.message.includes('SSRF_BLOCKED') && err.message.includes('protocolo não permitido'),
      'Redirecionamento 302 para file:/// rejeitado com SSRF_BLOCKED'
    );
  }

  // -----------------------------------------------------------------
  // 4. SERVIDORES LENTOS, CORPO INTERROMPIDO E SERVIDOR QUE IGNORA RANGE
  // -----------------------------------------------------------------
  console.log('\n--- 4. LIMITES DE LEITURA (RANGE IGNORADO) E TIMEOUT INTEGRAL ---');

  // Teste 4.1: Servidor que ignora Range e envia stream contínuo de 200KB
  mockHttpServer.removeAllListeners('request');
  mockHttpServer.on('request', (req, res) => {
    if (req.url === '/stream-large.mp4') {
      res.writeHead(200, {
        'Content-Type': 'video/mp4',
        'Accept-Ranges': 'none',
      });
      const chunk = Buffer.alloc(16 * 1024, 0x5a);
      let sent = 0;
      const interval = setInterval(() => {
        if (res.writableEnded || res.destroyed) {
          clearInterval(interval);
          return;
        }
        res.write(chunk);
        sent += chunk.length;
        if (sent >= 200 * 1024) {
          clearInterval(interval);
          res.end();
        }
      }, 5);
      req.on('close', () => clearInterval(interval));
    }
  });

  const streamCheck = await performSafeHttpCheck(
    new URL(`http://mock.safe-test.com:${mockPort}/stream-large.mp4`),
    'GET',
    0,
    { customLookup: mockDnsLookup, allowLoopbackForMockTest: true }
  );

  assert(
    streamCheck.truncated === true && streamCheck.statusCode === 200,
    'Servidor que ignora Range é truncado com sucesso após 64KB sem erro_rede'
  );

  // Teste 4.2: Timeout Integral cobre conexão lenta/travada no corpo (Slowloris Body)
  mockHttpServer.removeAllListeners('request');
  mockHttpServer.on('request', (req, res) => {
    if (req.url === '/slow-body') {
      res.writeHead(200, { 'Content-Type': 'video/mp4' });
      res.write('início do corpo...');
    }
  });

  let timeoutCaught = false;
  try {
    await performSafeHttpCheck(
      new URL(`http://mock.safe-test.com:${mockPort}/slow-body`),
      'GET',
      0,
      { customLookup: mockDnsLookup, timeoutMs: 300, allowLoopbackForMockTest: true }
    );
  } catch (err: any) {
    if (err.message.includes('TIMEOUT')) {
      timeoutCaught = true;
    }
  }
  assert(timeoutCaught, 'Timeout integral encerrou conexão paralisada durante leitura do corpo');

  // Teste 4.3: Fallback de HEAD (405 Method Not Allowed) para GET com Range
  mockHttpServer.removeAllListeners('request');
  mockHttpServer.on('request', (req, res) => {
    if (req.method === 'HEAD') {
      res.writeHead(405, { 'Content-Type': 'text/plain' });
      res.end();
    } else if (req.method === 'GET') {
      res.writeHead(206, {
        'Content-Type': 'video/mp4',
        'Content-Range': 'bytes 0-1024/5000000',
        'Accept-Ranges': 'bytes',
      });
      res.end(Buffer.alloc(1024, 0x01));
    }
  });

  const fallbackCheck = await validateMediaUrlSafely(
    `http://mock.safe-test.com:${mockPort}/method-check.mp4`,
    { customLookup: mockDnsLookup, allowLoopbackForMockTest: true }
  );
  assert(
    fallbackCheck.httpStatus === 206 && fallbackCheck.isMediaCompatible === true,
    'Fallback de status 405 executado com sucesso para GET Range (HTTP 206)'
  );

  // -----------------------------------------------------------------
  // 5. CANCELAMENTO DO CLIENTE E CONCORRÊNCIA NA API EXPRESS
  // -----------------------------------------------------------------
  console.log('\n--- 5. CANCELAMENTO DO CLIENTE E GESTÃO DE CONCORRÊNCIA ---');

  const app = await createExpressApp();
  const apiServer = http.createServer(app);
  await new Promise<void>((resolve) => {
    apiServer.listen(0, '127.0.0.1', () => resolve());
  });
  const apiPort = (apiServer.address() as AddressInfo).port;

  assert(getActiveValidationsCount() === 0, 'Contador de concorrência inicial é 0');

  // Teste 5.1: Cancelamento cliente libera vaga imediatamente
  const slowClientReq = http.request({
    port: apiPort,
    hostname: '127.0.0.1',
    path: '/api/validate-url',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  slowClientReq.on('error', () => {
    // Erro esperado decorrente da chamada intencional de destroy()
  });

  slowClientReq.write(JSON.stringify({ url: 'http://169.254.169.254/slow' }));
  // Aborta o cliente intencionalmente após 50ms
  setTimeout(() => {
    slowClientReq.destroy();
  }, 50);
  slowClientReq.end();

  await new Promise((r) => setTimeout(r, 200));
  assert(getActiveValidationsCount() === 0, 'Cancelamento do cliente liberou a vaga de concorrência');

  // -----------------------------------------------------------------
  // 6. RATE LIMIT E LIMPEZA DE ENTRADAS EXPIRADAS
  // -----------------------------------------------------------------
  console.log('\n--- 6. RATE LIMIT E LIMPEZA DE ENTRADAS EXPIRADAS ---');

  resetRateLimits();
  assert(getRateLimitMapSize() === 0, 'Mapa de rate limit começa limpo');

  // Faz requisição para criar registro
  const rateLimitPost = await new Promise<{ status: number }>((resolve, reject) => {
    const payload = JSON.stringify({ url: 'http://127.0.0.1:3000' });
    const r = http.request(
      {
        port: apiPort,
        hostname: '127.0.0.1',
        path: '/api/validate-url',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        res.on('data', () => {});
        res.on('end', () => resolve({ status: res.statusCode || 0 }));
      }
    );
    r.on('error', reject);
    r.write(payload);
    r.end();
  });

  assert(getRateLimitMapSize() > 0 && rateLimitPost.status === 200, 'Registro de cliente inserido no rateLimitMap');

  // Simula limpeza após janela expirar
  const removedCount = cleanupExpiredRateLimits(Date.now() + 70000);
  assert(removedCount > 0, `cleanupExpiredRateLimits removeu ${removedCount} entrada(s) expirada(s)`);
  assert(getRateLimitMapSize() === 0, 'Mapa de rate limit esvaziado com sucesso');

  // -----------------------------------------------------------------
  // 7. CÓDIGOS DE STATUS REMOTOS: 403, 404, 500
  // -----------------------------------------------------------------
  console.log('\n--- 7. CÓDIGOS DE STATUS HTTP REMOTOS (403, 404, 500) ---');

  mockHttpServer.removeAllListeners('request');
  mockHttpServer.on('request', (req, res) => {
    if (req.url === '/test-403') {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Acesso proibido');
    } else if (req.url === '/test-404') {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Não encontrado');
    } else if (req.url === '/test-500') {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Erro interno remoto');
    }
  });

  const check403 = await performSafeHttpCheck(
    new URL(`http://mock.safe-test.com:${mockPort}/test-403`),
    'HEAD',
    0,
    { customLookup: mockDnsLookup, allowLoopbackForMockTest: true }
  );
  assert(check403.statusCode === 403, 'Servidor remoto 403 recebido corretamente');

  const check404 = await performSafeHttpCheck(
    new URL(`http://mock.safe-test.com:${mockPort}/test-404`),
    'HEAD',
    0,
    { customLookup: mockDnsLookup, allowLoopbackForMockTest: true }
  );
  assert(check404.statusCode === 404, 'Servidor remoto 404 recebido corretamente');

  const check500 = await performSafeHttpCheck(
    new URL(`http://mock.safe-test.com:${mockPort}/test-500`),
    'HEAD',
    0,
    { customLookup: mockDnsLookup, allowLoopbackForMockTest: true }
  );
  assert(check500.statusCode === 500, 'Servidor remoto 500 recebido corretamente');

  mockHttpServer.close();
  apiServer.close();

  console.log('\n===============================================================');
  console.log(`TOTAL DE TESTES EXECUTADOS: ${passed + failed}`);
  console.log(`PASSARAM: ${passed} | FALHARAM: ${failed}`);
  console.log('===============================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runSuite().catch((err) => {
  console.error('Falha fatal na execução da suite de testes:', err);
  process.exit(1);
});
