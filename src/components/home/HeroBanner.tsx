import React from 'react';
import { Play, Info, ShieldCheck, UploadCloud, AlertTriangle } from 'lucide-react';
import { VideoItem } from '../../types/video';
import { hasLocalVideoFile } from '../../services/videoData';

interface HeroBannerProps {
  video: VideoItem;
  onWatch: (video: VideoItem) => void;
  onOpenDetails: (video: VideoItem) => void;
}

export const HeroBanner: React.FC<HeroBannerProps> = ({ video, onWatch, onOpenDetails }) => {
  const isAvailable = !video.isLocalFile || hasLocalVideoFile(video.id);

  return (
    <div className="relative w-full rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 shadow-2xl mb-10 group">
      {/* Imagem de Fundo com Aspecto Cinematográfico */}
      <div className="relative h-[340px] sm:h-[420px] md:h-[480px] w-full">
        <img
          src={video.posterUrl}
          alt={video.title}
          className="w-full h-full object-cover object-center group-hover:scale-[1.02] transition-transform duration-700"
          referrerPolicy="no-referrer"
        />

        {/* Gradientes Scrim de Alto Contraste para Leitura Perfeita */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0B0C10] via-[#0B0C10]/60 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0B0C10] via-[#0B0C10]/70 to-transparent" />

        {/* Conteúdo sobreposto */}
        <div className="absolute inset-0 flex flex-col justify-end p-6 sm:p-10 md:p-12 max-w-3xl">
          {/* Metadados não-envelopados */}
          <div className="flex items-center gap-2 text-xs font-medium text-slate-300 mb-2.5">
            <span className="text-indigo-400 font-semibold tracking-wide uppercase text-[11px]">
              Destaque Privado
            </span>
            <span aria-hidden="true" className="text-slate-600">·</span>
            <span>{video.category}</span>
            <span aria-hidden="true" className="text-slate-600">·</span>
            <span className="font-mono text-slate-400">
              {video.duration > 0 ? video.durationFormatted : '--:--'}
            </span>
            <span aria-hidden="true" className="text-slate-600">·</span>
            {isAvailable ? (
              <span className="text-emerald-400 font-medium flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 inline" /> Acesso Restrito
              </span>
            ) : (
              <span className="text-amber-400 font-medium flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5 inline" /> Arquivo Pendente
              </span>
            )}
          </div>

          {/* Título Principal */}
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-white tracking-tight leading-tight mb-3 [text-wrap:balance]">
            {video.title}
          </h1>

          {/* Sinopse / Descrição */}
          <p className="text-sm sm:text-base text-slate-300 line-clamp-2 md:line-clamp-3 mb-6 max-w-2xl leading-relaxed">
            {video.description}
          </p>

          {/* Botões de Ação */}
          <div className="flex flex-wrap items-center gap-3">
            {isAvailable ? (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onWatch(video);
                }}
                className="min-h-[44px] px-6 py-2.5 rounded-xl bg-white text-slate-950 hover:bg-slate-200 active:bg-slate-300 font-bold text-sm flex items-center gap-2 transition-all shadow-lg shadow-white/10 hover:scale-[1.02] cursor-pointer"
              >
                <Play className="w-4 h-4 fill-slate-950" />
                <span>Assistir Agora</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onOpenDetails(video);
                }}
                className="min-h-[44px] px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-bold text-sm flex items-center gap-2 transition-all shadow-lg shadow-amber-500/20 hover:scale-[1.02] cursor-pointer"
              >
                <UploadCloud className="w-4 h-4 text-slate-950" />
                <span>Reconectar Arquivo</span>
              </button>
            )}

            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onOpenDetails(video);
              }}
              className="min-h-[44px] px-5 py-2.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-slate-200 font-semibold text-sm flex items-center gap-2 transition-all border border-slate-700/80 cursor-pointer"
            >
              <Info className="w-4 h-4 text-slate-400" />
              <span>Mais Informações</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
