import net from 'node:net';
import dns from 'node:dns/promises';
import dnsCallback from 'node:dns';
import http from 'node:http';
import https from 'node:https';

// Constantes de limites seguros
export const REQUEST_TIMEOUT_MS = 4000;
export const MAX_REDIRECTS = 3;
export const MAX_BYTES_TO_READ = 64 * 1024; // 64 KB máx
export const RATE_LIMIT_WINDOW_MS = 60 * 1000;
export const RATE_LIMIT_MAX_PER_WINDOW = 60;
export const MAX_RATE_LIMIT_MAP_SIZE = 10000;
export const MAX_CONCURRENT_VALIDATIONS = 5;

/**
 * Converte qualquer representação de endereço IPv6 válida em um array exato de 8 hextets (16 bits cada).
 * Suporta notação compactada (::), grupos hexadecimais e notação híbrida IPv4-mapped/pontuada.
 */
export function parseIpv6ToHextets(ip: string): number[] | null {
  if (!ip || typeof ip !== 'string') return null;
  let clean = ip.toLowerCase().split('%')[0].trim();
  if (clean.startsWith('[') && clean.endsWith(']')) {
    clean = clean.slice(1, -1).trim();
  }
  if (!clean) return null;

  let parts = clean.split(':');
  const lastPart = parts[parts.length - 1];

  // Se o último segmento contiver IPv4 pontuado (ex: ::ffff:192.168.1.1 ou 64:ff9b::127.0.0.1)
  if (lastPart && lastPart.includes('.')) {
    const v4 = lastPart.split('.').map(Number);
    if (v4.length !== 4 || v4.some((n) => isNaN(n) || n < 0 || n > 255)) return null;
    parts.pop();
    parts.push(((v4[0] << 8) | v4[1]).toString(16));
    parts.push(((v4[2] << 8) | v4[3]).toString(16));
  }

  const doubleColonIdx = clean.indexOf('::');
  if (doubleColonIdx !== -1) {
    if (clean.indexOf('::', doubleColonIdx + 2) !== -1) return null;

    const leftStr = clean.slice(0, doubleColonIdx);
    const rightStr = clean.slice(doubleColonIdx + 2);

    const leftParts = leftStr ? leftStr.split(':') : [];
    let rightParts = rightStr ? rightStr.split(':') : [];

    if (rightParts.length > 0 && rightParts[rightParts.length - 1].includes('.')) {
      const v4 = rightParts[rightParts.length - 1].split('.').map(Number);
      if (v4.length !== 4 || v4.some((n) => isNaN(n) || n < 0 || n > 255)) return null;
      rightParts.pop();
      rightParts.push(((v4[0] << 8) | v4[1]).toString(16));
      rightParts.push(((v4[2] << 8) | v4[3]).toString(16));
    }

    const missing = 8 - (leftParts.length + rightParts.length);
    if (missing < 0) return null;
    const full = [...leftParts, ...Array(missing).fill('0'), ...rightParts];
    if (full.length !== 8) return null;
    const hextets = full.map((h) => parseInt(h, 16));
    if (hextets.some((n) => isNaN(n) || n < 0 || n > 0xffff)) return null;
    return hextets;
  } else {
    if (parts.length !== 8) return null;
    const hextets = parts.map((h) => parseInt(h, 16));
    if (hextets.some((n) => isNaN(n) || n < 0 || n > 0xffff)) return null;
    return hextets;
  }
}

/**
 * Validação rigorosa de IPs privados, loopback, metadados de nuvem e faixas reservadas.
 * Cobre IPv4 e IPv6 conforme RFC 1918, RFC 3927, RFC 4193, RFC 4291, RFC 6598, RFC 6052, RFC 8215 e RFC 2544.
 */
