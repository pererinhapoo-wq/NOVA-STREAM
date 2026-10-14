import React, { useState, useRef, useEffect, useCallback } from 'react';
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
} from 'lucide-react';
import { VideoItem, QualityLevel, PlaybackSpeed } from '../../types/video';
import { getLocalVideoUrl } from '../../services/videoData';

interface CustomVideoPlayerProps {
  video: VideoItem;
  onClose: () => void;
  autoPlay?: boolean;
}

export const CustomVideoPlayer: React.FC<CustomVideoPlayerProps> = ({
  video,
  onClose,
  autoPlay = true,
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
  const [selectedQuality, setSelectedQuality] = useState<QualityLevel>('auto');
  const [activeSubtitle, setActiveSubtitle] = useState<string>('pt');

  // Controles de visibilidade da interface
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isHoveringProgress, setIsHoveringProgress] = useState(false);
  const [hoverTime, setHoverTime] = useState(0);
  const [hoverPosition, setHoverPosition] = useState(0);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [showSubtitleMenu, setShowSubtitleMenu] = useState(false);
  const [showTechInfo, setShowTechInfo] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);

  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
      if (isPlaying && !showSettingsMenu && !showSpeedMenu && !showSubtitleMenu && !showTechInfo) {
        setControlsVisible(false);
      }
    }, 3500);
  }, [isPlaying, showSettingsMenu, showSpeedMenu, showSubtitleMenu, showTechInfo]);

  // Controle de Play/Pause
  const togglePlay = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) {
      el.play()
        .then(() => setIsPlaying(true))
        .catch((err) => {
          console.warn('Auto-play restrito pelo navegador:', err);
          setIsPlaying(false);
        });
    } else {
      el.pause();
      setIsPlaying(false);
    }
    showControlsTemporarily();
  }, [showControlsTemporarily]);

  // Avançar / retroceder 10s
  const seekRelative = useCallback((deltaSec: number) => {
    const el = videoRef.current;
    if (!el) return;
    const target = Math.max(0, Math.min(el.duration || duration, el.currentTime + deltaSec));
    el.currentTime = target;
    setCurrentTime(target);
    showControlsTemporarily();
  }, [duration, showControlsTemporarily]);

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
    setShowSpeedMenu(false);
  };

  // Alterar qualidade (preparada para HLS)
  const changeQuality = (q: QualityLevel) => {
    setSelectedQuality(q);
    setShowSettingsMenu(false);
    // Em produção HLS, chamará hls.currentLevel = levelIndex
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

  // Fechar menus ao clicar fora
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.player-menu-trigger') && !target.closest('.player-menu-content')) {
        setShowSettingsMenu(false);
        setShowSpeedMenu(false);
        setShowSubtitleMenu(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferedPercent = duration > 0 ? (bufferedTime / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      onMouseMove={showControlsTemporarily}
      onTouchStart={showControlsTemporarily}
      className="relative w-full h-full min-h-[340px] md:min-h-[520px] bg-black flex items-center justify-center select-none overflow-hidden group"
    >
      {/* Elemento de Vídeo HTML5 com suporte a arquivo local real e demonstrações */}
      <video
        ref={videoRef}
        src={effectiveVideoUrl}
        poster={video.posterUrl}
        playsInline
        autoPlay={autoPlay}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
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
        onClick={togglePlay}
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
            {activeSubtitle === 'pt'
              ? 'Transmissão autorizada · Segmentos HLS criptografados via token efêmero.'
              : 'Authorized private stream · HLS segmented with ephemeral token verification.'}
          </p>
        </div>
      )}

      {/* Barra superior de informações e fechar */}
      <div
        className={`absolute top-0 left-0 right-0 p-4 md:p-6 bg-gradient-to-b from-black/80 via-black/40 to-transparent transition-opacity duration-300 z-30 flex items-center justify-between ${
          controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="flex items-center gap-3 max-w-[70%]">
          <button
            onClick={onClose}
            aria-label="Voltar para a biblioteca"
            className="w-9 h-9 rounded-full bg-slate-900/80 hover:bg-slate-800 text-slate-200 hover:text-white flex items-center justify-center transition-colors border border-slate-700/50"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="truncate">
            <div className="flex items-center gap-2 text-xs text-indigo-400 font-medium">
              <span>{video.isLocalFile ? 'Arquivo Local' : video.category}</span>
              <span aria-hidden="true">·</span>
              <span className="text-slate-400">{video.resolution}</span>
              {video.isLocalFile && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-emerald-400 font-medium">Sessão Ativa</span>
                </>
              )}
            </div>
            <h2 className="text-sm md:text-base font-bold text-white truncate">{video.title}</h2>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Botão de Informações Técnicas e Segurança */}
          <button
            onClick={() => setShowTechInfo(!showTechInfo)}
            aria-label="Informações de transmissão"
            className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors border ${
              showTechInfo
                ? 'bg-indigo-600 text-white border-indigo-500'
                : 'bg-slate-900/80 hover:bg-slate-800 text-slate-300 border-slate-700/50'
            }`}
          >
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span className="hidden sm:inline">
              {video.isLocalFile ? 'Arquivo & Decodificação' : 'Segurança & Codec'}
            </span>
          </button>
        </div>
      </div>

      {/* Painel Flutuante de Informações de Segurança e Codec */}
      {showTechInfo && (
        <div className="absolute top-16 right-4 sm:right-6 w-80 max-w-[calc(100vw-2rem)] bg-[#12131A] border border-slate-800 rounded-xl p-4 text-xs text-slate-300 shadow-2xl z-40 backdrop-blur-md">
          <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-800">
            <span className="font-semibold text-white flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              {video.isLocalFile ? 'Arquivo Local da Sessão' : 'Detalhes da Transmissão Privada'}
            </span>
            <button
              onClick={() => setShowTechInfo(false)}
              className="text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-400">Modo de Acesso:</span>
              <span className="text-emerald-400 font-medium">
                {video.isLocalFile ? 'Reprodução Local (Navegador)' : 'Privado (Sessão Segura)'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Origem:</span>
              <span className="text-slate-200">
                {video.isLocalFile ? 'Dispositivo Local (blob URL)' : 'HLS (.m3u8) / Chunked TS'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Resolução:</span>
              <span className="text-indigo-400 font-mono">{selectedQuality.toUpperCase()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Decodificação:</span>
              <span className="text-slate-200">Nativa HTML5 Media Pipeline</span>
            </div>
            <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-400 leading-relaxed">
              {video.demoNotice ||
                (video.isLocalFile
                  ? 'Arquivo de vídeo local carregado para reprodução direta no navegador durante esta sessão.'
                  : 'Vídeo de demonstração técnica autorizado para teste de layout.')}
            </div>
          </div>
        </div>
      )}

      {/* Ícone central animado ao clicar no meio do player */}
      {!isPlaying && (
        <button
          onClick={togglePlay}
          aria-label="Reproduzir vídeo"
          className="absolute w-16 h-16 md:w-20 md:h-20 rounded-full bg-indigo-600/90 hover:bg-indigo-600 text-white flex items-center justify-center shadow-xl transition-transform hover:scale-110 active:scale-95 z-20"
        >
          <Play className="w-8 h-8 md:w-10 md:h-10 ml-1 fill-white" />
        </button>
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
          onClick={handleProgressSeek}
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
        <div className="flex items-center justify-between gap-2 text-slate-200">
          {/* Lado Esquerdo: Play, Voltar 10s, Avançar 10s, Volume, Tempo */}
          <div className="flex items-center gap-1 sm:gap-2">
            <button
              onClick={togglePlay}
              aria-label={isPlaying ? 'Pausar' : 'Reproduzir'}
              className="w-10 h-10 flex items-center justify-center hover:text-white rounded-lg hover:bg-white/10 transition-colors"
            >
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 fill-current" />}
            </button>

            <button
              onClick={() => seekRelative(-10)}
              aria-label="Voltar 10 segundos"
              className="w-10 h-10 flex items-center justify-center hover:text-white rounded-lg hover:bg-white/10 transition-colors"
              title="Voltar 10s"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <button
              onClick={() => seekRelative(10)}
              aria-label="Avançar 10 segundos"
              className="w-10 h-10 flex items-center justify-center hover:text-white rounded-lg hover:bg-white/10 transition-colors"
              title="Avançar 10s"
            >
              <RotateCw className="w-4 h-4" />
            </button>

            {/* Controle de Volume */}
            <div className="flex items-center group/vol">
              <button
                onClick={toggleMute}
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

          {/* Lado Direito: Velocidade, Legendas, Resolução, Fullscreen */}
          <div className="flex items-center gap-1 sm:gap-2">
            {/* Menu de Velocidade */}
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowSpeedMenu(!showSpeedMenu);
                  setShowSettingsMenu(false);
                  setShowSubtitleMenu(false);
                }}
                className="player-menu-trigger h-9 px-2 sm:px-2.5 flex items-center gap-1 text-xs font-medium hover:text-white rounded-lg hover:bg-white/10 transition-colors"
                title="Velocidade de reprodução"
              >
                <Gauge className="w-4 h-4 text-slate-400" />
                <span>{playbackSpeed}x</span>
              </button>

              {showSpeedMenu && (
                <div className="player-menu-content absolute bottom-12 right-0 w-36 bg-[#12131A] border border-slate-800 rounded-xl p-1.5 shadow-2xl z-40">
                  <div className="px-2.5 py-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    Velocidade
                  </div>
                  {([0.5, 0.75, 1, 1.25, 1.5, 2] as PlaybackSpeed[]).map((spd) => (
                    <button
                      key={spd}
                      onClick={() => changeSpeed(spd)}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 text-xs rounded-md transition-colors ${
                        playbackSpeed === spd
                          ? 'bg-indigo-600/30 text-indigo-300 font-semibold'
                          : 'text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <span>{spd === 1 ? '1x (Normal)' : `${spd}x`}</span>
                      {playbackSpeed === spd && <Check className="w-3.5 h-3.5 text-indigo-400" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Menu de Legendas */}
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowSubtitleMenu(!showSubtitleMenu);
                  setShowSpeedMenu(false);
                  setShowSettingsMenu(false);
                }}
                className={`player-menu-trigger w-10 h-10 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors ${
                  activeSubtitle !== 'none' ? 'text-indigo-400' : 'text-slate-300 hover:text-white'
                }`}
                title="Legendas"
              >
                <Subtitles className="w-4 h-4" />
              </button>

              {showSubtitleMenu && (
                <div className="player-menu-content absolute bottom-12 right-0 w-44 bg-[#12131A] border border-slate-800 rounded-xl p-1.5 shadow-2xl z-40">
                  <div className="px-2.5 py-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    Legendas
                  </div>
                  <button
                    onClick={() => {
                      setActiveSubtitle('none');
                      setShowSubtitleMenu(false);
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 text-xs rounded-md transition-colors ${
                      activeSubtitle === 'none'
                        ? 'bg-indigo-600/30 text-indigo-300 font-semibold'
                        : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <span>Desativadas</span>
                    {activeSubtitle === 'none' && <Check className="w-3.5 h-3.5 text-indigo-400" />}
                  </button>
                  <button
                    onClick={() => {
                      setActiveSubtitle('pt');
                      setShowSubtitleMenu(false);
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 text-xs rounded-md transition-colors ${
                      activeSubtitle === 'pt'
                        ? 'bg-indigo-600/30 text-indigo-300 font-semibold'
                        : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <span>Português (Brasil)</span>
                    {activeSubtitle === 'pt' && <Check className="w-3.5 h-3.5 text-indigo-400" />}
                  </button>
                  <button
                    onClick={() => {
                      setActiveSubtitle('en');
                      setShowSubtitleMenu(false);
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 text-xs rounded-md transition-colors ${
                      activeSubtitle === 'en'
                        ? 'bg-indigo-600/30 text-indigo-300 font-semibold'
                        : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <span>Inglês (Original)</span>
                    {activeSubtitle === 'en' && <Check className="w-3.5 h-3.5 text-indigo-400" />}
                  </button>
                </div>
              )}
            </div>

            {/* Menu de Qualidade (HLS Ready) */}
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowSettingsMenu(!showSettingsMenu);
                  setShowSpeedMenu(false);
                  setShowSubtitleMenu(false);
                }}
                className="player-menu-trigger h-9 px-2 sm:px-2.5 flex items-center gap-1 text-xs font-medium hover:text-white rounded-lg hover:bg-white/10 transition-colors"
                title="Qualidade do Vídeo"
              >
                <Settings className="w-4 h-4 text-slate-400" />
                <span className="uppercase text-[11px] font-mono">
                  {selectedQuality === 'auto' ? 'Auto' : selectedQuality}
                </span>
              </button>

              {showSettingsMenu && (
                <div className="player-menu-content absolute bottom-12 right-0 w-52 bg-[#12131A] border border-slate-800 rounded-xl p-2 shadow-2xl z-40">
                  <div className="px-2 py-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                    <span>Qualidade</span>
                    <span className="text-[10px] text-indigo-400 font-normal">HLS Multi-Bitrate</span>
                  </div>
                  {(['auto', '1080p', '720p', '480p', '360p'] as QualityLevel[]).map((q) => (
                    <button
                      key={q}
                      onClick={() => changeQuality(q)}
                      className={`w-full flex items-center justify-between px-2 py-1.5 text-xs rounded-md transition-colors ${
                        selectedQuality === q
                          ? 'bg-indigo-600/30 text-indigo-300 font-semibold'
                          : 'text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="uppercase">{q === 'auto' ? 'Automático (Adaptativo)' : q}</span>
                        {q === '1080p' && (
                          <span className="text-[10px] text-slate-400 font-normal">Full HD</span>
                        )}
                      </div>
                      {selectedQuality === q && <Check className="w-3.5 h-3.5 text-indigo-400" />}
                    </button>
                  ))}
                  <div className="mt-2 pt-2 border-t border-slate-800 px-2 text-[10px] text-slate-400 leading-normal">
                    Interface conectável ao motor HLS.js / Shaka Player para transição suave de bitrate.
                  </div>
                </div>
              )}
            </div>

            {/* Tela Cheia */}
            <button
              onClick={toggleFullscreen}
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
