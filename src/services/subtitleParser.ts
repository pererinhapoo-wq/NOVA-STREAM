import { SubtitleCue } from '../types/video';

/**
 * Converte string de timestamp (SRT ou WebVTT) em segundos com precisão decimal.
 * Exemplos aceitos:
 *  - 00:01:23,456 ou 01:23,456 ou 1:02:03.400 ou 00:00:05,5
 */
export function parseTimestampToSeconds(str: string): number | null {
  if (!str) return null;
  const trimmed = str.trim();
  // Regex captura: [HH:]MM:SS[,.]mmm
  const match = trimmed.match(/^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})[,.](\d{1,3})/);
  if (!match) return null;

  const hours = match[1] ? parseInt(match[1], 10) : 0;
  const minutes = parseInt(match[2], 10);
  const seconds = parseInt(match[3], 10);
  const msStr = (match[4] || '0').padEnd(3, '0').slice(0, 3);
  const ms = parseInt(msStr, 10);

  if (isNaN(minutes) || isNaN(seconds) || isNaN(ms)) return null;

  return hours * 3600 + minutes * 60 + seconds + ms / 1000;
}

/**
 * Remove formatações HTML simples (ex: <i>, <b>, <font color="...">) e tags de alinhamento SSA/ASS (ex: {\an8})
 */
export function cleanSubtitleText(text: string): string {
  if (!text) return '';
  return text
    .replace(/<[^>]+>/g, '') // Remove HTML tags
    .replace(/\{[^}]+\}/g, '') // Remove ASS tags {\an8}, etc.
    .trim();
}

export interface ParseSrtResult {
  cues: SubtitleCue[];
  vttContent: string;
  error?: string;
}

/**
 * Analisa e extrai cues a partir do conteúdo de um arquivo SRT ou WebVTT.
 * Trata quebras de linha Unix/Windows/Mac e arquivos com formatação flexível.
 */
export function parseSrt(rawContent: string): ParseSrtResult {
  if (!rawContent || !rawContent.trim()) {
    return {
      cues: [],
      vttContent: 'WEBVTT\n\n',
      error: 'O arquivo de legenda está vazio.',
    };
  }

  // Normaliza quebras de linha e remove BOM UTF-8
  const normalized = rawContent
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

  // Divide o arquivo em blocos separados por uma ou mais linhas em branco
  const blocks = normalized.split(/\n\s*\n+/);
  const cues: SubtitleCue[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i].trim();
    if (!block) continue;

    const lines = block.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
    if (lines.length === 0) continue;

    // Localiza a linha com a seta de temporização "-->"
    const arrowLineIndex = lines.findIndex((l) => l.includes('-->'));
    if (arrowLineIndex === -1) continue;

    const timeLine = lines[arrowLineIndex];
    const timeParts = timeLine.split('-->');
    if (timeParts.length < 2) continue;

    const startSec = parseTimestampToSeconds(timeParts[0]);
    const endSec = parseTimestampToSeconds(timeParts[1]);

    if (startSec === null || endSec === null || startSec >= endSec) {
      continue;
    }

    // O id do cue pode ser a linha anterior (se for número ou identificador)
    const cueId = arrowLineIndex > 0 ? lines[0] : `${cues.length + 1}`;

    // O texto da legenda são as linhas após a linha de temporização
    const rawTextLines = lines.slice(arrowLineIndex + 1);
    const text = cleanSubtitleText(rawTextLines.join('\n'));

    if (text) {
      cues.push({
        id: cueId,
        start: startSec,
        end: endSec,
        text,
      });
    }
  }

  // Se o método por blocos não encontrou nada (ex: arquivo sem linhas em branco entre legendas),
  // executa um fallback por varredura de linhas
  if (cues.length === 0) {
    const allLines = normalized.split('\n');
    for (let i = 0; i < allLines.length; i++) {
      const line = allLines[i].trim();
      if (line.includes('-->')) {
        const parts = line.split('-->');
        const start = parseTimestampToSeconds(parts[0]);
        const end = parseTimestampToSeconds(parts[1]);
        if (start !== null && end !== null && start < end) {
          const textLines: string[] = [];
          let j = i + 1;
          while (j < allLines.length && !allLines[j].includes('-->')) {
            const nextTrim = allLines[j].trim();
            // Se encontrar um número isolado e a linha seguinte contiver "-->", para aqui
            if (/^\d+$/.test(nextTrim) && j + 1 < allLines.length && allLines[j + 1].includes('-->')) {
              break;
            }
            if (nextTrim) textLines.push(nextTrim);
            j++;
          }
          const text = cleanSubtitleText(textLines.join('\n'));
          if (text) {
            cues.push({
              id: `${cues.length + 1}`,
              start,
              end,
              text,
            });
          }
        }
      }
    }
  }

  // Ordena por tempo de início para sincronização eficiente
  cues.sort((a, b) => a.start - b.start);

  if (cues.length === 0) {
    return {
      cues: [],
      vttContent: 'WEBVTT\n\n',
      error: 'Nenhuma legenda válida ou marcação de tempo encontrada no arquivo.',
    };
  }

  // Gera conteúdo compatível com WebVTT para elementos <track> HTML5
  const vttLines = ['WEBVTT', ''];
  cues.forEach((c, idx) => {
    vttLines.push(c.id || `${idx + 1}`);
    vttLines.push(`${formatSecondsToVttTime(c.start)} --> ${formatSecondsToVttTime(c.end)}`);
    vttLines.push(c.text);
    vttLines.push('');
  });

  return {
    cues,
    vttContent: vttLines.join('\n'),
  };
}

