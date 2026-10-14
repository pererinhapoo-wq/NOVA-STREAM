import React from 'react';
import { VideoItem, VideoCategory } from '../../types/video';
import { HeroBanner } from './HeroBanner';
import { VideoRow } from './VideoRow';
import { APP_CONFIG } from '../../config/appConfig';
import { Film, UploadCloud, RotateCcw } from 'lucide-react';

interface HomeViewProps {
  videos: VideoItem[];
  onSelectVideo: (video: VideoItem) => void;
  onOpenDetails: (video: VideoItem) => void;
  onNavigateToUpload: () => void;
  onResetDemoVideos: () => void;
}

export const HomeView: React.FC<HomeViewProps> = ({
  videos,
  onSelectVideo,
  onOpenDetails,
  onNavigateToUpload,
  onResetDemoVideos,
}) => {
  // Se não houver vídeos, exibe estado vazio elegante
  if (videos.length === 0) {
    return (
      <div className="max-w-4xl mx-auto py-16 px-4 text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-indigo-400">
          <Film className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Nenhum vídeo cadastrado na plataforma</h2>
        <p className="text-sm text-slate-400 max-w-md mx-auto mb-6 leading-relaxed">
          Esta é a visão da plataforma privada quando nenhum arquivo ou demonstração foi
          adicionado. Você pode cadastrar um novo vídeo ou restaurar as demonstrações de teste.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={onNavigateToUpload}
            className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm flex items-center gap-2 transition-colors shadow-lg shadow-indigo-600/20"
          >
            <UploadCloud className="w-4 h-4" />
            <span>Adicionar Primeiro Vídeo</span>
          </button>
          <button
            onClick={onResetDemoVideos}
            className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 font-medium text-sm flex items-center gap-2 transition-colors border border-slate-700/80"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Restaurar Amostras de Teste</span>
          </button>
        </div>
      </div>
    );
  }

  // Primeiro vídeo como destaque
  const heroVideo = videos[0];

  // Vídeos com progresso em "Continuar assistindo"
  const continueWatchingVideos = videos.filter(
    (v) => v.continueWatchingProgress !== undefined && v.continueWatchingProgress > 0
  );

  // Recentes (ordenados por data decrescente)
  const recentVideos = [...videos].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return (
    <div className="space-y-4">
      {/* Banner Principal de Destaque */}
      {heroVideo && (
        <HeroBanner
          video={heroVideo}
          onWatch={onSelectVideo}
          onOpenDetails={onOpenDetails}
        />
      )}

      {/* Seção Continuar Assistindo */}
      {continueWatchingVideos.length > 0 && (
        <VideoRow
          title="Continuar Assistindo"
          subtitle="Retome de onde parou na sua sessão privada"
          videos={continueWatchingVideos}
          onSelectVideo={onSelectVideo}
          onOpenDetails={onOpenDetails}
          showProgress={true}
        />
      )}

      {/* Seção Adicionados Recentemente */}
      <VideoRow
        title="Adicionados Recentemente"
        subtitle="Últimos vídeos catalogados"
        videos={recentVideos}
        onSelectVideo={onSelectVideo}
        onOpenDetails={onOpenDetails}
      />

      {/* Seções por Categoria */}
      {APP_CONFIG.categories.map((cat: VideoCategory) => {
        const catVideos = videos.filter((v) => v.category === cat);
        if (catVideos.length === 0) return null;
        return (
          <VideoRow
            key={cat}
            title={cat}
            videos={catVideos}
            onSelectVideo={onSelectVideo}
            onOpenDetails={onOpenDetails}
          />
        );
      })}
    </div>
  );
};
