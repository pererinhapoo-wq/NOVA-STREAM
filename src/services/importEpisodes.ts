import { VideoItem, VideoCategory } from '../types/video';

export type QueueItemStatus = 'pendente' | 'invalida' | 'duplicada';

export type NetworkValidationStatus =
  | 'nao_iniciada'
  | 'validando'
  | 'midia_compativel'
  | 'servidor_conectado'
  | 'acesso_negado_ou_expirado'
  | 'bloqueado_ssrf'
  | 'erro_rede'
  | 'inconclusivo';

export interface NetworkValidationDetail {
  httpStatus?: number;
  httpStatusText?: string;
  contentType?: string;
  contentLength?: number;
  isMediaCompatible: boolean;
  mediaTypeDetected?: string;
  supportsRangeRequests: boolean;
  timingMs: number;
  truncated?: boolean;
  diagnosticLevel: string;
  diagnosticMessage: string;
}

export interface PreparedQueueItem {
  episodeNumber: number;
  originalLineNumber: number;
  rawUrl: string;
  sanitizedUrl: string;
  status: QueueItemStatus;
  statusMessage: string;
  seriesTitle: string;
  seasonNumber: number;
  networkStatus?: NetworkValidationStatus;
  networkResult?: NetworkValidationDetail;
  networkError?: string;
}

export interface IgnoredItemDetail {
  episodeNumber: number;
  rawUrl: string;
  status: string;
  reason: string;
}

export interface ImportCandidateAnalysis {
  eligibleToImport: VideoItem[];
  ignoredCatalogDuplicates: IgnoredItemDetail[];
  ignoredIneligible: IgnoredItemDetail[];
  totalProcessed: number;
}

export interface BuildCandidatesOptions {
  seriesTitle: string;
  seasonNumber: number;
  category?: VideoCategory;
  posterUrl?: string;
}

/**
 * Normaliza uma URL para comparação de duplicatas no catálogo,
 * convertendo protocolo/host/pathname para minúsculas e removendo barras extras finais.
 */
export function normalizeUrlForComparison(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  const trimmed = rawUrl.trim();
  try {
    const u = new URL(trimmed);
    const pathname = u.pathname.replace(/\/+$/, '');
    return `${u.protocol}//${u.host.toLowerCase()}${pathname}`;
  } catch {
    return trimmed.toLowerCase().replace(/\/+$/, '');
  }
}

/**
 * Formata bytes numéricos de forma humanamente legível.
 */
export function formatBytes(bytes?: number): string {
  if (!bytes || isNaN(bytes) || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Gera um ID único e determinístico com entropia criptográfica
 * sem depender exclusivamente de Date.now() e Math.random().
 */
export function generateUniqueEpisodeId(
  seriesTitle: string,
  seasonNumber: number,
  episodeNumber: number
): string {
  const cleanSlug =
    seriesTitle
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .slice(0, 24)
      .replace(/(^-+|-+$)/g, '') || 'serie';

  let entropy = '';
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    entropy = crypto.randomUUID();
  } else if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    entropy = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  } else {
    const perf = typeof performance !== 'undefined' ? Math.floor(performance.now() * 1000) : 0;
    entropy = `${Date.now()}-${perf}-${Math.floor(Math.random() * 1000000)}`;
  }

  const sStr = String(seasonNumber).padStart(2, '0');
  const eStr = String(episodeNumber).padStart(2, '0');
  return `novastream-${cleanSlug}-s${sStr}e${eStr}-${entropy}`;
}

/**
 * Normaliza a chave de identificação de um episódio de série (obra + temporada + número)
 * para detectar colisões sem bloquear obras distintas ou temporadas distintas.
 */
export function getEpisodeSeriesKey(
  seriesTitle: string,
  seasonNumber: number,
  episodeNumber: number
): string {
  const normSeries = seriesTitle
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ');
  const sStr = String(seasonNumber).padStart(2, '0');
  const eStr = String(episodeNumber).padStart(2, '0');
  return `${normSeries}::t${sStr}::e${eStr}`;
}

