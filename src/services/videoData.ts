import { VideoItem, VideoResolution } from '../types/video';

// Imagens geradas localmente para visual de alta fidelidade
import heroPoster from '../assets/images/hero_streaming_poster_1791958055087.jpg';
import thumbTech from '../assets/images/video_thumb_tech_1791958055319.jpg';
import thumbNature from '../assets/images/video_thumb_nature_1791958055994.jpg';
import thumbWorkshop from '../assets/images/video_thumb_workshop_1791958055237.jpg';

export const INITIAL_DEMO_VIDEOS: VideoItem[] = [
  {
    id: 'demo-hero-01',
    title: 'Visão Geral da Infraestrutura de Transmissão Privada',
    description:
      'Apresentação técnica sobre arquitetura de streaming, segurança de tokens de acesso, transcodificação em múltiplos bitrates e entrega via CDN privada.',
    duration: 596,
    durationFormatted: '09:56',
    category: 'Treinamentos & Tutoriais',
    tags: ['Arquitetura', 'Segurança', 'Streaming Privado', 'HLS'],
    posterUrl: heroPoster,
    videoUrl: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
    isDemo: true,
    demoNotice: 'Stream HLS adaptativa multi-bitrate com troca real (1080p, 720p, 480p, 360p)',
    createdAt: '2026-03-12T14:30:00Z',
    resolution: '4K',
    fileSizeBytes: 420000000,
    fileSizeFormatted: '420 MB',
    continueWatchingProgress: 45,
    uploadStatus: 'pronto',
    subtitles: [
      { id: 'sub-pt', lang: 'pt', label: 'Português (Brasil)' },
      { id: 'sub-en', lang: 'en', label: 'Inglês (Original)' },
    ],
  },
  {
    id: 'demo-tech-02',
    title: 'Simpósio Técnico: Engenharia de Software e Edge Caching',
    description:
      'Gravação completa do painel técnico sobre redução de latência em transmissões de vídeo sob demanda e protocolos de isolamento de rede.',
    duration: 724,
    durationFormatted: '12:04',
    category: 'Apresentações Privadas',
    tags: ['Engenharia', 'Latência', 'Infraestrutura'],
    posterUrl: thumbTech,
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    isDemo: true,
    demoNotice: 'Demonstração de apresentação restrita para testes de layout (Fonte Direta MP4)',
    createdAt: '2026-03-10T09:15:00Z',
    resolution: '1080p',
    fileSizeBytes: 290000000,
    fileSizeFormatted: '290 MB',
    continueWatchingProgress: 82,
    uploadStatus: 'pronto',
    subtitles: [{ id: 'sub-pt', lang: 'pt', label: 'Português' }],
  },
  {
    id: 'demo-nature-03',
    title: 'Capturas de Teste de Cores & HDR: Paisagens Nórdicas',
    description:
      'Sequência de referência em alta fidelidade dinâmica para calibração de compressão H.264/H.265 e perfis de cores em telas móveis e monitores.',
    duration: 380,
    durationFormatted: '06:20',
    category: 'Documentários & Demos',
    tags: ['Calibração', 'Qualidade Visual', 'HDR', 'Compressão', 'HLS'],
    posterUrl: thumbNature,
    videoUrl: 'https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8',
    isDemo: true,
    demoNotice: 'Stream HLS adaptativa multi-bitrate Tears of Steel (Unified Streaming)',
    createdAt: '2026-03-08T18:00:00Z',
    resolution: '4K',
    fileSizeBytes: 180000000,
    fileSizeFormatted: '180 MB',
    continueWatchingProgress: 15,
    uploadStatus: 'pronto',
  },
  {
    id: 'demo-workshop-04',
    title: 'Workshop de Iluminação e Captura de Áudio em Estúdio',
    description:
      'Treinamento fechado sobre técnicas de gravação multicâmera, roteamento de áudio balanceado e preparação de master para pós-produção.',
    duration: 890,
    durationFormatted: '14:50',
    category: 'Produções & Gravações',
    tags: ['Produção', 'Áudio', 'Estúdio', 'Câmeras'],
    posterUrl: thumbWorkshop,
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
    isDemo: true,
    demoNotice: 'Demonstração interna autorizada para validação do player (Fonte Direta MP4)',
    createdAt: '2026-03-04T11:20:00Z',
    resolution: '1080p',
    fileSizeBytes: 340000000,
    fileSizeFormatted: '340 MB',
    uploadStatus: 'pronto',
    subtitles: [{ id: 'sub-pt', lang: 'pt', label: 'Português' }],
  },
];

const STORAGE_KEY = 'novastream_videos_v2';

// Registro de arquivos locais mantidos na sessão em memória
interface LocalFileEntry {
  file: File;
  objectUrl: string;
}

const localVideoFilesRegistry = new Map<string, LocalFileEntry>();

/**
 * Registra um arquivo de vídeo selecionado localmente na sessão.
 * Gera uma URL temporária via URL.createObjectURL para reprodução real no player.
 */
