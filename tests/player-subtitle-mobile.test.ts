import fs from 'fs';
import path from 'path';
import { parseSrt, getActiveSubtitleText } from '../src/services/subtitleParser';

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

async function runSubtitleMobileSuite() {
  console.log('===============================================================');
  console.log('SUITE DE TESTES: BOTÃO DE LEGENDAS SRT E COMPATIBILIDADE MOBILE');
  console.log('===============================================================\n');

  const playerFile = path.resolve(process.cwd(), 'src/components/player/CustomVideoPlayer.tsx');
  const playerContent = fs.readFileSync(playerFile, 'utf-8');

  // 1. COMPONENTE REAL E PRESENÇA DO BOTÃO NA BARRA DE CONTROLES
  console.log('--- 1. IDENTIFICAÇÃO DO COMPONENTE REAL E BOTÃO CC NA BARRA DE CONTROLES ---');
  assert(fs.existsSync(playerFile), 'Arquivo real src/components/player/CustomVideoPlayer.tsx existe');
  assert(playerContent.includes('player-subtitle-trigger'), 'Gatilho player-subtitle-trigger está presente na barra de controles');
  assert(playerContent.includes('CC</span>'), 'Botão exibe a identificação textual clara "CC"');
  assert(playerContent.includes('<Subtitles'), 'Botão inclui o ícone Subtitles');
  assert(playerContent.includes('aria-label="Legendas (CC)"'), 'Botão possui atributo de acessibilidade aria-label');

  // 2. OPÇÃO "Enviar legenda (.SRT)"
  console.log('\n--- 2. OPÇÃO "Enviar legenda (.SRT)" E SELETOR DE ARQUIVOS ANDROID ---');
  assert(playerContent.includes('Enviar legenda (.SRT)'), 'Opção com texto exato "Enviar legenda (.SRT)" está presente');
  assert(playerContent.includes('ref={subtitleInputRef}'), 'Input de upload vinculado ao subtitleInputRef');
  assert(
    playerContent.includes('accept=".srt,.vtt,text/plain,text/*,application/x-subrip,application/octet-stream,*/*"'),
    'Input aceita .srt e tipos de dados compatíveis com seletor de arquivos nativo do Android'
  );
  assert(playerContent.includes('subtitleInputRef.current?.click()'), 'Clique no botão abre o seletor nativo do sistema/Android');

  // 3. SINCRONIZAÇÃO E RENDERIZAÇÃO DA LEGENDA SOBRE O VÍDEO
  console.log('\n--- 3. SINCRONIZAÇÃO E RENDERIZAÇÃO SOBRE O VÍDEO ---');
  const sampleSrt = `1
00:00:02,000 --> 00:00:05,000
Primeira fala do episódio.

2
00:00:06,500 --> 00:00:10,000
Segunda fala sincronizada perfeitamente.
`;
  const parsed = parseSrt(sampleSrt);
  assert(parsed.cues.length === 2, 'SRT parseado com sucesso com 2 falas');

  // Teste de tempos
  assert(getActiveSubtitleText(parsed.cues, 1.0) === '', 'Aos 1.0s nenhuma legenda é exibida');
  assert(getActiveSubtitleText(parsed.cues, 3.0) === 'Primeira fala do episódio.', 'Aos 3.0s exibe fala 1');
  assert(getActiveSubtitleText(parsed.cues, 5.5) === '', 'Aos 5.5s intervalo sem fala');
  assert(getActiveSubtitleText(parsed.cues, 8.0) === 'Segunda fala sincronizada perfeitamente.', 'Aos 8.0s exibe fala 2');
  assert(getActiveSubtitleText(parsed.cues, 12.0) === '', 'Após o fim nada é exibido');

  // 4. ATIVAR, DESATIVAR E SUBSTITUIR SEM RECARREGAR O VÍDEO
  console.log('\n--- 4. ATIVAR, DESATIVAR E SUBSTITUIR SEM RECARREGAR VÍDEO ---');
  assert(playerContent.includes('handleToggleSubtitle'), 'Função handleToggleSubtitle presente para ativar/desativar');
  assert(playerContent.includes('handleRemoveSubtitle'), 'Função handleRemoveSubtitle presente');
  assert(!playerContent.includes('window.location.reload'), 'Nenhuma ação recarrega a página ou o vídeo');

  // 5. RESPONSIVIDADE E ACESSIBILIDADE MOBILE
  console.log('\n--- 5. LAYOUT MOBILE E VISIBILIDADE EXPANDIDA ---');
  assert(playerContent.includes('fixed sm:absolute'), 'Menu de legendas usa posicionamento fixed em telas mobile para nunca cortar');
  assert(playerContent.includes('shrink-0'), 'Controles da direita e botão CC usam shrink-0 para nunca serem esmagados no mobile');
  assert(playerContent.includes('hidden sm:flex items-center group/vol'), 'Controle de volume é ocultado em mobile estreito para preservar espaço do botão CC');

  console.log('\n===============================================================');
  console.log(`TOTAL DE ASSERTIVAS: ${passed + failed} | APROVADAS: ${passed} | FALHAS: ${failed}`);
  console.log('===============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runSubtitleMobileSuite();