export function isPrivateOrSpecialIp(ip: string): boolean {
  if (!ip || typeof ip !== 'string') return true;
  let cleanIp = ip.trim();
  if (cleanIp.startsWith('[') && cleanIp.endsWith(']')) {
    cleanIp = cleanIp.slice(1, -1).trim();
  }
  const family = net.isIP(cleanIp);
  if (!family) return true; // Bloqueio preventivo se não for IP reconhecido

  if (family === 4) {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some((n) => isNaN(n) || n < 0 || n > 255)) {
      return true;
    }
    const [a, b, c, d] = parts;

    // 0.0.0.0/8 (Esta rede / Loopback local)
    if (a === 0) return true;
    // 10.0.0.0/8 (Privada RFC 1918)
    if (a === 10) return true;
    // 127.0.0.0/8 (Loopback local)
    if (a === 127) return true;
    // 100.64.0.0/10 (CGNAT RFC 6598)
    if (a === 100 && b >= 64 && b <= 127) return true;
    // 169.254.0.0/16 (Link-Local & Cloud Metadata RFC 3927: ex: 169.254.169.254 GCP/AWS/Azure)
    if (a === 169 && b === 254) return true;
    // 172.16.0.0/12 (Privada RFC 1918: 172.16.0.0 até 172.31.255.255)
    if (a === 172 && b >= 16 && b <= 31) return true;
    // 192.0.0.0/24 (IETF Protocol Assignments)
    if (a === 192 && b === 0 && c === 0) return true;
    // 192.0.2.0/24 (TEST-NET-1)
    if (a === 192 && b === 0 && c === 2) return true;
    // 192.88.99.0/24 (6to4 Relay Anycast RFC 7526)
    if (a === 192 && b === 88 && c === 99) return true;
    // 192.168.0.0/16 (Privada RFC 1918)
    if (a === 192 && b === 168) return true;
    // 198.18.0.0/15 (Benchmarking RFC 2544: 198.18 e 198.19)
    if (a === 198 && (b === 18 || b === 19)) return true;
    // 198.51.100.0/24 (TEST-NET-2)
    if (a === 198 && b === 51 && c === 100) return true;
    // 203.0.113.0/24 (TEST-NET-3)
    if (a === 203 && b === 0 && c === 113) return true;
    // 224.0.0.0/4 (Multicast: 224 a 239)
    if (a >= 224 && a <= 239) return true;
    // 240.0.0.0/4 (Reservado / Uso Futuro)
    if (a >= 240) return true;
    // 255.255.255.255 (Broadcast)
    if (a === 255 && b === 255 && c === 255 && d === 255) return true;

    return false;
  }

  if (family === 6) {
    const hextets = parseIpv6ToHextets(ip);
    if (!hextets) return true;

    const [h0, h1, h2, h3, h4, h5, h6, h7] = hextets;

    // Helper para converter 2 hextets em endereço IPv4 pontuado
    const extractEmbeddedIpv4 = (highHextet: number, lowHextet: number): string => {
      return `${(highHextet >> 8) & 0xff}.${highHextet & 0xff}.${(lowHextet >> 8) & 0xff}.${lowHextet & 0xff}`;
    };

    // Loopback (::1)
    if (h0 === 0 && h1 === 0 && h2 === 0 && h3 === 0 && h4 === 0 && h5 === 0 && h6 === 0 && h7 === 1) {
      return true;
    }

    // Unspecified (::)
    if (h0 === 0 && h1 === 0 && h2 === 0 && h3 === 0 && h4 === 0 && h5 === 0 && h6 === 0 && h7 === 0) {
      return true;
    }

    // IPv4-mapped IPv6 (::ffff:0:0/96, cobre tanto decimal ::ffff:127.0.0.1 quanto hex ::ffff:7f00:1)
    if (h0 === 0 && h1 === 0 && h2 === 0 && h3 === 0 && h4 === 0 && h5 === 0xffff) {
      return isPrivateOrSpecialIp(extractEmbeddedIpv4(h6, h7));
    }

    // IPv4-compatible IPv6 (deprecated RFC 4291 ::/96)
    if (h0 === 0 && h1 === 0 && h2 === 0 && h3 === 0 && h4 === 0 && h5 === 0 && (h6 !== 0 || h7 > 1)) {
      return isPrivateOrSpecialIp(extractEmbeddedIpv4(h6, h7));
    }

    // NAT64 Well-Known Prefix (64:ff9b::/96 RFC 6052)
    if (h0 === 0x0064 && h1 === 0xff9b && h2 === 0 && h3 === 0 && h4 === 0 && h5 === 0) {
      return isPrivateOrSpecialIp(extractEmbeddedIpv4(h6, h7));
    }

    // NAT64 Local-Use (64:ff9b:1::/48 RFC 8215)
    if (h0 === 0x0064 && h1 === 0xff9b && h2 === 0x0001) {
      return true;
    }

    // 6to4 (2002::/16 RFC 3056)
    if (h0 === 0x2002) {
      return isPrivateOrSpecialIp(extractEmbeddedIpv4(h1, h2));
    }

    // Teredo (2001:0000::/32 RFC 4380)
    if (h0 === 0x2001 && h1 === 0x0000) {
      return true;
    }

    // Unique Local Address (fc00::/7 RFC 4193 - prefixos fc e fd)
    if ((h0 & 0xfe00) === 0xfc00) return true;

    // Link-local Unicast (fe80::/10 RFC 4291)
    if ((h0 & 0xffc0) === 0xfe80) return true;

    // Site-local (fec0::/10 RFC 3879)
    if ((h0 & 0xffc0) === 0xfec0) return true;

    // Multicast (ff00::/8 RFC 4291)
    if ((h0 & 0xff00) === 0xff00) return true;

    // Documentação (2001:db8::/32 RFC 3849)
    if (h0 === 0x2001 && h1 === 0x0db8) return true;

    // Discard (100::/64 RFC 6666)
    if (h0 === 0x0100 && h1 === 0 && h2 === 0 && h3 === 0) return true;

    // Benchmarking (2001:2::/48 RFC 5180)
    if (h0 === 0x2001 && h1 === 0x0002) return true;

    // ORCHID (2001:10::/28 RFC 4843)
    if (h0 === 0x2001 && (h1 & 0xfff0) === 0x0010) return true;

    // ORCHIDv2 (2001:20::/28 RFC 7343)
    if (h0 === 0x2001 && (h1 & 0xfff0) === 0x0020) return true;

    // Bloqueio conservador de endereços IPv6 fora do espaço Global Unicast oficial (2000::/3)
    if ((h0 & 0xe000) !== 0x2000) {
      return true;
    }

    return false;
  }

  return true;
}

