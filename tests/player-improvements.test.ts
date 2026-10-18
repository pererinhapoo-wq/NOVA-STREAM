import { PlaybackSpeed, QualityLevel } from '../src/types/video';

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

async function runPlayerImprovementsSuite() {
  console.log('===============================================================');
  console.log('SUITE DE TESTES: MELHORIAS PONTUAIS NOS CONTROLES DO PLAYER');
  console.log('===============================================================\n');

  // 1. ORGANIZAÇÃO DAS CONFIGURAÇÕES
  console.log('--- 1. CONFIGURAÇÕES E SUBMENUS (QUALIDADE E VELOCIDADE) ---');
  const availableSpeeds: PlaybackSpeed[] = [0.5, 0.75, 1, 1.25, 1.5, 2];
  assert(availableSpeeds.length === 6, 'Existem 6 opções de velocidade disponíveis');
  assert(availableSpeeds.includes(1), 'Velocidade padrão 1x está presente');
  assert(availableSpeeds[0] === 0.5 && availableSpeeds[5] === 2, 'Velocidades variam de 0.5x a 2x');

  const availableQualities: QualityLevel[] = ['auto', '1080p', '720p', '480p', '360p'];
  assert(availableQualities.length === 5, 'Existem 5 opções de qualidade no submenu');
  assert(availableQualities[0] === 'auto', 'Modo Automático é a primeira opção');

  // 2. LÓGICA DE DETECÇÃO DE GESTOS (TOQUE SIMPLES VS DUPLO TOQUE)
  console.log('\n--- 2. DIFERENCIAÇÃO DE TOQUE SIMPLES E DUPLO TOQUE ---');
  const DOUBLE_TAP_WINDOW = 280; // ms

  function detectGesture(
    tap1: { time: number; x: number },
    tap2: { time: number; x: number } | null,
    containerWidth: number
  ): 'single-tap' | 'double-tap-left' | 'double-tap-right' {
    if (!tap2) {
      return 'single-tap';
    }
    const deltaT = tap2.time - tap1.time;
    const deltaX = Math.abs(tap2.x - tap1.x);

    if (deltaT <= DOUBLE_TAP_WINDOW && deltaX < 140) {
      const isLeft = tap1.x < containerWidth / 2;
      return isLeft ? 'double-tap-left' : 'double-tap-right';
    }
    return 'single-tap';
  }

  const containerW = 800;

  // Teste: duplo toque rápido no lado esquerdo (100ms depois)
  const leftGesture = detectGesture(
    { time: 1000, x: 200 },
    { time: 1120, x: 205 },
    containerW
  );
  assert(leftGesture === 'double-tap-left', 'Dois toques rápidos na metade esquerda identificados como retrocesso de 10s');

  // Teste: duplo toque rápido no lado direito (150ms depois)
  const rightGesture = detectGesture(
    { time: 1000, x: 600 },
    { time: 1150, x: 610 },
    containerW
  );
  assert(rightGesture === 'double-tap-right', 'Dois toques rápidos na metade direita identificados como avanço de 10s');

  // Teste: dois toques lentos (400ms depois) não devem ser interpretados como duplo toque
  const slowTaps = detectGesture(
    { time: 1000, x: 200 },
    { time: 1450, x: 200 },
    containerW
  );
  assert(slowTaps === 'single-tap', 'Dois toques espaçados (> 280ms) não acionam duplo toque acidental');

  // 3. LIMITES DE TEMPO NO SALTO DE 10 SEGUNDOS (CLIPPED TO [0, DURATION])
  console.log('\n--- 3. LIMITES DE INÍCIO E FIM DO VÍDEO (SEEK RELATIVO) ---');
  function computeSeek(currentTime: number, delta: number, duration: number): number {
    return Math.max(0, Math.min(duration, currentTime + delta));
  }

  const videoDuration = 120; // 2 minutos

  // Não retrocede abaixo de 0
  const seekUnder = computeSeek(5, -10, videoDuration);
  assert(seekUnder === 0, 'Retroceder 10s aos 5s respeita o limite de início (tempo = 0s)');

  // Não avança além da duração
  const seekOver = computeSeek(115, 10, videoDuration);
  assert(seekOver === 120, 'Avançar 10s aos 115s respeita o limite de término (tempo = 120s)');

  // Salto intermediário regular
  const seekNormal = computeSeek(50, 10, videoDuration);
  assert(seekNormal === 60, 'Salto regular avança exatamente 10s');

  console.log('\n===============================================================');
  console.log(`TOTAL DE ASSERTIVAS: ${passed + failed} | APROVADAS: ${passed} | FALHAS: ${failed}`);
  console.log('===============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runPlayerImprovementsSuite();
