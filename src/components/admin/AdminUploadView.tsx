import React, { useState, useRef, useMemo } from 'react';
import {
  FileVideo,
  CheckCircle2,
  Clock,
  Cpu,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Info,
  Layers,
  ArrowRight,
  Play,
  HardDrive,
  Link2,
  Cloud,
  Film,
  ListOrdered,
  ShieldAlert,
  Server,
  Boxes,
  List,
  Trash2,
  AlertCircle,
  CheckCircle,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import { VideoItem, VideoCategory, VideoResolution, VideoUploadStatus } from '../../types/video';
import { APP_CONFIG } from '../../config/appConfig';
import { registerLocalVideoFile } from '../../services/videoData';

// Capas pré-selecionadas de alta qualidade disponíveis para o usuário escolher
import thumbTech from '../../assets/images/video_thumb_tech_1791958055319.jpg';
import thumbNature from '../../assets/images/video_thumb_nature_1791958055994.jpg';
import thumbWorkshop from '../../assets/images/video_thumb_workshop_1791958055237.jpg';
import heroPoster from '../../assets/images/hero_streaming_poster_1791958055087.jpg';

interface AdminUploadViewProps {
  onVideoCreated: (newVideo: VideoItem) => boolean;
  onNavigateToLibrary: (videoId?: string) => void;
}

type UploadTab = 'file' | 'url_seasons' | 'cloud';

export type QueueItemStatus = 'pendente' | 'invalida' | 'duplicada';

export interface PreparedQueueItem {
  episodeNumber: number;
  originalLineNumber: number;
  rawUrl: string;
  sanitizedUrl: string;
  status: QueueItemStatus;
  statusMessage: string;
  seriesTitle: string;
  seasonNumber: number;
}

export interface BatchSummary {
  totalEpisodes: number;
  validPending: number;
  invalid: number;
  duplicates: number;
}

export const AdminUploadView: React.FC<AdminUploadViewProps> = ({
  onVideoCreated,
  onNavigateToLibrary,
}) => {
  // Controle de abas da área de envio
  const [activeUploadTab, setActiveUploadTab] = useState<UploadTab>('file');

  // Controles funcionais da aba URLs / Temporadas
  const [seriesTitle, setSeriesTitle] = useState('');
  const [seasonNumber, setSeasonNumber] = useState<number>(1);
  const [rawUrlsText, setRawUrlsText] = useState('');

  // Fila de pré-processamento estruturada
  const [preparedBatch, setPreparedBatch] = useState<PreparedQueueItem[] | null>(null);

  // Parser em tempo real das linhas não vazias
  const parsedUrls = useMemo(() => {
    if (!rawUrlsText.trim()) return [];
    return rawUrlsText
      .split('\n')
      .map((line, idx) => ({
        originalLineNumber: idx + 1,
        url: line.trim(),
      }))
      .filter((item) => item.url.length > 0);
  }, [rawUrlsText]);

  // Resumo estatístico do lote preparado
  const batchSummary: BatchSummary | null = useMemo(() => {
    if (!preparedBatch) return null;
    return {
      totalEpisodes: preparedBatch.length,
      validPending: preparedBatch.filter((i) => i.status === 'pendente').length,
      invalid: preparedBatch.filter((i) => i.status === 'invalida').length,
      duplicates: preparedBatch.filter((i) => i.status === 'duplicada').length,
    };
  }, [preparedBatch]);

  // Validador sintático puro em memória (somente http e https, sem tocar na rede)
  const validateUrlSyntax = (urlStr: string): { isValid: boolean; normalized: string; error?: string } => {
    const trimmed = urlStr.trim();
    if (!trimmed) {
      return { isValid: false, normalized: '', error: 'Linha vazia' };
    }

    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return {
          isValid: false,
          normalized: trimmed,
          error: `Esquema não suportado (${parsed.protocol}). Aceita apenas http:// ou https://`,
        };
      }
      if (!parsed.hostname || !parsed.hostname.includes('.')) {
        return {
          isValid: false,
          normalized: trimmed,
          error: 'Domínio ou hostname incompleto',
        };
      }
      return { isValid: true, normalized: trimmed };
    } catch {
      return {
        isValid: false,
        normalized: trimmed,
        error: 'Sintaxe de URL inválida',
      };
    }
  };

  // Preparar a fila local analisando sintaxe e duplicatas
  const handlePrepareBatch = () => {
    const lines = rawUrlsText.split('\n');
    const validLinesWithIndex: { originalLineNumber: number; rawUrl: string }[] = [];

    lines.forEach((line, idx) => {
      const trimmed = line.trim();
      if (trimmed.length > 0) {
        validLinesWithIndex.push({
          originalLineNumber: idx + 1,
          rawUrl: trimmed,
        });
      }
    });

    if (validLinesWithIndex.length === 0) {
      setPreparedBatch([]);
      return;
    }

    const seenUrlsSet = new Set<string>();
    const currentSeries = seriesTitle.trim() || 'Obra Sem Título';

    const queueItems: PreparedQueueItem[] = validLinesWithIndex.map((entry, idx) => {
      const episodeNumber = idx + 1;
      const { isValid, normalized, error } = validateUrlSyntax(entry.rawUrl);

      if (!isValid) {
        return {
          episodeNumber,
          originalLineNumber: entry.originalLineNumber,
          rawUrl: entry.rawUrl,
          sanitizedUrl: normalized,
          status: 'invalida',
          statusMessage: error || 'Sintaxe inválida (apenas HTTP/HTTPS suportados)',
          seriesTitle: currentSeries,
          seasonNumber,
        };
      }

      // Chave para detecção de duplicadas ignorando diferenças triviais de espaços e barra final
      const dedupeKey = normalized.toLowerCase().replace(/\/+$/, '');

      if (seenUrlsSet.has(dedupeKey)) {
        return {
          episodeNumber,
          originalLineNumber: entry.originalLineNumber,
          rawUrl: entry.rawUrl,
          sanitizedUrl: normalized,
          status: 'duplicada',
          statusMessage: 'URL repetida no próprio lote',
          seriesTitle: currentSeries,
          seasonNumber,
        };
      }

      seenUrlsSet.add(dedupeKey);

      return {
        episodeNumber,
        originalLineNumber: entry.originalLineNumber,
        rawUrl: entry.rawUrl,
        sanitizedUrl: normalized,
        status: 'pendente',
        statusMessage: 'Sintaxe válida (Aguardando etapa de rede/persistência)',
        seriesTitle: currentSeries,
        seasonNumber,
      };
    });

    setPreparedBatch(queueItems);
  };

  const handleResetPreparedBatch = () => {
    setPreparedBatch(null);
  };

  // Modelos de teste rápido para facilidade no celular e desktop (preenchimento seguro e previsível)
  const handleLoadSampleBatch = (count: number) => {
    if (!seriesTitle.trim()) {
      setSeriesTitle('Série de Treinamento 2026');
    }
    const formattedSeason = String(seasonNumber || 1).padStart(2, '0');
    const sampleUrls = Array.from({ length: count }, (_, i) => {
      const epNum = String(i + 1).padStart(2, '0');
      return `https://cdn.exemplo.com/videos/serie-demo/s${formattedSeason}e${epNum}.mp4`;
    }).join('\n');
    setRawUrlsText(sampleUrls);
    setPreparedBatch(null);
  };

  const handleClearUrls = () => {
    setRawUrlsText('');
    setPreparedBatch(null);
  };

  // Formulário de Arquivo Local
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<VideoCategory>('Treinamentos & Tutoriais');
  const [resolution, setResolution] = useState<VideoResolution>('1080p');
  const [tags, setTags] = useState('Privado, Local');
  const [selectedPoster, setSelectedPoster] = useState<string>(thumbWorkshop);

  // Arquivo original preservado para reprodução local real
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileDuration, setFileDuration] = useState<number | null>(null);

  // Pipeline de upload e processamento preparado
  const [status, setStatus] = useState<VideoUploadStatus>('aguardando');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [processingStage, setProcessingStage] = useState('');
  const [createdVideoId, setCreatedVideoId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const formatSeconds = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Selecionar arquivo real e detectar duração
  const handleFileSelect = (file: File) => {
    setSelectedFile(file);

    if (!title) {
      // Auto-preencher título com o nome limpo do arquivo
      setTitle(file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '));
    }
    setStatus('aguardando');
    setUploadProgress(0);
    setErrorMessage(null);

    // Tentar ler duração real do vídeo local
    try {
      const tempVideo = document.createElement('video');
      tempVideo.preload = 'metadata';
      const tempUrl = URL.createObjectURL(file);
      tempVideo.onloadedmetadata = () => {
        URL.revokeObjectURL(tempUrl);
        if (tempVideo.duration && !isNaN(tempVideo.duration) && tempVideo.duration > 0) {
          setFileDuration(Math.round(tempVideo.duration));
        }
      };
      tempVideo.onerror = () => {
        URL.revokeObjectURL(tempUrl);
      };
      tempVideo.src = tempUrl;
    } catch {
      // no-op se restrito
    }
  };

  // Simular pipeline de ingestão e gerar URL de reprodução local real com URL.createObjectURL
  const runIngestionSimulation = () => {
    if (!selectedFile && !title.trim()) {
      setErrorMessage('Por favor, selecione um arquivo de vídeo para reprodução.');
      return;
    }

    setErrorMessage(null);
    setStatus('enviando');
    setUploadProgress(0);

    let progress = 0;
    const uploadInterval = setInterval(() => {
      progress += 25;
      setUploadProgress(Math.min(100, progress));

      if (progress >= 100) {
        clearInterval(uploadInterval);
        setStatus('processando');
        setProcessingStage('Iniciando contêiner e associando fluxo local para a sessão...');

        setTimeout(() => {
          setProcessingStage('Validando decodificação de vídeo e áudio...');
        }, 800);

        setTimeout(() => {
          setProcessingStage('Preparando ponte para o player próprio da plataforma...');
        }, 1600);

        setTimeout(() => {
          const newId = `private-vid-${Date.now()}`;

          // Se um arquivo real foi selecionado, registrar e gerar URL de objeto local
          let videoUrl = '';
          if (selectedFile) {
            videoUrl = registerLocalVideoFile(newId, selectedFile);
          } else {
            videoUrl =
              'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4';
          }

          const calculatedDuration = fileDuration || 180;

          const newVideo: VideoItem = {
            id: newId,
            title: title.trim() || selectedFile?.name || 'Novo Vídeo Privado',
            description:
              description.trim() ||
              (selectedFile
                ? `Arquivo local "${selectedFile.name}" pronto para reprodução direta no player.`
                : 'Vídeo cadastrado para teste de interface.'),
            duration: calculatedDuration,
            durationFormatted: formatSeconds(calculatedDuration),
            category,
            tags: tags
              .split(',')
              .map((t) => t.trim())
              .filter(Boolean),
            posterUrl: selectedPoster,
            videoUrl,
            isDemo: !selectedFile,
            isLocalFile: Boolean(selectedFile),
            demoNotice: selectedFile
              ? 'Arquivo de vídeo local carregado para reprodução na sessão (sem upload externo).'
              : 'Vídeo de teste de catálogo.',
            createdAt: new Date().toISOString(),
            resolution,
            fileSizeBytes: selectedFile?.size || 150000000,
            fileSizeFormatted: selectedFile
              ? `${(selectedFile.size / (1024 * 1024)).toFixed(1)} MB`
              : '150 MB',
            uploadStatus: 'pronto',
          };

          // Adicionar ao estado global compartilhado
          const isAdded = onVideoCreated(newVideo);

          if (isAdded) {
            setCreatedVideoId(newId);
            setStatus('pronto');
            setProcessingStage('Vídeo pronto para reprodução imediata no player.');
          } else {
            setStatus('erro');
            setErrorMessage('Não foi possível registrar o vídeo na biblioteca.');
            setProcessingStage('Falha no registro do item.');
          }
        }, 2400);
      }
    }, 250);
  };

  // Resetar formulário
  const handleReset = () => {
    setTitle('');
    setDescription('');
    setSelectedFile(null);
    setFileDuration(null);
    setStatus('aguardando');
    setUploadProgress(0);
    setCreatedVideoId(null);
    setErrorMessage(null);
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Cabeçalho da Área Administrativa */}
      <div className="pb-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Central de Ingestão & Envio
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Gerencie fontes de mídia, cadastre novos conteúdos ou prepare lotes de episódios para o catálogo.
          </p>
        </div>
      </div>

      {/* Seletor de Abas de Métodos de Envio */}
      <div className="flex p-1 bg-[#12131A] border border-slate-800 rounded-xl gap-1 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveUploadTab('file')}
          className={`flex-1 min-w-[140px] px-3.5 py-2.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
            activeUploadTab === 'file'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
          }`}
        >
          <HardDrive className="w-4 h-4 shrink-0" />
          <span>Arquivo Local</span>
          <span className="hidden sm:inline-block text-[10px] uppercase font-mono px-1.5 py-0.2 rounded bg-black/20 text-indigo-100">
            Ativo
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveUploadTab('url_seasons')}
          className={`flex-1 min-w-[170px] px-3.5 py-2.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
            activeUploadTab === 'url_seasons'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
          }`}
        >
          <Link2 className="w-4 h-4 shrink-0" />
          <span>URLs / Temporadas</span>
          <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
            Em Breve
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveUploadTab('cloud')}
          className={`flex-1 min-w-[160px] px-3.5 py-2.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
            activeUploadTab === 'cloud'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
          }`}
        >
          <Cloud className="w-4 h-4 shrink-0" />
          <span>Conectores Nuvem</span>
          <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
            Planejado
          </span>
        </button>
      </div>

      {/* ABA 1: ARQUIVO LOCAL (Funcionalidade existente preservada 100%) */}
      {activeUploadTab === 'file' && (
        <div className="space-y-6">
          {/* Aviso de Transparência da Reprodução Local */}
          <div className="p-4 bg-indigo-950/40 border border-indigo-800/40 rounded-xl text-xs text-indigo-300 flex items-start gap-3">
            <Info className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-white">
                Reprodução Local em Sessão Privada
              </p>
              <p className="text-slate-300 leading-relaxed">
                O arquivo selecionado é lido diretamente pelo seu navegador com endereço temporário seguro (<code className="text-indigo-400 font-mono">blob:</code>), permitindo testar todos os controles reais do player sem enviar arquivos pesados para a nuvem nesta fase.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Formulário de Metadados (2 colunas) */}
            <div className="lg:col-span-2 space-y-4 bg-[#12131A] p-5 rounded-2xl border border-slate-800">
              <h2 className="text-sm font-bold text-white uppercase tracking-wider text-slate-300">
                1. Metadados do Vídeo
              </h2>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Título do Vídeo *
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex: Minha Apresentação Gravada"
                  className="w-full bg-[#181A24] border border-slate-700/80 rounded-lg px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Descrição / Sinopse
                </label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Descreva o propósito deste conteúdo, tópicos abordados..."
                  className="w-full bg-[#181A24] border border-slate-700/80 rounded-lg px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors resize-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Categoria
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as VideoCategory)}
                    className="w-full bg-[#181A24] border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 transition-colors"
                  >
                    {APP_CONFIG.categories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Resolução Estimada
                  </label>
                  <select
                    value={resolution}
                    onChange={(e) => setResolution(e.target.value as VideoResolution)}
                    className="w-full bg-[#181A24] border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 transition-colors"
                  >
                    <option value="4K">4K Ultra HD (2160p)</option>
                    <option value="1080p">1080p Full HD (Padrão)</option>
                    <option value="720p">720p HD</option>
                    <option value="480p">480p SD</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Tags de Indexação (separadas por vírgula)
                </label>
                <input
                  type="text"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder="Treinamento, Restrito, Diretoria"
                  className="w-full bg-[#181A24] border border-slate-700/80 rounded-lg px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors font-mono"
                />
              </div>

              {/* Seleção de Capa / Poster */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">
                  Escolher Capa de Exibição
                </label>
                <div className="grid grid-cols-4 gap-2.5">
                  {[
                    { url: thumbWorkshop, label: 'Estúdio' },
                    { url: thumbTech, label: 'Palco' },
                    { url: heroPoster, label: 'Controle' },
                    { url: thumbNature, label: 'Paisagem' },
                  ].map((p, idx) => (
                    <button
                      type="button"
                      key={idx}
                      onClick={() => setSelectedPoster(p.url)}
                      className={`relative aspect-video rounded-lg overflow-hidden border-2 transition-all ${
                        selectedPoster === p.url
                          ? 'border-indigo-500 scale-105 shadow-md shadow-indigo-500/30'
                          : 'border-slate-800 hover:border-slate-700 opacity-60 hover:opacity-100'
                      }`}
                    >
                      <img
                        src={p.url}
                        alt={p.label}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                      <span className="absolute bottom-1 right-1 text-[9px] bg-black/80 px-1 rounded text-white">
                        {p.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Área de Seleção de Arquivo e Pipeline de Status (1 coluna) */}
            <div className="space-y-4">
              <div className="bg-[#12131A] p-5 rounded-2xl border border-slate-800">
                <h2 className="text-sm font-bold text-white uppercase tracking-wider text-slate-300 mb-3">
                  2. Arquivo de Vídeo
                </h2>

                {/* Dropzone */}
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                      handleFileSelect(e.dataTransfer.files[0]);
                    }
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  className={`p-6 border-2 border-dashed rounded-xl flex flex-col items-center justify-center text-center cursor-pointer transition-colors ${
                    isDragging
                      ? 'border-indigo-500 bg-indigo-950/20'
                      : 'border-slate-800 hover:border-slate-700 bg-slate-900/40'
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="video/mp4,video/webm,video/ogg,video/quicktime,video/x-matroska"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        handleFileSelect(e.target.files[0]);
                      }
                    }}
                    className="hidden"
                  />
                  <FileVideo className="w-8 h-8 text-indigo-400 mb-2" />
                  <p className="text-xs font-semibold text-white">
                    {selectedFile ? selectedFile.name : 'Clique ou arraste um vídeo'}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Suporte nativo a MP4, WebM, OGG, MOV
                  </p>
                  {selectedFile && (
                    <div className="mt-2 flex flex-col items-center gap-1">
                      <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-2 py-0.5 rounded">
                        {(selectedFile.size / (1024 * 1024)).toFixed(1)} MB preservados
                      </span>
                      {fileDuration && (
                        <span className="text-[10px] text-indigo-300 font-mono">
                          Duração detectada: {formatSeconds(fileDuration)}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Mensagem de Erro */}
                {errorMessage && (
                  <div className="mt-3 p-2.5 bg-red-950/50 border border-red-800 text-red-300 rounded-lg text-xs flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
                    <span>{errorMessage}</span>
                  </div>
                )}

                {/* Monitor de Pipeline e Status */}
                <div className="mt-4 pt-4 border-t border-slate-800 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Estado Atual:</span>
                    <span
                      className={`font-semibold capitalize flex items-center gap-1.5 ${
                        status === 'pronto'
                          ? 'text-emerald-400'
                          : status === 'processando'
                          ? 'text-indigo-400'
                          : status === 'enviando'
                          ? 'text-amber-400'
                          : status === 'erro'
                          ? 'text-red-400'
                          : 'text-slate-400'
                      }`}
                    >
                      {status === 'pronto' && <CheckCircle2 className="w-3.5 h-3.5" />}
                      {status === 'processando' && <Cpu className="w-3.5 h-3.5 animate-spin" />}
                      {status === 'enviando' && <Clock className="w-3.5 h-3.5" />}
                      {status === 'erro' && <AlertTriangle className="w-3.5 h-3.5" />}
                      {status}
                    </span>
                  </div>

                  {/* Barra de progresso durante envio */}
                  {status === 'enviando' && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px] text-slate-400 font-mono">
                        <span>Leitura do buffer...</span>
                        <span>{uploadProgress}%</span>
                      </div>
                      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-amber-500 transition-all duration-300"
                          style={{ width: `${uploadProgress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Log do processamento */}
                  {status === 'processando' && (
                    <div className="p-2.5 bg-slate-900 rounded-lg border border-slate-800 text-[11px] font-mono text-indigo-300 space-y-1">
                      <div className="flex items-center gap-1.5 text-indigo-400 font-semibold">
                        <Layers className="w-3.5 h-3.5" />
                        <span>Vinculação do Player:</span>
                      </div>
                      <p className="text-slate-300">{processingStage}</p>
                    </div>
                  )}

                  {/* Sucesso do Processamento */}
                  {status === 'pronto' && createdVideoId && (
                    <div className="p-3 bg-emerald-950/40 border border-emerald-800/40 rounded-xl space-y-2">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-300">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <span>Vídeo Pronto para Assistir!</span>
                      </div>
                      <p className="text-[11px] text-slate-300">
                        O arquivo local foi associado à sua sessão e pode ser reproduzido imediatamente no player.
                      </p>
                      <button
                        type="button"
                        onClick={() => onNavigateToLibrary(createdVideoId)}
                        className="w-full mt-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-colors shadow-sm"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Ir para a Biblioteca & Assistir</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  {/* Botão de Disparo do Pipeline */}
                  {status !== 'pronto' && (
                    <button
                      type="button"
                      onClick={runIngestionSimulation}
                      disabled={status === 'enviando' || status === 'processando'}
                      className="w-full mt-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-semibold text-xs transition-colors flex items-center justify-center gap-2 shadow"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>
                        {status === 'enviando'
                          ? 'Processando buffer...'
                          : status === 'processando'
                          ? 'Preparando player...'
                          : 'Habilitar Reprodução no Player'}
                      </span>
                    </button>
                  )}

                  {/* Botão para cadastrar outro */}
                  {status === 'pronto' && (
                    <button
                      type="button"
                      onClick={handleReset}
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-850 text-slate-300 text-xs font-medium transition-colors flex items-center justify-center gap-1.5 border border-slate-800"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
                      <span>Cadastrar Outro Vídeo</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ABA 2: URLs / TEMPORADAS (Controles interativos e pré-visualização sequencial em tempo real) */}
      {activeUploadTab === 'url_seasons' && (
        <div className="space-y-6">
          {/* Aviso explicativo obrigatório: Próxima Etapa */}
          <div className="p-4 bg-amber-950/30 border border-amber-800/40 rounded-xl text-xs text-amber-200 flex items-start gap-3">
            <Info className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-white flex items-center gap-2">
                <span>Modo de Digitação & Teste de Estrutura</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Importação na Próxima Etapa
                </span>
              </p>
              <p className="text-slate-300 leading-relaxed">
                Você pode digitar ou colar títulos, escolher a temporada e inserir várias URLs (uma por linha) para testar a organização e a contagem sequencial de episódios no celular e no computador. A validação real de links, fila assíncrona e persistência no catálogo serão ativadas na próxima etapa mediante sua autorização.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Controles de Formulário Interativos (2 colunas) */}
            <div className="lg:col-span-2 space-y-4 bg-[#12131A] p-5 rounded-2xl border border-slate-800">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <h2 className="text-sm font-bold text-white uppercase tracking-wider text-slate-300 flex items-center gap-2">
                  <Film className="w-4 h-4 text-indigo-400" />
                  <span>Configuração da Obra & Temporada</span>
                </h2>
                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-2 py-0.5 rounded">
                  Campos Ativos
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Título da Série ou Obra *
                  </label>
                  <input
                    type="text"
                    value={seriesTitle}
                    onChange={(e) => setSeriesTitle(e.target.value)}
                    placeholder="Ex: Treinamento Corporativo Avançado"
                    className="w-full bg-[#181A24] border border-slate-700/80 rounded-lg px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Temporada
                  </label>
                  <select
                    value={seasonNumber}
                    onChange={(e) => setSeasonNumber(Number(e.target.value))}
                    className="w-full bg-[#181A24] border border-slate-700/80 rounded-lg px-3 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500 transition-colors"
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                      <option key={num} value={num}>
                        Temporada {num}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-300">
                    URLs dos Vídeos (Uma URL por linha) *
                  </label>
                  <span className="text-[10px] text-indigo-300 font-mono">
                    1 linha não vazia = 1 episódio
                  </span>
                </div>
                <textarea
                  rows={8}
                  value={rawUrlsText}
                  onChange={(e) => setRawUrlsText(e.target.value)}
                  placeholder={`Cole aqui as URLs diretas, uma por linha:\nhttps://cdn.exemplo.com/videos/s01e01.mp4\nhttps://cdn.exemplo.com/videos/s01e02.mp4\nhttps://cdn.exemplo.com/videos/s01e03.mp4`}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  className="w-full bg-[#181A24] border border-slate-700/80 rounded-lg p-3 text-xs text-indigo-300 font-mono placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors resize-y leading-relaxed"
                />
              </div>

              {/* Botões de apoio rápido para digitação e teste */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-800/80">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-slate-400">Preencher lote de teste:</span>
                  <button
                    type="button"
                    onClick={() => handleLoadSampleBatch(13)}
                    title="Preenche a caixa com 13 URLs de teste sequenciais"
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-mono rounded border border-slate-700 transition-colors active:scale-95 cursor-pointer"
                  >
                    13 URLs
                  </button>
                  <button
                    type="button"
                    onClick={() => handleLoadSampleBatch(25)}
                    title="Preenche a caixa com 25 URLs de teste sequenciais"
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-mono rounded border border-slate-700 transition-colors active:scale-95 cursor-pointer"
                  >
                    25 URLs
                  </button>
                  <button
                    type="button"
                    onClick={() => handleLoadSampleBatch(50)}
                    title="Preenche a caixa com 50 URLs de teste sequenciais"
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-mono rounded border border-slate-700 transition-colors active:scale-95 cursor-pointer"
                  >
                    50 URLs
                  </button>
                </div>
                {rawUrlsText && (
                  <button
                    type="button"
                    onClick={handleClearUrls}
                    title="Limpar todas as URLs da caixa"
                    className="px-2 py-1 text-slate-400 hover:text-red-400 text-[11px] flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Limpar Caixa</span>
                  </button>
                )}
              </div>

              {/* Botão de Disparo: Preparar Lote */}
              <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={handlePrepareBatch}
                  disabled={!rawUrlsText.trim()}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-md active:scale-98 cursor-pointer"
                >
                  <Sparkles className="w-4 h-4 text-indigo-200" />
                  <span>Preparar Lote</span>
                  {parsedUrls.length > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-indigo-950/70 border border-indigo-400/30 text-[10px] font-mono text-indigo-200">
                      {parsedUrls.length} {parsedUrls.length === 1 ? 'item' : 'itens'}
                    </span>
                  )}
                </button>

                {preparedBatch && (
                  <button
                    type="button"
                    onClick={handleResetPreparedBatch}
                    className="px-3 py-2 text-slate-400 hover:text-slate-200 text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer border border-slate-800 rounded-lg bg-slate-900/60"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Limpar Análise / Editar URLs</span>
                  </button>
                )}
              </div>

              {/* RESUMO DO LOTE PREPARADO (Quando o usuário clica em Preparar Lote) */}
              {preparedBatch && batchSummary && (
                <div className="space-y-3 pt-2">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {/* Card 1: Total */}
                    <div className="p-3 bg-[#181A24] border border-slate-800 rounded-xl">
                      <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                        Total no Lote
                      </div>
                      <div className="text-lg font-bold text-white font-mono">
                        {batchSummary.totalEpisodes}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        {batchSummary.totalEpisodes === 1 ? 'episódio detectado' : 'episódios detectados'}
                      </div>
                    </div>

                    {/* Card 2: Válidos / Pendentes */}
                    <div className="p-3 bg-emerald-950/30 border border-emerald-800/40 rounded-xl">
                      <div className="text-[10px] font-semibold text-emerald-300 uppercase tracking-wider mb-1 flex items-center gap-1">
                        <CheckCircle className="w-3 h-3 text-emerald-400" />
                        <span>Sintaxe Válida</span>
                      </div>
                      <div className="text-lg font-bold text-emerald-300 font-mono">
                        {batchSummary.validPending}
                      </div>
                      <div className="text-[10px] text-emerald-400/80 mt-0.5">
                        Pendente (pronto)
                      </div>
                    </div>

                    {/* Card 3: URLs Inválidas */}
                    <div className="p-3 bg-red-950/30 border border-red-800/40 rounded-xl">
                      <div className="text-[10px] font-semibold text-red-300 uppercase tracking-wider mb-1 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 text-red-400" />
                        <span>URLs Inválidas</span>
                      </div>
                      <div className="text-lg font-bold text-red-300 font-mono">
                        {batchSummary.invalid}
                      </div>
                      <div className="text-[10px] text-red-400/80 mt-0.5">
                        Esquema não suportado
                      </div>
                    </div>

                    {/* Card 4: Duplicadas */}
                    <div className="p-3 bg-amber-950/30 border border-amber-800/40 rounded-xl">
                      <div className="text-[10px] font-semibold text-amber-300 uppercase tracking-wider mb-1 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3 text-amber-400" />
                        <span>Duplicadas</span>
                      </div>
                      <div className="text-lg font-bold text-amber-300 font-mono">
                        {batchSummary.duplicates}
                      </div>
                      <div className="text-[10px] text-amber-400/80 mt-0.5">
                        Repetidas no lote
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* FILA DE PRÉ-PROCESSAMENTO: Exibição detalhada por linha */}
              {preparedBatch ? (
                <div className="p-4 bg-[#141620] border border-slate-800 rounded-xl space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-2 border-b border-slate-800/80">
                    <div className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-indigo-400" />
                      <span className="text-xs font-semibold text-white">
                        Fila de Pré-Processamento do Lote
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-slate-400">
                      Análise sintática local concluída
                    </span>
                  </div>

                  {preparedBatch.length === 0 ? (
                    <div className="py-6 px-4 text-center text-xs text-slate-400 bg-slate-900/40 border border-dashed border-slate-800 rounded-lg">
                      Nenhuma linha com conteúdo foi encontrada para analisar.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-72 overflow-y-auto pr-1 custom-scrollbar">
                      {preparedBatch.map((item, idx) => {
                        const epNumberStr = String(item.episodeNumber).padStart(2, '0');
                        return (
                          <div
                            key={`queue-item-${item.originalLineNumber}-${idx}`}
                            className={`p-3 rounded-lg border text-xs space-y-1.5 transition-colors ${
                              item.status === 'pendente'
                                ? 'bg-[#181A24] border-slate-800 hover:border-slate-700'
                                : item.status === 'invalida'
                                ? 'bg-red-950/20 border-red-800/50 hover:border-red-700'
                                : 'bg-amber-950/20 border-amber-800/50 hover:border-amber-700'
                            }`}
                          >
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className="px-1.5 py-0.5 bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 font-mono text-[10px] font-bold rounded">
                                  EP {epNumberStr}
                                </span>
                                <span className="font-semibold text-white text-xs">
                                  {item.seriesTitle} • T{item.seasonNumber}E{epNumberStr}
                                </span>
                              </div>

                              <div>
                                {item.status === 'pendente' && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-950/60 border border-emerald-700/60 text-emerald-300 font-mono text-[10px] font-semibold">
                                    <Clock className="w-3 h-3 text-emerald-400" />
                                    <span>Pendente</span>
                                  </span>
                                )}
                                {item.status === 'invalida' && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-950/60 border border-red-700/60 text-red-300 font-mono text-[10px] font-semibold">
                                    <AlertTriangle className="w-3 h-3 text-red-400" />
                                    <span>URL inválida</span>
                                  </span>
                                )}
                                {item.status === 'duplicada' && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-950/60 border border-amber-700/60 text-amber-300 font-mono text-[10px] font-semibold">
                                    <AlertCircle className="w-3 h-3 text-amber-400" />
                                    <span>Duplicada no lote</span>
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[11px] font-mono text-slate-400">
                              <span className="truncate max-w-full sm:max-w-[420px] bg-slate-900/80 px-2 py-0.5 rounded border border-slate-800/60">
                                Linha {item.originalLineNumber}: {item.rawUrl}
                              </span>
                              <span
                                className={`text-[10px] ${
                                  item.status === 'pendente'
                                    ? 'text-emerald-400/90'
                                    : item.status === 'invalida'
                                    ? 'text-red-400/90'
                                    : 'text-amber-400/90'
                                }`}
                              >
                                {item.statusMessage}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
                    <span>
                      Nota de Integridade: Somente a sintaxe foi analisada. Nenhuma requisição HTTP foi feita.
                    </span>
                  </div>
                </div>
              ) : (
                /* Pré-visualização Simples antes de clicar em Preparar Lote */
                <div className="p-4 bg-[#141620] border border-slate-800 rounded-xl space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-2 border-b border-slate-800/80">
                    <div className="flex items-center gap-2">
                      <ListOrdered className="w-4 h-4 text-indigo-400" />
                      <span className="text-xs font-semibold text-white">
                        Mapeamento Inicial das Linhas
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-indigo-950/80 border border-indigo-700/60 text-indigo-300 font-semibold">
                        {parsedUrls.length} {parsedUrls.length === 1 ? 'episódio detectado' : 'episódios detectados'}
                      </span>
                      {rawUrlsText && (
                        <span className="text-[10px] font-mono text-slate-400">
                          ({parsedUrls.length} de {rawUrlsText.split('\n').length} linhas)
                        </span>
                      )}
                    </div>
                  </div>

                  {parsedUrls.length === 0 ? (
                    <div className="py-6 px-4 text-center text-xs text-slate-400 bg-slate-900/40 border border-dashed border-slate-800 rounded-lg">
                      <p className="text-slate-300 font-medium">Nenhuma URL inserida até o momento.</p>
                      <p className="text-[11px] text-slate-400 mt-1 max-w-md mx-auto">
                        Digite ou cole URLs na caixa acima (uma por linha) ou use os atalhos de lote para montar a sequência de episódios e clique em "Preparar Lote".
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1 custom-scrollbar">
                      {parsedUrls.map((item, idx) => {
                        const epNumberStr = String(idx + 1).padStart(2, '0');
                        return (
                          <div
                            key={`preview-line-${item.originalLineNumber}-${idx}`}
                            className="p-2.5 bg-[#181A24] border border-slate-800 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs hover:border-slate-700 transition-colors"
                          >
                            <div className="flex items-center gap-2.5 shrink-0">
                              <span className="px-1.5 py-0.5 bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 font-mono text-[10px] font-bold rounded">
                                EP {epNumberStr}
                              </span>
                              <span className="font-semibold text-slate-200 text-xs">
                                {seriesTitle.trim() || 'Obra Sem Título'} • T{seasonNumber}E{epNumberStr}
                              </span>
                            </div>
                            <div className="font-mono text-[11px] text-slate-400 truncate max-w-full sm:max-w-[320px] bg-slate-900/80 px-2 py-0.5 rounded border border-slate-800/60">
                              Linha {item.originalLineNumber}: {item.url}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
                    <span>
                      Clique no botão <strong>"Preparar Lote"</strong> para validar sintaxe e duplicatas.
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Painel Lateral: Critérios de Segurança e Fila (1 coluna) */}
            <div className="space-y-4">
              <div className="bg-[#12131A] p-5 rounded-2xl border border-slate-800 space-y-3">
                <h2 className="text-sm font-bold text-white uppercase tracking-wider text-slate-300 flex items-center gap-2">
                  <Boxes className="w-4 h-4 text-amber-400" />
                  <span>Pipeline em Fila</span>
                </h2>

                <p className="text-xs text-slate-400 leading-relaxed">
                  Para garantir que o navegador não congele ao processar lotes extensos (ex: 13, 25 ou 50 URLs), a importação seguirá estes princípios técnicos:
                </p>

                <ul className="text-xs text-slate-300 space-y-2 border-t border-slate-800 pt-3">
                  <li className="flex items-start gap-2">
                    <span className="text-indigo-400 font-bold">•</span>
                    <span><strong>Concorrência Máxima:</strong> 2 a 3 verificações simultâneas de cabeçalho HTTP (próxima etapa).</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-indigo-400 font-bold">•</span>
                    <span><strong>Antiduplicação:</strong> Checagem imediata contra URLs já presentes no próprio lote.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-indigo-400 font-bold">•</span>
                    <span><strong>Validação Sintática:</strong> Aceita estritamente esquemas HTTP e HTTPS.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-indigo-400 font-bold">•</span>
                    <span><strong>Cadastro Atômico:</strong> Somente links confirmados serão persistidos na fase de cadastro.</span>
                  </li>
                </ul>

                <div className="mt-4 pt-3 border-t border-slate-800 text-center space-y-2">
                  <div className="text-[11px] font-mono text-slate-400 bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
                    Estado:{' '}
                    {preparedBatch ? (
                      <span className="text-emerald-400 font-semibold">
                        Lote Analisado ({batchSummary?.validPending} válidos)
                      </span>
                    ) : (
                      <span className="text-amber-400 font-semibold">
                        Aguardando "Preparar Lote"
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Análise em memória. Nenhuma requisição de rede ou persistência nesta fase.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ABA 3: CONECTORES DE NUVEM (Google Drive, Mux, Mega) */}
      {activeUploadTab === 'cloud' && (
        <div className="space-y-6">
          {/* Informação sobre os conectores */}
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-300 flex items-start gap-3">
            <Server className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-white">
                Status das Integrações de Terceiros
              </p>
              <p className="text-slate-400 leading-relaxed">
                Os conectores abaixo foram catalogados no levantamento de arquitetura da plataforma NOVA STREAM. Atualmente são recursos não implementados e dependem de serviços de backend dedicados para funcionar com segurança.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Card 1: Google Drive */}
            <div className="bg-[#12131A] p-5 rounded-2xl border border-slate-800 flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 font-bold text-xs">
                    GD
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                    Não Implementado
                  </span>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Google Drive</h3>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    Armazenamento de arquivos de vídeo em pastas do Google Drive.
                  </p>
                </div>
                <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800/80 text-[11px] text-slate-400 space-y-1">
                  <div className="text-slate-300 font-semibold">Requisitos Técnicos:</div>
                  <p>Exige OAuth 2.0 e proxy backend para contornar bloqueios de CORS e limites de visualização diária.</p>
                </div>
              </div>
              <div className="pt-3 border-t border-slate-800/80 text-[11px] font-mono text-slate-500 text-center">
                Sem conexão ativa nesta versão
              </div>
            </div>

            {/* Card 2: Mux Video */}
            <div className="bg-[#12131A] p-5 rounded-2xl border border-slate-800 flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 font-bold text-xs">
                    MUX
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                    Não Implementado
                  </span>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Mux Video</h3>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    Streaming profissional sob demanda via protocolo HLS adaptativo.
                  </p>
                </div>
                <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800/80 text-[11px] text-slate-400 space-y-1">
                  <div className="text-slate-300 font-semibold">Requisitos Técnicos:</div>
                  <p>Exige leitor HLS (.m3u8) no player próprio do NOVA STREAM e assinatura de tokens com chaves privadas de API.</p>
                </div>
              </div>
              <div className="pt-3 border-t border-slate-800/80 text-[11px] font-mono text-slate-500 text-center">
                Sem conexão ativa nesta versão
              </div>
            </div>

            {/* Card 3: Mega */}
            <div className="bg-[#12131A] p-5 rounded-2xl border border-slate-800 flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="w-9 h-9 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 font-bold text-xs">
                    MG
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                    Não Implementado
                  </span>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Mega (NZ)</h3>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    Hospedagem em nuvem com criptografia de ponta a ponta.
                  </p>
                </div>
                <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800/80 text-[11px] text-slate-400 space-y-1">
                  <div className="text-slate-300 font-semibold">Requisitos Técnicos:</div>
                  <p>Exige descriptografia em chunks AES no navegador ou conversor externo, impedindo reprodução direta por tag HTML5.</p>
                </div>
              </div>
              <div className="pt-3 border-t border-slate-800/80 text-[11px] font-mono text-slate-500 text-center">
                Sem conexão ativa nesta versão
              </div>
            </div>
          </div>

          {/* Aviso de Segurança de Credenciais */}
          <div className="p-4 bg-[#12131A] border border-slate-800 rounded-xl flex items-center gap-3 text-xs text-slate-400">
            <ShieldAlert className="w-4 h-4 text-indigo-400 shrink-0" />
            <span>
              <strong>Diretriz de Segurança:</strong> Nenhuma credencial secreta, token OAuth ou chave de serviço é mantida no código do cliente.
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
