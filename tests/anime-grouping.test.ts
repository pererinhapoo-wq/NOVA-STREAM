import {
  parseVideoSeriesMetadata,
  groupVideosByAnimeAndSeason,
  normalizeSeriesTitle,
} from '../src/services/animeSeriesGrouping';
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

async function runAnimeGroupingSuite() {
  console.log('===============================================================');
  console.log('SUITE DE TESTES: HIERARQUIA DE ANIMES, TEMPORADAS E EPISÓDIOS');
  console.log('===============================================================\n');

  const existingAotVideo: VideoItem = {
    id: 'custom-aot-01',
    title: 'Attack on Titan temporada 1',
    description: 'Vídeo importado pelo usuário para Attack on Titan',
    duration: 1420,
    durationFormatted: '23:40',
    category: 'Treinamentos & Tutoriais',
    tags: ['Anime', 'Ação'],
    posterUrl: 'https://example.com/aot.jpg',
    videoUrl: 'https://example.com/aot_video.mp4',
    isDemo: false,
    createdAt: '2026-03-15T10:00:00Z',
    resolution: '1080p',
    uploadStatus: 'pronto',
  };

  const demoStandalones: VideoItem[] = [
    {
      id: 'demo-hero-01',
      title: 'Visão Geral da Infraestrutura de Transmissão Privada',
      description: 'Vídeo de demonstração técnica',
      duration: 596,
      durationFormatted: '09:56',
      category: 'Treinamentos & Tutoriais',
      tags: ['Arquitetura', 'Segurança'],
      posterUrl: 'https://example.com/demo1.jpg',
      videoUrl: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
      isDemo: true,
      createdAt: '2026-03-12T14:30:00Z',
      resolution: '4K',
    },
    {
      id: 'demo-nature-03',
      title: 'Capturas de Teste de Cores & HDR: Paisagens Nórdicas',
      description: 'Demonstração Tears of Steel',
      duration: 380,
      durationFormatted: '06:20',
      category: 'Documentários & Demos',
      tags: ['Calibração'],
      posterUrl: 'https://example.com/demo3.jpg',
      videoUrl: 'https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8',
      isDemo: true,
      createdAt: '2026-03-08T18:00:00Z',
      resolution: '4K',
    },
  ];

  console.log('--- 1. PRESERVAÇÃO E PARSER DO VÍDEO EXISTENTE (ATTACK ON TITAN TEMPORADA 1) ---');
  const parsedAot = parseVideoSeriesMetadata(existingAotVideo);
  assert(parsedAot.isSeries === true, 'Vídeo identificado como série/anime');
  assert(parsedAot.seriesTitle === 'Attack on Titan', 'Título do anime extraído como "Attack on Titan"');
  assert(parsedAot.seasonNumber === 1, 'Temporada identificada como 1');
  assert(parsedAot.episodeNumber === null, 'NÃO presume EP 01 apenas pelo título (episodeNumber === null)');
  assert(parsedAot.isConfirmedNumber === false, 'Numeração marcada honestamente como não confirmada (isConfirmedNumber === false)');
  assert(typeof parsedAot.unconfirmedNotice === 'string', 'Aviso explícito de numeração não confirmada preenchido');

  console.log('\n--- 2. RECONHECIMENTO DE EPISÓDIOS IMPORTADOS POR LOTE ("NOME • T01E01") ---');
  const ep1: VideoItem = {
    ...existingAotVideo,
    id: 'aot-s01e01',
    title: 'Attack on Titan • T01E01',
  };
  const ep2: VideoItem = {
    ...existingAotVideo,
    id: 'aot-s01e02',
    title: 'Attack on Titan • T01E02',
  };
  const parsedEp1 = parseVideoSeriesMetadata(ep1);
  assert(parsedEp1.isSeries === true, 'Episódio 1 identificado como série');
  assert(parsedEp1.episodeNumber === 1, 'Número do episódio 1 extraído com precisão (1)');
  assert(parsedEp1.isConfirmedNumber === true, 'Numeração do EP 01 marcada como confirmada');

  const parsedEp2 = parseVideoSeriesMetadata(ep2);
  assert(parsedEp2.episodeNumber === 2, 'Número do episódio 2 extraído com precisão (2)');
  assert(parsedEp2.isConfirmedNumber === true, 'Numeração do EP 02 marcada como confirmada');

  console.log('\n--- 3. AGRUPAMENTO EM PASTAS E PRESERVAÇÃO DE VÍDEOS AVULSOS ---');
  const catalog = [existingAotVideo, ep2, ep1, ...demoStandalones];
  const grouped = groupVideosByAnimeAndSeason(catalog);

  assert(grouped.animes.length === 1, '1 coleção de anime criada no total');
  const aotGroup = grouped.animes[0];
  assert(aotGroup.title === 'Attack on Titan', 'Título da coleção é "Attack on Titan"');
  assert(aotGroup.totalSeasons === 1, 'Total de temporadas é 1');
  assert(aotGroup.totalEpisodes === 3, 'Total de episódios na coleção é 3 (1 pré-existente + 2 importados)');

  // Preservação de avulsos
  assert(grouped.standalones.length === 2, 'Todos os vídeos avulsos/demonstrações foram preservados (2 avulsos)');
  assert(grouped.standalones.some((v) => v.id === 'demo-hero-01'), 'Demo Hero presente nos avulsos');
  assert(grouped.standalones.some((v) => v.id === 'demo-nature-03'), 'Demo Nature presente nos avulsos');

  console.log('\n--- 4. ORDENAÇÃO DE TEMPORADAS E EPISÓDIOS ---');
  const s2ep1: VideoItem = {
    ...existingAotVideo,
    id: 'aot-s02e01',
    title: 'Attack on Titan • T02E01',
  };
  const multiSeasonCatalog = [existingAotVideo, ep2, ep1, s2ep1];
  const multiGrouped = groupVideosByAnimeAndSeason(multiSeasonCatalog);
  const multiAot = multiGrouped.animes[0];

  assert(multiAot.totalSeasons === 2, '2 temporadas detectadas e ordenadas');
  assert(multiAot.seasons[0].seasonNumber === 1, 'Temporada 1 posicionada primeiro');
  assert(multiAot.seasons[1].seasonNumber === 2, 'Temporada 2 posicionada em segundo');

  const s1Episodes = multiAot.seasons[0].episodes;
  assert(s1Episodes[0].parsed.episodeNumber === 1, 'EP 01 posicionado antes do EP 02');
  assert(s1Episodes[1].parsed.episodeNumber === 2, 'EP 02 posicionado após EP 01');
  assert(s1Episodes[2].parsed.isConfirmedNumber === false, 'Episódio existente sem número posicionado com aviso sem conflito');

  console.log('\n--- 5. NORMALIZAÇÃO DE TÍTULOS ---');
  assert(normalizeSeriesTitle('Attack on Titan') === 'attack on titan', 'Normalização padrão');
  assert(normalizeSeriesTitle('ATTACK ON TITAN   ') === 'attack on titan', 'Normalização com maiúsculas e espaços');
  assert(normalizeSeriesTitle('Shingeki no Kyōjin') === 'shingeki no kyojin', 'Remoção de diacríticos e acentos');

  console.log('\n===============================================================');
  console.log(`TOTAL DE ASSERTIVAS: ${passed + failed} | APROVADAS: ${passed} | FALHAS: ${failed}`);
  console.log('===============================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runAnimeGroupingSuite().catch((err) => {
  console.error('Erro fatal na suíte:', err);
  process.exit(1);
});
