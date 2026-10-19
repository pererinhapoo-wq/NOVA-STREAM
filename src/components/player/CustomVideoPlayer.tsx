import React, { useState, useRef, useEffect, useCallback } from 'react';
import Hls from 'hls.js';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Volume1,
  Maximize,
  Minimize,
  RotateCcw,
  RotateCw,
  Settings,
  Subtitles,
  Gauge,
  Info,
  X,
  ShieldCheck,
  Check,
  Radio,
  Sparkles,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react';
import {
  VideoItem,
  QualityLevel,
  PlaybackSpeed,
  VideoResolution,
  StreamQualityOption,
} from '../../types/video';
import {
  getLocalVideoUrl,
  classifyVideoResolution,
  formatDuration,
  formatQualityLabel,
} from '../../services/videoData';

export interface VideoMetadataUpdates {
  duration?: number;
  durationFormatted?: string;
  resolution?: VideoResolution;
}

interface CustomVideoPlayerProps {
  video: VideoItem;
  onClose: () => void;
  autoPlay?: boolean;
  onUpdateMetadata?: (videoId: string, metadata: VideoMetadataUpdates) => void;
}

export const CustomVideoPlayer: React.FC<CustomVideoPlayerProps> = ({
  video,
  onClose,
  autoPlay = true,
  onUpdateMetadata,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);

  // Obter URL de vídeo real para arquivos locais da sessão ou fonte remota de demonstração
  const effectiveVideoUrl = video.isLocalFile
    ? getLocalVideoUrl(video.id) || video.videoUrl
    : video.videoUrl;

  // Estados de reprodução
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(video.duration || 0);
  const [bufferedTime, setBufferedTime] = useState(0);
  const [volume, setVolume] = useState(0.85);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<PlaybackSpeed>(1);
  const [selectedQuality, setSelectedQuality] = useState<QualityLevel>('1080p');
  const [activeSubtitle, setActiveSubtitle] = useState<string>('pt');

  // Resolução e dimensões detectadas em tempo de execução
  const [detectedResolution, setDetectedResolution] = useState<VideoResolution>(
    video.resolution || 'N/D'
  );
  const [videoDimensions, setVideoDimensions] = useState<{ width: number; height: number } | null>(null);

  // Estados de streaming HLS adaptativo
  const [isHlsActive, setIsHlsActive] = useState(false);
  const [availableLevels, setAvailableLevels] = useState<StreamQualityOption[]>([]);
  const [requestedHlsLevel, setRequestedHlsLevel] = useState<number>(-1); // -1 = Automático (ABR)
  const [effectiveHlsLevel, setEffectiveHlsLevel] = useState<number>(-1); // Nível ativo confirmado no hls.js
  const [isLevelSwitchPending, setIsLevelSwitchPending] = useState<boolean>(false);
  const [currentBitrate, setCurrentBitrate] = useState<number | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const switchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const isHlsUrl = useCallback((url: string): boolean => {
    if (!url) return false;
    const cleanUrl = url.split('?')[0].toLowerCase();
    return cleanUrl.endsWith('.m3u8') || url.includes('.m3u8') || url.includes('/hls/');
  }, []);

  // Sincronizar resolução inicial e limpar dimensões ao alternar de vídeo
  useEffect(() => {
    setDetectedResolution(video.resolution || 'N/D');
    setVideoDimensions(null);
    setCurrentBitrate(null);
    setRequestedHlsLevel(-1);
    setEffectiveHlsLevel(-1);
    setIsLevelSwitchPending(false);
    if (switchTimeoutRef.current) {
      clearTimeout(switchTimeoutRef.current);
      switchTimeoutRef.current = null;
    }
  }, [video.id, video.resolution]);

  // Resolução efetiva para exibição honesta
  const displayResolution: VideoResolution =
    detectedResolution !== 'N/D'
      ? detectedResolution
      : !isHlsActive && video.resolution && video.resolution !== 'N/D'
        ? video.resolution
        : 'N/D';

  const resolutionFormattedLabel = formatQualityLabel(displayResolution);

  // Controles de visibilidade da interface
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isHoveringProgress, setIsHoveringProgress] = useState(false);
  const [hoverTime, setHoverTime] = useState(0);
  const [hoverPosition, setHoverPosition] = useState(0);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  type SettingsView = 'main' | 'quality' | 'speed';
  const [settingsView, setSettingsView] = useState<SettingsView>('main');
  const [videoError, setVideoError] = useState<string | null>(null);

  // Estados de feedback visual (Play/Pause central e Double-Tap Seek estilo YouTube)
  const [playPauseFeedback, setPlayPauseFeedback] = useState<'play' | 'pause' | null>(null);
  const [seekFeedback, setSeekFeedback] = useState<{ side: 'left' | 'right'; id: number } | null>(null);

  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const playPauseTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const seekFeedbackTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const singleTapTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastTapRef = useRef<{ time: number; x: number; y: number; isLeft: boolean } | null>(null);

  // Listener para confirmação física de redimensionamento do decodificador no elemento <video>
  const handleVideoResize = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    const rawHeight = el.videoHeight;
    const rawWidth = el.videoWidth;

    if (rawWidth > 0 && rawHeight > 0) {
      setVideoDimensions({ width: rawWidth, height: rawHeight });
      const detected = classifyVideoResolution(rawHeight);
      if (detected !== 'N/D') {
        setDetectedResolution(detected);
      }
      setIsLevelSwitchPending(false);
    }
  }, []);

  // Inicialização do pipeline de decodificação: Hls.js ou HTML5 Direto
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl || !effectiveVideoUrl) return;

    // Destrói instância Hls anterior se houver
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const isHls = isHlsUrl(effectiveVideoUrl);
    setIsHlsActive(isHls);
    setVideoError(null);

    // Registra listener nativo de resize para acompanhar mudanças físicas de resolução do decodificador
    videoEl.addEventListener('resize', handleVideoResize);

    if (isHls && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 60,
        capLevelToPlayerSize: false,
      });

      hlsRef.current = hls;
      hls.loadSource(effectiveVideoUrl);
      hls.attachMedia(videoEl);

      hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
        const parsedLevels: StreamQualityOption[] = [
          {
            levelIndex: -1,
            label: 'Automático',
            resolution: 'Auto',
          },
        ];

        // Ordena visualmente por resolução decrescente preservando o índice real em data.levels
        const sortedVariants = data.levels
          .map((lvl, origIdx) => ({ lvl, origIdx }))
          .sort((a, b) => (b.lvl.height || 0) - (a.lvl.height || 0));

        sortedVariants.forEach(({ lvl, origIdx }) => {
          const height = lvl.height || 0;
          const resLabel =
            height >= 2160
              ? '4K'
              : height >= 1080
              ? '1080p'
              : height >= 720
              ? '720p'
              : height >= 480
              ? '480p'
              : height > 0
              ? `${height}p`
              : `Nível ${origIdx + 1}`;

          parsedLevels.push({
            levelIndex: origIdx,
            label: resLabel,
            resolution: resLabel,
            height: lvl.height,
            width: lvl.width,
            bitrate: lvl.bitrate,
          });
        });

        setAvailableLevels(parsedLevels);
        setRequestedHlsLevel(-1);
        setEffectiveHlsLevel(-1);
        setIsLevelSwitchPending(false);

        if (autoPlay) {
          videoEl.play().catch((err) => {
            console.warn('Auto-play HLS restrito pelo navegador:', err);
            setIsPlaying(false);
          });
        }
      });

      hls.on(Hls.Events.LEVEL_SWITCHING, (_event, _data) => {
        setIsLevelSwitchPending(true);
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => {
        setEffectiveHlsLevel(data.level);
        const lvl = hls.levels[data.level];
        if (lvl && lvl.bitrate) {
          setCurrentBitrate(lvl.bitrate);
        }
        // Se a resolução física decodificada pelo elemento de vídeo já corresponder ou se a variante não declarar height
        if (videoEl.videoHeight > 0 && lvl && (!lvl.height || videoEl.videoHeight === lvl.height)) {
          setIsLevelSwitchPending(false);
          const detected = classifyVideoResolution(videoEl.videoHeight);
          if (detected !== 'N/D') {
            setDetectedResolution(detected);
          }
        }
      });

      hls.on(Hls.Events.FRAG_CHANGED, (_event, data) => {
        if (data.frag && typeof data.frag.level === 'number') {
          const fragLevel = data.frag.level;
          setEffectiveHlsLevel(fragLevel);
          const lvl = hls.levels[fragLevel];
          if (lvl && lvl.bitrate) {
            setCurrentBitrate(lvl.bitrate);
          }
          if (videoEl.videoHeight > 0 && lvl && (!lvl.height || videoEl.videoHeight === lvl.height)) {
            setIsLevelSwitchPending(false);
            const detected = classifyVideoResolution(videoEl.videoHeight);
            if (detected !== 'N/D') {
              setDetectedResolution(detected);
            }
          }
        }
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        console.warn('HLS Event:', data.type, data.details);
        if (
          data.details === Hls.ErrorDetails.LEVEL_LOAD_ERROR ||
          data.details === Hls.ErrorDetails.LEVEL_LOAD_TIMEOUT
        ) {
          console.warn('Falha no carregamento do nível HLS selecionado:', data.details);
          setIsLevelSwitchPending(false);
          if (hls.currentLevel !== -1) {
            hls.currentLevel = -1;
            setRequestedHlsLevel(-1);
          }
        }
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.warn('Erro de rede fatal no HLS, tentando recuperar...');
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.warn('Erro de mídia fatal no HLS, tentando recuperar...');
              hls.recoverMediaError();
              break;
            default:
              console.error('Erro HLS fatal:', data.details);
              hls.destroy();
              setVideoError(
                'Não foi possível estabelecer transmissão contínua com a stream HLS adaptativa.'
              );
              break;
          }
        }
      });

      return () => {
        videoEl.removeEventListener('resize', handleVideoResize);
        if (switchTimeoutRef.current) {
          clearTimeout(switchTimeoutRef.current);
          switchTimeoutRef.current = null;
        }
        if (hlsRef.current) {
          hlsRef.current.destroy();
          hlsRef.current = null;
        }
      };
    } else if (isHls && videoEl.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari / iOS suporte nativo a HLS
      videoEl.src = effectiveVideoUrl;
      setIsHlsActive(true);
      setAvailableLevels([{ levelIndex: -1, label: 'Automático (Nativo)', resolution: 'Auto' }]);
      if (autoPlay) {
        videoEl.play().catch(() => setIsPlaying(false));
      }
    } else {
      // Fonte direta MP4, WebM ou Blob local
      videoEl.src = effectiveVideoUrl;
      setIsHlsActive(false);
      setAvailableLevels([]);
      if (autoPlay) {
        videoEl.play().catch((err) => {
          console.warn('Auto-play restrito pelo navegador:', err);
          setIsPlaying(false);
        });
      }
    }

    return () => {
      videoEl.removeEventListener('resize', handleVideoResize);
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [effectiveVideoUrl, autoPlay, isHlsUrl, handleVideoResize]);

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) return '00:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Resetar timer para ocultar controles
  const showControlsTemporarily = useCallback(() => {
    setControlsVisible(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying && !showSettingsMenu) {
        setControlsVisible(false);
      }
    }, 3500);
  }, [isPlaying, showSettingsMenu]);

  // Disparar animação suave e discreta de Play / Pause no centro
  const triggerPlayPauseFeedback = useCallback((type: 'play' | 'pause') => {
    if (playPauseTimeoutRef.current) {
      clearTimeout(playPauseTimeoutRef.current);
    }
    setPlayPauseFeedback(type);
    playPauseTimeoutRef.current = setTimeout(() => {
      setPlayPauseFeedback(null);
    }, 700);
  }, []);

  // Controle de Play/Pause com feedback visual
  const togglePlay = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) {
      el.play()
        .then(() => {
          setIsPlaying(true);
          triggerPlayPauseFeedback('play');
        })
        .catch((err) => {
          console.warn('Auto-play restrito pelo navegador:', err);
          setIsPlaying(false);
        });
    } else {
      el.pause();
      setIsPlaying(false);
      triggerPlayPauseFeedback('pause');
    }
    showControlsTemporarily();
  }, [showControlsTemporarily, triggerPlayPauseFeedback]);

  // Avançar / retroceder 10s respeitando os limites do vídeo
  const seekRelative = useCallback((deltaSec: number) => {
    const el = videoRef.current;
    if (!el) return;
    const target = Math.max(0, Math.min(el.duration || duration, el.currentTime + deltaSec));
    el.currentTime = target;
    setCurrentTime(target);
    showControlsTemporarily();
  }, [duration, showControlsTemporarily]);

  // Avançar / retroceder 10s via gesto com animação discreta estilo YouTube
  const triggerDoubleTapSeek = useCallback(
    (isLeft: boolean) => {
      seekRelative(isLeft ? -10 : 10);

      if (seekFeedbackTimeoutRef.current) {
        clearTimeout(seekFeedbackTimeoutRef.current);
      }
      setSeekFeedback({ side: isLeft ? 'left' : 'right', id: Date.now() });
      seekFeedbackTimeoutRef.current = setTimeout(() => {
        setSeekFeedback(null);
      }, 650);
    },
    [seekRelative]
  );

  // Tratamento refinado de toques simples vs duplo toque na área do vídeo
  const handleVideoAreaTap = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      // Prevenir acionamento se o clique atingir botões, barra de progresso, menus ou inputs
      if (
        target.closest('button') ||
        target.closest('.player-menu-content') ||
        target.closest('.player-menu-trigger') ||
        target.closest('.group\\/progress') ||
        target.closest('input')
      ) {
        return;
      }

      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const isLeft = clickX < rect.width / 2;
      const now = Date.now();
      const lastTap = lastTapRef.current;

      const DOUBLE_TAP_WINDOW = 280; // Janela para diferenciar toque simples de duplo toque

      if (
        lastTap &&
        now - lastTap.time < DOUBLE_TAP_WINDOW &&
        Math.abs(e.clientX - lastTap.x) < 140
      ) {
        // Double tap detectado: cancela o toque simples para evitar pausar/reproduzir acidentalmente
        if (singleTapTimeoutRef.current) {
          clearTimeout(singleTapTimeoutRef.current);
          singleTapTimeoutRef.current = null;
        }
        lastTapRef.current = null;
        triggerDoubleTapSeek(lastTap.isLeft);
      } else {
        // Primeiro toque registrado
        lastTapRef.current = { time: now, x: e.clientX, y: e.clientY, isLeft };

        if (singleTapTimeoutRef.current) {
          clearTimeout(singleTapTimeoutRef.current);
        }

        singleTapTimeoutRef.current = setTimeout(() => {
          singleTapTimeoutRef.current = null;
          lastTapRef.current = null;

          // Ação de toque simples: alternar reproduzir/pausar com feedback suave
          const el = videoRef.current;
          if (!el) return;

          if (el.paused) {
            el.play()
              .then(() => {
                setIsPlaying(true);
                triggerPlayPauseFeedback('play');
              })
              .catch((err) => {
                console.warn('Reprodução restrita:', err);
                setIsPlaying(false);
              });
          } else {
            el.pause();
            setIsPlaying(false);
            triggerPlayPauseFeedback('pause');
          }
          showControlsTemporarily();
        }, DOUBLE_TAP_WINDOW);
      }
    },
    [triggerDoubleTapSeek, triggerPlayPauseFeedback, showControlsTemporarily]
  );

  // Atualização de tempo do vídeo
  const handleTimeUpdate = () => {
    const el = videoRef.current;
    if (!el) return;
    setCurrentTime(el.currentTime);
    if (el.buffered.length > 0) {
      setBufferedTime(el.buffered.end(el.buffered.length - 1));
    }
  };

  const handleLoadedMetadata = () => {
    const el = videoRef.current;
    if (!el) return;
    if (el.duration && !isNaN(el.duration)) {
      setDuration(el.duration);
    }
    setVideoError(null);

    const rawDur = el.duration;
    const rawHeight = el.videoHeight;
    const rawWidth = el.videoWidth;

    if (rawWidth > 0 && rawHeight > 0) {
      setVideoDimensions({ width: rawWidth, height: rawHeight });
    }

    const detected = classifyVideoResolution(rawHeight);
    if (detected !== 'N/D') {
      setDetectedResolution(detected);
    }

    // Propagação de metadados reais confirmados pelo player
    if (onUpdateMetadata) {
      const hasValidDuration =
        typeof rawDur === 'number' && !isNaN(rawDur) && rawDur > 0 && isFinite(rawDur);

      const updates: VideoMetadataUpdates = {};

      if (hasValidDuration) {
        updates.duration = Math.round(rawDur);
        updates.durationFormatted = formatDuration(rawDur);
      }

      if (detected !== 'N/D') {
        updates.resolution = detected;
      }

      if (updates.duration !== undefined || updates.resolution !== undefined) {
        onUpdateMetadata(video.id, updates);
      }
    }
  };

  // Clique na barra de progresso
  const handleProgressSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const bar = progressBarRef.current;
    const el = videoRef.current;
    if (!bar || !el) return;
    const rect = bar.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    const newTime = ratio * (duration || 1);
    el.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const handleProgressMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const bar = progressBarRef.current;
    if (!bar) return;
    const rect = bar.getBoundingClientRect();
    const mouseX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const ratio = mouseX / rect.width;
    setHoverPosition(mouseX);
    setHoverTime(ratio * (duration || 0));
  };

  // Volume
  const handleVolumeChange = (newVol: number) => {
    const el = videoRef.current;
    const clamped = Math.max(0, Math.min(1, newVol));
    setVolume(clamped);
    if (el) {
      el.volume = clamped;
      el.muted = clamped === 0;
    }
    setIsMuted(clamped === 0);
  };

  const toggleMute = () => {
    const el = videoRef.current;
    if (!el) return;
    if (isMuted) {
      el.muted = false;
      el.volume = volume > 0 ? volume : 0.5;
      setIsMuted(false);
    } else {
      el.muted = true;
      setIsMuted(true);
    }
  };

  // Fullscreen
  const toggleFullscreen = () => {
    const container = containerRef.current;
    if (!container) return;

    if (!document.fullscreenElement) {
      container
        .requestFullscreen()
        .then(() => setIsFullscreen(true))
        .catch(() => {
          // fallback se fullscreen api for restrita
        });
    } else {
      document
        .exitFullscreen()
        .then(() => setIsFullscreen(false))
        .catch(() => {
          // fallback
        });
    }
  };

  // Alterar velocidade
  const changeSpeed = (speed: PlaybackSpeed) => {
    setPlaybackSpeed(speed);
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
    }
  };

  // Alterar seleção visual de qualidade (e sincronizar com HLS se a stream for adaptativa)
  const changeQuality = (q: QualityLevel) => {
    setSelectedQuality(q);
    if (isHlsActive && hlsRef.current) {
      if (q === 'auto') {
        changeHlsQuality(-1, 'auto');
      } else {
        const targetLvl = availableLevels.find(
          (lvl) => lvl.label.toLowerCase() === q.toLowerCase()
        );
        if (targetLvl && targetLvl.levelIndex >= 0) {
          changeHlsQuality(targetLvl.levelIndex, targetLvl.resolution);
        }
      }
    }
  };

  // Alterar nível de qualidade real para transmissões HLS via hls.js
  const changeHlsQuality = (levelIndex: number, resLabel: string) => {
    const hls = hlsRef.current;
    const el = videoRef.current;
    if (!hls) return;

    if (switchTimeoutRef.current) {
      clearTimeout(switchTimeoutRef.current);
      switchTimeoutRef.current = null;
    }

    setRequestedHlsLevel(levelIndex);
    setSelectedQuality(resLabel.toLowerCase() as QualityLevel);

    if (levelIndex === -1) {
      // Reativa o modo Automático (ABR)
      hls.currentLevel = -1;
      setIsLevelSwitchPending(false);
    } else {
      // Solicita a qualidade manual selecionada no hls.js
      hls.currentLevel = levelIndex;

      const targetLvl = hls.levels[levelIndex];
      const targetHeight = targetLvl?.height;

      // Trata o caso em que a dimensão não muda (ex.: decodificador já está na resolução física do nível selecionado)
      if (el && targetHeight && el.videoHeight > 0 && el.videoHeight === targetHeight) {
        setIsLevelSwitchPending(false);
        if (targetLvl.bitrate) {
          setCurrentBitrate(targetLvl.bitrate);
        }
      } else {
        setIsLevelSwitchPending(true);
        // Timeout de segurança para evitar interface travada em "trocando..." se o decodificador não emitir resize
        switchTimeoutRef.current = setTimeout(() => {
          setIsLevelSwitchPending(false);
        }, 8000);
      }
    }
  };

  // Teclado
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignorar se o foco estiver em campo de texto
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA'
      ) {
        return;
      }

      if (e.code === 'Space' || e.key === 'k') {
        e.preventDefault();
        togglePlay();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        seekRelative(-10);
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        seekRelative(10);
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        toggleMute();
      } else if (e.code === 'Escape') {
        if (isFullscreen) {
          document.exitFullscreen().catch(() => {});
        } else {
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlay, seekRelative, isFullscreen, onClose]);

  // Listener para evento fullscreenchange do navegador
  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // Fechar menu de configurações ao clicar fora
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.player-menu-trigger') && !target.closest('.player-menu-content')) {
        setShowSettingsMenu(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  // Limpeza de timers ao desmontar o componente
  useEffect(() => {
    return () => {
      if (singleTapTimeoutRef.current) clearTimeout(singleTapTimeoutRef.current);
      if (playPauseTimeoutRef.current) clearTimeout(playPauseTimeoutRef.current);
      if (seekFeedbackTimeoutRef.current) clearTimeout(seekFeedbackTimeoutRef.current);
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, []);

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferedPercent = duration > 0 ? (bufferedTime / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      onClick={handleVideoAreaTap}
      onMouseMove={showControlsTemporarily}
      onTouchStart={showControlsTemporarily}
      className="relative w-full h-full min-h-[340px] md:min-h-[520px] bg-black flex items-center justify-center select-none overflow-hidden group touch-manipulation"
      style={{ touchAction: 'manipulation' }}
    >
      {/* Elemento de Vídeo HTML5 com suporte a HLS.js adaptativo e decodificação nativa */}
      <video
        ref={videoRef}
        src={isHlsActive && Hls.isSupported() ? undefined : effectiveVideoUrl}
        poster={video.posterUrl}
        playsInline
        autoPlay={autoPlay}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onResize={handleVideoResize}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onError={() => {
          if (video.isLocalFile) {
            setVideoError(
              'O navegador não conseguiu decodificar o arquivo de vídeo selecionado. Verifique se o formato (MP4, WebM) e codec (H.264/AAC) são suportados nativamente pelo seu navegador.'
            );
          } else {
            setVideoError(
              'Não foi possível carregar a fonte de vídeo remota de teste. A arquitetura de reprodução permanece ativa.'
            );
          }
        }}
        className="w-full h-full object-contain cursor-pointer max-h-screen"
      />

      {/* Fallback caso a fonte falhe */}
      {videoError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0B0C10]/95 p-6 text-center z-20">
          <div className="w-12 h-12 rounded-full bg-indigo-950/80 border border-indigo-700/50 flex items-center justify-center text-indigo-400 mb-4">
            <Info className="w-6 h-6" />
          </div>
          <h4 className="text-base font-semibold text-white mb-1">
            {video.isLocalFile
              ? 'Erro na Decodificação do Vídeo Local'
              : 'Fonte de Demonstração em Manutenção'}
          </h4>
          <p className="text-xs text-slate-300 max-w-md mb-5 leading-relaxed">{videoError}</p>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition-colors"
          >
            Voltar para a Biblioteca
          </button>
        </div>
      )}

      {/* Exibição simulada de Legenda na tela */}
      {activeSubtitle !== 'none' && isPlaying && currentTime > 2 && currentTime < duration - 2 && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 pointer-events-none px-4 py-1.5 bg-black/75 rounded text-center max-w-lg z-20">
          <p className="text-sm md:text-base font-medium text-white drop-shadow">
            {video.isLocalFile
              ? (activeSubtitle === 'pt'
                  ? 'Reprodução de arquivo local · Decodificação direta no navegador.'
                  : 'Local file playback · Direct in-browser decoding.')
              : (activeSubtitle === 'pt'
                  ? 'Transmissão autorizada · Reprodução contínua de fonte direta.'
                  : 'Authorized transmission · Direct source continuous playback.')}
          </p>
        </div>
      )}

      {/* Barra superior com botão Fechar */}
      <div
        className={`absolute top-0 left-0 right-0 p-3 sm:p-5 bg-gradient-to-b from-black/80 via-black/30 to-transparent transition-opacity duration-300 z-30 flex items-center justify-between pointer-events-none ${
          controlsVisible ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          aria-label="Voltar para a biblioteca"
          className="pointer-events-auto w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-slate-900/80 hover:bg-slate-800 active:scale-95 text-slate-200 hover:text-white flex items-center justify-center transition-all border border-slate-700/60 shadow-lg backdrop-blur-sm"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Feedback central discreto e suave de Play / Pause */}
      {playPauseFeedback && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-black/65 backdrop-blur-md border border-white/20 text-white flex items-center justify-center shadow-2xl animate-player-pop">
            {playPauseFeedback === 'play' ? (
              <Play className="w-7 h-7 sm:w-8 sm:h-8 fill-white text-white ml-0.5" />
            ) : (
              <Pause className="w-7 h-7 sm:w-8 sm:h-8 fill-white text-white" />
            )}
          </div>
        </div>
      )}

      {/* Botão inicial de Play caso o vídeo ainda não tenha iniciado */}
      {!isPlaying && currentTime === 0 && !playPauseFeedback && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-indigo-600/90 text-white flex items-center justify-center shadow-xl transition-transform">
            <Play className="w-8 h-8 sm:w-9 sm:h-9 ml-1 fill-white" />
          </div>
        </div>
      )}

      {/* Feedback elegante e discreto de Voltar 10s (estilo YouTube) */}
      {seekFeedback && seekFeedback.side === 'left' && (
        <div className="absolute left-0 top-0 bottom-0 w-1/3 flex items-center justify-center pointer-events-none z-20 overflow-hidden">
          <div className="absolute inset-y-0 left-0 w-full bg-white/[0.08] rounded-r-full animate-seek-feedback pointer-events-none" />
          <div className="relative flex items-center gap-1.5 bg-black/70 backdrop-blur-md px-3.5 py-2 rounded-full border border-white/20 text-white shadow-xl animate-seek-feedback">
            <RotateCcw className="w-4 h-4 text-white" />
            <span className="text-xs font-bold tracking-wide font-mono">10</span>
          </div>
        </div>
      )}

      {/* Feedback elegante e discreto de Avançar 10s (estilo YouTube) */}
      {seekFeedback && seekFeedback.side === 'right' && (
        <div className="absolute right-0 top-0 bottom-0 w-1/3 flex items-center justify-center pointer-events-none z-20 overflow-hidden">
          <div className="absolute inset-y-0 right-0 w-full bg-white/[0.08] rounded-l-full animate-seek-feedback pointer-events-none" />
          <div className="relative flex items-center gap-1.5 bg-black/70 backdrop-blur-md px-3.5 py-2 rounded-full border border-white/20 text-white shadow-xl animate-seek-feedback">
            <span className="text-xs font-bold tracking-wide font-mono">10</span>
            <RotateCw className="w-4 h-4 text-white" />
          </div>
        </div>
      )}

      {/* Overlay inferior de controles */}
      <div
        className={`absolute bottom-0 left-0 right-0 p-3 sm:p-5 bg-gradient-to-t from-black/95 via-black/70 to-transparent transition-opacity duration-300 z-30 ${
          controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Barra de Progresso Interativa */}
        <div
          ref={progressBarRef}
          onClick={(e) => {
            e.stopPropagation();
            handleProgressSeek(e);
          }}
          onMouseMove={handleProgressMouseMove}
          onMouseEnter={() => setIsHoveringProgress(true)}
          onMouseLeave={() => setIsHoveringProgress(false)}
          className="relative h-2 hover:h-3.5 bg-slate-800/80 hover:bg-slate-800 rounded-full cursor-pointer transition-all mb-3 group/progress"
        >
          {/* Barra de buffer carregado */}
          <div
            className="absolute top-0 left-0 bottom-0 bg-slate-700/60 rounded-full pointer-events-none transition-all"
            style={{ width: `${bufferedPercent}%` }}
          />

          {/* Barra de progresso atual */}
          <div
            className="absolute top-0 left-0 bottom-0 bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full pointer-events-none"
            style={{ width: `${progressPercent}%` }}
          />

          {/* Marcador deslizante */}
          <div
            className="absolute top-1/2 -translate-y-1/2 -ml-2 w-4 h-4 bg-white rounded-full shadow-md pointer-events-none transition-transform scale-0 group-hover/progress:scale-100"
            style={{ left: `${progressPercent}%` }}
          />

          {/* Tooltip de tempo no hover */}
          {isHoveringProgress && (
            <div
              className="absolute -top-8 -translate-x-1/2 bg-slate-900 border border-slate-700 text-slate-100 text-[11px] font-mono px-2 py-0.5 rounded shadow pointer-events-none"
              style={{ left: `${hoverPosition}px` }}
            >
              {formatTime(hoverTime)}
            </div>
          )}
        </div>

        {/* Linha de Botões de Controle */}
        <div
          onClick={(e) => e.stopPropagation()}
          className="flex items-center justify-between gap-2 text-slate-200"
        >
          {/* Lado Esquerdo: Play, Voltar 10s, Avançar 10s, Volume, Tempo */}
          <div className="flex items-center gap-1 sm:gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                togglePlay();
              }}
              aria-label={isPlaying ? 'Pausar' : 'Reproduzir'}
              className="w-10 h-10 flex items-center justify-center hover:text-white rounded-lg hover:bg-white/10 transition-colors"
            >
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 fill-current" />}
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                seekRelative(-10);
              }}
              aria-label="Voltar 10 segundos"
              className="w-10 h-10 flex items-center justify-center hover:text-white rounded-lg hover:bg-white/10 transition-colors"
              title="Voltar 10s"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                seekRelative(10);
              }}
              aria-label="Avançar 10 segundos"
              className="w-10 h-10 flex items-center justify-center hover:text-white rounded-lg hover:bg-white/10 transition-colors"
              title="Avançar 10s"
            >
              <RotateCw className="w-4 h-4" />
            </button>

            {/* Controle de Volume */}
            <div className="flex items-center group/vol">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleMute();
                }}
                aria-label={isMuted ? 'Ativar som' : 'Desativar som'}
                className="w-10 h-10 flex items-center justify-center hover:text-white rounded-lg hover:bg-white/10 transition-colors"
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="w-5 h-5 text-red-400" />
                ) : volume < 0.5 ? (
                  <Volume1 className="w-5 h-5" />
                ) : (
                  <Volume2 className="w-5 h-5" />
                )}
              </button>

              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={isMuted ? 0 : volume}
                onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                aria-label="Ajustar volume"
                className="w-0 group-hover/vol:w-16 md:group-hover/vol:w-20 transition-all duration-200 accent-indigo-500 h-1 cursor-pointer bg-slate-700 rounded-lg hidden sm:block"
              />
            </div>

            {/* Marcação de Tempo */}
            <div className="text-xs font-mono text-slate-300 ml-1 sm:ml-2 tabular-nums">
              <span>{formatTime(currentTime)}</span>
              <span className="text-slate-500 mx-1">/</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Lado Direito: Menu Unificado de Configurações e Fullscreen */}
          <div className="flex items-center gap-1 sm:gap-2">
            {/* Menu Integrado de Configurações (Qualidade + Velocidade) */}
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowSettingsMenu(!showSettingsMenu);
                  setSettingsView('main');
                }}
                className="player-menu-trigger h-10 px-2 sm:px-2.5 flex items-center gap-1.5 text-xs font-medium hover:text-white rounded-lg hover:bg-white/10 transition-colors"
                title="Configurações (Qualidade e Velocidade)"
                aria-label="Configurações"
              >
                <Settings className="w-4 h-4 text-slate-300" />
                <span className="hidden xs:inline uppercase text-[11px] font-mono text-slate-300">
                  {selectedQuality}
                </span>
              </button>

              {showSettingsMenu && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="player-menu-content absolute bottom-12 right-0 w-48 sm:w-52 max-w-[calc(100vw-1.5rem)] max-h-[60vh] bg-[#12131A]/95 border border-slate-800/90 rounded-xl p-1.5 shadow-2xl z-50 backdrop-blur-md overflow-y-auto custom-scrollbar"
                >
                  {/* Visão Principal das Configurações */}
                  {settingsView === 'main' && (
                    <div className="space-y-0.5">
                      <div className="flex items-center justify-between px-2 py-1 border-b border-slate-800/80 mb-1">
                        <span className="text-xs font-semibold text-slate-200">Configurações</span>
                        <button
                          onClick={() => setShowSettingsMenu(false)}
                          className="text-slate-400 hover:text-white p-0.5 rounded transition-colors"
                          aria-label="Fechar configurações"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Opção Qualidade */}
                      <button
                        onClick={() => setSettingsView('quality')}
                        className="w-full flex items-center justify-between px-2 py-1.5 text-xs text-slate-200 hover:bg-slate-800/70 rounded-md transition-colors group"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Sparkles className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                          <span className="truncate">Qualidade</span>
                        </div>
                        <div className="flex items-center gap-1 text-slate-400 group-hover:text-slate-200 shrink-0 ml-2">
                          <span className="text-xs uppercase whitespace-nowrap">
                            {selectedQuality}
                          </span>
                          <ChevronRight className="w-3.5 h-3.5 shrink-0" />
                        </div>
                      </button>

                      {/* Opção Velocidade */}
                      <button
                        onClick={() => setSettingsView('speed')}
                        className="w-full flex items-center justify-between px-2 py-1.5 text-xs text-slate-200 hover:bg-slate-800/70 rounded-md transition-colors group text-left"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Gauge className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                          <span className="truncate">Velocidade</span>
                        </div>
                        <div className="flex items-center gap-1 text-slate-400 group-hover:text-slate-200 shrink-0 ml-2">
                          <span className="text-xs whitespace-nowrap">
                            {playbackSpeed === 1 ? 'Normal (1x)' : `${playbackSpeed}x`}
                          </span>
                          <ChevronRight className="w-3.5 h-3.5 shrink-0" />
                        </div>
                      </button>
                    </div>
                  )}

                  {/* Submenu de Qualidade */}
                  {settingsView === 'quality' && (
                    <div className="space-y-0.5">
                      <div className="flex items-center justify-between px-2 py-1 border-b border-slate-800/80 mb-1">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => setSettingsView('main')}
                            className="text-indigo-400 hover:text-white p-0.5 -ml-1 rounded hover:bg-slate-800/70 active:bg-slate-800 transition-colors flex items-center justify-center shrink-0"
                            title="Voltar"
                            aria-label="Voltar"
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </button>
                          <span className="text-xs font-semibold text-slate-200">Qualidade</span>
                        </div>
                        <button
                          onClick={() => setShowSettingsMenu(false)}
                          className="text-slate-400 hover:text-white p-0.5 rounded transition-colors"
                          aria-label="Fechar menu"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Lista de Resoluções */}
                      {(['1080p', '720p', '480p', '360p'] as QualityLevel[]).map((q) => (
                        <button
                          key={q}
                          onClick={() => changeQuality(q)}
                          className={`w-full flex items-center justify-between px-2 py-1.5 text-xs rounded-md transition-colors ${
                            selectedQuality === q
                              ? 'bg-indigo-600/30 text-indigo-300 font-semibold'
                              : 'text-slate-300 hover:bg-slate-800'
                          }`}
                        >
                          <div className="flex items-center gap-1.5">
                            <span className="uppercase">{q}</span>
                            {q === '1080p' && (
                              <span className="text-[10px] text-slate-400 font-normal">Full HD</span>
                            )}
                            {q === '720p' && (
                              <span className="text-[10px] text-slate-400 font-normal">HD</span>
                            )}
                          </div>
                          {selectedQuality === q && (
                            <Check className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                          )}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Submenu de Velocidade */}
                  {settingsView === 'speed' && (
                    <div className="space-y-0.5">
                      <div className="flex items-center justify-between px-2 py-1 border-b border-slate-800/80 mb-1">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => setSettingsView('main')}
                            className="text-indigo-400 hover:text-white p-0.5 -ml-1 rounded hover:bg-slate-800/70 active:bg-slate-800 transition-colors flex items-center justify-center shrink-0"
                            title="Voltar"
                            aria-label="Voltar"
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </button>
                          <span className="text-xs font-semibold text-slate-200">Velocidade</span>
                        </div>
                        <button
                          onClick={() => setShowSettingsMenu(false)}
                          className="text-slate-400 hover:text-white p-0.5 rounded transition-colors"
                          aria-label="Fechar menu"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Lista de Velocidades */}
                      {([0.5, 0.75, 1, 1.25, 1.5, 2] as PlaybackSpeed[]).map((spd) => (
                        <button
                          key={spd}
                          onClick={() => changeSpeed(spd)}
                          className={`w-full flex items-center justify-between px-2 py-1.5 text-xs rounded-md transition-colors ${
                            playbackSpeed === spd
                              ? 'bg-indigo-600/30 text-indigo-300 font-semibold'
                              : 'text-slate-300 hover:bg-slate-800'
                          }`}
                        >
                          <span className="text-xs whitespace-nowrap">{spd === 1 ? '1x' : `${spd}x`}</span>
                          {playbackSpeed === spd && (
                            <Check className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Tela Cheia */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleFullscreen();
              }}
              aria-label={isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
              className="w-10 h-10 flex items-center justify-center hover:text-white rounded-lg hover:bg-white/10 transition-colors"
            >
              {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
