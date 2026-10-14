import { VideoCategory } from '../types/video';

/**
 * Configuração global da plataforma.
 * Para renomear a marca no futuro, altere 'brandName' aqui.
 */
export const APP_CONFIG = {
  brandName: 'NOVA STREAM',
  brandTagline: 'Hospedagem & Transmissão Privada',
  version: '0.1.0-alpha',
  isPrivateMode: true,
  categories: [
    'Treinamentos & Tutoriais',
    'Produções & Gravações',
    'Apresentações Privadas',
    'Documentários & Demos',
  ] as VideoCategory[],
  demoDisclaimer: 'Dados e vídeos identificados como demonstração técnica autorizada.',
  roadmap: {
    storage: 'Preparado para Object Storage (S3 / Google Cloud Storage) com URLs pré-assinadas temporárias.',
    transcoding: 'Preparado para pipeline FFmpeg com segmentação HLS (.m3u8) multi-bitrate (1080p, 720p, 480p).',
    auth: 'Preparado para autenticação segura com tokens JWT efêmeros e controle de acesso baseado em papéis (RBAC).',
  },
};
