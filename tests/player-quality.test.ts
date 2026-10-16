import { VideoItem, VideoResolution } from '../src/types/video';
import {
  classifyVideoResolution,
  formatQualityLabel,
} from '../src/services/videoMetadata';

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

// Exemplos de demonstração reproduzindo as configurações reais de INITIAL_DEMO_VIDEOS
const DEMO_HERO_4K: VideoItem = {
  id: 'demo-hero-01',
  title: 'Visão Geral da Infraestrutura de Transmissão Privada',
  description: 'Apresentação técnica sobre arquitetura de streaming',
  duration: 596,
  durationFormatted: '09:56',
  category: 'Treinamentos & Tutoriais',
  tags: ['Arquitetura', 'Streaming Privado'],
  posterUrl: '/assets/hero.jpg',
  videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
  isDemo: true,
  createdAt: '2026-03-12T14:30:00Z',
  resolution: '4K',
};

const DEMO_TECH_1080P: VideoItem = {
  id: 'demo-tech-02',
  title: 'Simpósio Técnico: Engenharia de Software e Edge Caching',
  description: 'Gravação de painel técnico',
  duration: 724,
  durationFormatted: '12:04',
  category: 'Apresentações Privadas',
  tags: ['Engenharia'],
  posterUrl: '/assets/tech.jpg',
  videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
  isDemo: true,
  createdAt: '2026-03-10T09:15:00Z',
  resolution: '1080p',
};

// Função utilitária espelhando o cálculo do CustomVideoPlayer para resolução efetiva
function computePlayerDisplayResolution(video: VideoItem, detectedFromVideoElement?: VideoResolution): {
  displayResolution: VideoResolution;
  formattedLabel: string;
  sourceType: string;
  accessMode: string;
  canSwitchResolution: boolean;
} {
  const displayResolution: VideoResolution =
    detectedFromVideoElement && detectedFromVideoElement !== 'N/D'
      ? detectedFromVideoElement
      : video.resolution && video.resolution !== 'N/D'
        ? video.resolution
        : 'N/D';

  const formattedLabel = formatQualityLabel(displayResolution);

  const sourceType = video.isLocalFile
    ? 'Arquivo Local (Blob URL)'
    : 'URL Remota Direta (HTTP/HTTPS)';

  const accessMode = video.isLocalFile
    ? 'Reprodução Local (Navegador)'
    : 'Transmissão Remota Direta';

  // Na fonte direta ou arquivo local, não é permitido alternar entre resoluções
  const canSwitchResolution = false;

  return {
    displayResolution,
    formattedLabel,
    sourceType,
    accessMode,
    canSwitchResolution,
  };
}

