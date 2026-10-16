import { useState, useEffect, useCallback } from 'react';
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
import { LibraryView } from './components/library/LibraryView';
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
  }, []);

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
          />
        )}

        {activeTab === 'admin' && (
          <AdminUploadView
            onVideoCreated={handleVideoCreated}
            onNavigateToLibrary={handleNavigateToLibrary}
            existingVideos={videos}
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