/**
 * Validação de nomes de host proibidos (localhost, domínios internos e metadados).
 */
export function isProhibitedHostname(hostname: string): boolean {
  const h = hostname.toLowerCase().trim();
  if (
    h === 'localhost' ||
    h.endsWith('.localhost') ||
    h.endsWith('.local') ||
    h.endsWith('.internal') ||
    h.endsWith('.lan') ||
    h.endsWith('.home') ||
    h === 'metadata.google.internal' ||
    h === 'instance-data'
  ) {
    return true;
  }
  return false;
}

export interface ValidationResult {
  success: boolean;
  urlNormalized: string;
  checkedAt: string;
  httpStatus?: number;
  httpStatusText?: string;
  contentType?: string;
  contentLength?: number;
  isMediaCompatible: boolean;
  mediaTypeDetected?: string;
  supportsRangeRequests: boolean;
  timingMs: number;
  truncated?: boolean;
  diagnostic: {
    level:
      | 'sintaxe_invalida'
      | 'sintaxe_valida'
      | 'servidor_conectado'
      | 'midia_compativel'
      | 'acesso_negado_ou_expirado'
      | 'bloqueado_ssrf'
      | 'erro_rede';
    message: string;
  };
}

export interface ValidateOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  customLookup?: (
    hostname: string,
    options: any,
    callback: (err: NodeJS.ErrnoException | null, address: any, family?: number) => void
  ) => void;
  allowLoopbackForMockTest?: boolean;
}

/**
 * Executa uma requisição HTTP/HTTPS com proteção SSRF integral, prevenção contra DNS Rebinding,
 * timeout de ponta a ponta e controle estrito de leitura.
 */
