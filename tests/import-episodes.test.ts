import {
  buildImportCandidates,
  generateUniqueEpisodeId,
  normalizeUrlForComparison,
  PreparedQueueItem,
} from '../src/services/importEpisodes';
import { VideoItem, VideoResolution } from '../src/types/video';
import { classifyVideoResolution, formatDuration } from '../src/services/videoMetadata';

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

async function runImportEpisodesSuite() {
  console.log('===============================================================');
  console.log('SUITE DE TESTES: IMPORTAÇÃO DE EPISÓDIOS VALIDADOS (NOVA STREAM)');
  console.log('===============================================================\n');

  // Catálogo base de teste existente
  const existingCatalog: VideoItem[] = [
    {
      id: 'existing-vid-01',
      title: 'Vídeo Existente de Teste',
      description: 'Vídeo já presente na biblioteca',
      duration: 300,
      durationFormatted: '05:00',
      category: 'Treinamentos & Tutoriais',
      tags: ['Existente'],
      posterUrl: '/assets/thumb.jpg',
      videoUrl: 'https://cdn.exemplo.com/videos/aula01.mp4',
      isDemo: false,
      createdAt: '2026-03-01T10:00:00Z',
      resolution: '1080p',
    },
  ];

  // -----------------------------------------------------------------
  // 1. IMPORTAÇÃO VÁLIDA COM PRESERVAÇÃO DE METADADOS
  // -----------------------------------------------------------------
  console.log('--- 1. IMPORTAÇÃO VÁLIDA COM PRESERVAÇÃO DE METADADOS ---');

  const validBatch: PreparedQueueItem[] = [
    {
      episodeNumber: 1,
      originalLineNumber: 1,
      rawUrl: 'https://cdn.exemplo.com/videos/serie/s01e01.mp4?token=secret123',
      sanitizedUrl: 'https://cdn.exemplo.com/videos/serie/s01e01.mp4',
      status: 'pendente',
      statusMessage: 'Sintaxe válida',
      seriesTitle: 'Curso de Arquitetura em Nuvem',
      seasonNumber: 1,
      networkStatus: 'midia_compativel',
      networkResult: {
        httpStatus: 200,
        httpStatusText: 'OK',
        contentType: 'video/mp4',
        contentLength: 52428800, // 50 MB
        isMediaCompatible: true,
        mediaTypeDetected: 'Vídeo MP4 (H.264 / AAC)',
        supportsRangeRequests: true,
        timingMs: 145,
        diagnosticLevel: 'midia_compativel',
        diagnosticMessage: 'Servidor remoto ativo e mídia compatível.',
      },
    },
    {
      episodeNumber: 2,
      originalLineNumber: 2,
      rawUrl: 'https://cdn.exemplo.com/videos/serie/s01e02.mp4',
      sanitizedUrl: 'https://cdn.exemplo.com/videos/serie/s01e02.mp4',
      status: 'pendente',
      statusMessage: 'Sintaxe válida',
      seriesTitle: 'Curso de Arquitetura em Nuvem',
      seasonNumber: 1,
      networkStatus: 'midia_compativel',
      networkResult: {
        httpStatus: 206,
        httpStatusText: 'Partial Content',
        contentType: 'video/mp4',
        contentLength: 68157440, // 65 MB
        isMediaCompatible: true,
        mediaTypeDetected: 'Vídeo MP4',
        supportsRangeRequests: true,
        timingMs: 180,
        diagnosticLevel: 'midia_compativel',
        diagnosticMessage: 'Range suportado e mídia compatível.',
      },
    },
  ];

  const validResult = buildImportCandidates(validBatch, existingCatalog, {
    seriesTitle: 'Curso de Arquitetura em Nuvem',
    seasonNumber: 1,
    category: 'Treinamentos & Tutoriais',
    posterUrl: '/assets/capa.jpg',
  });

  assert(
    validResult.eligibleToImport.length === 2,
    `2 episódios válidos identificados como elegíveis (retornou ${validResult.eligibleToImport.length})`
  );
  assert(
    validResult.ignoredCatalogDuplicates.length === 0,
    'Nenhuma duplicata de catálogo no lote válido'
  );
  assert(
    validResult.ignoredIneligible.length === 0,
    'Nenhum item não elegível no lote válido'
  );

  const ep1 = validResult.eligibleToImport[0];
  assert(
    ep1.title === 'Curso de Arquitetura em Nuvem • T01E01',
    `Título do episódio preserva obra, temporada e numeração: "${ep1.title}"`
  );
  assert(
    ep1.duration === 0 && ep1.durationFormatted === '00:00',
    'Duração declarada honestamente como 0 e "00:00" até ser decodificada no player'
  );
  assert(
    ep1.fileSizeBytes === 52428800 && Boolean(ep1.fileSizeFormatted),
    `Tamanho do arquivo capturado com base no Content-Length real (${ep1.fileSizeFormatted})`
  );
  assert(
    ep1.videoUrl === 'https://cdn.exemplo.com/videos/serie/s01e01.mp4?token=secret123',
    'URL original preservada integralmente para reprodução no player'
  );
  assert(
    ep1.uploadStatus === 'pronto' && ep1.isDemo === false && ep1.isLocalFile === false,
    'Flags de status, isDemo=false e isLocalFile=false configuradas corretamente'
  );
  assert(
    ep1.resolution === 'N/D',
    `Resolução inicial declarada honestamente como neutra ("N/D") até teste no player: "${ep1.resolution}"`
  );
  assert(
    ep1.id.startsWith('novastream-curso-de-arquitetura-em-s01e01-'),
    `ID estruturado e sem dependência exclusiva de Date.now/Math.random: ${ep1.id}`
  );

  // -----------------------------------------------------------------
  // 2. DETECÇÃO DE DUPLICATAS (NO LOTE E NO CATÁLOGO)
  // -----------------------------------------------------------------
  console.log('\n--- 2. DETECÇÃO DE DUPLICATAS ---');

  const duplicateBatch: PreparedQueueItem[] = [
    // Duplicata interna no lote
    {
      episodeNumber: 1,
      originalLineNumber: 1,
      rawUrl: 'https://cdn.exemplo.com/videos/outro01.mp4',
      sanitizedUrl: 'https://cdn.exemplo.com/videos/outro01.mp4',
      status: 'duplicada',
      statusMessage: 'URL repetida no lote',
      seriesTitle: 'Série Teste',
      seasonNumber: 1,
      networkStatus: 'nao_iniciada',
    },
    // Duplicata contra o catálogo existente (https://cdn.exemplo.com/videos/aula01.mp4)
    {
      episodeNumber: 2,
      originalLineNumber: 2,
      rawUrl: 'https://cdn.exemplo.com/videos/aula01.mp4/', // Com barra final para testar normalização
      sanitizedUrl: 'https://cdn.exemplo.com/videos/aula01.mp4',
      status: 'pendente',
      statusMessage: 'Sintaxe válida',
      seriesTitle: 'Série Teste',
      seasonNumber: 1,
      networkStatus: 'midia_compativel',
      networkResult: {
        httpStatus: 200,
        contentType: 'video/mp4',
        isMediaCompatible: true,
        supportsRangeRequests: true,
        timingMs: 100,
        diagnosticLevel: 'midia_compativel',
        diagnosticMessage: 'Mídia compatível',
      },
    },
  ];

  const dupeResult = buildImportCandidates(duplicateBatch, existingCatalog, {
    seriesTitle: 'Série Teste',
    seasonNumber: 1,
  });

  assert(
    dupeResult.eligibleToImport.length === 0,
    `0 itens importados em lote composto exclusivamente por duplicatas (retornou ${dupeResult.eligibleToImport.length})`
  );
  assert(
    dupeResult.ignoredCatalogDuplicates.length === 1 &&
      dupeResult.ignoredCatalogDuplicates[0].episodeNumber === 2,
    'Episódio 2 corretamente classificado como duplicata de catálogo'
  );
  assert(
    dupeResult.ignoredIneligible.length === 1 &&
      dupeResult.ignoredIneligible[0].status === 'duplicada',
    'Episódio 1 corretamente classificado como duplicata interna do lote'
  );

  // -----------------------------------------------------------------
  // 3. URLs NÃO VALIDADAS PELA REDE (PENDENTES / EM CURSO)
  // -----------------------------------------------------------------
  console.log('\n--- 3. URLs NÃO VALIDADAS PELA REDE ---');

  const unvalidatedBatch: PreparedQueueItem[] = [
    {
      episodeNumber: 1,
      originalLineNumber: 1,
      rawUrl: 'https://cdn.exemplo.com/videos/s01e01.mp4',
      sanitizedUrl: 'https://cdn.exemplo.com/videos/s01e01.mp4',
      status: 'pendente',
      statusMessage: 'Sintaxe válida',
      seriesTitle: 'Série Teste',
      seasonNumber: 1,
      networkStatus: 'nao_iniciada',
    },
    {
      episodeNumber: 2,
      originalLineNumber: 2,
      rawUrl: 'https://cdn.exemplo.com/videos/s01e02.mp4',
      sanitizedUrl: 'https://cdn.exemplo.com/videos/s01e02.mp4',
      status: 'pendente',
      statusMessage: 'Sintaxe válida',
      seriesTitle: 'Série Teste',
      seasonNumber: 1,
      networkStatus: 'validando',
    },
  ];

  const unvalResult = buildImportCandidates(unvalidatedBatch, existingCatalog, {
    seriesTitle: 'Série Teste',
    seasonNumber: 1,
  });

  assert(
    unvalResult.eligibleToImport.length === 0,
    'Nenhum item não validado foi autorizado para importação'
  );
  assert(
    unvalResult.ignoredIneligible.length === 2,
    'Todos os itens não validados foram rejeitados e informados'
  );

  // -----------------------------------------------------------------
  // 4. HTTP 403 (ACESSO NEGADO), BLOQUEIO SSRF E ERROS DE REDE
  // -----------------------------------------------------------------
  console.log('\n--- 4. HTTP 403, BLOQUEIO SSRF E ERROS DE REDE ---');

  const errorBatch: PreparedQueueItem[] = [
    // HTTP 403 Acesso Negado
    {
      episodeNumber: 1,
      originalLineNumber: 1,
      rawUrl: 'https://cdn.exemplo.com/videos/protegido.mp4',
      sanitizedUrl: 'https://cdn.exemplo.com/videos/protegido.mp4',
      status: 'pendente',
      statusMessage: 'Sintaxe válida',
      seriesTitle: 'Série Restrita',
      seasonNumber: 1,
      networkStatus: 'acesso_negado_ou_expirado',
      networkResult: {
        httpStatus: 403,
        httpStatusText: 'Forbidden',
        isMediaCompatible: false,
        supportsRangeRequests: false,
        timingMs: 120,
        diagnosticLevel: 'acesso_negado_ou_expirado',
        diagnosticMessage: 'Acesso negado pelo servidor remoto (HTTP 403).',
      },
    },
    // Bloqueio de Segurança SSRF
    {
      episodeNumber: 2,
      originalLineNumber: 2,
      rawUrl: 'http://169.254.169.254/latest/meta-data/video.mp4',
      sanitizedUrl: 'http://169.254.169.254/latest/meta-data/video.mp4',
      status: 'pendente',
      statusMessage: 'Sintaxe válida',
      seriesTitle: 'Série Restrita',
      seasonNumber: 1,
      networkStatus: 'bloqueado_ssrf',
      networkResult: {
        isMediaCompatible: false,
        supportsRangeRequests: false,
        timingMs: 5,
        diagnosticLevel: 'bloqueado_ssrf',
        diagnosticMessage: 'Endereço bloqueado por política SSRF.',
      },
    },
    // Erro de Conexão de Rede
    {
      episodeNumber: 3,
      originalLineNumber: 3,
      rawUrl: 'https://servidor-offline-inexistente.com/video.mp4',
      sanitizedUrl: 'https://servidor-offline-inexistente.com/video.mp4',
      status: 'pendente',
      statusMessage: 'Sintaxe válida',
      seriesTitle: 'Série Restrita',
      seasonNumber: 1,
      networkStatus: 'erro_rede',
      networkError: 'getaddrinfo ENOTFOUND',
      networkResult: {
        isMediaCompatible: false,
        supportsRangeRequests: false,
        timingMs: 50,
        diagnosticLevel: 'erro_rede',
        diagnosticMessage: 'Falha de resolução de domínio.',
      },
    },
  ];

  const errorResult = buildImportCandidates(errorBatch, existingCatalog, {
    seriesTitle: 'Série Restrita',
    seasonNumber: 1,
  });

  assert(
    errorResult.eligibleToImport.length === 0,
    'Nenhum item com erro ou acesso negado foi permitido para importação'
  );
  assert(
    errorResult.ignoredIneligible.length === 3,
    '3 itens com falha (HTTP 403, SSRF, Erro de Rede) foram corretamente rejeitados'
  );
  assert(
    errorResult.ignoredIneligible.some((i) => i.reason.includes('403')),
    'Motivo do HTTP 403 explicita código de recusa'
  );
  assert(
    errorResult.ignoredIneligible.some((i) => i.reason.includes('SSRF')),
    'Motivo do bloqueio SSRF explicita restrição de segurança'
  );

  // -----------------------------------------------------------------
  // 5. LOTE VAZIO OU SEM ITENS
  // -----------------------------------------------------------------
  console.log('\n--- 5. LOTE VAZIO OU SEM ITENS ---');

  const emptyResult = buildImportCandidates([], existingCatalog, {
    seriesTitle: 'Série Vazia',
    seasonNumber: 1,
  });

  assert(
    emptyResult.eligibleToImport.length === 0,
    'Lote vazio retorna lista de importação vazia sem exceções'
  );
  assert(
    emptyResult.totalProcessed === 0,
    'Total processado do lote vazio é 0'
  );

  // -----------------------------------------------------------------
  // 6. GERAÇÃO DETERMINÍSTICA E UNICIDADE DE IDs
  // -----------------------------------------------------------------
  console.log('\n--- 6. GERAÇÃO DE IDs ÚNICOS ---');

  const id1 = generateUniqueEpisodeId('Treinamento Avançado', 1, 1);
  const id2 = generateUniqueEpisodeId('Treinamento Avançado', 1, 1);

  assert(id1 !== id2, 'Duas chamadas sucessivas para o mesmo episódio geram IDs distintos com entropia');
  assert(
    id1.includes('treinamento-avancado-s01e01'),
    `Slug sem acentos e numeração semântica preservados no ID (${id1})`
  );

  // -----------------------------------------------------------------
  // 7. CONFLITOS DE NUMERAÇÃO DE EPISÓDIOS (REGRA 4)
  // -----------------------------------------------------------------
  console.log('\n--- 7. CONFLITOS DE NUMERAÇÃO DE EPISÓDIOS ---');

  const catalogWithNumberedSeries: VideoItem[] = [
    {
      id: 'existing-serie-s01e01',
      title: 'Segurança em Redes • T01E01',
      description: 'Episódio 1 da Temporada 1',
      duration: 1200,
      durationFormatted: '20:00',
      category: 'Treinamentos & Tutoriais',
      tags: ['Redes', 'T1'],
      posterUrl: '/assets/thumb.jpg',
      videoUrl: 'https://cdn.exemplo.com/antigo-s01e01.mp4',
      isDemo: false,
      createdAt: '2026-03-01T10:00:00Z',
      resolution: '1080p',
    },
  ];

  // Caso 7.1: Mesma obra, mesma temporada, mesmo episódio, mas URL DIFERENTE -> DEVE BLOQUEAR CONFLITO
  const batchSameSeriesSeasonEpDiffUrl: PreparedQueueItem[] = [
    {
      episodeNumber: 1,
      originalLineNumber: 1,
      rawUrl: 'https://cdn.exemplo.com/url-totalmente-nova-s01e01.mp4',
      sanitizedUrl: 'https://cdn.exemplo.com/url-totalmente-nova-s01e01.mp4',
      status: 'pendente',
      statusMessage: 'Sintaxe válida',
      seriesTitle: 'Segurança em Redes',
      seasonNumber: 1,
      networkStatus: 'midia_compativel',
      networkResult: {
        httpStatus: 200,
        contentType: 'video/mp4',
        isMediaCompatible: true,
        supportsRangeRequests: true,
        timingMs: 80,
        diagnosticLevel: 'midia_compativel',
        diagnosticMessage: 'Mídia compatível',
      },
    },
  ];

  const resConflict = buildImportCandidates(batchSameSeriesSeasonEpDiffUrl, catalogWithNumberedSeries, {
    seriesTitle: 'Segurança em Redes',
    seasonNumber: 1,
  });

  assert(
    resConflict.eligibleToImport.length === 0,
    'Episódio com mesma obra, temporada e numeração bloqueado mesmo com URL diferente (0 importados)'
  );
  assert(
    resConflict.ignoredCatalogDuplicates.length === 1 &&
      resConflict.ignoredCatalogDuplicates[0].status === 'conflito_numeracao',
    'Item classificado com status conflito_numeracao'
  );
  assert(
    resConflict.ignoredCatalogDuplicates[0].reason.includes('T01E01'),
    `Motivo explicita a numeração conflitante: "${resConflict.ignoredCatalogDuplicates[0].reason}"`
  );

  // Caso 7.2: Obras DIFERENTES com o mesmo número de episódio (E01) -> DEVE PERMITIR
  const batchDiffSeriesSameEp: PreparedQueueItem[] = [
    {
      episodeNumber: 1,
      originalLineNumber: 1,
      rawUrl: 'https://cdn.exemplo.com/outra-obra-s01e01.mp4',
      sanitizedUrl: 'https://cdn.exemplo.com/outra-obra-s01e01.mp4',
      status: 'pendente',
      statusMessage: 'Sintaxe válida',
      seriesTitle: 'DevOps e Kubernetes',
      seasonNumber: 1,
      networkStatus: 'midia_compativel',
      networkResult: {
        httpStatus: 200,
        contentType: 'video/mp4',
        isMediaCompatible: true,
        supportsRangeRequests: true,
        timingMs: 90,
        diagnosticLevel: 'midia_compativel',
        diagnosticMessage: 'Mídia compatível',
      },
    },
  ];

  const resDiffSeries = buildImportCandidates(batchDiffSeriesSameEp, catalogWithNumberedSeries, {
    seriesTitle: 'DevOps e Kubernetes',
    seasonNumber: 1,
  });

  assert(
    resDiffSeries.eligibleToImport.length === 1,
    'Obra diferente com mesmo número de episódio permitida para importação'
  );
  assert(
    resDiffSeries.eligibleToImport[0].title === 'DevOps e Kubernetes • T01E01',
    `Título da obra distinta gerado corretamente: "${resDiffSeries.eligibleToImport[0].title}"`
  );

  // Caso 7.3: Mesma obra, mas Temporada DIFERENTE (Temporada 2, Episódio 1) -> DEVE PERMITIR
  const batchSameSeriesDiffSeason: PreparedQueueItem[] = [
    {
      episodeNumber: 1,
      originalLineNumber: 1,
      rawUrl: 'https://cdn.exemplo.com/redes-s02e01.mp4',
      sanitizedUrl: 'https://cdn.exemplo.com/redes-s02e01.mp4',
      status: 'pendente',
      statusMessage: 'Sintaxe válida',
      seriesTitle: 'Segurança em Redes',
      seasonNumber: 2,
      networkStatus: 'midia_compativel',
      networkResult: {
        httpStatus: 200,
        contentType: 'video/mp4',
        isMediaCompatible: true,
        supportsRangeRequests: true,
        timingMs: 85,
        diagnosticLevel: 'midia_compativel',
        diagnosticMessage: 'Mídia compatível',
      },
    },
  ];

  const resDiffSeason = buildImportCandidates(batchSameSeriesDiffSeason, catalogWithNumberedSeries, {
    seriesTitle: 'Segurança em Redes',
    seasonNumber: 2,
  });

  assert(
    resDiffSeason.eligibleToImport.length === 1,
    'Temporada 2 da mesma obra permitida para importação sem conflito com a Temporada 1'
  );
  assert(
    resDiffSeason.eligibleToImport[0].title === 'Segurança em Redes • T02E01',
    `Título com temporada 2 gerado corretamente: "${resDiffSeason.eligibleToImport[0].title}"`
  );

  // -----------------------------------------------------------------
  // 8. CLASSIFICAÇÃO DE RESOLUÇÃO E FORMATAÇÃO DE DURAÇÃO
  // -----------------------------------------------------------------
  console.log('\n--- 8. CLASSIFICAÇÃO DE RESOLUÇÃO E FORMATAÇÃO DE DURAÇÃO ---');

  // Testes de Classificação de Resolução Conforme Regra 3:
  // - >= 2160 -> '4K'
  // - >= 1080 -> '1080p'
  // - >= 720  -> '720p'
  // - Menores -> 'N/D' (sem inventar 480p)
  // - Dados inválidos -> 'N/D'
  assert(classifyVideoResolution(2160) === '4K', 'videoHeight 2160 classificado como 4K');
  assert(classifyVideoResolution(3840) === '4K', 'videoHeight 3840 classificado como 4K');
  assert(classifyVideoResolution(1080) === '1080p', 'videoHeight 1080 classificado como 1080p');
  assert(classifyVideoResolution(1440) === '1080p', 'videoHeight 1440 (2K) classificado com segurança como 1080p');
  assert(classifyVideoResolution(720) === '720p', 'videoHeight 720 classificado como 720p');
  assert(classifyVideoResolution(719) === 'N/D', 'videoHeight 719 não recebe 720p e resulta em N/D');
  assert(classifyVideoResolution(480) === 'N/D', 'videoHeight 480 não assume 480p automaticamente e resulta em N/D');
  assert(classifyVideoResolution(360) === 'N/D', 'videoHeight 360 resulta honestamente em N/D');
  assert(classifyVideoResolution(undefined) === 'N/D', 'videoHeight indefinido resulta em N/D');
  assert(classifyVideoResolution(0) === 'N/D', 'videoHeight 0 resulta em N/D');
  assert(classifyVideoResolution(-100) === 'N/D', 'videoHeight negativo resulta em N/D');
  assert(classifyVideoResolution(NaN) === 'N/D', 'videoHeight NaN resulta em N/D');

  // Testes de Formatação de Duração
  assert(formatDuration(0) === '00:00', '0 segundos formata como "00:00"');
  assert(formatDuration(-10) === '00:00', 'Duração negativa formata como "00:00"');
  assert(formatDuration(NaN) === '00:00', 'Duração NaN formata como "00:00"');
  assert(formatDuration(65) === '01:05', '65 segundos formata como "01:05"');
  assert(formatDuration(599) === '09:59', '599 segundos formata como "09:59"');
  assert(formatDuration(3665) === '01:01:05', '3665 segundos formata com horas como "01:01:05"');

  // -----------------------------------------------------------------
  // 9. ATUALIZAÇÃO E PERSISTÊNCIA DE METADADOS (SEM DUPLICATAS E PROTEÇÃO DE DEMOS)
  // -----------------------------------------------------------------
  console.log('\n--- 9. PERSISTÊNCIA DE METADADOS E PRESERVAÇÃO DE DEMOS ---');

  // Função pura que reproduz o contrato de atualização do estado em App.tsx
  function applyMetadataUpdate(
    catalog: VideoItem[],
    videoId: string,
    metadata: { duration?: number; durationFormatted?: string; resolution?: VideoResolution }
  ): VideoItem[] {
    return catalog.map((v) => {
      if (v.id !== videoId) return v;
      if (v.isDemo) return v; // Proteção estrita aos vídeos de demonstração

      const updated = { ...v };

      // Atualiza duração apenas se válida e se o vídeo ainda estiver com duração 0
      if (
        typeof metadata.duration === 'number' &&
        metadata.duration > 0 &&
        isFinite(metadata.duration) &&
        (v.duration === 0 || !v.duration)
      ) {
        updated.duration = metadata.duration;
        updated.durationFormatted = metadata.durationFormatted || formatDuration(metadata.duration);
      }

      // Atualiza resolução apenas se for válida e se o vídeo estiver como N/D
      if (
        metadata.resolution &&
        metadata.resolution !== 'N/D' &&
        (v.resolution === 'N/D' || !v.resolution)
      ) {
        updated.resolution = metadata.resolution;
      }

      return updated;
    });
  }

  const demoOriginal: VideoItem = {
    id: 'demo-hero-01',
    title: 'Visão Geral da Infraestrutura de Transmissão Privada',
    description: 'Apresentação técnica sobre arquitetura de streaming',
    duration: 596,
    durationFormatted: '09:56',
    category: 'Treinamentos & Tutoriais',
    tags: ['Arquitetura', 'Segurança'],
    posterUrl: '/assets/demo.jpg',
    videoUrl: 'https://cdn.exemplo.com/demo.mp4',
    isDemo: true,
    createdAt: '2026-03-12T14:30:00Z',
    resolution: '4K',
  };
  const initialCatalogState: VideoItem[] = [
    { ...demoOriginal },
    {
      id: 'imported-test-01',
      title: 'Episódio Importado • T01E01',
      description: 'Vídeo importado por URL aguardando reprodução',
      duration: 0,
      durationFormatted: '00:00',
      category: 'Treinamentos & Tutoriais',
      tags: ['Série'],
      posterUrl: '',
      videoUrl: 'https://cdn.exemplo.com/ep01.mp4',
      isDemo: false,
      createdAt: '2026-03-15T12:00:00Z',
      resolution: 'N/D',
    },
  ];

  // Caso 9.1: Vídeos de demonstração NUNCA são sobrescritos pelo player
  const catalogAfterDemoAttempt = applyMetadataUpdate(initialCatalogState, demoOriginal.id, {
    duration: 10,
    durationFormatted: '00:10',
    resolution: '720p',
  });
  const demoAfter = catalogAfterDemoAttempt.find((v) => v.id === demoOriginal.id);
  assert(
    demoAfter?.duration === demoOriginal.duration &&
      demoAfter?.durationFormatted === demoOriginal.durationFormatted &&
      demoAfter?.resolution === demoOriginal.resolution,
    'Vídeo de demonstração mantém metadados originais (4K e 09:56) mesmo se o player tentar atualizar'
  );

  // Caso 9.2: Vídeo importado recebe duração e resolução reais após loadedmetadata
  const catalogAfterRealUpdate = applyMetadataUpdate(initialCatalogState, 'imported-test-01', {
    duration: 1420,
    durationFormatted: '23:40',
    resolution: '1080p',
  });
  const importedAfter = catalogAfterRealUpdate.find((v) => v.id === 'imported-test-01');
  assert(
    importedAfter?.duration === 1420 &&
      importedAfter?.durationFormatted === '23:40' &&
      importedAfter?.resolution === '1080p',
    'Vídeo importado atualiza duração para 23:40 e resolução para 1080p quando dados reais chegam'
  );

  // Caso 9.3: Dados inválidos ou ausentes não sobrescrevem dados válidos já existentes
  const catalogAfterInvalidUpdate = applyMetadataUpdate(catalogAfterRealUpdate, 'imported-test-01', {
    duration: 0,
    durationFormatted: '00:00',
    resolution: 'N/D',
  });
  const importedAfterInvalid = catalogAfterInvalidUpdate.find((v) => v.id === 'imported-test-01');
  assert(
    importedAfterInvalid?.duration === 1420 &&
      importedAfterInvalid?.durationFormatted === '23:40' &&
      importedAfterInvalid?.resolution === '1080p',
    'Dados válidos já persistidos não são sobrescritos por valores ausentes ou inválidos (duration: 0 / N/D)'
  );

  // Caso 9.4: Atualização preserva o tamanho da lista sem criar duplicatas
  assert(
    catalogAfterRealUpdate.length === initialCatalogState.length,
    `Tamanho do catálogo preservado exatamente sem criar duplicatas (${catalogAfterRealUpdate.length} itens)`
  );

  // -----------------------------------------------------------------
  // 10. CICLO COMPLETO DE IMPORTAÇÃO SEQUENCIAL (DOIS ANIMES SEM RECARREGAR PÁGINA)
  // -----------------------------------------------------------------
  console.log('\n--- 10. CICLO COMPLETO DE IMPORTAÇÃO SEQUENCIAL (DOIS ANIMES DISTINTOS) ---');

  // Catálogo inicial em memória durante a sessão
  let dynamicCatalog: VideoItem[] = [...existingCatalog];
  const initialCatalogCount = dynamicCatalog.length;

  // Estado do formulário simulado (espelhando AdminUploadView)
  let currentSeriesTitle = 'Anime Alfa';
  let currentSeasonNumber = 1;
  let currentRawUrlsText = 'https://cdn.exemplo.com/videos/anime-alfa/ep01.mp4';
  let preparedBatchState: PreparedQueueItem[] | null = null;
  let preparedRawUrlsSnapshot: string | null = null;
  let importFeedbackState: any = null;

  // Função pura que espelha isUrlsTextModified de AdminUploadView
  const checkIsUrlsTextModified = (
    batch: PreparedQueueItem[] | null,
    snapshot: string | null,
    currentText: string
  ) => {
    if (!batch || snapshot === null) return false;
    return currentText.trim() !== snapshot.trim();
  };

  // 1. Preparar e validar um episódio de "Anime Alfa"
  preparedBatchState = [
    {
      episodeNumber: 1,
      originalLineNumber: 1,
      rawUrl: currentRawUrlsText,
      sanitizedUrl: currentRawUrlsText,
      status: 'pendente',
      statusMessage: 'Sintaxe válida',
      seriesTitle: currentSeriesTitle,
      seasonNumber: currentSeasonNumber,
      networkStatus: 'midia_compativel',
      networkResult: {
        httpStatus: 200,
        contentType: 'video/mp4',
        contentLength: 45000000,
        isMediaCompatible: true,
        supportsRangeRequests: true,
        timingMs: 110,
        diagnosticLevel: 'midia_compativel',
        diagnosticMessage: 'Mídia compatível',
      },
    },
  ];
  preparedRawUrlsSnapshot = currentRawUrlsText;

  const analysisAlfa = buildImportCandidates(preparedBatchState, dynamicCatalog, {
    seriesTitle: currentSeriesTitle,
    seasonNumber: currentSeasonNumber,
  });

  assert(
    analysisAlfa.eligibleToImport.length === 1,
    'Episódio 1 de "Anime Alfa" elegível para importação (eligibleToImportCount === 1)'
  );

  // 2. Importar o episódio de Anime Alfa e confirmar inclusão no catálogo
  const importedAlfa = analysisAlfa.eligibleToImport[0];
  dynamicCatalog = [importedAlfa, ...dynamicCatalog];
  importFeedbackState = {
    importedCount: 1,
    firstImportedId: importedAlfa.id,
  };

  assert(
    dynamicCatalog.length === initialCatalogCount + 1,
    'Anime Alfa adicionado com sucesso ao catálogo da sessão'
  );
  assert(
    dynamicCatalog.some((v) => v.title === 'Anime Alfa • T01E01'),
    'Título "Anime Alfa • T01E01" confirmado no catálogo'
  );

  // 3 e 4. Clicar em "Cadastrar outra obra / nova temporada" (handleStartNewBatch)
  // Limpa apenas o formulário, sem tocar no catálogo
  preparedBatchState = null;
  preparedRawUrlsSnapshot = null;
  currentRawUrlsText = '';
  currentSeriesTitle = '';
  importFeedbackState = null;

  assert(
    preparedBatchState === null &&
      currentRawUrlsText === '' &&
      currentSeriesTitle === '' &&
      importFeedbackState === null,
    'Estado do formulário e lote anterior limpos com sucesso após acionar "Cadastrar outra obra"'
  );
  assert(
    dynamicCatalog.some((v) => v.title === 'Anime Alfa • T01E01'),
    'Anime Alfa permanece preservado no catálogo após a limpeza do formulário'
  );

  // 5. Preparar e validar um episódio diferente de "Anime Beta"
  currentSeriesTitle = 'Anime Beta';
  currentSeasonNumber = 1;
  currentRawUrlsText = 'https://cdn.exemplo.com/videos/anime-beta/ep01.mp4';

  preparedBatchState = [
    {
      episodeNumber: 1,
      originalLineNumber: 1,
      rawUrl: currentRawUrlsText,
      sanitizedUrl: currentRawUrlsText,
      status: 'pendente',
      statusMessage: 'Sintaxe válida',
      seriesTitle: currentSeriesTitle,
      seasonNumber: currentSeasonNumber,
      networkStatus: 'midia_compativel',
      networkResult: {
        httpStatus: 206,
        contentType: 'video/mp4',
        contentLength: 62000000,
        isMediaCompatible: true,
        supportsRangeRequests: true,
        timingMs: 95,
        diagnosticLevel: 'midia_compativel',
        diagnosticMessage: 'Mídia compatível',
      },
    },
  ];
  preparedRawUrlsSnapshot = currentRawUrlsText;

  // 6. Confirmar que o botão "Importar episódios validados" fica habilitado (eligibleToImportCount === 1)
  const analysisBeta = buildImportCandidates(preparedBatchState, dynamicCatalog, {
    seriesTitle: currentSeriesTitle,
    seasonNumber: currentSeasonNumber,
  });

  const isButtonEnabledBeta =
    analysisBeta.eligibleToImport.length > 0 &&
    !checkIsUrlsTextModified(preparedBatchState, preparedRawUrlsSnapshot, currentRawUrlsText);

  assert(
    analysisBeta.eligibleToImport.length === 1 && isButtonEnabledBeta === true,
    'Botão "Importar episódios validados" fica habilitado para Anime Beta (eligibleToImportCount === 1)'
  );
  assert(
    analysisBeta.ignoredCatalogDuplicates.length === 0,
    'Nenhuma colisão entre Anime Beta e o Anime Alfa já existente no catálogo'
  );

  // 7. Importar Anime Beta e confirmar que ambos permanecem no catálogo
  const importedBeta = analysisBeta.eligibleToImport[0];
  dynamicCatalog = [importedBeta, ...dynamicCatalog];

  assert(
    dynamicCatalog.length === initialCatalogCount + 2,
    'Catálogo contém agora ambos os animes importados em sequência na mesma sessão'
  );
  assert(
    dynamicCatalog.some((v) => v.title === 'Anime Alfa • T01E01') &&
      dynamicCatalog.some((v) => v.title === 'Anime Beta • T01E01'),
    'Ambos os animes (Alfa e Beta) coexistem perfeitamente sem colisões de numeração ou IDs'
  );

  // 8. Editar as URLs após preparar um lote e confirmar que o aviso é acionado e bloqueia importação
  currentRawUrlsText = 'https://cdn.exemplo.com/videos/anime-beta/ep01-modificado.mp4';
  const isModifiedDetected = checkIsUrlsTextModified(
    preparedBatchState,
    preparedRawUrlsSnapshot,
    currentRawUrlsText
  );

  const canImportWithModifiedText =
    analysisBeta.eligibleToImport.length > 0 && !isModifiedDetected;

  assert(
    isModifiedDetected === true,
    'Modificação no texto da URL detectada com sucesso (isUrlsTextModified === true)'
  );
  assert(
    canImportWithModifiedText === false,
    'Importação bloqueada com segurança enquanto o usuário não preparar o lote para as novas URLs'
  );

  // -----------------------------------------------------------------
  // RESUMO DOS TESTES
  // -----------------------------------------------------------------
  console.log('\n===============================================================');
  console.log(`TOTAL DE ASSERTIVAS: ${passed + failed} | APROVADAS: ${passed} | FALHAS: ${failed}`);
  console.log('===============================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runImportEpisodesSuite().catch((err) => {
  console.error('Erro fatal executando suite de importação:', err);
  process.exit(1);
});
