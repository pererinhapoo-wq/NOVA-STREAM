export type VideoCategory =
  | 'Treinamentos & Tutoriais'
  | 'Produções & Gravações'
  | 'Apresentações Privadas'
  | 'Documentários & Demos';

export type VideoResolution = '4K' | '1080p' | '720p' | '480p';

export type VideoUploadStatus = 'aguardando' | 'enviando' | 'processando' | 'pronto' | 'erro';

export interface VideoSubtitles {
  id: string;
  lang: string;
  label: string;
  src?: string;
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
  demoNotice?: string;
  createdAt: string; // ISO date
  resolution: VideoResolution;
  fileSizeBytes?: number;
  fileSizeFormatted?: string;
  continueWatchingProgress?: number; // 0 to 100 percentage
  uploadStatus?: VideoUploadStatus;
  subtitles?: VideoSubtitles[];
}

export type PlaybackSpeed = 0.5 | 0.75 | 1 | 1.25 | 1.5 | 2;

export type QualityLevel = 'auto' | '1080p' | '720p' | '480p' | '360p';

export type ActiveTab = 'home' | 'library' | 'admin' | 'security';