/**
 * Tenta extrair a chave de episódio a partir do título de um vídeo existente no catálogo.
 * Suporta formatos como "Nome da Obra • T01E01", "Nome da Obra - T01E01", etc.
 */
export function extractEpisodeKeyFromTitle(title?: string): string | null {
  if (!title || typeof title !== 'string') return null;
  const match = title.trim().match(/^(.+?)\s*[•·-]\s*T(\d+)\s*E(\d+)$/i);
  if (!match) return null;
  const series = match[1];
  const season = parseInt(match[2], 10);
  const episode = parseInt(match[3], 10);
  if (isNaN(season) || isNaN(episode)) return null;
  return getEpisodeSeriesKey(series, season, episode);
}

/**
 * Filtra e constrói de forma pura os objetos VideoItem para importação,
 * aplicando regras estritas de elegibilidade e detecção de duplicatas.
 */
export function buildImportCandidates(
  batch: PreparedQueueItem[],
  existingCatalog: VideoItem[],
  options: BuildCandidatesOptions
): ImportCandidateAnalysis {
  const eligibleToImport: VideoItem[] = [];
  const ignoredCatalogDuplicates: IgnoredItemDetail[] = [];
  const ignoredIneligible: IgnoredItemDetail[] = [];

  const existingUrlSet = new Set<string>();
  const existingEpisodeKeySet = new Set<string>();

  if (Array.isArray(existingCatalog)) {
    for (const v of existingCatalog) {
      if (!v) continue;
      if (v.videoUrl) {
        existingUrlSet.add(normalizeUrlForComparison(v.videoUrl));
      }
      const keyFromTitle = extractEpisodeKeyFromTitle(v.title);
      if (keyFromTitle) {
        existingEpisodeKeySet.add(keyFromTitle);
      }
    }
  }

  const batchApprovedUrlSet = new Set<string>();
  const batchApprovedEpisodeKeySet = new Set<string>();

  const currentSeries = options.seriesTitle?.trim() || 'Obra Sem Título';
  const currentCategory: VideoCategory = options.category || 'Treinamentos & Tutoriais';
  const defaultPoster = options.posterUrl || '';

  if (Array.isArray(batch)) {
    for (const item of batch) {
      if (!item) continue;

      // 1. Verificações de sintaxe e duplicata pré-lote
      if (item.status === 'invalida') {
        ignoredIneligible.push({
          episodeNumber: item.episodeNumber,
          rawUrl: item.rawUrl,
          status: 'invalida',
          reason: item.statusMessage || 'Sintaxe de URL inválida.',
        });
        continue;
      }

      if (item.status === 'duplicada') {
        ignoredIneligible.push({
          episodeNumber: item.episodeNumber,
          rawUrl: item.rawUrl,
          status: 'duplicada',
          reason: 'URL repetida no mesmo lote.',
        });
        continue;
      }

      // 2. Verificação de status de validação de rede
      if (!item.networkStatus || item.networkStatus === 'nao_iniciada' || item.networkStatus === 'validando') {
        ignoredIneligible.push({
          episodeNumber: item.episodeNumber,
          rawUrl: item.rawUrl,
          status: item.networkStatus || 'nao_iniciada',
          reason: 'URL ainda não foi validada pela rede.',
        });
        continue;
      }

      if (item.networkStatus !== 'midia_compativel' || !item.networkResult?.isMediaCompatible) {
        let reason = 'Mídia incompatível ou não reconhecida.';
        if (item.networkStatus === 'acesso_negado_ou_expirado') {
          reason = `Acesso negado ou expirado (HTTP ${item.networkResult?.httpStatus || '401/403/404'}).`;
        } else if (item.networkStatus === 'bloqueado_ssrf') {
          reason = 'Bloqueado por política de segurança SSRF.';
        } else if (item.networkStatus === 'erro_rede') {
          reason = 'Erro de rede ou conexão esgotada.';
        } else if (item.networkStatus === 'servidor_conectado') {
          reason = 'Servidor conectado, mas Content-Type não é vídeo.';
        } else if (item.networkStatus === 'inconclusivo') {
          reason = 'Validação de rede inconclusiva.';
        }

        ignoredIneligible.push({
          episodeNumber: item.episodeNumber,
          rawUrl: item.rawUrl,
          status: item.networkStatus,
          reason,
        });
        continue;
      }

      // 3. Verificação de duplicata por URL (contra o catálogo existente e itens anteriores do lote)
      const normalizedUrl = normalizeUrlForComparison(item.rawUrl);
      if (existingUrlSet.has(normalizedUrl) || batchApprovedUrlSet.has(normalizedUrl)) {
        ignoredCatalogDuplicates.push({
          episodeNumber: item.episodeNumber,
          rawUrl: item.rawUrl,
          status: 'duplicada_catalogo',
          reason: 'URL já cadastrada no catálogo da aplicação.',
        });
        continue;
      }

      // Verificação de conflito de numeração: mesma obra, mesma temporada e mesmo número de episódio
      const candidateEpisodeKey = getEpisodeSeriesKey(
        currentSeries,
        options.seasonNumber,
        item.episodeNumber
      );
      if (
        existingEpisodeKeySet.has(candidateEpisodeKey) ||
        batchApprovedEpisodeKeySet.has(candidateEpisodeKey)
      ) {
        const sPad = String(options.seasonNumber).padStart(2, '0');
        const ePad = String(item.episodeNumber).padStart(2, '0');
        ignoredCatalogDuplicates.push({
          episodeNumber: item.episodeNumber,
          rawUrl: item.rawUrl,
          status: 'conflito_numeracao',
          reason: `Episódio já existente no catálogo para esta obra e temporada (T${sPad}E${ePad}).`,
        });
        continue;
      }

      batchApprovedUrlSet.add(normalizedUrl);
      batchApprovedEpisodeKeySet.add(candidateEpisodeKey);

      // 4. Construção honesta do VideoItem
      const epNumberStr = String(item.episodeNumber).padStart(2, '0');
      const seasonNumberStr = String(options.seasonNumber).padStart(2, '0');
      const uniqueId = generateUniqueEpisodeId(currentSeries, options.seasonNumber, item.episodeNumber);

      const hasRealBytes =
        typeof item.networkResult.contentLength === 'number' && item.networkResult.contentLength > 0;

      const newVideo: VideoItem = {
        id: uniqueId,
        title: `${currentSeries} • T${seasonNumberStr}E${epNumberStr}`,
        description: `Episódio ${item.episodeNumber} da Temporada ${options.seasonNumber} de "${currentSeries}". URL remota validada via servidor.`,
        duration: 0,
        durationFormatted: '00:00',
        category: currentCategory,
        tags: ['Série', `T${options.seasonNumber}`, `E${epNumberStr}`, currentSeries].filter(Boolean),
        posterUrl: defaultPoster,
        videoUrl: item.rawUrl,
        isDemo: false,
        isLocalFile: false,
        demoNotice: 'URL remota validada pela rede (HTTP 200/206). Reprodução efetiva requer teste no player.',
        createdAt: new Date().toISOString(),
        resolution: 'N/D',
        fileSizeBytes: hasRealBytes ? item.networkResult.contentLength : undefined,
        fileSizeFormatted: hasRealBytes ? formatBytes(item.networkResult.contentLength) : undefined,
        uploadStatus: 'pronto',
      };

      eligibleToImport.push(newVideo);
    }
  }

  return {
    eligibleToImport,
    ignoredCatalogDuplicates,
    ignoredIneligible,
    totalProcessed: batch ? batch.length : 0,
  };
}
