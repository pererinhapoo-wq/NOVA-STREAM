import React, { useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { VideoItem } from '../../types/video';
import { VideoCard } from '../common/VideoCard';

interface VideoRowProps {
  title: string;
  subtitle?: string;
  videos: VideoItem[];
  onSelectVideo: (video: VideoItem) => void;
  onOpenDetails?: (video: VideoItem) => void;
  showProgress?: boolean;
}

export const VideoRow: React.FC<VideoRowProps> = ({
  title,
  subtitle,
  videos,
  onSelectVideo,
  onOpenDetails,
  showProgress = false,
}) => {
  const rowRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: 'left' | 'right') => {
    if (!rowRef.current) return;
    const distance = 420;
    rowRef.current.scrollBy({
      left: direction === 'left' ? -distance : distance,
      behavior: 'smooth',
    });
  };

  if (videos.length === 0) return null;

  return (
    <div className="mb-10 relative">
      {/* Cabeçalho da Linha */}
      <div className="flex items-baseline justify-between mb-3 px-1">
        <div className="flex items-baseline gap-2.5">
          <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">{title}</h2>
          {subtitle && (
            <span className="text-xs text-slate-400 hidden sm:inline">{subtitle}</span>
          )}
        </div>

        {/* Setas de navegação (desktop) */}
        <div className="hidden sm:flex items-center gap-1.5">
          <button
            onClick={() => scroll('left')}
            aria-label="Rolar para esquerda"
            className="w-8 h-8 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => scroll('right')}
            aria-label="Rolar para direita"
            className="w-8 h-8 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Contêiner de rolagem horizontal com cards */}
      <div
        ref={rowRef}
        className="flex gap-4 overflow-x-auto pb-4 scrollbar-none snap-x snap-mandatory scroll-smooth px-1"
      >
        {videos.map((vid) => (
          <div
            key={vid.id}
            className="w-[260px] sm:w-[280px] md:w-[300px] shrink-0 snap-start"
          >
            <VideoCard
              video={vid}
              onSelect={onSelectVideo}
              onOpenDetails={onOpenDetails}
              showProgress={showProgress}
            />
          </div>
        ))}
      </div>
    </div>
  );
};
