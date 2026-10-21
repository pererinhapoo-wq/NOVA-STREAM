import {
  parseTimestampToSeconds,
  cleanSubtitleText,
  parseSrt,
  formatSecondsToVttTime,
  getActiveSubtitleText,
} from '../src/services/subtitleParser';

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

async function runSubtitleParserTestSuite() {
  console.log('===============================================================');
  console.log('SUITE DE TESTES: PARSER E SINCRONIZAÇÃO DE LEGENDAS SRT (NOVA STREAM)');
  console.log('===============================================================\n');

  // 1. CONVERSÃO DE TIMESTAMPS
  console.log('--- 1. CONVERSÃO DE TIMESTAMPS (SRT E WEBVTT) ---');
  const t1 = parseTimestampToSeconds('00:01:23,456');
  assert(t1 === 83.456, 'Converte formato padrão 00:01:23,456 para 83.456s');

  const t2 = parseTimestampToSeconds('01:23,456');
  assert(t2 === 83.456, 'Converte formato abreviado sem horas 01:23,456 para 83.456s');

  const t3 = parseTimestampToSeconds('00:00:05.500');
  assert(t3 === 5.5, 'Aceita ponto como separador de milissegundos (00:00:05.500)');

  const t4 = parseTimestampToSeconds('01:00:00,000');
  assert(t4 === 3600, 'Calcula horas com precisão (01:00:00,000 = 3600s)');

  const tInvalid = parseTimestampToSeconds('invalid:time');
  assert(tInvalid === null, 'Retorna null para timestamps corrompidos ou inválidos');

  // 2. LIMPEZA DE TEXTO HTML E SSA
  console.log('\n--- 2. HIGIENIZAÇÃO DE TEXTO DAS LEGENDAS ---');
  assert(cleanSubtitleText('<i>Texto em itálico</i>') === 'Texto em itálico', 'Remove tags HTML <i></i>');
  assert(cleanSubtitleText('<font color="#ffff00">Legenda amarela</font>') === 'Legenda amarela', 'Remove tags <font>');
  assert(cleanSubtitleText('{\\an8}Legenda no topo') === 'Legenda no topo', 'Remove tags ASS {\\an8}');

  // 3. PARSE COMPLETO DE ARQUIVO SRT REALISTA
  console.log('\n--- 3. PARSING DE ARQUIVO SRT COMPLETO ---');
  const sampleSrt = `1
00:00:01,000 --> 00:00:04,500
Olá, bem-vindo à Nova Stream!

2
00:00:05,000 --> 00:00:08,200
Este é o teste oficial do reprodutor.
Segunda linha de diálogo.

3
00:00:10,100 --> 00:00:14,000
<i>Aproveite a melhor experiência em streaming!</i>
`;

  const parsed = parseSrt(sampleSrt);
  assert(!parsed.error, 'Parsing de SRT bem-sucedido sem erros');
  assert(parsed.cues.length === 3, 'Extraiu exatamente 3 legendas');
  assert(parsed.cues[0].start === 1.0 && parsed.cues[0].end === 4.5, 'Temporização da legenda 1 precisa');
  assert(parsed.cues[0].text === 'Olá, bem-vindo à Nova Stream!', 'Texto da legenda 1 preservado');
  assert(parsed.cues[1].text === 'Este é o teste oficial do reprodutor.\nSegunda linha de diálogo.', 'Quebras de linha internas preservadas');
  assert(parsed.cues[2].text === 'Aproveite a melhor experiência em streaming!', 'Tags HTML da legenda 3 removidas');

  // 4. CONVERSÃO PARA WEBVTT
  console.log('\n--- 4. CONVERSÃO PARA FORMATO WEBVTT ---');
  assert(parsed.vttContent.startsWith('WEBVTT'), 'Conteúdo gerado inicia com cabeçalho WEBVTT');
  assert(parsed.vttContent.includes('00:00:01.000 --> 00:00:04.500'), 'Ponto utilizado como separador no WebVTT');
  assert(formatSecondsToVttTime(83.456) === '00:01:23.456', 'formatSecondsToVttTime formata corretamente');

  // 5. SINCRONIZAÇÃO EM TEMPO DE REPRODUÇÃO
  console.log('\n--- 5. SINCRONIZAÇÃO EM TEMPO REAL ---');
  assert(getActiveSubtitleText(parsed.cues, 0.5) === '', 'Antes de 1.0s nenhuma legenda é exibida');
  assert(getActiveSubtitleText(parsed.cues, 2.0) === 'Olá, bem-vindo à Nova Stream!', 'Aos 2.0s exibe legenda 1');
  assert(getActiveSubtitleText(parsed.cues, 4.8) === '', 'Aos 4.8s (intervalo entre 1 e 2) nenhuma legenda é exibida');
  assert(getActiveSubtitleText(parsed.cues, 6.0) === 'Este é o teste oficial do reprodutor.\nSegunda linha de diálogo.', 'Aos 6.0s exibe legenda 2');
  assert(getActiveSubtitleText(parsed.cues, 12.0) === 'Aproveite a melhor experiência em streaming!', 'Aos 12.0s exibe legenda 3');
  assert(getActiveSubtitleText(parsed.cues, 20.0) === '', 'Após o fim das legendas nada é exibido');

  // 6. RESILIENTE A FALHAS E FORMATAÇÃO IRREGULAR
  console.log('\n--- 6. RESILIÊNCIA A ARQUIVOS CORROMPIDOS OU VAZIOS ---');
  const emptyResult = parseSrt('');
  assert(emptyResult.error !== undefined, 'Detecta arquivo vazio com aviso seguro');
  assert(emptyResult.cues.length === 0, 'Não gera cues para arquivo vazio');

  const malformedSrt = `Apenas texto solto sem marcações de tempo.
Nada que pareça com setas ou horas.`;
  const malformedResult = parseSrt(malformedSrt);
  assert(malformedResult.error !== undefined, 'Não quebra com arquivo de texto arbitrário');
  assert(malformedResult.cues.length === 0, 'Cues vazio para formato inválido');

  // Arquivo com quebras Windows CRLF e BOM
  const windowsBOM = '\uFEFF1\r\n00:00:02,000 --> 00:00:05,000\r\nTeste com BOM e CRLF\r\n';
  const parsedBom = parseSrt(windowsBOM);
  assert(parsedBom.cues.length === 1, 'Suporta UTF-8 BOM e CRLF do Windows');
  assert(parsedBom.cues[0].text === 'Teste com BOM e CRLF', 'Texto decodificado corretamente');

  console.log('\n===============================================================');
  console.log(`TOTAL DE ASSERTIVAS: ${passed + failed} | APROVADAS: ${passed} | FALHAS: ${failed}`);
  console.log('===============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runSubtitleParserTestSuite();
