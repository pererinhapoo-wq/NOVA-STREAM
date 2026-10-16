import {
  parseVideoSeriesMetadata,
  getSeasonEpisodeAnalysis,
  normalizeSeriesTitle,
} from '../src/services/animeSeriesGrouping';
import {
  buildImportCandidates,
  getEpisodeSeriesKey,
  PreparedQueueItem,
} from '../src/services/importEpisodes';
import { VideoItem } from '../src/types/video';

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

async function runEpisodeNumberingSuite() {
  console.log('===============================================================');
  console.log('SUITE DE TESTES: IDENTIFICAÇÃO E NUMERAÇÃO DE EPISÓDIOS (NOVA STREAM)');
  console.log('===============================================================\n');

  // Vídeo legado existente no catálogo conforme reproduzido pelo usuário
  const existingAotVideo: VideoItem = {
    id: 'custom-aot-01',
    title: 'Attack on Titan temporada 1',
    description: 'Vídeo importado pelo usuário para Attack on Titan',
    duration: 1420,
    durationFormatted: '23:40',
    category: 'Treinamentos & Tutoriais',
    tags: ['Anime', 'Ação'],
    posterUrl: 'https://example.com/aot.jpg',
    videoUrl: 'https://cdn.exemplo.com/aot/ep1.mp4',
    isDemo: false,
    createdAt: '2026-03-15T10:00:00Z',
    resolution: '1080p',
    uploadStatus: 'pronto',
  };

  const currentCatalog: VideoItem[] = [existingAotVideo];

  // -----------------------------------------------------------------
  // 1. ANÁLISE DO VÍDEO EXISTENTE "Attack on Titan temporada 1"
  // -----------------------------------------------------------------
  console.log('--- 1. ANÁLISE DO VÍDEO EXISTENTE "Attack on Titan temporada 1" ---');
  const parsed = parseVideoSeriesMetadata(existingAotVideo);
  assert(parsed.isSeries === true, 'Vídeo identificado como série');
  assert(parsed.seriesTitle === 'Attack on Titan', 'Título da série extraído como "Attack on Titan"');
  assert(parsed.seasonNumber === 1, 'Temporada identificada como 1');
  assert(parsed.episodeNumber === null, 'NÃO presume EP 01 pelo título (episodeNumber === null)');
  assert(parsed.isConfirmedNumber === false, 'isConfirmedNumber marcado honestamente como false');
  assert(typeof parsed.unconfirmedNotice === 'string', 'Aviso de numeração não confirmada preenchido');

  // -----------------------------------------------------------------
  // 2. SUGESTÃO AUTOMÁTICA DE NUMERAÇÃO BASEADA NO CATÁLOGO
  // -----------------------------------------------------------------
  console.log('\n--- 2. SUGESTÃO AUTOMÁTICA DE NUMERAÇÃO BASEADA NO CATÁLOGO ---');
  const analysis = getSeasonEpisodeAnalysis(currentCatalog, 'Attack on Titan', 1);

  assert(analysis.totalVideosInSeason === 1, 'Detecta 1 vídeo existente na Temporada 1');
  assert(analysis.confirmedCount === 0, '0 episódios com numeração confirmada');
  assert(analysis.unconfirmedCount === 1, '1 vídeo com numeração não confirmada');
  assert(analysis.hasAmbiguity === true, 'Ambiguidade sinalizada com precisão (hasAmbiguity === true)');
  assert(
    analysis.suggestedNextEpisodeNumber === 2,
    `Sugere automaticamente o EP 02 como próximo disponível (sugerido: ${analysis.suggestedNextEpisodeNumber})`
  );
  assert(
    typeof analysis.ambiguityNotice === 'string' &&
      analysis.ambiguityNotice.includes('Attack on Titan temporada 1') &&
      analysis.ambiguityNotice.includes('EP 02'),
    'Mensagem de ambiguidade clara cita o vídeo legado e sugere EP 02'
  );

  // -----------------------------------------------------------------
  // 3. IMPORTAÇÃO AUTOMÁTICA DO SEGUNDO EPISÓDIO (EP 02)
  // -----------------------------------------------------------------
  console.log('\n--- 3. IMPORTAÇÃO AUTOMÁTICA DO SEGUNDO EPISÓDIO (EP 02) ---');
  const batchForEp2: PreparedQueueItem[] = [
    {
      episodeNumber: analysis.suggestedNextEpisodeNumber, // 2
      originalLineNumber: 1,
      rawUrl: 'https://cdn.exemplo.com/aot/ep2.mp4',
      sanitizedUrl: 'https://cdn.exemplo.com/aot/ep2.mp4',
      status: 'pendente',
      statusMessage: 'Sintaxe válida',
      seriesTitle: 'Attack on Titan',
      seasonNumber: 1,
      networkStatus: 'midia_compativel',
      networkResult: {
        httpStatus: 200,
        contentType: 'video/mp4',
        contentLength: 45000000,
        isMediaCompatible: true,
        supportsRangeRequests: true,
        timingMs: 120,
        diagnosticLevel: 'midia_compativel',
        diagnosticMessage: 'Mídia compatível',
      },
    },
  ];

  const importResult = buildImportCandidates(batchForEp2, currentCatalog, {
    seriesTitle: 'Attack on Titan',
    seasonNumber: 1,
  });

  assert(importResult.eligibleToImport.length === 1, 'Segundo episódio (EP 02) aceito com sucesso');
  assert(importResult.ignoredCatalogDuplicates.length === 0, '0 duplicatas ou bloqueios indevidos');
  assert(
    importResult.eligibleToImport[0].title === 'Attack on Titan • T01E02',
    `Título construído preserva formato honesto: "${importResult.eligibleToImport[0].title}"`
  );
  assert(
    importResult.eligibleToImport[0].tags.includes('E02'),
    'Tags incluem a tag de identificação "E02"'
  );
  assert(
    existingAotVideo.title === 'Attack on Titan temporada 1' &&
      existingAotVideo.id === 'custom-aot-01',
    'Vídeo existente "Attack on Titan temporada 1" preservado intacto sem alterações de ID ou título'
  );

  // -----------------------------------------------------------------
  // 4. CADASTRO MANUAL DO EPISÓDIO 2 (PRESERVAÇÃO ESTRITA DO NÚMERO 2)
  // -----------------------------------------------------------------
  console.log('\n--- 4. CADASTRO MANUAL DO EPISÓDIO 2 (PRESERVAÇÃO ESTRITA DO NÚMERO 2) ---');
  const manualBatchEp2: PreparedQueueItem[] = [
    {
      episodeNumber: 2, // Entrada manual explícita
      originalLineNumber: 1,
      rawUrl: 'https://cdn.exemplo.com/aot/manual_ep2.mp4',
      sanitizedUrl: 'https://cdn.exemplo.com/aot/manual_ep2.mp4',
      status: 'pendente',
      statusMessage: 'Sintaxe válida',
      seriesTitle: 'Attack on Titan',
      seasonNumber: 1,
      networkStatus: 'midia_compativel',
      networkResult: {
        httpStatus: 200,
        contentType: 'video/mp4',
        contentLength: 48000000,
        isMediaCompatible: true,
        supportsRangeRequests: true,
        timingMs: 110,
        diagnosticLevel: 'midia_compativel',
        diagnosticMessage: 'Mídia compatível',
      },
    },
  ];

  const manualResult = buildImportCandidates(manualBatchEp2, currentCatalog, {
    seriesTitle: 'Attack on Titan',
    seasonNumber: 1,
  });

  assert(manualResult.eligibleToImport.length === 1, 'Episódio 2 manual aceito com sucesso');
  assert(
    manualResult.eligibleToImport[0].title === 'Attack on Titan • T01E02',
    'Número 2 rigorosamente preservado na importação manual'
  );

  // -----------------------------------------------------------------
  // 5. BLOQUEIO DE DUPLICATA QUANDO EP 01 ESTÁ CONFIRMADO NO CATÁLOGO
  // -----------------------------------------------------------------
  console.log('\n--- 5. BLOQUEIO DE DUPLICATA QUANDO EP 01 ESTÁ CONFIRMADO NO CATÁLOGO ---');
  const confirmedEp1Video: VideoItem = {
    id: 'aot-confirmed-ep01',
    title: 'Attack on Titan • T01E01',
    description: 'Primeiro episódio oficial',
    duration: 1420,
    durationFormatted: '23:40',
    category: 'Treinamentos & Tutoriais',
    tags: ['Série', 'T1', 'E01', 'Attack on Titan'],
    posterUrl: 'https://example.com/aot.jpg',
    videoUrl: 'https://cdn.exemplo.com/aot/confirmed_ep1.mp4',
    isDemo: false,
    createdAt: '2026-03-15T10:00:00Z',
    resolution: '1080p',
    uploadStatus: 'pronto',
  };

  const catalogWithConfirmedEp1: VideoItem[] = [confirmedEp1Video];

  // Tentativa de importar outro EP 01 para a mesma obra e temporada
  const duplicateEp1Batch: PreparedQueueItem[] = [
    {
      episodeNumber: 1,
      originalLineNumber: 1,
      rawUrl: 'https://cdn.exemplo.com/aot/different_url_ep1.mp4',
      sanitizedUrl: 'https://cdn.exemplo.com/aot/different_url_ep1.mp4',
      status: 'pendente',
      statusMessage: 'Sintaxe válida',
      seriesTitle: 'Attack on Titan',
      seasonNumber: 1,
      networkStatus: 'midia_compativel',
      networkResult: {
        httpStatus: 200,
        contentType: 'video/mp4',
        contentLength: 40000000,
        isMediaCompatible: true,
        supportsRangeRequests: true,
        timingMs: 95,
        diagnosticLevel: 'midia_compativel',
        diagnosticMessage: 'Mídia compatível',
      },
    },
  ];

  const duplicateResult = buildImportCandidates(duplicateEp1Batch, catalogWithConfirmedEp1, {
    seriesTitle: 'Attack on Titan',
    seasonNumber: 1,
  });

  assert(
    duplicateResult.eligibleToImport.length === 0,
    'Tentativa de criar outro EP 01 bloqueada com sucesso (0 elegíveis)'
  );
  assert(
    duplicateResult.ignoredCatalogDuplicates.length === 1 &&
      duplicateResult.ignoredCatalogDuplicates[0].status === 'conflito_numeracao',
    'Classificado honestamente como conflito_numeracao'
  );
  assert(
    duplicateResult.ignoredCatalogDuplicates[0].reason.includes('T01E01'),
    `Motivo explicita conflito de numeração: "${duplicateResult.ignoredCatalogDuplicates[0].reason}"`
  );

  // Tentativa de importar EP 02 no catálogo com EP 01 confirmado DEVE ser permitida
  const ep2OnConfirmedCatalogBatch: PreparedQueueItem[] = [
    {
      episodeNumber: 2,
      originalLineNumber: 1,
      rawUrl: 'https://cdn.exemplo.com/aot/ep2_new.mp4',
      sanitizedUrl: 'https://cdn.exemplo.com/aot/ep2_new.mp4',
      status: 'pendente',
      statusMessage: 'Sintaxe válida',
      seriesTitle: 'Attack on Titan',
      seasonNumber: 1,
      networkStatus: 'midia_compativel',
      networkResult: {
        httpStatus: 200,
        contentType: 'video/mp4',
        contentLength: 50000000,
        isMediaCompatible: true,
        supportsRangeRequests: true,
        timingMs: 100,
        diagnosticLevel: 'midia_compativel',
        diagnosticMessage: 'Mídia compatível',
      },
    },
  ];

  const ep2Result = buildImportCandidates(ep2OnConfirmedCatalogBatch, catalogWithConfirmedEp1, {
    seriesTitle: 'Attack on Titan',
    seasonNumber: 1,
  });

  assert(ep2Result.eligibleToImport.length === 1, 'EP 02 permitido sem impedimento no catálogo com EP 01');
  assert(ep2Result.ignoredCatalogDuplicates.length === 0, 'Nenhum conflito de duplicata para o EP 02');

  // -----------------------------------------------------------------
  // 6. SUGESTÃO APÓS EP 01 CONFIRMADO
  // -----------------------------------------------------------------
  console.log('\n--- 6. SUGESTÃO APÓS EP 01 CONFIRMADO ---');
  const analysisAfterConfirmed = getSeasonEpisodeAnalysis(catalogWithConfirmedEp1, 'Attack on Titan', 1);
  assert(
    analysisAfterConfirmed.highestConfirmedEpisode === 1,
    'Identifica maior episódio confirmado como 1'
  );
  assert(
    analysisAfterConfirmed.suggestedNextEpisodeNumber === 2,
    'Próximo episódio sugerido é 2'
  );
  assert(
    analysisAfterConfirmed.hasAmbiguity === false,
    'Sem ambiguidade quando todos os episódios têm numeração confirmada'
  );

  // -----------------------------------------------------------------
  // RESUMO FINAL
  // -----------------------------------------------------------------
  console.log('\n===============================================================');
  console.log(`TOTAL DE ASSERTIVAS: ${passed + failed} | APROVADAS: ${passed} | FALHAS: ${failed}`);
  console.log('===============================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runEpisodeNumberingSuite();
