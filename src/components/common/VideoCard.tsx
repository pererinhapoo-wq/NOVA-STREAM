import React from 'react';
import { Play, Clock, Sparkles, AlertTriangle, UploadCloud } from 'lucide-react';
import { VideoItem } from '../../types/video';
import { hasLocalVideoFile } from '../../services/videoData';

interface VideoCardProps {
  video: VideoItem;
  onSelect: (video: VideoItem) => void;
  onOpenDetails?: (video: VideoItem) => void;
  showProgress?: boolean;
}

export const VideoCard: React.FC<VideoCardProps> = ({
  video,
  onSelect,
  onOpenDetails,
  showProgress = false,
}) => {
  const isAvailable = !video.isLocalFile || hasLocalVideoFile(video.id);

  const handleCardClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!isAvailable) {
      if (onOpenDetails) {
        onOpenDetails(video);
      }
      return;
    }
    onSelect(video);
  };

  return (
    <div
      onClick={handleCardClick}
      className={`group relative flex flex-col bg-[#12131A] rounded-xl overflow-hidden border transition-all duration-200 cursor-pointer text-left hover:-translate-y-1 hover:shadow-xl ${
        !isAvailable
          ? 'border-amber-700/60 hover:border-amber-500/80 hover:shadow-amber-950/20'
          : 'border-slate-800/90 hover:border-indigo-500/50 hover:shadow-indigo-950/20'
      }`}
    >
      {/* Container da Capa / Thumbnail */}
      <div className="relative aspect-video w-full bg-slate-900 overflow-hidden">
        <img
          src={video.posterUrl}
          alt={video.title}
          loading="lazy"
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        />

        {/* Gradiente escuro no rodapé da capa */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />

        {/* Tag de demonstração técnica ou arquivo local da sessão */}
        {video.isLocalFile ? (
          isAvailable ? (
            <div className="absolute top-2.5 left-2.5 text-[10px] font-medium tracking-wide text-emerald-300 bg-black/80 px-2 py-0.5 rounded backdrop-blur-sm flex items-center gap-1 border border-emerald-500/30">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>Arquivo Local</span>
            </div>
          ) : (
            <div className="absolute top-2.5 left-2.5 text-[10px] font-medium tracking-wide text-amber-300 bg-black/85 px-2 py-0.5 rounded backdrop-blur-sm flex items-center gap-1 border border-amber-500/50 shadow-md">
              <AlertTriangle className="w-2.5 h-2.5 text-amber-400" />
              <span>Arquivo Pendente</span>
            </div>
          )
        ) : video.isDemo ? (
          <div className="absolute top-2.5 left-2.5 text-[10px] font-medium tracking-wide text-indigo-300 bg-black/70 px-2 py-0.5 rounded backdrop-blur-sm flex items-center gap-1 border border-indigo-500/30">
            <Sparkles className="w-2.5 h-2.5 text-indigo-400" />
            <span>Amostra</span>
          </div>
        ) : null}

        {/* Resolução */}
        <div className="absolute top-2.5 right-2.5 text-[10px] font-mono text-slate-300 bg-black/70 px-1.5 py-0.5 rounded backdrop-blur-sm border border-slate-800">
          {video.resolution}
        </div>

        {/* Duração no canto inferior direito */}
        <div className="absolute bottom-2.5 right-2.5 text-[11px] font-mono font-medium text-white bg-black/80 px-2 py-0.5 rounded flex items-center gap-1 border border-slate-700/50">
          <Clock className="w-3 h-3 text-slate-400" />
          <span>{video.durationFormatted}</span>
        </div>

        {/* Ícone de Play central ou Ação de Reconexão no hover/touch */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/45 backdrop-blur-[2px]">
          {isAvailable ? (
            <div className="w-12 h-12 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-lg transform scale-90 group-hover:scale-100 transition-transform">
              <Play className="w-5 h-5 ml-0.5 fill-current" />
            </div>
          ) : (
            <div className="px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xl border border-amber-400/30 transform scale-95 group-hover:scale-100 transition-transform">
              <UploadCloud className="w-4 h-4" />
              <span>Reconectar Arquivo</span>
            </div>
          )}
        </div>

        {/* Barra de progresso de "Continuar Assistindo" */}
        {showProgress && isAvailable && video.continueWatchingProgress !== undefined && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-800">
            <div
              className="h-full bg-indigo-500"
              style={{ width: `${video.continueWatchingProgress}%` }}
            />
          </div>
        )}
      </div>

      {/* Metadados e Título */}
      <div className="p-3.5 flex flex-col flex-1 justify-between gap-2">
        <div>
          {/* Metadados não encaixotados com separadores sutis */}
          <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium mb-1">
            <span className="text-indigo-400 truncate max-w-[150px]">{video.category}</span>
            <span aria-hidden="true">·</span>
            <span>{new Date(video.createdAt).toLocaleDateString('pt-BR', { month: 'short', day: 'numeric' })}</span>
          </div>

          <h3 className="text-sm font-semibold text-slate-100 line-clamp-2 group-hover:text-indigo-300 transition-colors leading-snug">
            {video.title}
          </h3>
        </div>

        {/* Ações inferiores discretas */}
        <div className="flex items-center justify-between pt-1 border-t border-slate-800/60 text-xs">
          <span className="text-[11px] text-slate-400 truncate max-w-[160px]">
            {video.tags.slice(0, 2).join(' · ')}
          </span>
          {onOpenDetails && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onOpenDetails(video);
              }}
              className={`text-xs px-2 py-0.5 rounded transition-colors shrink-0 ${
                !isAvailable
                  ? 'text-amber-300 bg-amber-950/60 hover:bg-amber-900/80 border border-amber-700/60 font-medium'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              {!isAvailable ? 'Reconectar' : 'Info'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
