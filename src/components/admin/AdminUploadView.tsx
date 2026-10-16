import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
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
  Wifi,
  WifiOff,
  StopCircle,
  Globe,
  Loader2,
  Check,
  ChevronDown,
  ChevronUp,
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

export type NetworkValidationStatus =
  | 'nao_iniciada'
  | 'validando'
  | 'midia_compativel'
  | 'servidor_conectado'
  | 'acesso_negado_ou_expirado'
  | 'bloqueado_ssrf'
  | 'erro_rede'
  | 'inconclusivo';

export interface NetworkValidationDetail {
  httpStatus?: number;
  httpStatusText?: string;
  contentType?: string;
  contentLength?: number;
  isMediaCompatible: boolean;
  mediaTypeDetected?: string;
  supportsRangeRequests: boolean;
  timingMs: number;
  truncated?: boolean;
  diagnosticLevel: string;
  diagnosticMessage: string;
}

export interface PreparedQueueItem {
  episodeNumber: number;
  originalLineNumber: number;
  rawUrl: string;
  sanitizedUrl: string;
  status: QueueItemStatus;
  statusMessage: string;
  seriesTitle: string;
  seasonNumber: number;
  networkStatus?: NetworkValidationStatus;
  networkResult?: NetworkValidationDetail;
  networkError?: string;
}

export interface BatchSummary {
  totalEpisodes: number;
  validPending: number;
  invalid: number;
  duplicates: number;
}

/**
 * Normaliza e sanitiza a URL para exibição segura na interface,
 * ocultando tokens de autenticação e assinaturas de query/hash.
 */
export function getSafeDisplayUrl(rawUrl: string): { display: string; hasTokens: boolean } {
  try {
    const u = new URL(rawUrl);
    const hasTokens = u.search.length > 0 || u.hash.length > 0;
    const display = `${u.protocol}//${u.host}${u.pathname}`;
    return { display, hasTokens };
  } catch {
    return { display: rawUrl, hasTokens: false };
  }
}

/**
 * Formata bytes numéricos de forma humanamente legível.
 */