export const registerLocalVideoFile = (videoId: string, file: File): string => {
  // Revoga URL anterior se já existir para este id
  const existing = localVideoFilesRegistry.get(videoId);
  if (existing) {
    try {
      URL.revokeObjectURL(existing.objectUrl);
    } catch {
      // no-op
    }
  }

  const objectUrl = URL.createObjectURL(file);
  localVideoFilesRegistry.set(videoId, { file, objectUrl });
  return objectUrl;
};

/**
 * Retorna a URL de reprodução utilizável para um vídeo local.
 * Se a URL temporária tiver expirado mas o arquivo ainda existir na memória da sessão, recria a URL.
 */
export const getLocalVideoUrl = (videoId: string): string | null => {
  const entry = localVideoFilesRegistry.get(videoId);
  if (!entry) return null;
  return entry.objectUrl;
};

/**
 * Retorna se o arquivo local do vídeo está presente na memória da sessão atual.
 */
export const hasLocalVideoFile = (videoId: string): boolean => {
  return localVideoFilesRegistry.has(videoId);
};

/**
 * Retorna o objeto File real caso ainda esteja registrado na sessão.
 */
export const getLocalVideoFile = (videoId: string): File | null => {
  const entry = localVideoFilesRegistry.get(videoId);
  return entry ? entry.file : null;
};

/**
 * Verifica se um vídeo está pronto e disponível para reprodução.
 * Vídeos de demonstração/remotos estão sempre disponíveis.
 * Vídeos locais só estão disponíveis se o arquivo estiver na memória da sessão.
 */
export const isLocalVideoAvailable = (video: VideoItem): boolean => {
  if (!video.isLocalFile) {
    return Boolean(video.videoUrl);
  }
  return hasLocalVideoFile(video.id) && Boolean(getLocalVideoUrl(video.id));
};

/**
 * Revoga a URL temporária e limpa a referência ao arquivo da memória quando o vídeo é excluído.
 */
export const revokeLocalVideoFile = (videoId: string): void => {
  const entry = localVideoFilesRegistry.get(videoId);
  if (entry) {
    try {
      URL.revokeObjectURL(entry.objectUrl);
    } catch {
      // no-op
    }
    localVideoFilesRegistry.delete(videoId);
  }
};

/**
 * Limpa todos os arquivos e URLs temporárias da sessão.
 */
export const revokeAllLocalVideoFiles = (): void => {
  localVideoFilesRegistry.forEach((entry) => {
    try {
      URL.revokeObjectURL(entry.objectUrl);
    } catch {
      // no-op
    }
  });
  localVideoFilesRegistry.clear();
};

// Cache em memória para garantir consistência
let inMemoryVideosCache: VideoItem[] | null = null;

export const getStoredVideos = (): VideoItem[] => {
  if (inMemoryVideosCache && inMemoryVideosCache.length > 0) {
    // Reassocia URLs locais caso existam no registro de sessão
    return inMemoryVideosCache.map((v) => {
      if (v.isLocalFile) {
        const localUrl = getLocalVideoUrl(v.id);
        return { ...v, videoUrl: localUrl || '' };
      }
      return v;
    });
  }

  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (!raw) {
      inMemoryVideosCache = [...INITIAL_DEMO_VIDEOS];
      return inMemoryVideosCache;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      inMemoryVideosCache = parsed.map((v: VideoItem) => {
        if (v.isLocalFile) {
          const localUrl = getLocalVideoUrl(v.id);
          return { ...v, videoUrl: localUrl || '' };
        }
        return v;
      });
      return inMemoryVideosCache;
    }
    inMemoryVideosCache = [...INITIAL_DEMO_VIDEOS];
    return inMemoryVideosCache;
  } catch (err) {
    console.warn('Armazenamento local inacessível, utilizando cache em memória:', err);
    if (!inMemoryVideosCache) {
      inMemoryVideosCache = [...INITIAL_DEMO_VIDEOS];
    }
    return inMemoryVideosCache;
  }
};

export const saveStoredVideos = (videos: VideoItem[]): boolean => {
  inMemoryVideosCache = [...videos];
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      // NÃO armazena o arquivo nem URLs 'blob:' efêmeras em localStorage para evitar erros de serialização
      const sanitized = videos.map((v) => {
        if (v.isLocalFile || (typeof v.videoUrl === 'string' && v.videoUrl.startsWith('blob:'))) {
          return { ...v, videoUrl: '' }; // mantido na memória da sessão e recuperado via getLocalVideoUrl
        }
        return v;
      });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
    }
    return true;
  } catch (err) {
    console.warn('Falha ao persistir no localStorage (mantido em memória com segurança):', err);
    return true;
  }
};

export const resetStoredVideos = (): VideoItem[] => {
  revokeAllLocalVideoFiles();
  inMemoryVideosCache = [...INITIAL_DEMO_VIDEOS];
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // no-op
  }
  return inMemoryVideosCache;
};
export { classifyVideoResolution, formatDuration, formatQualityLabel } from './videoMetadata';
