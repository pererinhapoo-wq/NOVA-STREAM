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
  Upload,
  FileText,
  Trash2,
  AlertCircle,
} from 'lucide-react';
import {
  VideoItem,
  QualityLevel,
  PlaybackSpeed,
  VideoResolution,
  StreamQualityOption,
  ActiveSubtitleFile,
  SubtitleCue,
} from '../../types/video';
import {
  getLocalVideoUrl,
  classifyVideoResolution,
  formatDuration,
  formatQualityLabel,
} from '../../services/videoData';
import {
  parseSrt,
  getActiveSubtitleText,
  readSubtitleFileAsync,
} from '../../services/subtitleParser';

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
    if (customSubtitleRef.current?.vttBlobUrl) {
      URL.revokeObjectURL(customSubtitleRef.current.vttBlobUrl);
    }
    setCustomSubtitle(null);
    setSubtitleError(null);
    setShowSubtitleMenu(false);
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

  // Estados de Legendas SRT (upload direto no celular Android ou computador)
  const [showSubtitleMenu, setShowSubtitleMenu] = useState(false);
  const [customSubtitle, setCustomSubtitle] = useState<ActiveSubtitleFile | null>(null);
  const [subtitleError, setSubtitleError] = useState<string | null>(null);
  const [isUploadingSubtitle, setIsUploadingSubtitle] = useState(false);
  const subtitleInputRef = useRef<HTMLInputElement>(null);
  const customSubtitleRef = useRef<ActiveSubtitleFile | null>(null);
  customSubtitleRef.current = customSubtitle;

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

  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;
  const showSettingsMenuRef = useRef(showSettingsMenu);
  showSettingsMenuRef.current = showSettingsMenu;
  const showSubtitleMenuRef = useRef(showSubtitleMenu);
  showSubtitleMenuRef.current = showSubtitleMenu;

  // Resetar timer para ocultar controles
  const showControlsTemporarily = useCallback(() => {
    setControlsVisible(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
      controlsTimeoutRef.current = null;
    }
    // Não ocultar automaticamente se o menu de legendas ou configurações estiver aberto
    if (showSettingsMenuRef.current || showSubtitleMenuRef.current) {
      return;
    }
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlayingRef.current && !showSettingsMenuRef.current && !showSubtitleMenuRef.current) {
        setControlsVisible(false);
      }
    }, 3500);
  }, []);

  // Mantém os controles sempre visíveis e cancela auto-hide enquanto qualquer menu estiver aberto
  useEffect(() => {
    if (showSubtitleMenu || showSettingsMenu) {
      setControlsVisible(true);
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
        controlsTimeoutRef.current = null;
      }
    } else if (isPlaying) {
      showControlsTemporarily();
    }
  }, [showSubtitleMenu, showSettingsMenu, isPlaying, showControlsTemporarily]);

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
        target.closest('.player-subtitle-content') ||
        target.closest('.player-subtitle-trigger') ||
        target.closest('.group\\/progress') ||
        target.closest('input')
      ) {
        return;
      }

      // Se o menu de legendas ou configurações estiver aberto, fechar os menus em vez de pausar
      if (showSubtitleMenuRef.current || showSettingsMenuRef.current) {
        setShowSubtitleMenu(false);
        setShowSettingsMenu(false);
        showControlsTemporarily();
        return;
      }

      // Se os controles estiverem invisíveis, o primeiro toque apenas exibe os controles
      if (!controlsVisible) {
        showControlsTemporarily();
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
    [triggerDoubleTapSeek, triggerPlayPauseFeedback, showControlsTemporarily, controlsVisible]
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

  // Handlers para upload, alternância e remoção de legendas SRT
  const handleSubtitleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Se o usuário selecionou acidentalmente um arquivo de mídia binária (vídeo, áudio ou imagem)
    if (file.type.startsWith('video/') || file.type.startsWith('image/') || file.type.startsWith('audio/')) {
      setSubtitleError('O arquivo selecionado é uma mídia, não um arquivo de legenda. Por favor, escolha um arquivo com extensão .srt.');
      e.target.value = '';
      return;
    }

    setIsUploadingSubtitle(true);
    setSubtitleError(null);

    try {
      const content = await readSubtitleFileAsync(file);
      const parsed = parseSrt(content);

      if (parsed.error || parsed.cues.length === 0) {
        setSubtitleError(
          parsed.error || 'Não foi possível encontrar marcações de tempo válidas no arquivo .srt selecionado.'
        );
        setIsUploadingSubtitle(false);
        return;
      }

      // Revoga URL blob anterior para evitar consumo de memória
      if (customSubtitle?.vttBlobUrl) {
        URL.revokeObjectURL(customSubtitle.vttBlobUrl);
      }

      const vttBlob = new Blob([parsed.vttContent], { type: 'text/vtt;charset=utf-8' });
      const blobUrl = URL.createObjectURL(vttBlob);

      setCustomSubtitle({
        fileName: file.name,
        fileSizeBytes: file.size,
        cues: parsed.cues,
        vttBlobUrl: blobUrl,
        isEnabled: true,
      });
      setSubtitleError(null);
    } catch (err: any) {
      console.error('Erro ao ler arquivo de legenda:', err);
      setSubtitleError(err?.message || 'Falha ao ler o arquivo selecionado no seu celular.');
    } finally {
      setIsUploadingSubtitle(false);
      e.target.value = '';
    }
  };

  const handleToggleSubtitle = () => {
    if (!customSubtitle) return;
    setCustomSubtitle((prev) => (prev ? { ...prev, isEnabled: !prev.isEnabled } : null));
  };

  const handleRemoveSubtitle = () => {
    if (customSubtitle?.vttBlobUrl) {
      URL.revokeObjectURL(customSubtitle.vttBlobUrl);
    }
    setCustomSubtitle(null);
    setSubtitleError(null);
  };

  const handleLoadDemoSrt = () => {
    const demoSrt = `1
00:00:01,000 --> 00:00:04,500
NOVA STREAM · Legenda sincronizada ativa!

2
00:00:05,000 --> 00:00:09,000
Compatível com arquivos .srt do celular Android e desktop.

3
00:00:09,500 --> 00:00:14,000
Você pode desativar, reativar ou substituir a legenda a qualquer momento.
`;
    const parsed = parseSrt(demoSrt);
    if (customSubtitle?.vttBlobUrl) {
      URL.revokeObjectURL(customSubtitle.vttBlobUrl);
    }
    const vttBlob = new Blob([parsed.vttContent], { type: 'text/vtt;charset=utf-8' });
    const blobUrl = URL.createObjectURL(vttBlob);
    setCustomSubtitle({
      fileName: 'legenda_exemplo_novastream.srt',
      fileSizeBytes: 275,
      cues: parsed.cues,
      vttBlobUrl: blobUrl,
      isEnabled: true,
    });
    setSubtitleError(null);
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
      } else if (e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        setCustomSubtitle((prev) => (prev ? { ...prev, isEnabled: !prev.isEnabled } : null));
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

  // Fechar menus de configurações e de legendas ao clicar fora
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.player-menu-trigger') && !target.closest('.player-menu-content')) {
        setShowSettingsMenu(false);
      }
      if (!target.closest('.player-subtitle-trigger') && !target.closest('.player-subtitle-content')) {
        setShowSubtitleMenu(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  // Limpeza de Blob URL de legendas ao desmontar
  useEffect(() => {
    return () => {
      if (customSubtitleRef.current?.vttBlobUrl) {
        URL.revokeObjectURL(customSubtitleRef.current.vttBlobUrl);
      }
    };
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

  // Legenda sincronizada ativa no momento da reprodução
  const activeCustomSubtitleText =
    customSubtitle && customSubtitle.isEnabled
      ? getActiveSubtitleText(customSubtitle.cues, currentTime)
      : '';

  return (
    <div
      ref={containerRef}
      onClick={handleVideoAreaTap}
      onMouseMove={showControlsTemporarily}
      onTouchStart={showControlsTemporarily}
      className="relative w-full h-full min-h-[340px] md:min-h-[520px] bg-black flex items-center justify-center select-none overflow-hidden group touch-manipulation"
      style={{ touchAction: 'manipulation' }}
    >
      {/* Elemento de Vídeo HTML5 com suporte a HLS.js adaptativo, decodificação nativa e track de legendas */}
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
      >
        {customSubtitle?.vttBlobUrl && (
          <track
            key={customSubtitle.vttBlobUrl}
            kind="subtitles"
            src={customSubtitle.vttBlobUrl}
            srcLang="pt"
            label={customSubtitle.fileName}
            default={customSubtitle.isEnabled}
          />
        )}
      </video>

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

      {/* Exibição em tela da Legenda SRT Sincronizada (com posicionamento adaptativo aos controles) */}
      {activeCustomSubtitleText && (
        <div
          className={`absolute left-1/2 -translate-x-1/2 pointer-events-none px-3.5 py-1.5 sm:px-4 sm:py-2 bg-black/85 backdrop-blur-xs rounded-lg text-center max-w-[92%] sm:max-w-xl md:max-w-2xl z-20 border border-white/10 shadow-2xl transition-all duration-200 ${
            controlsVisible ? 'bottom-20 sm:bottom-24' : 'bottom-8 sm:bottom-12'
          }`}
        >
          <p className="text-sm sm:text-base md:text-lg font-medium text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.95)] leading-snug whitespace-pre-line tracking-wide">
            {activeCustomSubtitleText}
          </p>
        </div>
      )}

      {/* Exibição simulada de Legenda legada apenas quando nenhuma legenda SRT estiver carregada */}
      {!customSubtitle && activeSubtitle !== 'none' && isPlaying && currentTime > 2 && currentTime < duration - 2 && (
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

      {/* Barra superior com botão Fechar e status de Legenda */}
      <div
        className={`absolute top-0 left-0 right-0 p-3 sm:p-5 bg-gradient-to-b from-black/85 via-black/40 to-transparent transition-opacity duration-300 z-30 flex items-center justify-between pointer-events-none ${
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

        {/* Informação do vídeo e atalho de status da legenda */}
        <div className="flex items-center gap-2 pointer-events-auto">
          {customSubtitle && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowSubtitleMenu(true);
                setShowSettingsMenu(false);
              }}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border flex items-center gap-1.5 backdrop-blur-md transition-colors cursor-pointer ${
                customSubtitle.isEnabled
                  ? 'bg-indigo-600/35 text-indigo-200 border-indigo-500/50 hover:bg-indigo-600/50'
                  : 'bg-slate-900/80 text-slate-400 border-slate-700/70 hover:bg-slate-850'
              }`}
              title="Gerenciar legenda"
            >
              <Subtitles className="w-3.5 h-3.5" />
              <span>{customSubtitle.isEnabled ? 'CC Ativa' : 'CC Desativada'}</span>
            </button>
          )}
        </div>
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
          className="flex items-center justify-between gap-1.5 sm:gap-2 text-slate-200"
        >
          {/* Lado Esquerdo: Play, Voltar 10s, Avançar 10s, Volume, Tempo */}
          <div className="flex items-center gap-1 sm:gap-2 min-w-0">
            <button
              onClick={(e) => {
                e.stopPropagation();
                togglePlay();
              }}
              aria-label={isPlaying ? 'Pausar' : 'Reproduzir'}
              className="w-9 h-9 sm:w-10 sm:h-10 shrink-0 flex items-center justify-center hover:text-white rounded-lg hover:bg-white/10 active:scale-95 transition-all"
            >
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 fill-current" />}
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                seekRelative(-10);
              }}
              aria-label="Voltar 10 segundos"
              className="w-8 h-8 sm:w-10 sm:h-10 shrink-0 hidden xs:flex items-center justify-center hover:text-white rounded-lg hover:bg-white/10 active:scale-95 transition-all"
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
              className="w-8 h-8 sm:w-10 sm:h-10 shrink-0 hidden xs:flex items-center justify-center hover:text-white rounded-lg hover:bg-white/10 active:scale-95 transition-all"
              title="Avançar 10s"
            >
              <RotateCw className="w-4 h-4" />
            </button>

            {/* Controle de Volume (oculto no mobile compacto pois smartphones usam botões físicos de volume) */}
            <div className="hidden sm:flex items-center group/vol shrink-0">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleMute();
                }}
                aria-label={isMuted ? 'Ativar som' : 'Desativar som'}
                className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center hover:text-white rounded-lg hover:bg-white/10 transition-colors"
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
            <div className="text-[11px] sm:text-xs font-mono text-slate-300 ml-0.5 sm:ml-2 tabular-nums whitespace-nowrap">
              <span>{formatTime(currentTime)}</span>
              <span className="text-slate-500 mx-1">/</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Lado Direito: Legendas (CC), Menu Unificado de Configurações e Fullscreen */}
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            {/* Input de arquivo de legenda oculto com suporte total a seleção nativa no celular Android e desktop */}
            <input
              ref={subtitleInputRef}
              type="file"
              accept=".srt,.vtt,text/plain,text/*,application/x-subrip,application/octet-stream,*/*"
              onChange={handleSubtitleFileSelect}
              className="hidden"
              aria-label="Selecionar arquivo de legenda SRT"
            />

            {/* Botão de Legendas (CC) — Principal, altamente visível no layout mobile e desktop */}
            <div className="relative">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowSubtitleMenu(!showSubtitleMenu);
                  setShowSettingsMenu(false);
                }}
                className={`player-subtitle-trigger h-9 sm:h-10 px-2.5 sm:px-3 flex items-center gap-1.5 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                  customSubtitle?.isEnabled
                    ? 'bg-indigo-600 text-white border-indigo-400 shadow-md shadow-indigo-600/30'
                    : customSubtitle
                      ? 'bg-slate-800 text-indigo-300 border-slate-700 hover:bg-slate-700'
                      : 'bg-slate-900/90 hover:bg-slate-800 text-slate-200 hover:text-white border-slate-700/80'
                }`}
                title="Legendas (SRT)"
                aria-label="Legendas (CC)"
              >
                <Subtitles className={`w-4 h-4 shrink-0 ${customSubtitle?.isEnabled ? 'text-white' : 'text-indigo-400'}`} />
                <span className="text-[11px] sm:text-xs uppercase tracking-wider font-bold">CC</span>
                {customSubtitle && (
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      customSubtitle.isEnabled ? 'bg-emerald-400' : 'bg-slate-500'
                    }`}
                  />
                )}
              </button>

              {/* Menu de Legendas: responsivo e centrado em telas mobile para nunca cortar */}
              {showSubtitleMenu && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="player-subtitle-content fixed sm:absolute bottom-16 sm:bottom-14 left-3 right-3 sm:left-auto sm:right-0 w-auto sm:w-80 max-w-sm sm:max-w-none mx-auto sm:mx-0 bg-[#12131A]/98 border border-slate-700/80 rounded-2xl sm:rounded-xl p-3 sm:p-3.5 shadow-2xl z-50 backdrop-blur-xl overflow-hidden text-slate-200 animate-in fade-in zoom-in-95 duration-150"
                >
                  {/* Cabeçalho */}
                  <div className="flex items-center justify-between pb-2.5 border-b border-slate-800/90 mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
                        <Subtitles className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-white block leading-none">Legendas</span>
                        <span className="text-[10px] text-slate-400 block leading-none mt-1">Sincronização com arquivo .SRT</span>
                      </div>
                    </div>
                    <button
                      onClick={() => setShowSubtitleMenu(false)}
                      className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-slate-800 transition-colors"
                      aria-label="Fechar menu de legendas"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Conteúdo com arquivo carregado */}
                  {customSubtitle ? (
                    <div className="space-y-2.5">
                      {/* Card do arquivo selecionado */}
                      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2 min-w-0">
                            <FileText className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-white truncate" title={customSubtitle.fileName}>
                                {customSubtitle.fileName}
                              </p>
                              <p className="text-[11px] text-slate-400 mt-0.5">
                                {customSubtitle.cues.length} falas sincronizadas
                                {customSubtitle.fileSizeBytes ? ` • ${(customSubtitle.fileSizeBytes / 1024).toFixed(1)} KB` : ''}
                              </p>
                            </div>
                          </div>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0 ${
                              customSubtitle.isEnabled
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : 'bg-slate-800 text-slate-400 border border-slate-700'
                            }`}
                          >
                            {customSubtitle.isEnabled ? 'Ativa' : 'Desativada'}
                          </span>
                        </div>
                      </div>

                      {/* Botão de Ativar / Desativar Legendas */}
                      <button
                        type="button"
                        onClick={handleToggleSubtitle}
                        className={`w-full flex items-center justify-between px-3 py-2 text-xs rounded-lg font-medium transition-colors cursor-pointer ${
                          customSubtitle.isEnabled
                            ? 'bg-indigo-600/20 text-indigo-300 hover:bg-indigo-600/30 border border-indigo-500/40'
                            : 'bg-slate-800 text-slate-300 hover:bg-slate-750 border border-slate-700/60'
                        }`}
                      >
                        <span>{customSubtitle.isEnabled ? 'Desativar exibição da legenda' : 'Ativar exibição da legenda'}</span>
                        {customSubtitle.isEnabled ? (
                          <Check className="w-4 h-4 text-indigo-400 shrink-0" />
                        ) : (
                          <span className="text-[10px] text-slate-400 font-normal">Oculta</span>
                        )}
                      </button>

                      {/* Ações de Envio / Substituição e Remoção */}
                      <div className="flex items-center gap-2 pt-0.5">
                        <button
                          type="button"
                          onClick={() => subtitleInputRef.current?.click()}
                          disabled={isUploadingSubtitle}
                          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] text-white rounded-lg text-xs font-semibold shadow-md transition-all cursor-pointer"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          <span>Enviar legenda (.SRT)</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleRemoveSubtitle}
                          className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg border border-slate-800 transition-colors"
                          title="Remover legenda"
                          aria-label="Remover legenda"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Conteúdo quando nenhuma legenda foi enviada */
                    <div className="space-y-3">
                      <div className="p-3 bg-slate-900/70 rounded-xl border border-dashed border-slate-800 text-center">
                        <p className="text-xs text-slate-200 font-semibold">Nenhuma legenda carregada</p>
                        <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                          Selecione um arquivo .srt salvo no seu celular ou computador para sincronizar com o vídeo.
                        </p>
                      </div>

                      {/* Botão Enviar legenda (.SRT) */}
                      <button
                        type="button"
                        onClick={() => subtitleInputRef.current?.click()}
                        disabled={isUploadingSubtitle}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] text-white rounded-lg text-xs font-bold shadow-lg shadow-indigo-600/30 transition-all cursor-pointer"
                      >
                        <Upload className="w-4 h-4 text-white" />
                        <span>Enviar legenda (.SRT)</span>
                      </button>

                      {/* Opção rápida de teste */}
                      <button
                        type="button"
                        onClick={handleLoadDemoSrt}
                        className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 bg-slate-800/80 hover:bg-slate-800 text-indigo-300 hover:text-indigo-200 rounded-lg text-[11px] font-medium transition-colors"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                        <span>Testar com legenda de exemplo</span>
                      </button>
                    </div>
                  )}

                  {/* Mensagem de Erro de Parsing, se houver */}
                  {subtitleError && (
                    <div className="mt-2.5 p-2 bg-red-950/60 border border-red-800/60 rounded-lg flex items-start gap-1.5 text-red-300 text-[11px] leading-tight">
                      <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                      <span>{subtitleError}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Menu Integrado de Configurações (Qualidade + Velocidade) */}
            <div className="relative">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowSettingsMenu(!showSettingsMenu);
                  setShowSubtitleMenu(false);
                  setSettingsView('main');
                }}
                className="player-menu-trigger h-9 sm:h-10 px-2 sm:px-2.5 flex items-center gap-1.5 text-xs font-medium hover:text-white rounded-lg hover:bg-white/10 transition-colors"
                title="Configurações (Qualidade e Velocidade)"
                aria-label="Configurações"
              >
                <Settings className="w-4 h-4 text-slate-300" />
                <span className="hidden sm:inline uppercase text-[11px] font-mono text-slate-300">
                  {selectedQuality}
                </span>
              </button>

              {showSettingsMenu && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="player-menu-content fixed sm:absolute bottom-16 sm:bottom-14 left-3 right-3 sm:left-auto sm:right-0 w-auto sm:w-52 max-w-sm sm:max-w-none mx-auto sm:mx-0 max-h-[60vh] bg-[#12131A]/98 border border-slate-700/80 rounded-2xl sm:rounded-xl p-2 shadow-2xl z-50 backdrop-blur-xl overflow-y-auto custom-scrollbar"
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
