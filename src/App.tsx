import { useState, useEffect, useCallback, useRef } from 'react';
import { VideoItem, ActiveTab } from './types/video';
import {
  getStoredVideos,
  saveStoredVideos,
  resetStoredVideos,
  getLocalVideoUrl,
  revokeLocalVideoFile,
  revokeAllLocalVideoFiles,
} from './services/videoData';
import { Header } from './components/common/Header';
import { BottomNav } from './components/common/BottomNav';
import { Footer } from './components/common/Footer';
import { HomeView } from './components/home/HomeView';
import { LibraryView, LibraryNavState } from './components/library/LibraryView';
import { AdminUploadView } from './components/admin/AdminUploadView';
import { ArchitectureView } from './components/architecture/ArchitectureView';
import { CustomVideoPlayer, VideoMetadataUpdates } from './components/player/CustomVideoPlayer';
import { VideoDetailsModal } from './components/common/VideoDetailsModal';
import { VideoEditModal } from './components/library/VideoEditModal';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('home');
  const [videos, setVideos] = useState<VideoItem[]>(() => getStoredVideos());
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedVideoId, setHighlightedVideoId] = useState<string | null>(null);

  // Estados dos modais e do player
  const [playingVideo, setPlayingVideo] = useState<VideoItem | null>(null);
  const [detailsVideo, setDetailsVideo] = useState<VideoItem | null>(null);
  const [editingVideo, setEditingVideo] = useState<VideoItem | null>(null);

  // Navegação hierárquica da Biblioteca (Biblioteca -> Anime -> Temporada -> Episódios)
  const [libraryNav, setLibraryNav] = useState<LibraryNavState>({ level: 'root' });
  const [adminPrefill, setAdminPrefill] = useState<{ seriesTitle: string; seasonNumber: number } | null>(null);
  const [adminReturnSeason, setAdminReturnSeason] = useState<{
    animeTitle: string;
    animeId: string;
    seasonNumber: number;
  } | null>(null);

  // Referências mutáveis para o listener de popstate evitar stale closures
  const playingVideoRef = useRef(playingVideo);
  playingVideoRef.current = playingVideo;

  const detailsVideoRef = useRef(detailsVideo);
  detailsVideoRef.current = detailsVideo;

  const editingVideoRef = useRef(editingVideo);
  editingVideoRef.current = editingVideo;

  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;

  const libraryNavRef = useRef(libraryNav);
  libraryNavRef.current = libraryNav;

  const adminReturnSeasonRef = useRef(adminReturnSeason);
  adminReturnSeasonRef.current = adminReturnSeason;

  // Interceptador e sincronizador seguro do botão Voltar do navegador e Android (popstate)
  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      // 1. Se o player estiver ativo, o retorno fecha o player e preserva a tela de origem intacta
      if (playingVideoRef.current) {
        setPlayingVideo(null);
        return;
      }

      // 2. Se modais de detalhes ou edição estiverem abertos, fechá-los
      if (detailsVideoRef.current) {
        setDetailsVideo(null);
        return;
      }
      if (editingVideoRef.current) {
        setEditingVideo(null);
        return;
      }

      // 3. Se estiver na Ingestão vindo de "Adicionar episódios", retornar para a temporada de origem
      if (activeTabRef.current === 'admin' && adminReturnSeasonRef.current) {
        const target = adminReturnSeasonRef.current;
        setActiveTab('library');
        setLibraryNav({
          level: 'season',
          animeId: target.animeId,
          seasonNumber: target.seasonNumber,
        });
        setAdminReturnSeason(null);
        return;
      }

      // 4. Se estiver em subníveis da Biblioteca
      if (activeTabRef.current === 'library') {
        const curNav = libraryNavRef.current;
        if (curNav.level === 'season') {
          setLibraryNav({ level: 'anime', animeId: curNav.animeId });
          return;
        }
        if (curNav.level === 'anime') {
          setLibraryNav({ level: 'root' });
          return;
        }
      }

      // 5. Restauração de histórico seguro estruturado
      const state = event.state;
      if (state && state._novastream) {
        if (state.tab) setActiveTab(state.tab);
        if (state.libraryNav) setLibraryNav(state.libraryNav);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const pushSafeHistoryState = useCallback((state: any) => {
    if (typeof window === 'undefined') return;
    try {
      window.history.pushState({ ...state, _novastream: true }, '');
    } catch {
      // no-op
    }
  }, []);

  // Sincronizar persistência sempre que o catálogo for modificado
  useEffect(() => {
    saveStoredVideos(videos);
  }, [videos]);

  // Limpeza de URLs de objetos ao desmontar
  useEffect(() => {
    return () => {
      revokeAllLocalVideoFiles();
    };
  }, []);

  // Ações sobre vídeos
  const handleSelectVideo = (video: VideoItem) => {
    // Garante que o player receba o URL local real caso seja um arquivo da sessão
    const activeUrl = video.isLocalFile
      ? getLocalVideoUrl(video.id) || video.videoUrl
      : video.videoUrl;
    pushSafeHistoryState({ tab: activeTab, libraryNav, isPlayer: true });
    setPlayingVideo({ ...video, videoUrl: activeUrl });
    setDetailsVideo(null);
  };

  const handleClosePlayer = () => {
    setPlayingVideo(null);
  };

  const handleOpenDetails = (video: VideoItem) => {
    setDetailsVideo(video);
  };

  const handleOpenEdit = (video: VideoItem) => {
    setEditingVideo(video);
  };

  const handleSaveEditedVideo = (updated: VideoItem) => {
    setVideos((prev) => {
      const next = prev.map((v) => (v.id === updated.id ? updated : v));
      saveStoredVideos(next);
      return next;
    });
  };

  const handleDeleteVideo = (id: string) => {
    revokeLocalVideoFile(id);
    setVideos((prev) => {
      const next = prev.filter((v) => v.id !== id);
      saveStoredVideos(next);
      return next;
    });
    if (highlightedVideoId === id) {
      setHighlightedVideoId(null);
    }
  };

  // Função central de adição com retorno síncrono de status para evitar falsas confirmações
  const handleVideoCreated = useCallback((newVideo: VideoItem): boolean => {
    try {
      setVideos((prev) => {
        // Evita duplicatas se o ID já existir
        const filtered = prev.filter((v) => v.id !== newVideo.id);
        const next = [newVideo, ...filtered];
        saveStoredVideos(next);
        return next;
      });
      return true;
    } catch (err) {
      console.error('Falha ao adicionar vídeo ao estado compartilhado:', err);
      return false;
    }
  }, []);

  // Atualiza metadados reais de reprodução (duração e resolução detectadas no player)
  const handleUpdateVideoMetadata = useCallback(
    (videoId: string, metadata: VideoMetadataUpdates) => {
      setVideos((prev) => {
        let changed = false;
        const next = prev.map((v) => {
          if (v.id !== videoId) return v;

          // Preserva metadados dos vídeos de demonstração inalterados
          if (v.isDemo) return v;

          const updated: VideoItem = { ...v };

          // Atualiza duração se for válida e se o vídeo ainda estiver com duração não confirmada (0)
          if (
            typeof metadata.duration === 'number' &&
            metadata.duration > 0 &&
            isFinite(metadata.duration) &&
            (v.duration === 0 || !v.duration)
          ) {
            updated.duration = metadata.duration;
            updated.durationFormatted = metadata.durationFormatted || v.durationFormatted;
            changed = true;
          }

          // Atualiza resolução se for válida ('4K' | '1080p' | '720p') e se o vídeo estiver como 'N/D'
          if (
            metadata.resolution &&
            metadata.resolution !== 'N/D' &&
            (v.resolution === 'N/D' || !v.resolution)
          ) {
            updated.resolution = metadata.resolution;
            changed = true;
          }

          return updated;
        });

        if (changed) {
          saveStoredVideos(next);
          return next;
        }
        return prev;
      });

      // Mantém também o vídeo em reprodução sincronizado na visualização atual
      setPlayingVideo((curr) => {
        if (!curr || curr.id !== videoId || curr.isDemo) return curr;
        const updated = { ...curr };
        if (
          typeof metadata.duration === 'number' &&
          metadata.duration > 0 &&
          isFinite(metadata.duration) &&
          (curr.duration === 0 || !curr.duration)
        ) {
          updated.duration = metadata.duration;
          updated.durationFormatted = metadata.durationFormatted || curr.durationFormatted;
        }
        if (
          metadata.resolution &&
          metadata.resolution !== 'N/D' &&
          (curr.resolution === 'N/D' || !curr.resolution)
        ) {
          updated.resolution = metadata.resolution;
        }
        return updated;
      });
    },
    []
  );

  // Navegar para a biblioteca focando o vídeo recém-adicionado
  const handleNavigateToLibrary = useCallback((targetVideoId?: string) => {
    if (targetVideoId) {
      setHighlightedVideoId(targetVideoId);
    }
    setSearchQuery('');
    setActiveTab('library');
    pushSafeHistoryState({ tab: 'library', libraryNav });
  }, [libraryNav, pushSafeHistoryState]);

  const handleLibraryNavChange = useCallback(
    (next: LibraryNavState) => {
      setLibraryNav(next);
      pushSafeHistoryState({ tab: 'library', libraryNav: next });
    },
    [pushSafeHistoryState]
  );

  const handleAddEpisodesToSeason = useCallback(
    (seriesTitle: string, seasonNumber: number) => {
      const cleanSlug = seriesTitle
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/[^a-z0-9]+/g, '-');
      const animeId = `anime-${cleanSlug}`;

      setAdminPrefill({ seriesTitle, seasonNumber });
      setAdminReturnSeason({ animeTitle: seriesTitle, animeId, seasonNumber });
      setActiveTab('admin');
      pushSafeHistoryState({
        tab: 'admin',
        adminReturn: { animeTitle: seriesTitle, animeId, seasonNumber },
      });
    },
    [pushSafeHistoryState]
  );

  const handleReturnFromAdminToSeason = useCallback(
    (seriesTitle: string, seasonNumber: number) => {
      const cleanSlug = seriesTitle
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/[^a-z0-9]+/g, '-');
      const animeId = `anime-${cleanSlug}`;

      setActiveTab('library');
      setLibraryNav({
        level: 'season',
        animeId,
        seasonNumber,
      });
      setAdminPrefill(null);
      setAdminReturnSeason(null);
      pushSafeHistoryState({
        tab: 'library',
        libraryNav: { level: 'season', animeId, seasonNumber },
      });
    },
    [pushSafeHistoryState]
  );

  const handleResetDemoVideos = () => {
    const defaultList = resetStoredVideos();
    setVideos([...defaultList]);
    setHighlightedVideoId(null);
  };

  const handleTabChange = (tab: ActiveTab) => {
    if (tab !== 'library') {
      setHighlightedVideoId(null);
    }
    setActiveTab(tab);
    pushSafeHistoryState({ tab, libraryNav });
  };

  return (
    <div className="min-h-screen bg-[#0B0C10] text-slate-100 flex flex-col font-sans selection:bg-indigo-600 selection:text-white">
      {/* Cabeçalho Fixo / Sticky com Contrato de 3 Zonas */}
      <Header
        activeTab={activeTab}
        setActiveTab={handleTabChange}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        allVideos={videos}
        onSelectVideo={handleSelectVideo}
      />

      {/* Conteúdo Principal */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {activeTab === 'home' && (
          <HomeView
            videos={videos}
            onSelectVideo={handleSelectVideo}
            onOpenDetails={handleOpenDetails}
            onNavigateToUpload={() => handleTabChange('admin')}
            onResetDemoVideos={handleResetDemoVideos}
          />
        )}

        {activeTab === 'library' && (
          <LibraryView
            videos={videos}
            highlightedVideoId={highlightedVideoId}
            onClearHighlight={() => setHighlightedVideoId(null)}
            onSelectVideo={handleSelectVideo}
            onOpenDetails={handleOpenDetails}
            onEditVideo={handleOpenEdit}
            onDeleteVideo={handleDeleteVideo}
            onNavigateToUpload={() => handleTabChange('admin')}
            onResetDemoVideos={handleResetDemoVideos}
            navState={libraryNav}
            onNavChange={handleLibraryNavChange}
            onAddEpisodesToSeason={handleAddEpisodesToSeason}
          />
        )}

        {activeTab === 'admin' && (
          <AdminUploadView
            onVideoCreated={handleVideoCreated}
            onNavigateToLibrary={handleNavigateToLibrary}
            existingVideos={videos}
            initialSeriesTitle={adminPrefill?.seriesTitle}
            initialSeasonNumber={adminPrefill?.seasonNumber}
            initialUploadTab="url_seasons"
            onReturnToSeason={handleReturnFromAdminToSeason}
          />
        )}

        {activeTab === 'security' && <ArchitectureView />}
      </main>

      {/* Rodapé */}
      <Footer setActiveTab={handleTabChange} />

      {/* Navegação Inferior para Celulares (Android / iOS) */}
      <BottomNav activeTab={activeTab} setActiveTab={handleTabChange} />

      {/* Player Customizado em Modo Cinema / Modal de Alta Resolução */}
      {playingVideo && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black flex items-center justify-center animate-in fade-in duration-200"
        >
          <CustomVideoPlayer
            video={playingVideo}
            onClose={handleClosePlayer}
            autoPlay={true}
            onUpdateMetadata={handleUpdateVideoMetadata}
          />
        </div>
      )}

      {/* Modal de Detalhes do Vídeo */}
      {detailsVideo && (
        <VideoDetailsModal
          video={detailsVideo}
          onClose={() => setDetailsVideo(null)}
          onWatch={handleSelectVideo}
          onEdit={handleOpenEdit}
        />
      )}

      {/* Modal de Edição de Metadados */}
      {editingVideo && (
        <VideoEditModal
          video={editingVideo}
          onClose={() => setEditingVideo(null)}
          onSave={handleSaveEditedVideo}
        />
      )}
    </div>
  );
}