/**
 * Converte segundos para o formato de tempo WebVTT: HH:MM:SS.mmm
 */
export function formatSecondsToVttTime(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = Math.floor(safe % 60);
  const ms = Math.floor((safe % 1) * 1000);

  const hh = hours.toString().padStart(2, '0');
  const mm = minutes.toString().padStart(2, '0');
  const ss = seconds.toString().padStart(2, '0');
  const mmm = ms.toString().padStart(3, '0');

  return `${hh}:${mm}:${ss}.${mmm}`;
}

/**
 * Localiza a legenda ativa no instante de tempo informado.
 * Concatena múltiplos textos se houver sobreposição legítima de falas.
 */
export function getActiveSubtitleText(cues: SubtitleCue[], currentTime: number): string {
  if (!cues || cues.length === 0) return '';

  const activeTexts: string[] = [];
  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i];
    if (currentTime >= cue.start && currentTime <= cue.end) {
      activeTexts.push(cue.text);
    } else if (cue.start > currentTime + 0.5) {
      // Como os cues estão ordenados, podemos parar a busca
      break;
    }
  }

  return activeTexts.join('\n');
}

/**
 * Lê o arquivo SRT selecionado pelo usuário no navegador / celular.
 * Detecta e lida com codificações UTF-8 e ISO-8859-1 (muito comum em legendas baixadas no Brasil).
 */
export function readSubtitleFileAsync(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      const content = (e.target?.result as string) || '';
      // Se tiver muitos caracteres de substituição UTF-8 (\uFFFD), tenta reler como ISO-8859-1
      const replacementCount = (content.match(/\uFFFD/g) || []).length;
      if (replacementCount > 3) {
        const fallbackReader = new FileReader();
        fallbackReader.onload = (fallbackEvt) => {
          resolve((fallbackEvt.target?.result as string) || content);
        };
        fallbackReader.onerror = () => resolve(content);
        fallbackReader.readAsText(file, 'iso-8859-1');
        return;
      }
      resolve(content);
    };

    reader.onerror = () => {
      reject(new Error('Erro ao ler o arquivo selecionado no dispositivo.'));
    };

    reader.readAsText(file, 'utf-8');
  });
}