export async function performSafeHttpCheck(
  targetUrl: URL,
  method: 'HEAD' | 'GET',
  redirectCount: number,
  options?: ValidateOptions
): Promise<{
  statusCode?: number;
  statusMessage?: string;
  headers: http.IncomingHttpHeaders;
  redirectUrl?: URL;
  timingMs: number;
  truncated?: boolean;
}> {
  // Revalidação do protocolo em cada chamada
  if (targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:') {
    throw new Error(`SSRF_BLOCKED: Protocolo '${targetUrl.protocol}' proibido. Apenas HTTP e HTTPS são aceitos.`);
  }

  const isHttps = targetUrl.protocol === 'https:';
  const transport = isHttps ? https : http;
  const startTime = Date.now();
  const timeoutMs = options?.timeoutMs ?? REQUEST_TIMEOUT_MS;

  const checkIp = (addr: string) => {
    if (options?.allowLoopbackForMockTest && (addr === '127.0.0.1' || addr === '::1')) {
      return false; // Permitido exclusivamente em testes locais controlados com mock
    }
    return isPrivateOrSpecialIp(addr);
  };

  // 1. Resolução DNS prévia e verificação de todos os IPs retornados
  const rawHostname = targetUrl.hostname;
  const hostname = rawHostname.startsWith('[') && rawHostname.endsWith(']')
    ? rawHostname.slice(1, -1)
    : rawHostname;

  if (!options?.allowLoopbackForMockTest && isProhibitedHostname(hostname)) {
    throw new Error('SSRF_BLOCKED: Hostname local ou interno proibido');
  }

  if (net.isIP(hostname)) {
    if (checkIp(hostname)) {
      throw new Error(`SSRF_BLOCKED: Endereço IP proibido (${hostname})`);
    }
  } else {
    let resolvedIps: { address: string; family: number }[] = [];
    if (options?.customLookup) {
      await new Promise<void>((res, rej) => {
        options.customLookup!(hostname, { all: true }, (err: any, addrs: any) => {
          if (err) return rej(err);
          if (Array.isArray(addrs)) {
            resolvedIps = addrs;
          } else if (typeof addrs === 'string') {
            resolvedIps = [{ address: addrs, family: 4 }];
          }
          res();
        });
      });
    } else {
      try {
        resolvedIps = await dns.lookup(hostname, { all: true });
      } catch (dnsErr: any) {
        throw new Error(`DNS_RESOLUTION_FAILED: Não foi possível resolver o domínio (${dnsErr.message})`);
      }
    }

    if (!resolvedIps || resolvedIps.length === 0) {
      throw new Error('DNS_RESOLUTION_FAILED: Domínio não possui registros de endereço válidos');
    }

    // Se qualquer um dos IPs for privado/reservado, bloquear imediatamente
    for (const record of resolvedIps) {
      if (checkIp(record.address)) {
        throw new Error(`SSRF_BLOCKED: Domínio resolve para endereço IP proibido (${record.address})`);
      }
    }
  }

  // 2. Proteção contra DNS Rebinding no momento da conexão do socket
  const safeLookup = (
    hostToLookup: string,
    lookupOpts: any,
    callback: (err: NodeJS.ErrnoException | null, address: any, family?: number) => void
  ) => {
    if (options?.customLookup) {
      return options.customLookup(hostToLookup, lookupOpts, callback);
    }

    dnsCallback.lookup(hostToLookup, lookupOpts, (err, address, family) => {
      if (err) {
        return callback(err, address, family);
      }

      if (Array.isArray(address)) {
        for (const item of address) {
          if (checkIp(item.address)) {
            return callback(
              new Error(`SSRF_BLOCKED: DNS Rebinding impedido. IP proibido: ${item.address}`),
              [],
              0
            );
          }
        }
        return callback(null, address, family);
      }

      if (typeof address === 'string') {
        if (checkIp(address)) {
          return callback(
            new Error(`SSRF_BLOCKED: DNS Rebinding impedido. IP proibido: ${address}`),
            '',
            0
          );
        }
        return callback(null, address, family);
      }

      return callback(new Error('SSRF_BLOCKED: Endereço IP não pôde ser determinado'), '', 0);
    });
  };

  return new Promise((resolve, reject) => {
    let finished = false;
    let globalTimer: NodeJS.Timeout | null = null;
    let responseStream: http.IncomingMessage | null = null;

    const cleanup = () => {
      if (globalTimer) {
        clearTimeout(globalTimer);
        globalTimer = null;
      }
      if (options?.signal) {
        options.signal.removeEventListener('abort', handleAbort);
      }
    };

    const handleAbort = () => {
      if (!finished) {
        finished = true;
        cleanup();
        req.destroy();
        if (responseStream) {
          try { responseStream.destroy(); } catch {}
        }
        reject(new Error('CLIENT_ABORTED'));
      }
    };

    if (options?.signal) {
      if (options.signal.aborted) {
        return reject(new Error('CLIENT_ABORTED'));
      }
      options.signal.addEventListener('abort', handleAbort);
    }

    // O timeout integral cobre a operação inteira (conexão, cabeçalhos E leitura do corpo)
    globalTimer = setTimeout(() => {
      if (!finished) {
        finished = true;
        cleanup();
        req.destroy();
        if (responseStream) {
          try { responseStream.destroy(); } catch {}
        }
        reject(new Error(`TIMEOUT: Limite de ${timeoutMs}ms excedido para a operação completa`));
      }
    }, timeoutMs);

    const requestHeaders: Record<string, string> = {
      'User-Agent': 'NOVA-STREAM-MediaValidator/1.0 (compatible; private streaming inspection)',
      Accept: '*/*',
      Connection: 'close',
    };

    if (method === 'GET') {
      requestHeaders['Range'] = 'bytes=0-1024';
    }

    const port = targetUrl.port
      ? Number(targetUrl.port)
      : isHttps
      ? 443
      : 80;

    const req = transport.request(
      {
        protocol: targetUrl.protocol,
        hostname: targetUrl.hostname,
        port,
        path: `${targetUrl.pathname}${targetUrl.search}`,
        method,
        headers: requestHeaders,
        lookup: safeLookup as any,
        rejectUnauthorized: true,
        servername: isHttps && !net.isIP(hostname) ? hostname : undefined,
      },
      (res) => {
        responseStream = res;
        const timingMs = Date.now() - startTime;
        const statusCode = res.statusCode;

        // Tratar redirecionamento (301, 302, 303, 307, 308)
        if (
          statusCode &&
          [301, 302, 303, 307, 308].includes(statusCode) &&
          res.headers.location
        ) {
          req.destroy();
          try { res.destroy(); } catch {}
          try {
            const rawLocation = Array.isArray(res.headers.location)
              ? res.headers.location[0]
              : res.headers.location;
            if (!rawLocation || typeof rawLocation !== 'string' || !rawLocation.trim()) {
              finished = true;
              cleanup();
              return reject(new Error('INVALID_REDIRECT_LOCATION: Cabeçalho de redirecionamento vazio'));
            }
            const nextUrl = new URL(rawLocation.trim(), targetUrl);
            if (nextUrl.protocol !== 'http:' && nextUrl.protocol !== 'https:') {
              finished = true;
              cleanup();
              return reject(
                new Error(`SSRF_BLOCKED: Redirecionamento para protocolo não permitido (${nextUrl.protocol})`)
              );
            }
            if (!nextUrl.hostname) {
              finished = true;
              cleanup();
              return reject(new Error('INVALID_REDIRECT_LOCATION: Hostname ausente no redirecionamento'));
            }
            finished = true;
            cleanup();
            return resolve({
              statusCode,
              statusMessage: res.statusMessage,
              headers: res.headers,
              redirectUrl: nextUrl,
              timingMs,
              truncated: false,
            });
          } catch (err: any) {
            finished = true;
            cleanup();
            if (err.message && err.message.includes('SSRF_BLOCKED')) {
              return reject(err);
            }
            return reject(new Error('INVALID_REDIRECT_LOCATION: Cabeçalho de redirecionamento malformado'));
          }
        }

        // Limite estrito de bytes lidos do corpo para não baixar mídia
        let bytesRead = 0;
        res.on('data', (chunk) => {
          bytesRead += chunk.length;
          if (bytesRead >= MAX_BYTES_TO_READ && !finished) {
            // Interrupção intencional de leitura com dados parciais válidos
            finished = true;
            cleanup();
            req.destroy(); // Corta conexão intencionalmente
            try { res.destroy(); } catch {}
            resolve({
              statusCode,
              statusMessage: res.statusMessage,
              headers: res.headers,
              timingMs: Date.now() - startTime,
              truncated: true,
            });
          }
        });

        res.on('end', () => {
          if (!finished) {
            finished = true;
            cleanup();
            resolve({
              statusCode,
              statusMessage: res.statusMessage,
              headers: res.headers,
              timingMs: Date.now() - startTime,
              truncated: false,
            });
          }
        });

        res.on('close', () => {
          if (!finished && !res.complete) {
            finished = true;
            cleanup();
            reject(
              new Error(
                'REMOTE_CONNECTION_CLOSED: Conexão encerrada prematuramente pelo servidor remoto antes do fim da resposta.'
              )
            );
          }
        });

        res.on('error', (err) => {
          if (!finished) {
            finished = true;
            cleanup();
            reject(err);
          }
        });
      }
    );

    // Validação do endereço do socket no momento da conexão
    req.on('socket', (socket) => {
      const onConnect = () => {
        const remoteIp = socket.remoteAddress;
        if (remoteIp && checkIp(remoteIp)) {
          if (!finished) {
            finished = true;
            cleanup();
            req.destroy(new Error(`SSRF_BLOCKED: Conexão direta impedida para IP proibido (${remoteIp})`));
            reject(new Error(`SSRF_BLOCKED: Conexão direta impedida para IP proibido (${remoteIp})`));
          }
        }
      };

      if (socket.connecting) {
        socket.once('connect', onConnect);
      } else if (socket.remoteAddress) {
        onConnect();
      }
    });

    req.on('error', (err) => {
      if (!finished) {
        finished = true;
        cleanup();
        reject(err);
      }
    });

    req.end();
  });
}

