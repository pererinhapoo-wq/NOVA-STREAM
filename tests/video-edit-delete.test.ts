import {
  parseVideoSeriesMetadata,
  groupVideosByAnimeAndSeason,
} from '../src/services/animeSeriesGrouping';
import { VideoItem } from '../src/types/video';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++;
    console.log(`  [OK] ${message}`);
  } else {
    failed++;
    console.error(`  [FALHA] ${message}`);
  }
}

console.log('\n===============================================================');
console.log('SUITE DE TESTES: EDIÇÃO E EXCLUSÃO DE VÍDEOS NA BIBLIOTECA');
console.log('===============================================================\n');

// 1. ESTADO INICIAL
const initialVideos: VideoItem[] = [
  {
    id: 'aot-orig',
    title: 'Attack on Titan temporada 1',
    description: 'Episódio piloto original',
    duration: 1420,
    durationFormatted: '23:40',
    category: 'Documentários & Demos',
    tags: ['AOT', 'Anime'],
    posterUrl: 'https://images.unsplash.com/photo-1',
    videoUrl: 'https://example.com/aot-01.mp4',
    isDemo: false,
    createdAt: '2026-01-01T00:00:00Z',
    resolution: '1080p',
  },
  {
    id: 'aot-ep02',
    title: 'Attack on Titan • T01E02',
    description: 'Segundo episódio da temporada 1',
    duration: 1420,
    durationFormatted: '23:40',
    category: 'Documentários & Demos',
    tags: ['Série', 'T01', 'E02'],
    posterUrl: 'https://images.unsplash.com/photo-2',
    videoUrl: 'https://example.com/aot-02.mp4',
    isDemo: false,
    createdAt: '2026-01-02T00:00:00Z',
    resolution: '1080p',
  },
  {
    id: 'demo-standalone',
    title: 'Apresentação Corporativa',
    description: 'Vídeo institucional avulso',
    duration: 600,
    durationFormatted: '10:00',
    category: 'Apresentações Privadas',
    tags: ['Corporativo'],
    posterUrl: 'https://images.unsplash.com/photo-3',
    videoUrl: 'https://example.com/demo.mp4',
    isDemo: true,
    createdAt: '2026-01-03T00:00:00Z',
    resolution: '4K',
  },
];

console.log('--- 1. VERIFICAÇÃO DO AGRUPAMENTO INICIAL ---');
let grouped = groupVideosByAnimeAndSeason(initialVideos);
assert(grouped.animes.length === 1, '1 coleção de anime detectada inicialmente');
assert(grouped.animes[0].title === 'Attack on Titan', 'Título do anime é "Attack on Titan"');
assert(grouped.animes[0].totalEpisodes === 2, 'Total de 2 episódios no anime inicialmente');
assert(grouped.standalones.length === 1, '1 vídeo avulso detectado');

console.log('\n--- 2. EDIÇÃO DE METADADOS DE UM EPISÓDIO ---');
// Simulando handleSaveEditedVideo no episódio 2
const updatedEp02: VideoItem = {
  ...initialVideos[1],
  title: 'Attack on Titan • T01E02 - O Retorno',
  description: 'Sinopse atualizada pelo usuário',
  category: 'Produções & Gravações',
  resolution: '4K',
  tags: ['Série', 'T01', 'E02', 'Atualizado'],
};

const videosAfterEdit = initialVideos.map((v) => (v.id === updatedEp02.id ? updatedEp02 : v));

assert(videosAfterEdit.length === 3, 'Tamanho do catálogo preservado após edição (3 vídeos)');
assert(videosAfterEdit[1].title === 'Attack on Titan • T01E02 - O Retorno', 'Título do episódio atualizado');
assert(videosAfterEdit[1].resolution === '4K', 'Resolução atualizada para 4K');
assert(videosAfterEdit[1].category === 'Produções & Gravações', 'Categoria atualizada');
assert(videosAfterEdit[0].id === 'aot-orig', 'Outros vídeos permanecem com IDs originais');
assert(videosAfterEdit[0].title === 'Attack on Titan temporada 1', 'Outros vídeos mantêm dados inalterados');
assert(videosAfterEdit[2].isDemo === true, 'Flag de demonstração preservada');

// Re-agrupamento após edição
grouped = groupVideosByAnimeAndSeason(videosAfterEdit);
assert(grouped.animes[0].totalEpisodes === 2, 'Contagem total de episódios mantida em 2 após edição');
assert(grouped.animes[0].seasons[0].episodes.length === 2, 'Temporada continua com 2 episódios');

console.log('\n--- 3. EXCLUSÃO PONTUAL DE UM EPISÓDIO (LIXEIRA) ---');
// Simulando handleDeleteVideo no episódio 2
const videosAfterDeleteEp02 = videosAfterEdit.filter((v) => v.id !== 'aot-ep02');

assert(videosAfterDeleteEp02.length === 2, 'Catálogo reduzido para 2 vídeos após exclusão');
assert(!videosAfterDeleteEp02.some((v) => v.id === 'aot-ep02'), 'Episódio aot-ep02 foi removido');
assert(videosAfterDeleteEp02.some((v) => v.id === 'aot-orig'), 'Episódio aot-orig preservado intacto');
assert(videosAfterDeleteEp02.some((v) => v.id === 'demo-standalone'), 'Vídeo avulso preservado intacto');

// Re-agrupamento após exclusão do episódio 2
grouped = groupVideosByAnimeAndSeason(videosAfterDeleteEp02);
assert(grouped.animes.length === 1, 'Coleção Attack on Titan ainda existe');
assert(grouped.animes[0].totalEpisodes === 1, 'Contagem de episódios do anime atualizada para 1');
assert(grouped.animes[0].seasons[0].episodes.length === 1, 'Temporada 1 atualizada para 1 episódio');
assert(grouped.animes[0].seasons[0].episodes[0].video.id === 'aot-orig', 'Episódio restante é o aot-orig');

console.log('\n--- 4. EXCLUSÃO DO ÚLTIMO EPISÓDIO DE UM ANIME ---');
// Simulando exclusão do último episódio
const videosAfterDeleteAllEpisodes = videosAfterDeleteEp02.filter((v) => v.id !== 'aot-orig');

assert(videosAfterDeleteAllEpisodes.length === 1, 'Catálogo reduzido para 1 vídeo');
grouped = groupVideosByAnimeAndSeason(videosAfterDeleteAllEpisodes);
assert(grouped.animes.length === 0, 'Nenhuma pasta de anime vazia permanece no catálogo');
assert(grouped.standalones.length === 1, 'Vídeo avulso demo-standalone permanece preservado');

console.log('\n--- 5. EXCLUSÃO DE VÍDEO AVULSO ---');
const emptyCatalog = videosAfterDeleteAllEpisodes.filter((v) => v.id !== 'demo-standalone');
assert(emptyCatalog.length === 0, 'Catálogo vazio quando todos os vídeos são removidos');
grouped = groupVideosByAnimeAndSeason(emptyCatalog);
assert(grouped.animes.length === 0, '0 animes no catálogo vazio');
assert(grouped.standalones.length === 0, '0 avulsos no catálogo vazio');

console.log('\n===============================================================');
console.log(`TOTAL DE ASSERTIVAS: ${passed + failed} | APROVADAS: ${passed} | FALHAS: ${failed}`);
console.log('===============================================================\n');

if (failed > 0) {
  process.exit(1);
}
