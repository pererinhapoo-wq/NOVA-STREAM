import React, { useState, useMemo, useEffect } from 'react';
import {
  Search,
  Grid,
  List,
  ArrowUpDown,
  Filter,
  Play,
  Edit3,
  Trash2,
  Sparkles,
  UploadCloud,
  RotateCcw,
  CheckCircle2,
  X,
} from 'lucide-react';
import { VideoItem, VideoCategory } from '../../types/video';
import { APP_CONFIG } from '../../config/appConfig';
import { VideoCard } from '../common/VideoCard';

interface LibraryViewProps {
  videos: VideoItem[];
  highlightedVideoId?: string | null;
  onClearHighlight?: () => void;
  onSelectVideo: (video: VideoItem) => void;
  onOpenDetails: (video: VideoItem) => void;
  onEditVideo: (video: VideoItem) => void;
  onDeleteVideo: (id: string) => void;
  onNavigateToUpload: () => void;
  onResetDemoVideos: () => void;
}

type SortOption = 'date-desc' | 'date-asc' | 'title-asc' | 'duration-desc';

export const LibraryView: React.FC<LibraryViewProps> = ({
  videos,
  highlightedVideoId,
  onClearHighlight,
  onSelectVideo,
  onOpenDetails,
  onEditVideo,
  onDeleteVideo,
  onNavigateToUpload,
  onResetDemoVideos,
}) => {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SortOption>('date-desc');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Se um vídeo recém-adicionado for destacado, garantir que a busca e os filtros não o ocultem
  useEffect(() => {
    if (highlightedVideoId) {
      setSearch('');
      setSelectedCategory('all');
    }
  }, [highlightedVideoId]);

  // Filtragem e ordenação seguras com suporte a itens novos
  const filteredVideos = useMemo(() => {
    const q = search.trim().toLowerCase();

    const result = videos.filter((v) => {
      // Se for o vídeo destacado pelo upload recente, sempre manter visível
      if (highlightedVideoId && v.id === highlightedVideoId) {
        return true;
      }

      const matchesCategory =
        selectedCategory === 'all' || v.category === selectedCategory;

      const matchesSearch =
        q === '' ||
        (v.title && v.title.toLowerCase().includes(q)) ||
        (v.description && v.description.toLowerCase().includes(q)) ||
        (v.tags && v.tags.some((t) => t && t.toLowerCase().includes(q)));

      return matchesCategory && matchesSearch;
    });

    return result.sort((a, b) => {
      // Priorizar o vídeo recém-adicionado no topo
      if (highlightedVideoId) {
        if (a.id === highlightedVideoId) return -1;
        if (b.id === highlightedVideoId) return 1;
      }

      if (sortBy === 'date-desc') {
        const timeA = new Date(a.createdAt).getTime() || 0;
        const timeB = new Date(b.createdAt).getTime() || 0;
        return timeB - timeA;
      }
      if (sortBy === 'date-asc') {
        const timeA = new Date(a.createdAt).getTime() || 0;
        const timeB = new Date(b.createdAt).getTime() || 0;
        return timeA - timeB;
      }
      if (sortBy === 'title-asc') {
        return (a.title || '').localeCompare(b.title || '');
      }
      if (sortBy === 'duration-desc') {
        return (b.duration || 0) - (a.duration || 0);
      }
      return 0;
    });
  }, [videos, search, selectedCategory, sortBy, highlightedVideoId]);

  // Vídeo em destaque encontrado
  const highlightedVideo = highlightedVideoId
    ? videos.find((v) => v.id === highlightedVideoId)
    : null;

  return (
    <div className="space-y-6">
      {/* Cabeçalho da Biblioteca */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Biblioteca Privada</h1>
          <p className="text-xs text-slate-400 mt-1">
            Repositório isolado de vídeos autorizados para armazenamento e streaming ({videos.length} disponíveis).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onNavigateToUpload}
            className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-sm transition-colors flex items-center gap-1.5"
          >
            <UploadCloud className="w-4 h-4" />
            <span>Adicionar Vídeo</span>
          </button>
          <button
            onClick={onResetDemoVideos}
            className="px-3 py-2 text-xs font-medium text-slate-300 hover:text-white bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-lg transition-colors flex items-center gap-1.5"
            title="Restaurar vídeos de demonstração padrão"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
            <span className="hidden sm:inline">Restaurar Amostras</span>
          </button>
        </div>
      </div>

      {/* Banner de Confirmação quando navegou a partir do upload */}
      {highlightedVideo && (
        <div className="p-3.5 bg-indigo-950/60 border border-indigo-500/50 rounded-xl flex items-center justify-between gap-3 text-xs text-indigo-200 shadow-lg shadow-indigo-950/40">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div className="truncate">
              <span className="font-semibold text-white">Vídeo catalogado com sucesso: </span>
              <span className="text-indigo-300 underline font-medium truncate">
                &ldquo;{highlightedVideo.title}&rdquo;
              </span>
              <span className="text-slate-400 ml-2 hidden sm:inline">
                posicionado no topo da lista
              </span>
            </div>
          </div>
          {onClearHighlight && (
            <button
              onClick={onClearHighlight}
              aria-label="Dispensar aviso"
              className="text-slate-400 hover:text-white p-1 rounded-md transition-colors shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* Barra de Filtros, Busca e Ordenação */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Campo de Busca */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por título, assunto ou tag..."
            className="w-full bg-[#161822] border border-slate-800 rounded-xl pl-9 pr-8 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              aria-label="Limpar busca"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Controles de Ordenação e Visualização */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Ordenação */}
          <div className="flex items-center gap-1.5 bg-[#161822] border border-slate-800 rounded-xl px-2.5 py-1.5">
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="bg-transparent text-xs text-slate-200 focus:outline-none cursor-pointer"
            >
              <option value="date-desc" className="bg-[#161822]">Mais Recentes</option>
              <option value="date-asc" className="bg-[#161822]">Mais Antigos</option>
              <option value="title-asc" className="bg-[#161822]">Título (A-Z)</option>
              <option value="duration-desc" className="bg-[#161822]">Maior Duração</option>
            </select>
          </div>

          {/* Alternador Grade / Lista */}
          <div className="flex items-center bg-[#161822] border border-slate-800 rounded-xl p-1">
            <button
              onClick={() => setViewMode('grid')}
              aria-label="Visualização em grade"
              className={`p-1.5 rounded-lg transition-colors ${
                viewMode === 'grid'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Grid className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              aria-label="Visualização em lista"
              className={`p-1.5 rounded-lg transition-colors ${
                viewMode === 'list'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Abas de Categorias */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-none">
        <button
          onClick={() => setSelectedCategory('all')}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors ${
            selectedCategory === 'all'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'bg-[#161822] text-slate-300 hover:text-white hover:bg-slate-800'
          }`}
        >
          Todas ({videos.length})
        </button>
        {APP_CONFIG.categories.map((cat: VideoCategory) => {
          const count = videos.filter((v) => v.category === cat).length;
          return (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors ${
                selectedCategory === cat
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-[#161822] text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              {cat} ({count})
            </button>
          );
        })}
      </div>

      {/* Conteúdo: Listagem ou Estado Vazio */}
      {filteredVideos.length === 0 ? (
        <div className="py-16 px-4 text-center bg-[#12131A] rounded-2xl border border-slate-800/80 my-4">
          <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-500">
            <Filter className="w-6 h-6" />
          </div>
          <h3 className="text-base font-semibold text-white mb-1">
            Nenhum vídeo atende aos critérios
          </h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto mb-4">
            {search || selectedCategory !== 'all'
              ? 'Tente ajustar os filtros ou o termo de busca utilizado.'
              : 'Nenhum vídeo cadastrado no momento.'}
          </p>
          {(search || selectedCategory !== 'all') && (
            <button
              onClick={() => {
                setSearch('');
                setSelectedCategory('all');
              }}
              className="text-xs text-indigo-400 hover:text-indigo-300 underline font-medium"
            >
              Limpar filtros
            </button>
          )}
        </div>
      ) : viewMode === 'grid' ? (
        /* Visualização em Grade */
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredVideos.map((video) => {
            const isHighlighted = highlightedVideoId === video.id;

            return (
              <div
                key={video.id}
                className={`relative group/actions rounded-xl transition-all ${
                  isHighlighted
                    ? 'ring-2 ring-indigo-500 ring-offset-2 ring-offset-[#0B0C10] shadow-xl shadow-indigo-600/30'
                    : ''
                }`}
              >
                {/* Badge visual se for recém adicionado */}
                {isHighlighted && (
                  <div className="absolute -top-2.5 left-3 z-20 bg-indigo-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-md flex items-center gap-1 border border-indigo-400">
                    <Sparkles className="w-2.5 h-2.5" />
                    <span>Recém-adicionado</span>
                  </div>
                )}

                <VideoCard
                  video={video}
                  onSelect={onSelectVideo}
                  onOpenDetails={onOpenDetails}
                />

                {/* Barra de Ações Rápidas Flutuante */}
                <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover/actions:opacity-100 transition-opacity bg-black/80 rounded-lg p-1 backdrop-blur-sm z-10 border border-slate-800">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onEditVideo(video);
                    }}
                    title="Editar metadados"
                    className="p-1 hover:text-indigo-400 text-slate-300 transition-colors"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`Remover "${video.title}" da biblioteca?`)) {
                        onDeleteVideo(video.id);
                      }
                    }}
                    title="Excluir vídeo"
                    className="p-1 hover:text-red-400 text-slate-300 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Visualização em Lista */
        <div className="space-y-2 bg-[#12131A] rounded-2xl border border-slate-800/90 overflow-hidden divide-y divide-slate-800/80">
          {filteredVideos.map((video) => {
            const isHighlighted = highlightedVideoId === video.id;

            return (
              <div
                key={video.id}
                onClick={() => onSelectVideo(video)}
                className={`p-3 sm:p-4 hover:bg-slate-850 flex items-center justify-between gap-4 cursor-pointer group transition-colors ${
                  isHighlighted ? 'bg-indigo-950/30 border-l-4 border-l-indigo-500' : ''
                }`}
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  {/* Thumbnail */}
                  <div className="relative w-28 sm:w-36 aspect-video rounded-lg overflow-hidden bg-slate-900 shrink-0">
                    <img
                      src={video.posterUrl}
                      alt={video.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-black/30 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                      <Play className="w-6 h-6 text-white drop-shadow opacity-80 group-hover:opacity-100 fill-white/50" />
                    </div>
                    <span className="absolute bottom-1 right-1 text-[10px] font-mono text-white bg-black/80 px-1 rounded">
                      {video.durationFormatted}
                    </span>
                  </div>

                  {/* Texto */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-[11px] text-indigo-400 mb-0.5">
                      <span>{video.category}</span>
                      <span aria-hidden="true" className="text-slate-600">·</span>
                      <span className="text-slate-400">{video.resolution}</span>
                      {isHighlighted && (
                        <>
                          <span aria-hidden="true" className="text-slate-600">·</span>
                          <span className="text-emerald-400 font-semibold">Novo</span>
                        </>
                      )}
                    </div>
                    <h3 className="text-sm font-semibold text-white truncate group-hover:text-indigo-300 transition-colors">
                      {video.title}
                    </h3>
                    <p className="text-xs text-slate-400 line-clamp-1 mt-0.5 hidden sm:block">
                      {video.description}
                    </p>
                  </div>
                </div>

                {/* Ações na Lista */}
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center gap-1.5 shrink-0"
                >
                  <button
                    onClick={() => onOpenDetails(video)}
                    className="px-2.5 py-1 text-xs text-slate-300 hover:text-white bg-slate-900 border border-slate-800 rounded-lg hover:bg-slate-800 transition-colors hidden md:block"
                  >
                    Detalhes
                  </button>
                  <button
                    onClick={() => onEditVideo(video)}
                    title="Editar metadados"
                    className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Remover "${video.title}" da biblioteca?`)) {
                        onDeleteVideo(video.id);
                      }
                    }}
                    title="Excluir"
                    className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
