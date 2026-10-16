import { VideoResolution } from '../types/video';

/**
 * Classifica a resolução do vídeo a partir da altura real dos quadros (videoHeight).
 * Regras:
 * - >= 2160 px -> '4K'
 * - >= 1080 px -> '1080p'
 * - >= 720 px  -> '720p'
 * - Menores ou inválidos -> 'N/D' (não atribui 480p sem confirmação confiável)
 */
export function classifyVideoResolution(height?: number): VideoResolution {
  if (typeof height !== 'number' || isNaN(height) || height <= 0 || !isFinite(height)) {
    return 'N/D';
  }
  if (height >= 2160) return '4K';
  if (height >= 1080) return '1080p';
  if (height >= 720) return '720p';
  return 'N/D';
}

/**
 * Formata segundos numéricos em formato legível mm:ss ou hh:mm:ss.
 * Valores ausentes ou inválidos retornam '00:00'.
 */
export function formatDuration(seconds?: number): string {
  if (typeof seconds !== 'number' || isNaN(seconds) || seconds <= 0 || !isFinite(seconds)) {
    return '00:00';
  }
  const total = Math.floor(seconds);
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hrs > 0) {
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Retorna o rótulo amigável e honesto da qualidade para fontes diretas e arquivos locais.
 * Exemplo: 'Original (1080p)', 'Original (4K)', 'Original (N/D)'.
 */
export function formatQualityLabel(resolution?: VideoResolution): string {
  if (!resolution || resolution === 'N/D') {
    return 'Original (N/D)';
  }
  return `Original (${resolution})`;
}
