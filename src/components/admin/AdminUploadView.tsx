import React, { useState, useRef } from 'react';
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

export const AdminUploadView: React.FC<AdminUploadViewProps> = ({
  onVideoCreated,
  onNavigateToLibrary,
}) => {
  // Formulário
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
      {/* Cabeçalho */}
      <div className="pb-4 border-b border-slate-800">
        <h1 className="text-2xl font-bold text-white tracking-tight">
          Ingestão & Cadastro de Vídeo
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Selecione um arquivo de vídeo do seu dispositivo para assistir no player da plataforma durante a sessão atual.
        </p>
      </div>

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
  );
};