/**
 * Validação completa de uma URL com suporte seguro a redirecionamento,
 * tratamento de URLs malformadas e prevenção de SSRF.
 */
export async function validateMediaUrlSafely(
  rawUrlStr: string,
  options?: ValidateOptions
): Promise<ValidationResult> {
  const checkedAt = new Date().toISOString();

  // 1. Sintaxe inicial
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrlStr.trim());
  } catch {
    return {
      success: false,
      urlNormalized: rawUrlStr.trim(),
      checkedAt,
      isMediaCompatible: false,
      supportsRangeRequests: false,
      timingMs: 0,
      diagnostic: {
        level: 'sintaxe_invalida',
        message: 'A URL informada possui formato sintático inválido.',
      },
    };
  }

  // 2. Esquema permitido exclusivamente HTTP e HTTPS
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return {
      success: false,
      urlNormalized: `${parsedUrl.protocol}//${parsedUrl.host}`,
      checkedAt,
      isMediaCompatible: false,
      supportsRangeRequests: false,
      timingMs: 0,
      diagnostic: {
        level: 'bloqueado_ssrf',
        message: `Protocolo '${parsedUrl.protocol}' proibido. Apenas HTTP e HTTPS são aceitos.`,
      },
    };
  }

  // 3. Validação explícita de nome de host ausente para URLs HTTP/HTTPS
  if (!parsedUrl.hostname) {
    return {
      success: false,
      urlNormalized: rawUrlStr.trim(),
      checkedAt,
      isMediaCompatible: false,
      supportsRangeRequests: false,
      timingMs: 0,
      diagnostic: {
        level: 'sintaxe_invalida',
        message: 'A URL informada não possui um nome de host válido.',
      },
    };
  }

  // Sanitizar URL para saída pública (sem senhas ou credenciais)
  const sanitizedDisplayUrl = `${parsedUrl.protocol}//${parsedUrl.host}${parsedUrl.pathname}`;

  const totalTimeoutMs = options?.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const overallDeadline = Date.now() + totalTimeoutMs;

  let currentUrl = parsedUrl;
  let redirectHop = 0;
  let finalResult: any = null;

  try {
    while (redirectHop <= MAX_REDIRECTS) {
      if (options?.signal?.aborted) {
        throw new Error('CLIENT_ABORTED');
      }

      const remainingMs = overallDeadline - Date.now();
      if (remainingMs <= 0) {
        throw new Error(`TIMEOUT: Limite de ${totalTimeoutMs}ms excedido para a operação completa`);
      }

      const stepOptions: ValidateOptions = {
        ...options,
        timeoutMs: remainingMs,
      };

      // Revalida protocolo e hostname a cada salto
      if (currentUrl.protocol !== 'http:' && currentUrl.protocol !== 'https:') {
        return {
          success: false,
          urlNormalized: sanitizedDisplayUrl,
          checkedAt,
          isMediaCompatible: false,
          supportsRangeRequests: false,
          timingMs: 0,
          diagnostic: {
            level: 'bloqueado_ssrf',
            message: `Protocolo '${currentUrl.protocol}' proibido em redirecionamento.`,
          },
        };
      }

      const loopRawHost = currentUrl.hostname;
      const loopHost = loopRawHost.startsWith('[') && loopRawHost.endsWith(']')
        ? loopRawHost.slice(1, -1)
        : loopRawHost;

      if (!options?.allowLoopbackForMockTest && isProhibitedHostname(loopHost)) {
        return {
          success: false,
          urlNormalized: sanitizedDisplayUrl,
          checkedAt,
          isMediaCompatible: false,
          supportsRangeRequests: false,
          timingMs: 0,
          diagnostic: {
            level: 'bloqueado_ssrf',
            message: `Hostname proibido em redirecionamento (${currentUrl.hostname}).`,
          },
        };
      }

      // Tentar HEAD leve primeiro
      let stepResult;
      try {
        stepResult = await performSafeHttpCheck(currentUrl, 'HEAD', redirectHop, stepOptions);
        // Se retornar 405 Method Not Allowed, 501 Not Implemented ou 403 Forbidden (comum em URLs assinadas para GET), fallback com GET Range limitado
        if (
          stepResult.statusCode === 405 ||
          stepResult.statusCode === 501 ||
          stepResult.statusCode === 403
        ) {
          const fallbackRemaining = overallDeadline - Date.now();
          if (fallbackRemaining <= 0) {
            throw new Error(`TIMEOUT: Limite de ${totalTimeoutMs}ms excedido para a operação completa`);
          }
          stepResult = await performSafeHttpCheck(currentUrl, 'GET', redirectHop, {
            ...options,
            timeoutMs: fallbackRemaining,
          });
        }
      } catch (headErr: any) {
        if (
          headErr.message &&
          (headErr.message.includes('SSRF_BLOCKED') ||
            headErr.message.includes('CLIENT_ABORTED') ||
            headErr.message.includes('TIMEOUT'))
        ) {
          throw headErr;
        }
        // Fallback para GET com Range
        const fallbackRemaining = overallDeadline - Date.now();
        if (fallbackRemaining <= 0) {
          throw new Error(`TIMEOUT: Limite de ${totalTimeoutMs}ms excedido para a operação completa`);
        }
        stepResult = await performSafeHttpCheck(currentUrl, 'GET', redirectHop, {
          ...options,
          timeoutMs: fallbackRemaining,
        });
      }

      if (stepResult.redirectUrl) {
        redirectHop++;
        if (redirectHop > MAX_REDIRECTS) {
          return {
            success: false,
            urlNormalized: sanitizedDisplayUrl,
            checkedAt,
            isMediaCompatible: false,
            supportsRangeRequests: false,
            timingMs: stepResult.timingMs,
            diagnostic: {
              level: 'erro_rede',
              message: `Limite de redirecionamentos excedido (${MAX_REDIRECTS} saltos).`,
            },
          };
        }
        currentUrl = stepResult.redirectUrl;
        continue;
      }

      finalResult = stepResult;
      break;
    }
  } catch (err: any) {
    const errorMsg = err.message || 'Falha de conexão com o servidor remoto';
    const isSsrf = errorMsg.includes('SSRF_BLOCKED');
    const isTimeout = errorMsg.includes('TIMEOUT');
    const isClientAbort = errorMsg.includes('CLIENT_ABORTED');

    if (isClientAbort) {
      throw err; // Repassa cancelamento do cliente para controle de fluxo
    }

    return {
      success: false,
      urlNormalized: sanitizedDisplayUrl,
      checkedAt,
      isMediaCompatible: false,
      supportsRangeRequests: false,
      timingMs: 0,
      diagnostic: {
        level: isSsrf ? 'bloqueado_ssrf' : 'erro_rede',
        message: isSsrf
          ? 'Endereço bloqueado por política de segurança SSRF (acesso a IP local, privado ou metadados de nuvem é proibido).'
          : isTimeout
          ? 'O servidor remoto não respondeu dentro do limite de tempo de 4 segundos.'
          : errorMsg,
      },
    };
  }

  const statusCode = finalResult.statusCode || 0;
  const headers = finalResult.headers || {};
  const rawContentType = (headers['content-type'] as string) || '';
  const contentType = rawContentType.split(';')[0].trim().toLowerCase();
  const contentLength = headers['content-length']
    ? Number(headers['content-length'])
    : undefined;
  const acceptRanges = (headers['accept-ranges'] as string) || '';
  const supportsRange = acceptRanges.toLowerCase().includes('bytes');

  // Identificação de compatibilidade de mídia
  const isVideoDirect =
    contentType.startsWith('video/') ||
    contentType === 'application/mp4' ||
    (contentType === 'application/octet-stream' &&
      currentUrl.pathname.match(/\.(mp4|webm|mkv|mov|ogg)$/i) !== null);

  const isStreamingManifest =
    contentType.includes('mpegurl') ||
    contentType.includes('application/x-mpegurl') ||
    contentType.includes('application/vnd.apple.mpegurl') ||
    currentUrl.pathname.endsWith('.m3u8');

  const isMediaCompatible = isVideoDirect || isStreamingManifest;

  let diagnosticLevel: ValidationResult['diagnostic']['level'] = 'servidor_conectado';
  let diagnosticMessage = `Servidor respondeu com HTTP ${statusCode}.`;

  if (statusCode >= 200 && statusCode < 300) {
    if (isMediaCompatible) {
      diagnosticLevel = 'midia_compativel';
      diagnosticMessage = finalResult.truncated
        ? `Mídia compatível detectada (${contentType || 'formato de vídeo'}). Leitura limitada a 64KB com segurança.`
        : `Mídia compatível detectada (${contentType || 'formato de vídeo'}). Cabeçalhos HTTP confirmados.`;
    } else {
      diagnosticLevel = 'servidor_conectado';
      diagnosticMessage = `Servidor acessível (HTTP ${statusCode}), mas o conteúdo retornado (${contentType || 'desconhecido'}) não é um fluxo de vídeo reconhecido.`;
    }
  } else if (statusCode === 401 || statusCode === 403) {
    diagnosticLevel = 'acesso_negado_ou_expirado';
    diagnosticMessage =
      statusCode === 403
        ? 'Acesso negado (HTTP 403). O servidor remoto rejeitou a requisição.'
        : `Acesso negado ou token expirado (HTTP ${statusCode}). O servidor remoto rejeitou a requisição.`;
  } else if (statusCode === 404) {
    diagnosticLevel = 'acesso_negado_ou_expirado';
    diagnosticMessage = 'Arquivo de vídeo não encontrado no servidor remoto (HTTP 404).';
  } else {
    diagnosticLevel = 'erro_rede';
    diagnosticMessage = `Servidor remoto retornou código inesperado (HTTP ${statusCode}).`;
  }

  return {
    success: statusCode >= 200 && statusCode < 300,
    urlNormalized: sanitizedDisplayUrl,
    checkedAt,
    httpStatus: statusCode,
    httpStatusText: finalResult.statusMessage,
    contentType,
    contentLength,
    isMediaCompatible,
    mediaTypeDetected: isStreamingManifest
      ? 'HLS Playlist (.m3u8)'
      : isVideoDirect
      ? 'Arquivo de Vídeo Direto'
      : undefined,
    supportsRangeRequests: supportsRange,
    timingMs: finalResult.timingMs,
    truncated: finalResult.truncated,
    diagnostic: {
      level: diagnosticLevel,
      message: diagnosticMessage,
    },
  };
}
