export type VideoCategory =
  | 'Treinamentos & Tutoriais'
  | 'Produções & Gravações'
  | 'Apresentações Privadas'
  | 'Documentários & Demos';

export type VideoResolution = '4K' | '1080p' | '720p' | '480p' | 'N/D';

export type VideoUploadStatus = 'aguardando' | 'enviando' | 'processando' | 'pronto' | 'erro';

export interface VideoSubtitles {
  id: string;
  lang: string;
  label: string;
  src?: string;
}

export interface SubtitleCue {
  id?: string;
  start: number; // segundos com precisão decimal
  end: number;   // segundos com precisão decimal
  text: string;
}

export interface ActiveSubtitleFile {
  fileName: string;
  fileSizeBytes?: number;
  cues: SubtitleCue[];
  vttBlobUrl?: string;
  isEnabled: boolean;
}

export interface VideoItem {
  id: string;
  title: string;
  description: string;
  duration: number; // in seconds
  durationFormatted: string;
  category: VideoCategory;
  tags: string[];
  posterUrl: string;
  videoUrl: string;
  isDemo: boolean;
  isLocalFile?: boolean; // Flag indicando que é um arquivo local da sessão atual
  originalFileName?: string; // Nome original do arquivo selecionado
  demoNotice?: string;
  createdAt: string; // ISO date
  resolution: VideoResolution;
  fileSizeBytes?: number;
  fileSizeFormatted?: string;
  continueWatchingProgress?: number; // 0 to 100 percentage
  uploadStatus?: VideoUploadStatus;
  subtitles?: VideoSubtitles[];
  qualityVariants?: VideoQualityVariant[];
}

export interface VideoQualityVariant {
  quality: QualityLevel;
  url: string;
  label?: string;
}

export type PlaybackSpeed = 0.5 | 0.75 | 1 | 1.25 | 1.5 | 2;

export type QualityLevel = 'original' | 'auto' | '1080p' | '720p' | '480p' | '360p' | '240p';

export interface StreamQualityOption {
  levelIndex: number; // -1 for auto
  label: string; // "Automático (ABR)", "1080p", "720p", etc.
  resolution: string;
  bitrate?: number;
  width?: number;
  height?: number;
}

export type ActiveTab = 'home' | 'library' | 'admin' | 'security';