export function formatBytes(bytes?: number): string {
  if (!bytes || isNaN(bytes) || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
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

  // Estados de controle da validação de rede pela API
  const [isValidating, setIsValidating] = useState<boolean>(false);
  const [validationProgress, setValidationProgress] = useState<{ completed: number; total: number }>({
    completed: 0,
    total: 0,
  });
  const [cancellationNotice, setCancellationNotice] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef<boolean>(true);
  const isQueueRunningRef = useRef<boolean>(false);

  // Controle de expansão/recolhimento dos detalhes de diagnóstico individual por episódio
  const [expandedDiagnostics, setExpandedDiagnostics] = useState<Record<number, boolean>>({});

  const toggleDiagnostic = useCallback((episodeNumber: number) => {
    setExpandedDiagnostics((prev) => ({
      ...prev,
      [episodeNumber]: !prev[episodeNumber],
    }));
  }, []);

  const handleExpandAllDiagnostics = useCallback(() => {
    if (!preparedBatch) return;
    const allExpanded: Record<number, boolean> = {};
    preparedBatch.forEach((item) => {
      allExpanded[item.episodeNumber] = true;
    });
    setExpandedDiagnostics(allExpanded);
  }, [preparedBatch]);

  const handleCollapseAllDiagnostics = useCallback(() => {
    setExpandedDiagnostics({});
  }, []);

  // Limpeza de cancelamento ao desmontar o componente
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

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

  // Resumo estatístico da análise local do lote preparado
  const batchSummary: BatchSummary | null = useMemo(() => {
    if (!preparedBatch) return null;
    return {
      totalEpisodes: preparedBatch.length,
      validPending: preparedBatch.filter((i) => i.status === 'pendente').length,
      invalid: preparedBatch.filter((i) => i.status === 'invalida').length,
      duplicates: preparedBatch.filter((i) => i.status === 'duplicada').length,
    };
  }, [preparedBatch]);

  // Resumo estatístico detalhado da validação de rede
  const networkSummary = useMemo(() => {
    if (!preparedBatch) return null;
    const validItems = preparedBatch.filter((i) => i.status === 'pendente');
    const mediaCompatible = validItems.filter((i) => i.networkStatus === 'midia_compativel').length;
    const serverConnected = validItems.filter((i) => i.networkStatus === 'servidor_conectado').length;
    const accessDeniedOrExpired = validItems.filter((i) => i.networkStatus === 'acesso_negado_ou_expirado').length;
    const ssrfBlocked = validItems.filter((i) => i.networkStatus === 'bloqueado_ssrf').length;
    const networkError = validItems.filter((i) => i.networkStatus === 'erro_rede').length;
    const inconclusive = validItems.filter((i) => i.networkStatus === 'inconclusivo').length;
    const validating = validItems.filter((i) => i.networkStatus === 'validando').length;
    const unvalidated = validItems.filter((i) => !i.networkStatus || i.networkStatus === 'nao_iniciada').length;
    const totalValidated = validItems.filter(
      (i) => i.networkStatus && i.networkStatus !== 'nao_iniciada' && i.networkStatus !== 'validando'
    ).length;
    const failedOrInconclusive = accessDeniedOrExpired + networkError + inconclusive;

    return {
      totalToValidate: validItems.length,
      totalValidated,
      mediaCompatible,
      serverConnected,
      accessDeniedOrExpired,
      ssrfBlocked,
      networkError,
      inconclusive,
      validating,
      unvalidated,
      failedOrInconclusive,
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
    if (isValidating) {
      abortControllerRef.current?.abort();
      setIsValidating(false);
      isQueueRunningRef.current = false;
    }
    setCancellationNotice(null);

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
          networkStatus: 'nao_iniciada',
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
          networkStatus: 'nao_iniciada',
        };
      }

      seenUrlsSet.add(dedupeKey);

      return {
        episodeNumber,
        originalLineNumber: entry.originalLineNumber,
        rawUrl: entry.rawUrl,
        sanitizedUrl: normalized,
        status: 'pendente',
        statusMessage: 'Sintaxe válida (Aguardando validação de rede)',
        seriesTitle: currentSeries,
        seasonNumber,
        networkStatus: 'nao_iniciada',
      };
    });

    setPreparedBatch(queueItems);
    setExpandedDiagnostics({});
  };

  const handleResetPreparedBatch = () => {
    if (isValidating) {
      abortControllerRef.current?.abort();
      setIsValidating(false);
      isQueueRunningRef.current = false;
    }
    setPreparedBatch(null);
    setCancellationNotice(null);
    setExpandedDiagnostics({});
  };

  // Modelos de teste rápido para facilidade no celular e desktop (preenchimento seguro e previsível)
  const handleLoadSampleBatch = (count: number) => {
    if (isValidating) return;
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
    setCancellationNotice(null);
  };

  const handleClearUrls = () => {
    if (isValidating) return;
    setRawUrlsText('');
    setPreparedBatch(null);
    setCancellationNotice(null);
  };

  // Motor central de validação de rede: concorrência máxima de 2 requisições simultâneas
  const executeBatchValidation = useCallback(
    async (targetIndices?: number[]) => {
      if (isQueueRunningRef.current) return;
      if (!preparedBatch || preparedBatch.length === 0) return;

      const batchSnapshot = preparedBatch;

      let indicesToValidate: number[] = [];
      if (targetIndices && targetIndices.length > 0) {
        indicesToValidate = targetIndices.filter(
          (idx) => batchSnapshot[idx] && batchSnapshot[idx].status === 'pendente'
        );
      } else {
        // Valida todos os itens pendentes da análise local (ignora estritamente inválidas e duplicadas)
        indicesToValidate = batchSnapshot
          .map((item, idx) => (item.status === 'pendente' ? idx : -1))
          .filter((idx) => idx !== -1);
      }

      if (indicesToValidate.length === 0) return;

      isQueueRunningRef.current = true;
      setIsValidating(true);
      setCancellationNotice(null);
      setValidationProgress({ completed: 0, total: indicesToValidate.length });

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      // Marca visualmente os itens selecionados como 'validando'
      setPreparedBatch((prev) => {
        if (!prev) return null;
        return prev.map((item, idx) => {
          if (indicesToValidate.includes(idx)) {
            return {
              ...item,
              networkStatus: 'validando',
              networkResult: undefined,
              networkError: undefined,
            };
          }
          return item;
        });
      });

      let nextQueuePointer = 0;
      let completedCount = 0;

      const runWorker = async () => {
        while (nextQueuePointer < indicesToValidate.length) {
          if (abortController.signal.aborted) {
            break;
          }

          const queuePointer = nextQueuePointer++;
          if (queuePointer >= indicesToValidate.length) {
            break;
          }

          const itemIndex = indicesToValidate[queuePointer];
          const itemToValidate = batchSnapshot[itemIndex];
          if (!itemToValidate) continue;

          let netStatus: NetworkValidationStatus = 'inconclusivo';
          let netResult: NetworkValidationDetail | undefined = undefined;
          let netError: string | undefined = undefined;

          try {
            const response = await fetch('/api/validate-url', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ url: itemToValidate.rawUrl }),
              signal: abortController.signal,
            });

            let data: any = null;
            try {
              data = await response.json();
            } catch {
              netStatus = 'inconclusivo';
              netError = `Resposta não formatada em JSON (HTTP ${response.status}).`;
            }

            if (response.ok && data) {
              const diagLevel = data.diagnostic?.level;
              if (diagLevel === 'midia_compativel') {
                netStatus = 'midia_compativel';
              } else if (diagLevel === 'servidor_conectado') {
                netStatus = 'servidor_conectado';
              } else if (diagLevel === 'acesso_negado_ou_expirado') {
                netStatus = 'acesso_negado_ou_expirado';
              } else if (diagLevel === 'bloqueado_ssrf') {
                netStatus = 'bloqueado_ssrf';
              } else if (diagLevel === 'erro_rede') {
                netStatus = 'erro_rede';
              } else if (diagLevel === 'sintaxe_invalida') {
                netStatus = 'inconclusivo';
              } else {
                netStatus = 'inconclusivo';
              }

              netResult = {
                httpStatus: data.httpStatus,
                httpStatusText: data.httpStatusText,
                contentType: data.contentType,
                contentLength: data.contentLength,
                isMediaCompatible: Boolean(data.isMediaCompatible),
                mediaTypeDetected: data.mediaTypeDetected,
                supportsRangeRequests: Boolean(data.supportsRangeRequests),
                timingMs: data.timingMs ?? 0,
                truncated: data.truncated,
                diagnosticLevel: diagLevel || 'inconclusivo',
                diagnosticMessage:
                  data.diagnostic?.message || 'Sem mensagem diagnóstica.',
              };
            } else if (data && data.error) {
              if (response.status === 429) {
                netStatus = 'inconclusivo';
                netError = `${data.error} (Você pode repetir a validação em instantes).`;
              } else if (response.status === 400) {
                netStatus = 'inconclusivo';
                netError = data.error;
              } else {
                netStatus = 'erro_rede';
                netError = data.error;
              }
            } else {
              netStatus = 'erro_rede';
              netError = `Erro HTTP ${response.status} ao validar na API.`;
            }
          } catch (err: any) {
            if (err.name === 'AbortError' || abortController.signal.aborted) {
              netStatus = 'inconclusivo';
              netError = 'Validação cancelada pelo usuário.';
            } else {
              netStatus = 'erro_rede';
              netError = err.message || 'Falha de conexão com a API de validação.';
            }
          }

          if (!isMountedRef.current) return;

          completedCount++;
          setValidationProgress({
            completed: completedCount,
            total: indicesToValidate.length,
          });

          setPreparedBatch((prev) => {
            if (!prev) return null;
            return prev.map((item, idx) => {
              if (idx === itemIndex) {
                return {
                  ...item,
                  networkStatus: netStatus,
                  networkResult: netResult,
                  networkError: netError,
                };
              }
              return item;
            });
          });
        }
      };

      // Concorrência estrita: máximo de 2 workers simultâneos
      const workerCount = Math.min(2, indicesToValidate.length);
      const workerPromises: Promise<void>[] = [];
      for (let w = 0; w < workerCount; w++) {
        workerPromises.push(runWorker());
      }

      await Promise.all(workerPromises);

      if (!isMountedRef.current) return;

      if (abortController.signal.aborted) {
        setPreparedBatch((prev) => {
          if (!prev) return null;
          return prev.map((item) => {
            if (item.networkStatus === 'validando') {
              return {
                ...item,
                networkStatus: 'inconclusivo',
                networkError: 'Cancelado antes da execução.',
              };
            }
            return item;
          });
        });
        setCancellationNotice(
          'Fila de validação cancelada pelo usuário. Novas requisições foram interrompidas; requisições já transmitidas ao servidor concluem de forma segura.'
        );
      }

      isQueueRunningRef.current = false;
      setIsValidating(false);
      abortControllerRef.current = null;
    },
    [preparedBatch]
  );

  // Cancelar a fila de validação em andamento
  const handleCancelValidation = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  // Repetir apenas itens com falha de rede, acesso negado ou inconclusivos
  const handleRetryFailedOrInconclusive = useCallback(() => {
    if (!preparedBatch || isValidating) return;
    const targetIndices = preparedBatch
      .map((item, idx) => {
        if (
          item.status === 'pendente' &&
          (item.networkStatus === 'erro_rede' ||
            item.networkStatus === 'inconclusivo' ||
            item.networkStatus === 'acesso_negado_ou_expirado')
        ) {
          return idx;
        }
        return -1;
      })
      .filter((idx) => idx !== -1);

    if (targetIndices.length > 0) {
      executeBatchValidation(targetIndices);
    }
  }, [preparedBatch, isValidating, executeBatchValidation]);

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
          {/* Aviso de Orientação Técnica: Validação de Lote e Rede */}
          <div className="p-4 bg-indigo-950/30 border border-indigo-800/40 rounded-xl text-xs text-indigo-200 flex items-start gap-3">
            <Info className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-white flex items-center gap-2">
                <span>Validação Estrutural e de Rede de Lotes de Episódios</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  API Ativa (/api/validate-url)
                </span>
              </p>
              <p className="text-slate-300 leading-relaxed">
                Configure a obra e a temporada, insira as URLs (uma por linha) e clique em <strong>"Preparar Lote"</strong> para realizar a análise sintática e a detecção de duplicatas em memória. Com o lote preparado, use a ação <strong>"Validar URLs pela rede"</strong> para inspecionar disponibilidade, códigos HTTP e cabeçalhos de mídia com concorrência segura (máximo de 2 requisições simultâneas via backend).
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
                    disabled={isValidating}
                    placeholder="Ex: Treinamento Corporativo Avançado"
                    className="w-full bg-[#181A24] border border-slate-700/80 rounded-lg px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Temporada
                  </label>
                  <select
                    value={seasonNumber}
                    onChange={(e) => setSeasonNumber(Number(e.target.value))}
                    disabled={isValidating}
                    className="w-full bg-[#181A24] border border-slate-700/80 rounded-lg px-3 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
                  disabled={isValidating}
                  placeholder={`Cole aqui as URLs diretas, uma por linha:\nhttps://cdn.exemplo.com/videos/s01e01.mp4\nhttps://cdn.exemplo.com/videos/s01e02.mp4\nhttps://cdn.exemplo.com/videos/s01e03.mp4`}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  className="w-full bg-[#181A24] border border-slate-700/80 rounded-lg p-3 text-xs text-indigo-300 font-mono placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors resize-y leading-relaxed disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>

              {/* Botões de apoio rápido para digitação e teste */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-800/80">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-slate-400">Preencher lote de teste:</span>
                  <button
                    type="button"
                    onClick={() => handleLoadSampleBatch(13)}
                    disabled={isValidating}
                    title="Preenche a caixa com 13 URLs de teste sequenciais"
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-slate-300 text-[10px] font-mono rounded border border-slate-700 transition-colors active:scale-95 cursor-pointer"
                  >
                    13 URLs
                  </button>
                  <button
                    type="button"
                    onClick={() => handleLoadSampleBatch(25)}
                    disabled={isValidating}
                    title="Preenche a caixa com 25 URLs de teste sequenciais"
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-slate-300 text-[10px] font-mono rounded border border-slate-700 transition-colors active:scale-95 cursor-pointer"
                  >
                    25 URLs
                  </button>
                  <button
                    type="button"
                    onClick={() => handleLoadSampleBatch(50)}
                    disabled={isValidating}
                    title="Preenche a caixa com 50 URLs de teste sequenciais"
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-slate-300 text-[10px] font-mono rounded border border-slate-700 transition-colors active:scale-95 cursor-pointer"
                  >
                    50 URLs
                  </button>
                </div>
                {rawUrlsText && (
                  <button
                    type="button"
                    onClick={handleClearUrls}
                    disabled={isValidating}
                    title="Limpar todas as URLs da caixa"
                    className="px-2 py-1 text-slate-400 hover:text-red-400 disabled:opacity-50 disabled:cursor-not-allowed text-[11px] flex items-center gap-1 transition-colors cursor-pointer"
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
                  disabled={isValidating || !rawUrlsText.trim()}
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
                    disabled={isValidating}
                    className="px-3 py-2 text-slate-400 hover:text-slate-200 disabled:opacity-50 disabled:cursor-not-allowed text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer border border-slate-800 rounded-lg bg-slate-900/60"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Limpar Análise / Editar URLs</span>
                  </button>
                )}
              </div>
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

                  {/* BARRA DE AÇÕES DE VALIDAÇÃO DE REDE */}
                  <div className="p-3.5 bg-[#141620] border border-slate-800 rounded-xl flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Ação Primária: Validar URLs pela rede */}
                      <button
                        type="button"
                        onClick={() => executeBatchValidation()}
                        disabled={isValidating || (batchSummary?.validPending ?? 0) === 0}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-lg flex items-center gap-2 transition-all shadow shadow-indigo-600/20 active:scale-98 cursor-pointer"
                      >
                        {isValidating ? (
                          <Loader2 className="w-4 h-4 animate-spin text-white" />
                        ) : (
                          <Globe className="w-4 h-4 text-indigo-200" />
                        )}
                        <span>{isValidating ? 'Validando Fila...' : 'Validar URLs pela rede'}</span>
                        {batchSummary && batchSummary.validPending > 0 && !isValidating && (
                          <span className="px-1.5 py-0.5 rounded-full bg-indigo-950/80 border border-indigo-400/30 text-[10px] font-mono text-indigo-200">
                            {batchSummary.validPending} {batchSummary.validPending === 1 ? 'URL' : 'URLs'}
                          </span>
                        )}
                      </button>

                      {/* Cancelar Fila em andamento */}
                      {isValidating && (
                        <button
                          type="button"
                          onClick={handleCancelValidation}
                          className="px-3.5 py-2 bg-amber-950/70 hover:bg-amber-900 border border-amber-800/80 text-amber-200 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <StopCircle className="w-4 h-4 text-amber-400" />
                          <span>Cancelar Fila</span>
                        </button>
                      )}

                      {/* Repetir apenas falhas ou inconclusivos */}
                      {!isValidating && (networkSummary?.failedOrInconclusive ?? 0) > 0 && (
                        <button
                          type="button"
                          onClick={handleRetryFailedOrInconclusive}
                          className="px-3.5 py-2 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <RotateCcw className="w-4 h-4 text-amber-400" />
                          <span>Repetir Falhas e Inconclusivos</span>
                          <span className="px-1.5 py-0.2 rounded-full bg-amber-950 border border-amber-600/40 text-[10px] font-mono">
                            {networkSummary?.failedOrInconclusive}
                          </span>
                        </button>
                      )}

                      {/* Revalidar Lote Completo (quando já finalizado) */}
                      {!isValidating && (networkSummary?.totalValidated ?? 0) > 0 && (
                        <button
                          type="button"
                          onClick={() => executeBatchValidation()}
                          className="px-3 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 text-xs rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <RefreshCw className="w-3.5 h-3.5 text-indigo-400" />
                          <span>Revalidar Tudo</span>
                        </button>
                      )}
                    </div>

                    <div className="text-[11px] font-mono text-slate-400 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                      <span>Concorrência máx: 2 requisições</span>
                    </div>
                  </div>

                  {/* Aviso de Cancelamento */}
                  {cancellationNotice && (
                    <div className="p-3 bg-amber-950/40 border border-amber-800/60 rounded-xl text-xs text-amber-200 flex items-start gap-2.5">
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <div className="space-y-0.5">
                        <p className="font-semibold">{cancellationNotice}</p>
                        <p className="text-[11px] text-amber-300/80">
                          O cancelamento no navegador encerra chamadas futuras. Requisições em trânsito no servidor concluem sem causar vazamento de recursos.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* PAINEL DE PROGRESSO E MÉTRICAS DE REDE */}
                  {(isValidating || (networkSummary && networkSummary.totalValidated > 0)) && (
                    <div className="p-4 bg-[#141620] border border-slate-800 rounded-xl space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Wifi className="w-4 h-4 text-indigo-400" />
                          <span className="text-xs font-semibold text-white">
                            Progresso da Validação de Rede
                          </span>
                        </div>
                        <div className="flex items-center gap-2 font-mono text-[11px]">
                          <span className="text-slate-400">
                            {validationProgress.completed} de {validationProgress.total} processadas
                          </span>
                          <span className="px-2 py-0.5 rounded bg-indigo-950 border border-indigo-700/60 text-indigo-300 font-semibold">
                            {Math.round(
                              (validationProgress.completed / Math.max(1, validationProgress.total)) * 100
                            )}
                            %
                          </span>
                        </div>
                      </div>

                      {/* Barra de Progresso */}
                      <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-indigo-500 to-emerald-500 transition-all duration-300"
                          style={{
                            width: `${Math.round(
                              (validationProgress.completed / Math.max(1, validationProgress.total)) * 100
                            )}%`,
                          }}
                        />
                      </div>

                      {/* Métricas de Diagnóstico de Rede */}
                      {networkSummary && (
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 pt-1">
                          <div className="p-2 bg-emerald-950/20 border border-emerald-800/40 rounded-lg text-center">
                            <div className="text-[10px] text-emerald-400 font-semibold truncate">Mídia Compatível</div>
                            <div className="text-base font-bold text-emerald-300 font-mono mt-0.5">
                              {networkSummary.mediaCompatible}
                            </div>
                          </div>
                          <div className="p-2 bg-blue-950/20 border border-blue-800/40 rounded-lg text-center">
                            <div className="text-[10px] text-blue-400 font-semibold truncate">Servidor Conectado</div>
                            <div className="text-base font-bold text-blue-300 font-mono mt-0.5">
                              {networkSummary.serverConnected}
                            </div>
                          </div>
                          <div className="p-2 bg-amber-950/20 border border-amber-800/40 rounded-lg text-center">
                            <div className="text-[10px] text-amber-400 font-semibold truncate">Acesso Negado</div>
                            <div className="text-base font-bold text-amber-300 font-mono mt-0.5">
                              {networkSummary.accessDeniedOrExpired}
                            </div>
                          </div>
                          <div className="p-2 bg-rose-950/20 border border-rose-800/40 rounded-lg text-center">
                            <div className="text-[10px] text-rose-400 font-semibold truncate">Bloqueio SSRF</div>
                            <div className="text-base font-bold text-rose-300 font-mono mt-0.5">
                              {networkSummary.ssrfBlocked}
                            </div>
                          </div>
                          <div className="p-2 bg-red-950/20 border border-red-800/40 rounded-lg text-center">
                            <div className="text-[10px] text-red-400 font-semibold truncate">Erro de Rede</div>
                            <div className="text-base font-bold text-red-300 font-mono mt-0.5">
                              {networkSummary.networkError}
                            </div>
                          </div>
                          <div className="p-2 bg-slate-900 border border-slate-700/60 rounded-lg text-center">
                            <div className="text-[10px] text-slate-300 font-semibold truncate">Inconclusivo</div>
                            <div className="text-base font-bold text-slate-200 font-mono mt-0.5">
                              {networkSummary.inconclusive}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Aviso Técnico Essencial: Cabeçalhos vs Reprodução Real */}
                      <div className="p-2.5 bg-slate-900/80 border border-slate-800 rounded-lg flex items-start gap-2 text-[11px] text-slate-300">
                        <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                        <span>
                          <strong>Escopo da Validação:</strong> A validação remota confirma exclusivamente resposta HTTP, disponibilidade do servidor e cabeçalhos de mídia (Content-Type e Range). A reprodução efetiva só pode ser confirmada quando o vídeo for testado e decodificado no player da aplicação.
                        </span>
                      </div>
                    </div>
                  )}
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
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-slate-400 hidden sm:inline">
                        Análise sintática local e validação de rede integrada
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={handleExpandAllDiagnostics}
                          className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 text-[10px] transition-colors cursor-pointer"
                        >
                          Expandir todos
                        </button>
                        <button
                          type="button"
                          onClick={handleCollapseAllDiagnostics}
                          className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 text-[10px] transition-colors cursor-pointer"
                        >
                          Recolher todos
                        </button>
                      </div>
                    </div>
                  </div>

                  {preparedBatch.length === 0 ? (
                    <div className="py-6 px-4 text-center text-xs text-slate-400 bg-slate-900/40 border border-dashed border-slate-800 rounded-lg">
                      Nenhuma linha com conteúdo foi encontrada para analisar.
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-96 overflow-y-auto pr-1 custom-scrollbar">
                      {preparedBatch.map((item, idx) => {
                        const epNumberStr = String(item.episodeNumber).padStart(2, '0');
                        const { display: safeDisplayUrl, hasTokens } = getSafeDisplayUrl(item.rawUrl);
                        const hostOnly = (() => {
                          try {
                            return new URL(item.rawUrl).hostname;
                          } catch {
                            return 'URL malformada';
                          }
                        })();
                        const isExpanded = Boolean(expandedDiagnostics[item.episodeNumber]);

                        return (
                          <div
                            key={`queue-item-${item.originalLineNumber}-${idx}`}
                            className={`p-3.5 rounded-xl border text-xs space-y-2.5 transition-colors ${
                              item.status === 'invalida'
                                ? 'bg-red-950/15 border-red-800/40'
                                : item.status === 'duplicada'
                                ? 'bg-amber-950/15 border-amber-800/40'
                                : item.networkStatus === 'midia_compativel'
                                ? 'bg-[#151a24] border-emerald-800/40'
                                : item.networkStatus === 'servidor_conectado'
                                ? 'bg-[#151a24] border-blue-800/40'
                                : item.networkStatus === 'acesso_negado_ou_expirado'
                                ? 'bg-[#1a1620] border-amber-800/40'
                                : item.networkStatus === 'bloqueado_ssrf'
                                ? 'bg-[#1e141a] border-rose-800/40'
                                : item.networkStatus === 'erro_rede'
                                ? 'bg-[#1e1418] border-red-800/40'
                                : item.networkStatus === 'validando'
                                ? 'bg-[#161828] border-indigo-800/60'
                                : 'bg-[#181A24] border-slate-800'
                            }`}
                          >
                            {/* Linha 1: Identificação do Episódio, Status, Código HTTP e Botão Ver Diagnóstico */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className="px-2 py-0.5 bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 font-mono text-[10px] font-bold rounded">
                                  EP {epNumberStr}
                                </span>
                                <span className="font-semibold text-white text-xs">
                                  {item.seriesTitle ? `${item.seriesTitle} • ` : ''}T{item.seasonNumber}E{epNumberStr}
                                </span>
                              </div>

                              {/* Badges de Status, Código HTTP e Ações de Diagnóstico */}
                              <div className="flex flex-wrap items-center gap-1.5">
                                {/* Badges de Estado */}
                                {item.status === 'invalida' && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-950/80 border border-red-700 text-red-300 font-mono text-[10px] font-semibold">
                                    <AlertTriangle className="w-3 h-3 text-red-400" />
                                    <span>Sintaxe Inválida</span>
                                  </span>
                                )}
                                {item.status === 'duplicada' && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-950/80 border border-amber-700 text-amber-300 font-mono text-[10px] font-semibold">
                                    <AlertCircle className="w-3 h-3 text-amber-400" />
                                    <span>Duplicada</span>
                                  </span>
                                )}

                                {item.status === 'pendente' && (
                                  <>
                                    {!item.networkStatus || item.networkStatus === 'nao_iniciada' ? (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-900 border border-slate-700 text-slate-400 font-mono text-[10px]">
                                        <Clock className="w-3 h-3 text-slate-400" />
                                        <span>Aguardando rede</span>
                                      </span>
                                    ) : item.networkStatus === 'validando' ? (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-950/80 border border-indigo-700 text-indigo-300 font-mono text-[10px] font-semibold animate-pulse">
                                        <Loader2 className="w-3 h-3 animate-spin text-indigo-400" />
                                        <span>Validando na rede...</span>
                                      </span>
                                    ) : item.networkStatus === 'midia_compativel' ? (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-600 text-emerald-300 font-mono text-[10px] font-bold shadow-sm shadow-emerald-950/50">
                                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                        <span>Mídia Compatível</span>
                                      </span>
                                    ) : item.networkStatus === 'acesso_negado_ou_expirado' ? (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-950/80 border border-amber-600 text-amber-300 font-mono text-[10px] font-bold shadow-sm shadow-amber-950/50">
                                        <AlertTriangle className="w-3 h-3 text-amber-400" />
                                        <span>Acesso Negado</span>
                                      </span>
                                    ) : item.networkStatus === 'servidor_conectado' ? (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-950/80 border border-blue-700 text-blue-300 font-mono text-[10px] font-semibold">
                                        <Info className="w-3 h-3 text-blue-400" />
                                        <span>Servidor Conectado</span>
                                      </span>
                                    ) : item.networkStatus === 'bloqueado_ssrf' ? (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-950/80 border border-rose-700 text-rose-300 font-mono text-[10px] font-bold">
                                        <ShieldAlert className="w-3 h-3 text-rose-400" />
                                        <span>Bloqueio SSRF</span>
                                      </span>
                                    ) : item.networkStatus === 'erro_rede' ? (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-950/80 border border-red-700 text-red-300 font-mono text-[10px] font-semibold">
                                        <XCircle className="w-3 h-3 text-red-400" />
                                        <span>Erro de Rede</span>
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-900 border border-amber-700 text-amber-300 font-mono text-[10px] font-semibold">
                                        <AlertCircle className="w-3 h-3 text-amber-400" />
                                        <span>Inconclusivo</span>
                                      </span>
                                    )}
                                  </>
                                )}

                                {/* Código HTTP exibido de forma imediata quando disponível */}
                                {item.networkResult?.httpStatus !== undefined && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-900 border border-slate-700 text-slate-200 font-mono text-[10px] font-semibold">
                                    HTTP {item.networkResult.httpStatus}
                                  </span>
                                )}

                                {/* Botão Acessível: Ver / Ocultar Diagnóstico */}
                                <button
                                  type="button"
                                  aria-expanded={isExpanded}
                                  aria-controls={`diagnostic-details-ep-${item.episodeNumber}`}
                                  aria-label={
                                    isExpanded
                                      ? `Recolher diagnóstico detalhado do episódio ${epNumberStr}`
                                      : `Ver diagnóstico detalhado do episódio ${epNumberStr}`
                                  }
                                  onClick={() => toggleDiagnostic(item.episodeNumber)}
                                  className={`px-2.5 py-1 text-[11px] rounded-lg border font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                                    isExpanded
                                      ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500/50 hover:bg-indigo-600/30'
                                      : 'bg-slate-900 text-slate-300 border-slate-700/80 hover:bg-slate-800 hover:text-white'
                                  }`}
                                >
                                  <span>{isExpanded ? 'Ocultar diagnóstico' : 'Ver diagnóstico'}</span>
                                  {isExpanded ? (
                                    <ChevronUp className="w-3.5 h-3.5 text-indigo-400" />
                                  ) : (
                                    <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                                  )}
                                </button>

                                {/* Ação individual de repetição para itens falhos */}
                                {!isValidating &&
                                  item.status === 'pendente' &&
                                  (item.networkStatus === 'erro_rede' ||
                                    item.networkStatus === 'inconclusivo' ||
                                    item.networkStatus === 'acesso_negado_ou_expirado') && (
                                    <button
                                      type="button"
                                      onClick={() => executeBatchValidation([idx])}
                                      className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-amber-300 text-[10px] rounded-lg border border-amber-800/50 flex items-center gap-1 transition-colors cursor-pointer"
                                      title="Repetir validação exclusivamente para este episódio"
                                    >
                                      <RotateCcw className="w-3 h-3 text-amber-400" />
                                      <span>Revalidar</span>
                                    </button>
                                  )}
                              </div>
                            </div>

                            {/* Linha 2: Exibição Segura da URL e Hostname (sem tokens/senhas/hashes) */}
                            <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono">
                              <span className="text-slate-400">Host:</span>
                              <span className="text-white bg-slate-900 px-2 py-0.5 rounded border border-slate-800 font-semibold">
                                {hostOnly}
                              </span>
                              <span className="text-slate-500">•</span>
                              <span className="text-slate-300 truncate max-w-full sm:max-w-md bg-slate-900/80 px-2 py-0.5 rounded border border-slate-800/60">
                                {safeDisplayUrl}
                              </span>
                              {hasTokens && (
                                <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 font-sans">
                                  Tokens / Query ocultados por segurança
                                </span>
                              )}
                              <span className="text-[10px] text-slate-500 font-sans ml-auto">
                                Linha {item.originalLineNumber}
                              </span>
                            </div>

                            {/* Diagnóstico Resumido (Visível para contexto rápido) */}
                            <div
                              className={`p-2.5 rounded-lg border text-[11px] leading-relaxed ${
                                item.status === 'invalida'
                                  ? 'bg-red-950/30 border-red-800/50 text-red-200'
                                  : item.status === 'duplicada'
                                  ? 'bg-amber-950/30 border-amber-800/50 text-amber-200'
                                  : item.networkStatus === 'midia_compativel'
                                  ? 'bg-emerald-950/30 border-emerald-800/50 text-emerald-200'
                                  : item.networkStatus === 'servidor_conectado'
                                  ? 'bg-blue-950/30 border-blue-800/50 text-blue-200'
                                  : item.networkStatus === 'acesso_negado_ou_expirado'
                                  ? 'bg-amber-950/30 border-amber-800/50 text-amber-200'
                                  : item.networkStatus === 'bloqueado_ssrf'
                                  ? 'bg-rose-950/30 border-rose-800/50 text-rose-200'
                                  : item.networkStatus === 'erro_rede'
                                  ? 'bg-red-950/30 border-red-800/50 text-red-200'
                                  : item.networkStatus === 'validando'
                                  ? 'bg-indigo-950/30 border-indigo-800/50 text-indigo-200'
                                  : item.networkStatus === 'inconclusivo'
                                  ? 'bg-amber-950/30 border-amber-800/50 text-amber-200'
                                  : 'bg-slate-900/60 border-slate-800 text-slate-300'
                              }`}
                            >
                              <div className="flex items-center justify-between font-semibold mb-0.5">
                                <span>
                                  {item.status !== 'pendente'
                                    ? 'Diagnóstico Local:'
                                    : item.networkResult || item.networkError
                                    ? 'Diagnóstico de Rede:'
                                    : 'Estado da URL:'}
                                </span>
                                {item.networkResult?.timingMs !== undefined && item.networkResult.timingMs > 0 && (
                                  <span className="font-mono text-[10px] opacity-80">
                                    Resposta: {item.networkResult.timingMs}ms
                                  </span>
                                )}
                              </div>
                              <p>
                                {item.status === 'invalida'
                                  ? item.statusMessage
                                  : item.status === 'duplicada'
                                  ? 'Esta URL é idêntica a outro item anterior no mesmo lote. Foi ignorada para evitar redundância e consumo de conexões.'
                                  : item.networkResult?.diagnosticMessage
                                  ? item.networkResult.diagnosticMessage
                                  : item.networkError
                                  ? item.networkError
                                  : item.networkStatus === 'validando'
                                  ? 'Efetuando requisição segura para a API /api/validate-url com prazo máximo de 4 segundos...'
                                  : 'Sintaxe local validada com sucesso. Clique em "Validar URLs pela rede" para checar a disponibilidade no servidor remoto.'}
                              </p>
                            </div>

                            {/* ÁREA DE DIAGNÓSTICO INDIVIDUAL EXPANSÍVEL (Requisitos 1, 2, 3, 4 e 5) */}
                            {isExpanded && (
                              <div
                                id={`diagnostic-details-ep-${item.episodeNumber}`}
                                className="pt-3 mt-2 border-t border-slate-800/80 space-y-3"
                              >
                                {/* Identificação Explícita de Classificação (Requisito 5) */}
                                {item.networkStatus === 'midia_compativel' && (
                                  <div className="p-3 rounded-lg bg-emerald-950/40 border border-emerald-600/60 flex items-start gap-2.5 text-emerald-200">
                                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                                    <div>
                                      <div className="font-bold text-xs text-emerald-300">
                                        Classificação: Mídia Compatível
                                      </div>
                                      <p className="text-[11px] text-emerald-200/90 mt-0.5 leading-relaxed">
                                        O servidor remoto respondeu positivamente e os cabeçalhos confirmam conteúdo de streaming de vídeo compatível.
                                      </p>
                                    </div>
                                  </div>
                                )}

                                {item.networkStatus === 'acesso_negado_ou_expirado' && (
                                  <div className="p-3 rounded-lg bg-amber-950/40 border border-amber-600/60 flex items-start gap-2.5 text-amber-200">
                                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                                    <div>
                                      <div className="font-bold text-xs text-amber-300">
                                        Classificação: Acesso Negado
                                      </div>
                                      <p className="text-[11px] text-amber-200/90 mt-0.5 leading-relaxed">
                                        O servidor remoto retornou código de recusa ou recurso não encontrado (HTTP {item.networkResult?.httpStatus || '401/403/404'}). Verifique se o link requer autenticação, token ou se expirou.
                                      </p>
                                    </div>
                                  </div>
                                )}

                                {item.networkStatus === 'bloqueado_ssrf' && (
                                  <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-600/60 flex items-start gap-2.5 text-rose-200">
                                    <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                                    <div>
                                      <div className="font-bold text-xs text-rose-300">
                                        Classificação: Bloqueio de Segurança (SSRF)
                                      </div>
                                      <p className="text-[11px] text-rose-200/90 mt-0.5 leading-relaxed">
                                        Requisição bloqueada preventivamente pela política de segurança. Destinos internos, loopback, redes privadas ou metadados de nuvem são proibidos.
                                      </p>
                                    </div>
                                  </div>
                                )}

                                {item.networkStatus === 'erro_rede' && (
                                  <div className="p-3 rounded-lg bg-red-950/40 border border-red-600/60 flex items-start gap-2.5 text-red-200">
                                    <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                                    <div>
                                      <div className="font-bold text-xs text-red-300">
                                        Classificação: Erro de Rede
                                      </div>
                                      <p className="text-[11px] text-red-200/90 mt-0.5 leading-relaxed">
                                        Falha na conexão com o servidor remoto, erro de resolução DNS ou esgotamento do tempo limite integral de 4 segundos.
                                      </p>
                                    </div>
                                  </div>
                                )}

                                {item.networkStatus === 'servidor_conectado' && (
                                  <div className="p-3 rounded-lg bg-blue-950/40 border border-blue-600/60 flex items-start gap-2.5 text-blue-200">
                                    <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                                    <div>
                                      <div className="font-bold text-xs text-blue-300">
                                        Classificação: Servidor Conectado (Conteúdo Não-Vídeo)
                                      </div>
                                      <p className="text-[11px] text-blue-200/90 mt-0.5 leading-relaxed">
                                        O servidor remoto respondeu positivamente, mas o cabeçalho Content-Type não corresponde a um fluxo de vídeo reconhecido.
                                      </p>
                                    </div>
                                  </div>
                                )}

                                {item.networkStatus === 'inconclusivo' && (
                                  <div className="p-3 rounded-lg bg-slate-900 border border-amber-700/60 flex items-start gap-2.5 text-amber-200">
                                    <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                                    <div>
                                      <div className="font-bold text-xs text-amber-300">
                                        Classificação: Resultado Inconclusivo
                                      </div>
                                      <p className="text-[11px] text-amber-200/90 mt-0.5 leading-relaxed">
                                        A resposta da API ou do servidor não permitiu uma validação conclusiva. Você pode tentar revalidar este episódio individualmente.
                                      </p>
                                    </div>
                                  </div>
                                )}

                                {item.status === 'invalida' && (
                                  <div className="p-3 rounded-lg bg-red-950/40 border border-red-600/60 flex items-start gap-2.5 text-red-200">
                                    <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                                    <div>
                                      <div className="font-bold text-xs text-red-300">
                                        Classificação: Sintaxe Inválida
                                      </div>
                                      <p className="text-[11px] text-red-200/90 mt-0.5 leading-relaxed">
                                        A URL não atende aos padrões válidos de formatação HTTP/HTTPS.
                                      </p>
                                    </div>
                                  </div>
                                )}

                                {item.status === 'duplicada' && (
                                  <div className="p-3 rounded-lg bg-amber-950/40 border border-amber-600/60 flex items-start gap-2.5 text-amber-200">
                                    <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                                    <div>
                                      <div className="font-bold text-xs text-amber-300">
                                        Classificação: URL Duplicada
                                      </div>
                                      <p className="text-[11px] text-amber-200/90 mt-0.5 leading-relaxed">
                                        Esta URL já consta em outra linha deste lote. Foi ignorada para evitar redundância.
                                      </p>
                                    </div>
                                  </div>
                                )}

                                {(!item.networkStatus || item.networkStatus === 'nao_iniciada') && item.status === 'pendente' && (
                                  <div className="p-3 rounded-lg bg-slate-900 border border-slate-700/60 flex items-start gap-2.5 text-slate-300">
                                    <Clock className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                                    <div>
                                      <div className="font-bold text-xs text-slate-200">
                                        Classificação: Aguardando Validação de Rede
                                      </div>
                                      <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                                        A sintaxe local foi aprovada. Clique no botão &quot;Validar URLs pela rede&quot; para enviar a requisição de checagem.
                                      </p>
                                    </div>
                                  </div>
                                )}

                                {/* Grid de Metadados Técnicos Reais da API (Requisitos 3 e 4) */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                                  {/* 1. Status HTTP */}
                                  <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800">
                                    <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                                      Status HTTP
                                    </div>
                                    <div className="text-white font-mono font-semibold mt-1">
                                      {item.networkResult?.httpStatus !== undefined
                                        ? `HTTP ${item.networkResult.httpStatus}${
                                            item.networkResult.httpStatusText
                                              ? ` (${item.networkResult.httpStatusText})`
                                              : ''
                                          }`
                                        : 'Não informado'}
                                    </div>
                                  </div>

                                  {/* 2. Content-Type */}
                                  <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800">
                                    <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                                      Content-Type
                                    </div>
                                    <div className="text-indigo-300 font-mono font-semibold mt-1 truncate">
                                      {item.networkResult?.contentType || 'Não informado'}
                                    </div>
                                  </div>

                                  {/* 3. Tipo de Mídia */}
                                  <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800">
                                    <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                                      Tipo de Mídia
                                    </div>
                                    <div className="text-emerald-300 font-medium mt-1">
                                      {item.networkResult?.mediaTypeDetected || 'Não informado'}
                                    </div>
                                  </div>

                                  {/* 4. Content-Length */}
                                  <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800">
                                    <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                                      Content-Length
                                    </div>
                                    <div className="text-slate-200 font-mono font-semibold mt-1">
                                      {item.networkResult?.contentLength !== undefined &&
                                      item.networkResult.contentLength > 0
                                        ? `${formatBytes(
                                            item.networkResult.contentLength
                                          )} (${item.networkResult.contentLength.toLocaleString('pt-BR')} bytes)`
                                        : 'Não informado'}
                                    </div>
                                  </div>

                                  {/* 5. Accept-Ranges */}
                                  <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800">
                                    <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                                      Accept-Ranges
                                    </div>
                                    <div className="text-slate-200 font-mono font-semibold mt-1">
                                      {item.networkResult !== undefined
                                        ? item.networkResult.supportsRangeRequests
                                          ? 'bytes (Suporte a reprodução fracionada / Seek)'
                                          : 'Sem suporte a Range'
                                        : 'Não informado'}
                                    </div>
                                  </div>

                                  {/* 6. Indicação de resposta truncada */}
                                  <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800">
                                    <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                                      Resposta Truncada
                                    </div>
                                    <div className="text-slate-200 font-medium mt-1">
                                      {item.networkResult?.truncated !== undefined
                                        ? item.networkResult.truncated
                                          ? 'Sim (limitado com segurança a 64KB)'
                                          : 'Não (resposta completa)'
                                        : 'Não informado'}
                                    </div>
                                  </div>
                                </div>

                                {/* 7. Mensagem de Diagnóstico Detalhada (Requisitos 3 e 4) */}
                                <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 space-y-1">
                                  <div className="flex items-center justify-between text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                                    <span>Mensagem de Diagnóstico</span>
                                    {item.networkResult?.timingMs !== undefined &&
                                      item.networkResult.timingMs > 0 && (
                                        <span className="font-mono text-slate-400">
                                          Tempo de resposta: {item.networkResult.timingMs}ms
                                        </span>
                                      )}
                                  </div>
                                  <div className="text-slate-200 text-xs leading-relaxed font-sans">
                                    {item.networkResult?.diagnosticMessage ||
                                      (item.status === 'invalida'
                                        ? item.statusMessage
                                        : item.status === 'duplicada'
                                        ? 'URL duplicada no mesmo lote (ignorada).'
                                        : item.networkError || 'Não informado')}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
                    <span>
                      Nota de Integridade: Todas as verificações de rede passam exclusivamente pelo backend seguro (/api/validate-url).
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
                  <span>Pipeline em Fila Ativo</span>
                </h2>

                <p className="text-xs text-slate-400 leading-relaxed">
                  Para garantir integridade, segurança e evitar travamentos na interface, a validação de URLs segue estas garantias técnicas:
                </p>

                <ul className="text-xs text-slate-300 space-y-2 border-t border-slate-800 pt-3">
                  <li className="flex items-start gap-2">
                    <span className="text-indigo-400 font-bold">•</span>
                    <span><strong>Concorrência Segura:</strong> No máximo 2 requisições simultâneas via <code>POST /api/validate-url</code>.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-indigo-400 font-bold">•</span>
                    <span><strong>Antiduplicação Local:</strong> URLs repetidas no lote são bloqueadas antes do envio à rede.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-indigo-400 font-bold">•</span>
                    <span><strong>Proteção SSRF Ativa:</strong> Bloqueio conservador de IPs locais, privados, metadados e rebinding de DNS.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-indigo-400 font-bold">•</span>
                    <span><strong>Leitura Limitada a 64KB:</strong> Servidores que ignoram Range são truncados sem baixar vídeos completos.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-indigo-400 font-bold">•</span>
                    <span><strong>Validação vs. Reprodução:</strong> Confirmação de cabeçalhos não atesta decodificação até teste no player.</span>
                  </li>
                </ul>

                <div className="mt-4 pt-3 border-t border-slate-800 text-center space-y-2">
                  <div className="text-[11px] font-mono text-slate-400 bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
                    Estado:{' '}
                    {isValidating ? (
                      <span className="text-indigo-400 font-semibold animate-pulse">
                        Validando Fila ({validationProgress.completed}/{validationProgress.total})
                      </span>
                    ) : preparedBatch ? (
                      <span className="text-emerald-400 font-semibold">
                        Lote Pronto ({batchSummary?.validPending} válidos)
                      </span>
                    ) : (
                      <span className="text-amber-400 font-semibold">
                        Aguardando "Preparar Lote"
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500">
                    {isValidating
                      ? 'Requisições HTTP em execução com controle de concorrência.'
                      : networkSummary && networkSummary.totalValidated > 0
                      ? `Validação de rede concluída: ${networkSummary.mediaCompatible} com mídia compatível.`
                      : 'Análise sintática local pronta. Validação de rede disponível.'}
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
