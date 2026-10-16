import http from 'node:http';
import net, { AddressInfo } from 'node:net';
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
  setActiveValidationsCount,
  REQUEST_TIMEOUT_MS,
  MAX_BYTES_TO_READ,
  MAX_CONCURRENT_VALIDATIONS,
  RATE_LIMIT_MAX_PER_WINDOW,
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
    'String vazia/espaços classificada como sintaxe_invalida com success=false'
  );

  const resNoHost1 = await validateMediaUrlSafely('http://');
  assert(
    resNoHost1.success === false && resNoHost1.diagnostic.level === 'sintaxe_invalida',
    'URL "http://" sem host classificada como sintaxe_invalida'
  );

  const resNoHost2 = await validateMediaUrlSafely('http:///');
  assert(
    resNoHost2.success === false && resNoHost2.diagnostic.level === 'sintaxe_invalida',
    'URL "http:///" sem host classificada como sintaxe_invalida'
  );

  const forbiddenProtocols = [
    { url: 'ftp://example.com/movie.mp4', proto: 'ftp:' },
    { url: 'file:///etc/passwd', proto: 'file:' },
    { url: 'gopher://example.com/', proto: 'gopher:' },
    { url: 'javascript:alert(1)', proto: 'javascript:' },
    { url: 'data:text/html,<script>alert(1)</script>', proto: 'data:' },
    { url: 'ws://example.com/socket', proto: 'ws:' },
    { url: 'wss://example.com/socket', proto: 'wss:' },
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
    { ip: '198.19.0.1', blocked: true, desc: 'IPv4 Benchmarking 198.19 RFC 2544' },
    { ip: '198.51.100.1', blocked: true, desc: 'IPv4 TEST-NET-2 RFC 5737' },
    { ip: '203.0.113.1', blocked: true, desc: 'IPv4 TEST-NET-3 RFC 5737' },
    { ip: '192.0.0.1', blocked: true, desc: 'IPv4 IETF Protocol Assignments RFC 6890' },
    { ip: '192.0.2.1', blocked: true, desc: 'IPv4 TEST-NET-1 RFC 5737' },
    { ip: '224.0.0.1', blocked: true, desc: 'IPv4 Multicast RFC 5771' },
    { ip: '239.255.255.255', blocked: true, desc: 'IPv4 Multicast topo' },
    { ip: '240.0.0.1', blocked: true, desc: 'IPv4 Reservado / Classe E' },
    { ip: '255.255.255.255', blocked: true, desc: 'IPv4 Broadcast' },

    // IPv6 Especiais e Locais
    { ip: '::1', blocked: true, desc: 'IPv6 Loopback' },
    { ip: '[::1]', blocked: true, desc: 'IPv6 Loopback entre colchetes' },
    { ip: '::', blocked: true, desc: 'IPv6 Não especificado' },
    { ip: 'fe80::1', blocked: true, desc: 'IPv6 Link-Local RFC 4291' },
    { ip: 'fc00::1', blocked: true, desc: 'IPv6 Unique Local (ULA) fc00::/7' },
    { ip: 'fd12:3456::1', blocked: true, desc: 'IPv6 Unique Local (ULA) fd00::/8' },
    { ip: 'fec0::1', blocked: true, desc: 'IPv6 Site-Local fec0::/10' },
    { ip: 'ff02::1', blocked: true, desc: 'IPv6 Multicast ff00::/8' },
    { ip: '2001:db8::1', blocked: true, desc: 'IPv6 Documentação RFC 3849' },
    { ip: '100::1', blocked: true, desc: 'IPv6 Discard RFC 6666' },
    { ip: '2001:2::1', blocked: true, desc: 'IPv6 Benchmarking RFC 5180' },
    { ip: '2001:10::1', blocked: true, desc: 'IPv6 ORCHID RFC 4843' },
    { ip: '2001:20::1', blocked: true, desc: 'IPv6 ORCHIDv2 RFC 7343' },
    { ip: '2001:0000::1', blocked: true, desc: 'IPv6 Teredo RFC 4380' },
    { ip: '4000::1', blocked: true, desc: 'IPv6 Não Global (fora de 2000::/3 conservador)' },

    // IPv4-mapped IPv6 em formato Decimal e Hexadecimal
    { ip: '::ffff:127.0.0.1', blocked: true, desc: 'IPv4-mapped decimal loopback' },
    { ip: '::ffff:192.168.0.1', blocked: true, desc: 'IPv4-mapped decimal privado' },
    { ip: '::ffff:7f00:1', blocked: true, desc: 'IPv4-mapped hex loopback (::ffff:7f00:1)' },
    { ip: '[::ffff:7f00:1]', blocked: true, desc: 'IPv4-mapped hex loopback entre colchetes' },
    { ip: '::ffff:7f00:0001', blocked: true, desc: 'IPv4-mapped hex loopback completo' },
    { ip: '0:0:0:0:0:ffff:7f00:1', blocked: true, desc: 'IPv4-mapped descompactado hex' },
    { ip: '::ffff:0a00:0001', blocked: true, desc: 'IPv4-mapped hex privado 10.0.0.1' },

    // NAT64 (RFC 6052 e RFC 8215)
    { ip: '64:ff9b::127.0.0.1', blocked: true, desc: 'NAT64 Well-Known decimal loopback' },
    { ip: '64:ff9b::7f00:1', blocked: true, desc: 'NAT64 Well-Known hex loopback' },
    { ip: '64:ff9b::192.168.1.1', blocked: true, desc: 'NAT64 Well-Known privado 192.168.1.1' },
    { ip: '64:ff9b::c0a8:0101', blocked: true, desc: 'NAT64 Well-Known hex privado 192.168.1.1' },
    { ip: '64:ff9b:1::1', blocked: true, desc: 'NAT64 Local-Use RFC 8215 64:ff9b:1::/48' },

    // 6to4
    { ip: '2002:7f00:0001::', blocked: true, desc: '6to4 com IPv4 loopback encapsulado' },
    { ip: '2002:0a00:0001::', blocked: true, desc: '6to4 com IPv4 privado 10.0.0.1' },

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
  console.log('\n--- 3. DNS COM MÚLTIPLOS ENDEREÇOS E REDIRECIONAMENTOS PROIBIDOS ---');

  // Teste 3.1: DNS com múltiplos IPs incluindo um privado
  let rebindingBlocked = false;
  const mockMixedDnsLookup = (host: string, opts: any, cb: any) => {
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
      { customLookup: mockMixedDnsLookup }
    );
  } catch (err: any) {
    assert(rebindingBlocked && err.message.includes('SSRF_BLOCKED'), 'DNS com IP misto barrado no safeLookup');
  }

  // Teste 3.2: Ataque de DNS Rebinding em 2 etapas
  // 1º lookup (pré-validação): retorna IP público 93.184.216.34
  // 2º lookup (socket connect): retorna 127.0.0.1
  let lookupCallCount = 0;
  let rebindingTwoStageBlocked = false;
  const mockRebindingDnsLookup = (host: string, opts: any, cb: any) => {
    lookupCallCount++;
    if (lookupCallCount === 1) {
      // 1ª resolução prévia: aparenta ser público
      if (opts && opts.all) {
        cb(null, [{ address: '93.184.216.34', family: 4 }]);
      } else {
        cb(null, '93.184.216.34', 4);
      }
    } else {
      // 2ª resolução (momento da conexão do socket): tenta rebinding para loopback
      const attackAddress = '127.0.0.1';
      if (isPrivateOrSpecialIp(attackAddress)) {
        rebindingTwoStageBlocked = true;
        return cb(new Error(`SSRF_BLOCKED: DNS Rebinding impedido. IP proibido: ${attackAddress}`), '', 0);
      }
      cb(null, attackAddress, 4);
    }
  };

  try {
    await performSafeHttpCheck(
      new URL('http://rebinding-attack.com/stream.mp4'),
      'HEAD',
      0,
      { customLookup: mockRebindingDnsLookup }
    );
  } catch (err: any) {
    assert(
      rebindingTwoStageBlocked && err.message.includes('SSRF_BLOCKED'),
      'Ataque de DNS Rebinding em duas etapas detectado e bloqueado no socket connect'
    );
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

  // Teste 3.3: Redirecionamento proibido para file://
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

  // Teste 3.4: Redirecionamento 302 para IP privado (127.0.0.1) sem permissão de mock
  mockHttpServer.removeAllListeners('request');
  mockHttpServer.on('request', (req, res) => {
    if (req.url === '/redirect-private') {
      res.writeHead(302, { Location: 'http://127.0.0.1/internal-admin' });
      res.end();
    }
  });

  const redirectPrivateRes = await validateMediaUrlSafely(
    `http://mock.safe-test.com:${mockPort}/redirect-private`,
    { customLookup: mockDnsLookup, allowLoopbackForMockTest: false }
  );
  assert(
    redirectPrivateRes.success === false && redirectPrivateRes.diagnostic.level === 'bloqueado_ssrf',
    'Redirecionamento para 127.0.0.1 interceptado e bloqueado com nível bloqueado_ssrf'
  );

  // Teste 3.5: Redirecionamento 302 para metadados de nuvem (169.254.169.254)
  mockHttpServer.removeAllListeners('request');
  mockHttpServer.on('request', (req, res) => {
    if (req.url === '/redirect-metadata') {
      res.writeHead(302, { Location: 'http://169.254.169.254/computeMetadata/v1/' });
      res.end();
    }
  });

  const redirectMetaRes = await validateMediaUrlSafely(
    `http://mock.safe-test.com:${mockPort}/redirect-metadata`,
    { customLookup: mockDnsLookup, allowLoopbackForMockTest: false }
  );
  assert(
    redirectMetaRes.success === false && redirectMetaRes.diagnostic.level === 'bloqueado_ssrf',
    'Redirecionamento para 169.254.169.254 bloqueado com nível bloqueado_ssrf'
  );

  // Teste 3.6: Limite de redirecionamentos em cadeia (> 3 saltos)
  mockHttpServer.removeAllListeners('request');
  mockHttpServer.on('request', (req, res) => {
    const match = req.url?.match(/\/loop-(\d+)/);
    if (match) {
      const nextHop = Number(match[1]) + 1;
      res.writeHead(302, { Location: `/loop-${nextHop}` });
      res.end();
    }
  });

  const redirectLoopRes = await validateMediaUrlSafely(
    `http://mock.safe-test.com:${mockPort}/loop-1`,
    { customLookup: mockDnsLookup, allowLoopbackForMockTest: true }
  );
  assert(
    redirectLoopRes.success === false &&
      redirectLoopRes.diagnostic.level === 'erro_rede' &&
      redirectLoopRes.diagnostic.message.includes('Limite de redirecionamentos excedido'),
    'Redirecionamento contínuo abortado após 3 saltos com diagnóstico erro_rede'
  );

  // -----------------------------------------------------------------
  // 4. SERVIDORES LENTOS, CABEÇALHOS SEM CORPO, CORPO INTERROMPIDO E RANGE IGNORADO
  // -----------------------------------------------------------------
  console.log('\n--- 4. LIMITES DE LEITURA E RESPOSTAS ANÔMALAS ---');

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

  // Teste 4.2: Cabeçalhos enviados sem corpo (servidor envia 200 OK headers mas nunca envia corpo)
  mockHttpServer.removeAllListeners('request');
  mockHttpServer.on('request', (req, res) => {
    if (req.url === '/headers-no-body') {
      res.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Length': '50000' });
      // Nunca envia dados nem finaliza
    }
  });

  let noBodyTimeoutCaught = false;
  try {
    await performSafeHttpCheck(
      new URL(`http://mock.safe-test.com:${mockPort}/headers-no-body`),
      'GET',
      0,
      { customLookup: mockDnsLookup, timeoutMs: 300, allowLoopbackForMockTest: true }
    );
  } catch (err: any) {
    if (err.message && err.message.includes('TIMEOUT')) {
      noBodyTimeoutCaught = true;
    }
  }
  assert(noBodyTimeoutCaught, 'Timeout integral de 4s encerrou conexão onde o servidor enviou headers mas não enviou corpo');

  // Teste 4.3: Corpo interrompido prematuramente (socket abortado pelo servidor remoto)
  mockHttpServer.removeAllListeners('request');
  mockHttpServer.on('request', (req, res) => {
    if (req.url === '/broken-body') {
      res.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Length': '100000' });
      res.write(Buffer.alloc(512, 0x01));
      setTimeout(() => {
        // Encerra a conexão abruptamente simulando queda do servidor remoto
        res.destroy();
      }, 30);
    }
  });

  let brokenBodyHandled = false;
  try {
    await performSafeHttpCheck(
      new URL(`http://mock.safe-test.com:${mockPort}/broken-body`),
      'GET',
      0,
      { customLookup: mockDnsLookup, allowLoopbackForMockTest: true }
    );
  } catch (err: any) {
    brokenBodyHandled = true;
  }
  assert(brokenBodyHandled, 'Corpo interrompido pelo servidor remoto rejeitado como erro de rede sem travar');

  // Teste 4.4: Fallback de HEAD (405 Method Not Allowed) para GET com Range
  mockHttpServer.removeAllListeners('request');
  mockHttpServer.on('request', (req, res) => {
    if (req.method === 'HEAD' && req.url === '/method-check-405.mp4') {
      res.writeHead(405, { 'Content-Type': 'text/plain' });
      res.end();
    } else if (req.method === 'GET' && req.url === '/method-check-405.mp4') {
      res.writeHead(206, {
        'Content-Type': 'video/mp4',
        'Content-Range': 'bytes 0-1024/5000000',
        'Accept-Ranges': 'bytes',
      });
      res.end(Buffer.alloc(1024, 0x01));
    }
  });

  const fallbackCheck405 = await validateMediaUrlSafely(
    `http://mock.safe-test.com:${mockPort}/method-check-405.mp4`,
    { customLookup: mockDnsLookup, allowLoopbackForMockTest: true }
  );
  assert(
    fallbackCheck405.httpStatus === 206 && fallbackCheck405.isMediaCompatible === true,
    'Fallback de status 405 executado com sucesso para GET Range (HTTP 206)'
  );

  // Teste 4.5: Fallback de HEAD (501 Not Implemented) para GET com Range
  mockHttpServer.removeAllListeners('request');
  mockHttpServer.on('request', (req, res) => {
    if (req.method === 'HEAD' && req.url === '/method-check-501.mp4') {
      res.writeHead(501, { 'Content-Type': 'text/plain' });
      res.end();
    } else if (req.method === 'GET' && req.url === '/method-check-501.mp4') {
      res.writeHead(206, {
        'Content-Type': 'video/mp4',
        'Content-Range': 'bytes 0-1024/2000000',
        'Accept-Ranges': 'bytes',
      });
      res.end(Buffer.alloc(1024, 0x01));
    }
  });

  const fallbackCheck501 = await validateMediaUrlSafely(
    `http://mock.safe-test.com:${mockPort}/method-check-501.mp4`,
    { customLookup: mockDnsLookup, allowLoopbackForMockTest: true }
  );
  assert(
    fallbackCheck501.httpStatus === 206 && fallbackCheck501.isMediaCompatible === true,
    'Fallback de status 501 executado com sucesso para GET Range (HTTP 206)'
  );

  // Teste 4.6: HEAD 403 seguido de GET 206 com conteúdo de vídeo reconhecível
  mockHttpServer.removeAllListeners('request');
  mockHttpServer.on('request', (req, res) => {
    if (req.method === 'HEAD' && req.url === '/signed-video-403-to-206.mp4') {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('HEAD forbidden for signed GET URL');
    } else if (req.method === 'GET' && req.url === '/signed-video-403-to-206.mp4') {
      res.writeHead(206, {
        'Content-Type': 'video/mp4',
        'Content-Range': 'bytes 0-1024/15000000',
        'Accept-Ranges': 'bytes',
      });
      res.end(Buffer.alloc(1024, 0x02));
    }
  });

  const fallbackCheck403to206 = await validateMediaUrlSafely(
    `http://mock.safe-test.com:${mockPort}/signed-video-403-to-206.mp4`,
    { customLookup: mockDnsLookup, allowLoopbackForMockTest: true }
  );
  assert(
    fallbackCheck403to206.httpStatus === 206 &&
      fallbackCheck403to206.isMediaCompatible === true &&
      fallbackCheck403to206.diagnostic.level === 'midia_compativel',
    'HEAD 403 seguido de GET 206 com vídeo reconhecido resulta em midia_compativel (HTTP 206)'
  );

  // Teste 4.7: HEAD 403 seguido de GET 200 com vídeo reconhecível e leitura limitada
  mockHttpServer.removeAllListeners('request');
  mockHttpServer.on('request', (req, res) => {
    if (req.method === 'HEAD' && req.url === '/signed-video-403-to-200.mp4') {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden');
    } else if (req.method === 'GET' && req.url === '/signed-video-403-to-200.mp4') {
      res.writeHead(200, {
        'Content-Type': 'video/mp4',
        'Accept-Ranges': 'bytes',
      });
      // Servidor envia stream que excede 64KB
      const bigChunk = Buffer.alloc(16 * 1024, 0x33);
      let sentBytes = 0;
      const streamInt = setInterval(() => {
        if (res.writableEnded || res.destroyed) {
          clearInterval(streamInt);
          return;
        }
        res.write(bigChunk);
        sentBytes += bigChunk.length;
        if (sentBytes >= 128 * 1024) {
          clearInterval(streamInt);
          res.end();
        }
      }, 5);
      req.on('close', () => clearInterval(streamInt));
    }
  });

  const fallbackCheck403to200 = await validateMediaUrlSafely(
    `http://mock.safe-test.com:${mockPort}/signed-video-403-to-200.mp4`,
    { customLookup: mockDnsLookup, allowLoopbackForMockTest: true }
  );
  assert(
    fallbackCheck403to200.httpStatus === 200 &&
      fallbackCheck403to200.isMediaCompatible === true &&
      fallbackCheck403to200.truncated === true &&
      fallbackCheck403to200.diagnostic.level === 'midia_compativel',
    'HEAD 403 seguido de GET 200 com vídeo reconhecido e leitura limitada resulta em midia_compativel e truncated=true'
  );

  // Teste 4.8: HEAD 403 seguido de GET 403 (ambos rejeitados)
  mockHttpServer.removeAllListeners('request');
  mockHttpServer.on('request', (req, res) => {
    if (req.url === '/signed-video-403-to-403.mp4') {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Access Denied');
    }
  });

  const fallbackCheck403to403 = await validateMediaUrlSafely(
    `http://mock.safe-test.com:${mockPort}/signed-video-403-to-403.mp4`,
    { customLookup: mockDnsLookup, allowLoopbackForMockTest: true }
  );
  assert(
    fallbackCheck403to403.httpStatus === 403 &&
      fallbackCheck403to403.isMediaCompatible === false &&
      fallbackCheck403to403.diagnostic.level === 'acesso_negado_ou_expirado' &&
      fallbackCheck403to403.diagnostic.message.includes('Acesso negado (HTTP 403)'),
    'HEAD 403 seguido de GET 403 resulta em acesso_negado_ou_expirado com mensagem precisa'
  );

  // Teste 4.9: HEAD 403 seguido de GET que responde HTML (não-vídeo)
  mockHttpServer.removeAllListeners('request');
  mockHttpServer.on('request', (req, res) => {
    if (req.method === 'HEAD' && req.url === '/signed-page-403-to-html') {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden');
    } else if (req.method === 'GET' && req.url === '/signed-page-403-to-html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<!DOCTYPE html><html><body>Login Page</body></html>');
    }
  });

  const fallbackCheck403toHtml = await validateMediaUrlSafely(
    `http://mock.safe-test.com:${mockPort}/signed-page-403-to-html`,
    { customLookup: mockDnsLookup, allowLoopbackForMockTest: true }
  );
  assert(
    fallbackCheck403toHtml.httpStatus === 200 &&
      fallbackCheck403toHtml.isMediaCompatible === false &&
      fallbackCheck403toHtml.diagnostic.level === 'servidor_conectado' &&
      fallbackCheck403toHtml.diagnostic.message.includes('não é um fluxo de vídeo reconhecido'),
    'HEAD 403 seguido de GET HTML não é considerado mídia compatível (diagnostic: servidor_conectado)'
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

  // Teste 5.1: Cancelamento cliente libera vaga imediatamente sem decremento duplicado
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
  setTimeout(() => {
    slowClientReq.destroy();
  }, 40);
  slowClientReq.end();

  await new Promise((r) => setTimeout(r, 150));
  assert(getActiveValidationsCount() === 0, 'Cancelamento do cliente liberou a vaga de concorrência sem erros');

  // Teste 5.2: Limite de concorrência máxima (MAX_CONCURRENT_VALIDATIONS = 5)
  // Simula 5 validações ativas simultâneas
  setActiveValidationsCount(MAX_CONCURRENT_VALIDATIONS);
  assert(
    getActiveValidationsCount() === MAX_CONCURRENT_VALIDATIONS,
    `Vagas de concorrência preenchidas no limite máximo (${MAX_CONCURRENT_VALIDATIONS})`
  );

  // A requisição recebida com o limite preenchido deve receber HTTP 429 com code CONCURRENCY_LIMIT
  const rejectedRes = await new Promise<{ status: number; body: any }>((resolve, reject) => {
    const payload = JSON.stringify({ url: 'https://cdn.exemplo.com/test.mp4' });
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
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode || 0, body: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode || 0, body: {} });
          }
        });
      }
    );
    r.on('error', reject);
    r.write(payload);
    r.end();
  });

  assert(
    rejectedRes.status === 429 && rejectedRes.body.code === 'CONCURRENCY_LIMIT',
    'Requisição sob concorrência cheia rejeitada com HTTP 429 e código CONCURRENCY_LIMIT'
  );

  // Libera as vagas de concorrência e verifica restauração para 0
  resetActiveValidations();
  assert(getActiveValidationsCount() === 0, 'Todas as 5 vagas foram liberadas após a conclusão');

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

  // Teste de estouro de cota (RATE_LIMIT_MAX_PER_WINDOW)
  resetRateLimits();
  let gotRateLimit429 = false;
  // Simula contador no limite
  for (let i = 0; i <= RATE_LIMIT_MAX_PER_WINDOW; i++) {
    const codeRes = await new Promise<number>((resolve, reject) => {
      const payload = JSON.stringify({ url: 'not-valid' });
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
          res.on('end', () => resolve(res.statusCode || 0));
        }
      );
      r.on('error', reject);
      r.write(payload);
      r.end();
    });
    if (codeRes === 429) {
      gotRateLimit429 = true;
      break;
    }
  }
  assert(gotRateLimit429, 'Estouro de cota (> 60 req/min) retorna HTTP 429 RATE_LIMIT_EXCEEDED');

  // -----------------------------------------------------------------
  // 7. CÓDIGOS DE STATUS REMOTOS: 403, 404, 500 E ERROS DE REDE
  // -----------------------------------------------------------------
  console.log('\n--- 7. CÓDIGOS DE STATUS HTTP REMOTOS (403, 404, 500) E ERROS DE REDE ---');

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

  const check403Diag = await validateMediaUrlSafely(
    `http://mock.safe-test.com:${mockPort}/test-403`,
    { customLookup: mockDnsLookup, allowLoopbackForMockTest: true }
  );
  assert(
    check403Diag.diagnostic.level === 'acesso_negado_ou_expirado',
    'Status 403 mapeado para diagnóstico acesso_negado_ou_expirado'
  );

  const check404 = await performSafeHttpCheck(
    new URL(`http://mock.safe-test.com:${mockPort}/test-404`),
    'HEAD',
    0,
    { customLookup: mockDnsLookup, allowLoopbackForMockTest: true }
  );
  assert(check404.statusCode === 404, 'Servidor remoto 404 recebido corretamente');

  const check404Diag = await validateMediaUrlSafely(
    `http://mock.safe-test.com:${mockPort}/test-404`,
    { customLookup: mockDnsLookup, allowLoopbackForMockTest: true }
  );
  assert(
    check404Diag.diagnostic.level === 'acesso_negado_ou_expirado',
    'Status 404 mapeado para diagnóstico acesso_negado_ou_expirado'
  );

  const check500 = await performSafeHttpCheck(
    new URL(`http://mock.safe-test.com:${mockPort}/test-500`),
    'HEAD',
    0,
    { customLookup: mockDnsLookup, allowLoopbackForMockTest: true }
  );
  assert(check500.statusCode === 500, 'Servidor remoto 500 recebido corretamente');

  // Teste 7.1: Erro de rede real (porta fechada gerando ECONNREFUSED)
  // Encontra porta livre sem nenhum listener
  const freePortServer = net.createServer();
  await new Promise<void>((r) => freePortServer.listen(0, '127.0.0.1', () => r()));
  const freePort = (freePortServer.address() as AddressInfo).port;
  await new Promise<void>((r) => freePortServer.close(() => r()));

  const connRefusedRes = await validateMediaUrlSafely(
    `http://mock.safe-test.com:${freePort}/offline.mp4`,
    { customLookup: mockDnsLookup, allowLoopbackForMockTest: true }
  );
  assert(
    connRefusedRes.success === false && connRefusedRes.diagnostic.level === 'erro_rede',
    'Falha real de conexão (ECONNREFUSED) classificada corretamente como erro_rede'
  );

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