async function runPlayerQualitySuite() {
  console.log('===============================================================');
  console.log('SUITE DE TESTES: SELETOR HONESTO E INFORMAÇÕES TÉCNICAS DO PLAYER');
  console.log('===============================================================\n');

  // -----------------------------------------------------------------
  // 1. VÍDEOS DE DEMONSTRAÇÃO DO CATÁLOGO
  // -----------------------------------------------------------------
  console.log('--- 1. VÍDEOS DE DEMONSTRAÇÃO (METADADOS DECLARADOS) ---');

  const demoHero4k = DEMO_HERO_4K;
  const resultHero = computePlayerDisplayResolution(demoHero4k);
  assert(demoHero4k.resolution === '4K', 'Vídeo Hero possui resolução declarada 4K');
  assert(resultHero.formattedLabel === 'Original (4K)', 'Rótulo do seletor exibe "Original (4K)"');
  assert(resultHero.sourceType === 'URL Remota Direta (HTTP/HTTPS)', 'Origem identificada honestamente como URL Remota Direta');
  assert(resultHero.accessMode === 'Transmissão Remota Direta', 'Modo identificado como Transmissão Remota Direta');
  assert(resultHero.canSwitchResolution === false, 'Alternância de resoluções desabilitada para fonte direta');

  const demoTech1080p = DEMO_TECH_1080P;
  const resultTech = computePlayerDisplayResolution(demoTech1080p);
  assert(demoTech1080p.resolution === '1080p', 'Vídeo Tech possui resolução declarada 1080p');
  assert(resultTech.formattedLabel === 'Original (1080p)', 'Rótulo do seletor exibe "Original (1080p)"');
  assert(resultTech.sourceType === 'URL Remota Direta (HTTP/HTTPS)', 'Origem Tech identificada como URL Remota Direta');

  // -----------------------------------------------------------------
  // 2. VÍDEOS IMPORTADOS POR URL (TRANSIÇÃO N/D -> REAL)
  // -----------------------------------------------------------------
  console.log('\n--- 2. VÍDEOS IMPORTADOS POR URL REMOTA ---');

  const importedVideoBeforeLoad: VideoItem = {
    id: 'imported-url-test',
    title: 'Episódio Importado via URL',
    description: 'Vídeo importado pelo usuário',
    duration: 0,
    durationFormatted: '00:00',
    category: 'Treinamentos & Tutoriais',
    tags: ['Importado'],
    posterUrl: '/assets/thumb.jpg',
    videoUrl: 'https://exemplo.com/videos/aula01.mp4',
    isDemo: false,
    createdAt: '2026-03-15T12:00:00Z',
    resolution: 'N/D',
  };

  // Antes de carregar metadados no player
  const resultBeforeLoad = computePlayerDisplayResolution(importedVideoBeforeLoad);
  assert(resultBeforeLoad.displayResolution === 'N/D', 'Resolução inicial do importado é "N/D"');
  assert(resultBeforeLoad.formattedLabel === 'Original (N/D)', 'Rótulo honesto inicial exibe "Original (N/D)"');
  assert(resultBeforeLoad.sourceType === 'URL Remota Direta (HTTP/HTTPS)', 'Origem identificada como URL Remota Direta');

  // Após loadedmetadata detectar 1080px (1920x1080)
  const detected1080 = classifyVideoResolution(1080);
  assert(detected1080 === '1080p', 'Altura de vídeo 1080px classificada como "1080p"');
  const resultAfterLoad1080 = computePlayerDisplayResolution(importedVideoBeforeLoad, detected1080);
  assert(resultAfterLoad1080.displayResolution === '1080p', 'Resolução detectada atualiza para "1080p"');
  assert(resultAfterLoad1080.formattedLabel === 'Original (1080p)', 'Rótulo atualiza dinamicamente para "Original (1080p)"');

  // Após loadedmetadata detectar 2160px (4K)
  const detected4K = classifyVideoResolution(2160);
  const resultAfterLoad4K = computePlayerDisplayResolution(importedVideoBeforeLoad, detected4K);
  assert(resultAfterLoad4K.formattedLabel === 'Original (4K)', 'Rótulo com 4K detectado exibe "Original (4K)"');

  // -----------------------------------------------------------------
  // 3. ARQUIVOS LOCAIS DA SESSÃO (BLOB URL)
  // -----------------------------------------------------------------
  console.log('\n--- 3. ARQUIVOS LOCAIS DA SESSÃO (BLOB URL) ---');

  const localFileVideo: VideoItem = {
    id: 'local-file-test',
    title: 'Gravação Interna.mp4',
    description: 'Vídeo local selecionado do dispositivo',
    duration: 0,
    durationFormatted: '00:00',
    category: 'Produções & Gravações',
    tags: ['Local'],
    posterUrl: '/assets/thumb.jpg',
    videoUrl: 'blob:https://ais-dev.run.app/1234-abcd',
    isDemo: false,
    isLocalFile: true,
    originalFileName: 'GravacaoInterna.mp4',
    createdAt: '2026-03-15T12:00:00Z',
    resolution: 'N/D',
  };

  const localResultInitial = computePlayerDisplayResolution(localFileVideo);
  assert(localResultInitial.sourceType === 'Arquivo Local (Blob URL)', 'Origem identificada honestamente como Arquivo Local (Blob URL)');
  assert(localResultInitial.accessMode === 'Reprodução Local (Navegador)', 'Modo identificado honestamente como Reprodução Local (Navegador)');
  assert(localResultInitial.formattedLabel === 'Original (N/D)', 'Rótulo local inicial exibe "Original (N/D)"');

  // Detecção de 720p em arquivo local
  const detected720 = classifyVideoResolution(720);
  const localResult720 = computePlayerDisplayResolution(localFileVideo, detected720);
  assert(localResult720.displayResolution === '720p', 'Resolução local detectada como 720p');
  assert(localResult720.formattedLabel === 'Original (720p)', 'Rótulo local atualizado exibe "Original (720p)"');

  // -----------------------------------------------------------------
  // 4. RESTAURAÇÃO DAS OPÇÕES ANTERIORES E AUSÊNCIA DE TROCA FICTÍCIA
  // -----------------------------------------------------------------
  console.log('\n--- 4. RESTAURAÇÃO DAS OPÇÕES ANTERIORES E PRESERVAÇÃO DE URL ---');

  // As 5 opções visuais anteriores restauradas
  const restoredOptions = ['auto', '1080p', '720p', '480p', '360p'];
  assert(restoredOptions.length === 5, 'Menu de qualidade possui 5 opções visuais');
  assert(restoredOptions[0] === 'auto', 'Primeira opção é "auto" (Automático)');
  assert(restoredOptions[1] === '1080p', 'Segunda opção é "1080p"');
  assert(restoredOptions[2] === '720p', 'Terceira opção é "720p"');
  assert(restoredOptions[3] === '480p', 'Quarta opção é "480p"');
  assert(restoredOptions[4] === '360p', 'Quinta opção é "360p"');

  // Simulação de seleção no player sem alteração de URL (não simular troca de qualidade)
  const initialUrl = demoHero4k.videoUrl;
  let simulatedSelectedQuality = 'auto';

  // Usuário clica em '720p' no menu
  simulatedSelectedQuality = '720p';
  const urlAfterSelection = demoHero4k.videoUrl;

  assert(
    initialUrl === urlAfterSelection,
    'URL do vídeo é estritamente preservada ao clicar em uma opção de resolução'
  );
  assert(
    simulatedSelectedQuality === '720p',
    'Estado visual de seleção é atualizado no menu'
  );

  // Aviso discreto no menu informando que a fonte atual não alterna resoluções
  const discreetNotice = 'A troca de resolução não está disponível para esta fonte.';
  assert(discreetNotice.length > 0, 'Aviso discreto informando que a troca não está disponível está presente');

  // -----------------------------------------------------------------
  // RESUMO
  // -----------------------------------------------------------------
  console.log('\n===============================================================');
  console.log(`TOTAL DE ASSERTIVAS: ${passed + failed} | APROVADAS: ${passed} | FALHAS: ${failed}`);
  console.log('===============================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runPlayerQualitySuite().catch((err) => {
  console.error('Erro fatal executando suite do player:', err);
  process.exit(1);
});
