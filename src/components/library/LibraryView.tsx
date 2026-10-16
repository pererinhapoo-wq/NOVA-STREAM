import React, { useState, useMemo, useEffect, useCallback } from 'react';
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
  AlertTriangle,
  ArrowLeft,
  Folder,
  Film,
  ChevronRight,
  PlusCircle,
  AlertCircle,
  Layers,
  Info,
} from 'lucide-react';
import { VideoItem, VideoCategory } from '../../types/video';
import { APP_CONFIG } from '../../config/appConfig';
import { VideoCard } from '../common/VideoCard';
import { hasLocalVideoFile } from '../../services/videoData';
import {
  groupVideosByAnimeAndSeason,
  AnimeGroup,
  SeasonGroup,
} from '../../services/animeSeriesGrouping';

export interface LibraryNavState {
  level: 'root' | 'anime' | 'season';
  animeId?: string;
  seasonNumber?: number;
}

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
  onReconnectFile?: (videoId: string, file: File) => void;
  // Navegação hierárquica sincronizada
  navState?: LibraryNavState;
  onNavChange?: (next: LibraryNavState) => void;
  onAddEpisodesToSeason?: (seriesTitle: string, seasonNumber: number) => void;
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
  onReconnectFile: _onReconnectFile,
  navState: externalNavState,
  onNavChange,
  onAddEpisodesToSeason,
}) => {
  // Estado interno de fallback se não fornecido externamente
  const [internalNavState, setInternalNavState] = useState<LibraryNavState>({ level: 'root' });
  const activeNav = externalNavState || internalNavState;

  const setNavState = useCallback(
    (next: LibraryNavState) => {
      if (onNavChange) {
        onNavChange(next);
      } else {
        setInternalNavState(next);
      }
    },
    [onNavChange]
  );

  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SortOption>('date-desc');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Estado para modal próprio de confirmação de exclusão (evita window.confirm bloqueado por sandbox/iframe)
  const [videoToDelete, setVideoToDelete] = useState<VideoItem | null>(null);

  // Se um vídeo recém-adicionado for destacado, garantir que a busca e os filtros não o ocultem
  useEffect(() => {
    if (highlightedVideoId) {
      setSearch('');
      setSelectedCategory('all');
    }
  }, [highlightedVideoId]);

  // Agrupamento central determinístico por Animes, Temporadas e Vídeos Avulsos
  const { animes, standalones } = useMemo(() => {
    return groupVideosByAnimeAndSeason(videos);
  }, [videos]);

  // Anime selecionado na visualização atual
  const selectedAnime = useMemo(() => {
    if (!activeNav.animeId) return null;
    return animes.find((a) => a.id === activeNav.animeId) || null;
  }, [animes, activeNav.animeId]);

  // Temporada selecionada na visualização atual
  const selectedSeason = useMemo(() => {
    if (!selectedAnime || typeof activeNav.seasonNumber !== 'number') return null;
    return selectedAnime.seasons.find((s) => s.seasonNumber === activeNav.seasonNumber) || null;
  }, [selectedAnime, activeNav.seasonNumber]);

  // Se a temporada ou anime atualmente aberto tiver seus episódios excluídos, recua com segurança
  useEffect(() => {
    if (activeNav.level === 'season') {
      if (!selectedAnime) {
        setNavState({ level: 'root' });
      } else if (!selectedSeason) {
        setNavState({ level: 'anime', animeId: selectedAnime.id });
      }
    } else if (activeNav.level === 'anime') {
      if (!selectedAnime) {
        setNavState({ level: 'root' });
      }
    }
  }, [activeNav.level, selectedAnime, selectedSeason, setNavState]);

  // Modal acessível em UI de confirmação de exclusão sem window.confirm
  const renderDeleteConfirmationModal = () => {
    if (!videoToDelete) return null;
    return (
      <div
        role="dialog"
        aria-modal="true"
        onClick={() => setVideoToDelete(null)}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-md bg-[#12131A] border border-slate-800 rounded-2xl overflow-hidden shadow-2xl p-6 space-y-4"
        >
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-full bg-red-950/60 border border-red-800/80 text-red-400 flex items-center justify-center shrink-0">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Excluir Vídeo da Biblioteca</h3>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                Tem certeza de que deseja excluir <span className="text-white font-semibold">&ldquo;{videoToDelete.title}&rdquo;</span>? Esta ação removerá o vídeo da sua biblioteca privada.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={() => setVideoToDelete(null)}
              className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => {
                const idToDelete = videoToDelete.id;
                setVideoToDelete(null);
                onDeleteVideo(idToDelete);
              }}
              className="px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-500 rounded-xl transition-colors flex items-center gap-1.5 shadow-lg shadow-red-950/30 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Confirmar Exclusão</span>
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Handlers de navegação entre os níveis da Biblioteca
  const handleOpenAnime = (animeId: string) => {
    setNavState({ level: 'anime', animeId });
  };

  const handleOpenSeason = (animeId: string, seasonNumber: number) => {
    setNavState({ level: 'season', animeId, seasonNumber });
  };

  const handleBackToAnime = () => {
    if (activeNav.animeId) {
      setNavState({ level: 'anime', animeId: activeNav.animeId });
    } else {
      setNavState({ level: 'root' });
    }
  };

  const handleBackToRoot = () => {
    setNavState({ level: 'root' });
  };

  // Filtragem e ordenação seguras para os vídeos avulsos
  const filteredStandalones = useMemo(() => {
    const q = search.trim().toLowerCase();

    const result = standalones.filter((v) => {
      if (highlightedVideoId && v.id === highlightedVideoId) return true;

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
  }, [standalones, search, selectedCategory, sortBy, highlightedVideoId]);

  // Filtragem de animes na busca da raiz
  const filteredAnimes = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return animes;
    return animes.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        a.seasons.some((s) =>
          s.episodes.some(
            (ep) =>
              ep.video.title.toLowerCase().includes(q) ||
              ep.video.description.toLowerCase().includes(q)
          )
        )
    );
  }, [animes, search]);

  // Vídeo em destaque encontrado
  const highlightedVideo = highlightedVideoId
    ? videos.find((v) => v.id === highlightedVideoId)
    : null;

  // =========================================================================
  // NÍVEL 2: PASTA DA TEMPORADA (Lista de episódios daquela temporada)
  // =========================================================================
  if (activeNav.level === 'season' && selectedAnime && selectedSeason) {
    return (
      <div className="space-y-6">
        {/* Barra Superior de Navegação com Botão Voltar Obrigatório */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleBackToAnime}
              className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-200 hover:text-white rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer shadow-sm group"
              title={`Voltar para as temporadas de ${selectedAnime.title}`}
            >
              <ArrowLeft className="w-4 h-4 text-indigo-400 group-hover:-translate-x-0.5 transition-transform" />
              <span>Voltar para {selectedAnime.title}</span>
            </button>

            {/* Breadcrumb Visual */}
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-400">
              <span
                onClick={handleBackToRoot}
                className="hover:text-white cursor-pointer transition-colors"
              >
                Biblioteca
              </span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
              <span
                onClick={handleBackToAnime}
                className="hover:text-white cursor-pointer transition-colors max-w-[160px] truncate"
              >
                {selectedAnime.title}
              </span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
              <span className="text-indigo-300 font-semibold">{selectedSeason.seasonLabel}</span>
            </div>
          </div>

          {/* Botão Obrigatório "Adicionar episódios" para a temporada atual */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (onAddEpisodesToSeason) {
                  onAddEpisodesToSeason(selectedAnime.title, selectedSeason.seasonNumber);
                } else {
                  onNavigateToUpload();
                }
              }}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer shadow-md shadow-indigo-600/20 active:scale-98"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Adicionar episódios</span>
            </button>
          </div>
        </div>

        {/* Banner Informativo da Temporada */}
        <div className="p-4 bg-[#12131A] border border-slate-800/80 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-indigo-400 font-medium mb-1">
              <span>{selectedAnime.title}</span>
              <span className="text-slate-600">·</span>
              <span className="text-slate-300 font-semibold">{selectedSeason.seasonLabel}</span>
            </div>
            <h2 className="text-xl font-bold text-white tracking-tight">
              Lista de Episódios ({selectedSeason.episodes.length} cadastrados)
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Episódios isolados desta temporada ordenados para streaming.
            </p>
          </div>

          {selectedSeason.unconfirmedEpisodesCount > 0 && (
            <div className="p-2.5 bg-amber-950/40 border border-amber-800/50 rounded-xl flex items-center gap-2 text-xs text-amber-200">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                {selectedSeason.unconfirmedEpisodesCount}{' '}
                {selectedSeason.unconfirmedEpisodesCount === 1
                  ? 'episódio com numeração a confirmar'
                  : 'episódios com numeração a confirmar'}
              </span>
            </div>
          )}
        </div>

        {/* Lista de Episódios da Temporada */}
        {selectedSeason.episodes.length === 0 ? (
          <div className="py-16 text-center bg-[#12131A] rounded-2xl border border-slate-800 my-4">
            <Film className="w-10 h-10 text-slate-600 mx-auto mb-2" />
            <p className="text-sm font-semibold text-white">Nenhum episódio nesta temporada</p>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              Clique em &quot;Adicionar episódios&quot; para importar URLs com validação automática.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {selectedSeason.episodes.map(({ video, parsed }) => {
              const isAvailable = !video.isLocalFile || hasLocalVideoFile(video.id);
              const epNumberLabel = parsed.isConfirmedNumber && parsed.episodeNumber !== null
                ? `EP ${String(parsed.episodeNumber).padStart(2, '0')}`
                : null;

              return (
                <div
                  key={video.id}
                  className="relative group rounded-xl bg-[#12131A] border border-slate-800/80 hover:border-slate-700 transition-all flex flex-col overflow-hidden shadow-sm"
                >
                  {/* Badge de Numeração do Episódio */}
                  <div className="absolute top-2.5 left-2.5 z-20 flex items-center gap-1.5">
                    {epNumberLabel ? (
                      <span className="bg-indigo-600 text-white font-mono text-[11px] font-bold px-2 py-0.5 rounded shadow-md border border-indigo-400">
                        {epNumberLabel}
                      </span>
                    ) : (
                      <span
                        className="bg-amber-600/90 text-white text-[10px] font-semibold px-2 py-0.5 rounded shadow-md flex items-center gap-1 border border-amber-400/80"
                        title={parsed.unconfirmedNotice || 'Numeração não confirmada'}
                      >
                        <AlertTriangle className="w-3 h-3" />
                        <span>Numeração a confirmar</span>
                      </span>
                    )}
                  </div>

                  {/* Thumbnail com botão de play */}
                  <div
                    onClick={() => {
                      if (!isAvailable) {
                        onOpenDetails(video);
                        return;
                      }
                      onSelectVideo(video);
                    }}
                    className="relative aspect-video bg-slate-900 cursor-pointer overflow-hidden group/thumb"
                  >
                    <img
                      src={video.posterUrl}
                      alt={video.title}
                      className="w-full h-full object-cover group-hover/thumb:scale-105 transition-transform duration-300"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-black/40 group-hover/thumb:bg-black/20 transition-colors flex items-center justify-center">
                      <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white group-hover/thumb:scale-110 transition-transform">
                        <Play className="w-5 h-5 fill-white ml-0.5" />
                      </div>
                    </div>

                    <span className="absolute bottom-2 right-2 text-[10px] font-mono text-white bg-black/80 px-1.5 py-0.5 rounded">
                      {video.duration > 0 ? video.durationFormatted : '--:--'}
                    </span>
                  </div>

                  {/* Detalhes do Episódio */}
                  <div className="p-3.5 flex-1 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                        <span className="text-indigo-400 font-medium">
                          {epNumberLabel || 'Episódio da Temporada'}
                        </span>
                        <span className="font-mono text-slate-400">{video.resolution}</span>
                      </div>
                      <h4
                        onClick={() => onSelectVideo(video)}
                        className="text-xs font-semibold text-white group-hover:text-indigo-300 transition-colors line-clamp-2 cursor-pointer"
                        title={video.title}
                      >
                        {video.title}
                      </h4>
                      {parsed.unconfirmedNotice && (
                        <p className="text-[10px] text-amber-400/90 mt-1 flex items-center gap-1">
                          <Info className="w-3 h-3 shrink-0" />
                          <span>{parsed.unconfirmedNotice}</span>
                        </p>
                      )}
                    </div>

                    {/* Ações Rápidas do Episódio */}
                    <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-slate-800/80 text-xs">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onSelectVideo(video);
                        }}
                        className="text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Assistir</span>
                      </button>

                      <div
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                        className="flex items-center gap-1"
                      >
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onEditVideo(video);
                          }}
                          title="Editar metadados"
                          className="p-1.5 hover:text-indigo-400 hover:bg-slate-800 text-slate-400 rounded-lg transition-colors cursor-pointer"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setVideoToDelete(video);
                          }}
                          title="Excluir episódio"
                          className="p-1.5 hover:text-red-400 hover:bg-red-950/40 text-slate-400 rounded-lg transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Modal de Confirmação de Exclusão no nível de temporada */}
        {renderDeleteConfirmationModal()}
      </div>
    );
  }

  // =========================================================================
  // NÍVEL 1: PASTA DO ANIME (Tela de detalhes e temporadas da obra)
  // =========================================================================
  if (activeNav.level === 'anime' && selectedAnime) {
    return (
      <div className="space-y-6">
        {/* Barra Superior com Botão Voltar para a Biblioteca */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleBackToRoot}
              className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-200 hover:text-white rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer shadow-sm group"
              title="Voltar para a Biblioteca"
            >
              <ArrowLeft className="w-4 h-4 text-indigo-400 group-hover:-translate-x-0.5 transition-transform" />
              <span>Voltar para a Biblioteca</span>
            </button>

            {/* Breadcrumb Visual */}
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-400">
              <span
                onClick={handleBackToRoot}
                className="hover:text-white cursor-pointer transition-colors"
              >
                Biblioteca
              </span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
              <span className="text-indigo-300 font-semibold truncate max-w-[200px]">
                {selectedAnime.title}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (onAddEpisodesToSeason) {
                  onAddEpisodesToSeason(selectedAnime.title, selectedAnime.totalSeasons + 1);
                } else {
                  onNavigateToUpload();
                }
              }}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer shadow-md shadow-indigo-600/20 active:scale-98"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Adicionar Nova Temporada</span>
            </button>
          </div>
        </div>

        {/* Card de Cabeçalho da Coleção do Anime */}
        <div className="p-5 bg-[#12131A] border border-slate-800 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center gap-5">
          <div className="relative w-24 sm:w-28 aspect-[3/4] rounded-xl overflow-hidden bg-slate-900 shrink-0 border border-slate-700/80 shadow-md">
            <img
              src={selectedAnime.posterUrl}
              alt={selectedAnime.title}
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-xs text-indigo-400 font-semibold uppercase tracking-wider mb-1">
              <Folder className="w-3.5 h-3.5" />
              <span>Coleção de Anime / Série</span>
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight truncate">
              {selectedAnime.title}
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              {selectedAnime.totalSeasons} {selectedAnime.totalSeasons === 1 ? 'temporada' : 'temporadas'} registradas · {selectedAnime.totalEpisodes} {selectedAnime.totalEpisodes === 1 ? 'episódio total' : 'episódios totais'}.
            </p>
          </div>
        </div>

        {/* Lista de Temporadas (Pastas de Temporadas) */}
        <div>
          <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Layers className="w-4 h-4 text-indigo-400" />
            <span>Temporadas Disponíveis</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {selectedAnime.seasons.map((season) => {
              const previewPoster =
                season.episodes[0]?.video.posterUrl || selectedAnime.posterUrl;

              return (
                <div
                  key={season.seasonNumber}
                  onClick={() => handleOpenSeason(selectedAnime.id, season.seasonNumber)}
                  className="p-4 bg-[#12131A] hover:bg-slate-850 border border-slate-800 hover:border-indigo-500/50 rounded-2xl cursor-pointer group transition-all flex flex-col justify-between shadow-sm"
                >
                  <div className="flex items-start gap-3.5">
                    <div className="relative w-20 aspect-video rounded-lg overflow-hidden bg-slate-900 shrink-0 border border-slate-700/60">
                      <img
                        src={previewPoster}
                        alt={season.seasonLabel}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute inset-0 bg-black/20 group-hover:bg-black/0 transition-colors" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] font-mono text-indigo-400 font-medium">
                        Pasta da Temporada
                      </div>
                      <h4 className="text-base font-bold text-white group-hover:text-indigo-300 transition-colors truncate">
                        {season.seasonLabel}
                      </h4>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {season.episodes.length}{' '}
                        {season.episodes.length === 1 ? 'episódio' : 'episódios'}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs font-semibold text-indigo-400 group-hover:text-indigo-300">
                    <span>Explorar episódios</span>
                    <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // NÍVEL 0: BIBLIOTECA RAIZ (Coleções de Animes + Vídeos Avulsos e Demos)
  // =========================================================================
  return (
    <div className="space-y-8">
      {/* Cabeçalho da Biblioteca */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Biblioteca Privada</h1>
          <p className="text-xs text-slate-400 mt-1">
            Repositório isolado de conteúdos: {animes.length}{' '}
            {animes.length === 1 ? 'coleção de anime' : 'coleções de animes'} e{' '}
            {standalones.length} {standalones.length === 1 ? 'vídeo avulso' : 'vídeos avulsos'}.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onNavigateToUpload}
            className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <UploadCloud className="w-4 h-4" />
            <span>Adicionar Vídeo / Lote</span>
          </button>
          <button
            type="button"
            onClick={onResetDemoVideos}
            className="px-3 py-2 text-xs font-medium text-slate-300 hover:text-white bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
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
            </div>
          </div>
          {onClearHighlight && (
            <button
              type="button"
              onClick={onClearHighlight}
              aria-label="Dispensar aviso"
              className="text-slate-400 hover:text-white p-1 rounded-md transition-colors shrink-0 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* Barra de Filtros e Busca */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Campo de Busca Unificado */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por anime, temporada, título ou tag..."
            className="w-full bg-[#161822] border border-slate-800 rounded-xl pl-9 pr-8 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
              aria-label="Limpar busca"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Controles de Ordenação e Alternador Grade / Lista para avulsos */}
        <div className="flex flex-wrap items-center gap-2.5">
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

          <div className="flex items-center bg-[#161822] border border-slate-800 rounded-xl p-1">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              aria-label="Visualização em grade"
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                viewMode === 'grid'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Grid className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              aria-label="Visualização em lista"
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
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

      {/* SEÇÃO 1: COLEÇÕES DE ANIMES (Estrutura em Pastas) */}
      <section className="space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
          <div className="flex items-center gap-2">
            <Folder className="w-4 h-4 text-indigo-400" />
            <h2 className="text-base font-bold text-white tracking-tight">
              Animes & Séries ({filteredAnimes.length})
            </h2>
          </div>
          <span className="text-[11px] text-slate-400">
            Abra uma obra para explorar temporadas e episódios
          </span>
        </div>

        {filteredAnimes.length === 0 ? (
          <div className="p-8 text-center bg-[#12131A] rounded-2xl border border-slate-800/80">
            <Folder className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <p className="text-xs text-slate-300 font-semibold">
              {search ? 'Nenhum anime encontrado para esta busca.' : 'Nenhum anime cadastrado.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredAnimes.map((anime) => (
              <div
                key={anime.id}
                onClick={() => handleOpenAnime(anime.id)}
                className="group p-4 bg-[#12131A] hover:bg-slate-850 border border-slate-800 hover:border-indigo-500/60 rounded-2xl cursor-pointer transition-all flex flex-col justify-between shadow-sm hover:shadow-indigo-950/20"
              >
                <div>
                  <div className="relative aspect-[16/10] rounded-xl overflow-hidden bg-slate-900 border border-slate-700/60 mb-3">
                    <img
                      src={anime.posterUrl}
                      alt={anime.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end p-2.5">
                      <span className="bg-indigo-600/90 text-white font-mono text-[10px] font-bold px-2 py-0.5 rounded shadow">
                        {anime.totalSeasons} {anime.totalSeasons === 1 ? 'temporada' : 'temporadas'}
                      </span>
                    </div>
                  </div>

                  <h3 className="text-sm font-bold text-white group-hover:text-indigo-300 transition-colors line-clamp-1">
                    {anime.title}
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    {anime.totalEpisodes} {anime.totalEpisodes === 1 ? 'episódio catalogado' : 'episódios catalogados'}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs font-semibold text-indigo-400 group-hover:text-indigo-300">
                  <span>Abrir pasta do anime</span>
                  <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* SEÇÃO 2: VÍDEOS AVULSOS & DEMONSTRAÇÕES (Requisito 9: Nada Desaparece) */}
      <section className="space-y-4 pt-4 border-t border-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-800/80">
          <div className="flex items-center gap-2">
            <Film className="w-4 h-4 text-emerald-400" />
            <h2 className="text-base font-bold text-white tracking-tight">
              Vídeos Avulsos & Demonstrações ({filteredStandalones.length})
            </h2>
          </div>
          <span className="text-[11px] text-slate-400">
            Apresentações, tutoriais e demonstrações diretas
          </span>
        </div>

        {/* Abas de Categorias para Avulsos */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-none">
          <button
            type="button"
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors cursor-pointer ${
              selectedCategory === 'all'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-[#161822] text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            Todas ({standalones.length})
          </button>
          {APP_CONFIG.categories.map((cat: VideoCategory) => {
            const count = standalones.filter((v) => v.category === cat).length;
            return (
              <button
                type="button"
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors cursor-pointer ${
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

        {filteredStandalones.length === 0 ? (
          <div className="py-12 px-4 text-center bg-[#12131A] rounded-2xl border border-slate-800/80 my-2">
            <Filter className="w-6 h-6 text-slate-500 mx-auto mb-2" />
            <p className="text-xs text-slate-300 font-semibold">
              Nenhum vídeo avulso atende aos critérios selecionados.
            </p>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredStandalones.map((video) => {
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

                  {/* Barra de Ações Rápidas */}
                  <div
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    className="absolute top-2 right-2 flex items-center gap-1 bg-black/85 hover:bg-black/95 rounded-lg p-1 backdrop-blur-sm z-20 border border-slate-800 shadow-md transition-all sm:opacity-90 sm:hover:opacity-100"
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onEditVideo(video);
                      }}
                      title="Editar metadados"
                      className="p-1.5 hover:text-indigo-400 hover:bg-slate-800 text-slate-300 rounded-md transition-colors cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setVideoToDelete(video);
                      }}
                      title="Excluir vídeo"
                      className="p-1.5 hover:text-red-400 hover:bg-red-950/40 text-slate-300 rounded-md transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-2 bg-[#12131A] rounded-2xl border border-slate-800/90 overflow-hidden divide-y divide-slate-800/80">
            {filteredStandalones.map((video) => {
              const isHighlighted = highlightedVideoId === video.id;
              const isAvailable = !video.isLocalFile || hasLocalVideoFile(video.id);

              return (
                <div
                  key={video.id}
                  onClick={(e) => {
                    e.preventDefault();
                    if (!isAvailable) {
                      onOpenDetails(video);
                      return;
                    }
                    onSelectVideo(video);
                  }}
                  className={`p-3 sm:p-4 hover:bg-slate-850 flex items-center justify-between gap-4 cursor-pointer group transition-colors ${
                    isHighlighted ? 'bg-indigo-950/30 border-l-4 border-l-indigo-500' : ''
                  }`}
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="relative w-28 sm:w-36 aspect-video rounded-lg overflow-hidden bg-slate-900 shrink-0">
                      <img
                        src={video.posterUrl}
                        alt={video.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute inset-0 bg-black/30 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                        {isAvailable ? (
                          <Play className="w-6 h-6 text-white drop-shadow opacity-80 group-hover:opacity-100 fill-white/50" />
                        ) : (
                          <UploadCloud className="w-5 h-5 text-amber-400 drop-shadow opacity-90 group-hover:opacity-100" />
                        )}
                      </div>
                      <span className="absolute bottom-1 right-1 text-[10px] font-mono text-white bg-black/80 px-1 rounded">
                        {video.duration > 0 ? video.durationFormatted : '--:--'}
                      </span>
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-[11px] text-indigo-400 mb-0.5">
                        <span>{video.category}</span>
                        <span aria-hidden="true" className="text-slate-600">·</span>
                        <span className="text-slate-400">{video.resolution}</span>
                      </div>
                      <h3 className="text-sm font-semibold text-white truncate group-hover:text-indigo-300 transition-colors">
                        {video.title}
                      </h3>
                      <p className="text-xs text-slate-400 line-clamp-1 mt-0.5 hidden sm:block">
                        {video.description}
                      </p>
                    </div>
                  </div>

                  <div
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    className="flex items-center gap-2 shrink-0"
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onEditVideo(video);
                      }}
                      title="Editar metadados"
                      className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setVideoToDelete(video);
                      }}
                      title="Excluir vídeo"
                      className="p-1.5 rounded-lg hover:bg-red-950/40 text-slate-400 hover:text-red-400 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Modal de Confirmação de Exclusão no nível raiz */}
      {renderDeleteConfirmationModal()}
    </div>
  );
};
