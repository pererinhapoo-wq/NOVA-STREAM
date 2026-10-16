import React, { useRef } from 'react';
import { X, Play, Clock, Sparkles, HardDrive, ShieldCheck, Edit3, AlertTriangle, UploadCloud } from 'lucide-react';
import { VideoItem } from '../../types/video';
import { hasLocalVideoFile } from '../../services/videoData';

interface VideoDetailsModalProps {
  video: VideoItem | null;
  onClose: () => void;
  onWatch: (video: VideoItem) => void;
  onEdit?: (video: VideoItem) => void;
  onReconnectFile?: (videoId: string, file: File) => void;
}

export const VideoDetailsModal: React.FC<VideoDetailsModalProps> = ({
  video,
  onClose,
  onWatch,
  onEdit,
  onReconnectFile,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!video) return null;

  const isAvailable = !video.isLocalFile || hasLocalVideoFile(video.id);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onReconnectFile) {
      onReconnectFile(video.id, file);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="video/mp4,video/webm,video/ogg,video/quicktime,video/x-matroska"
        onChange={handleFileInputChange}
        className="hidden"
      />

      <div className="relative w-full max-w-2xl bg-[#12131A] border border-slate-800 rounded-2xl overflow-hidden shadow-2xl max-h-[90vh] flex flex-col">
        {/* Imagem do cabeçalho */}
        <div className="relative aspect-video w-full bg-slate-900 shrink-0">
          <img
            src={video.posterUrl}
            alt={video.title}
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#12131A] via-transparent to-transparent" />

          {/* Botão fechar */}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClose();
            }}
            aria-label="Fechar detalhes"
            className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/70 hover:bg-black text-white flex items-center justify-center transition-colors border border-slate-700 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Botão de assistir sobreposto ou ação de reconectar */}
          <div className="absolute bottom-4 left-6 flex items-center gap-3">
            {isAvailable ? (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onClose();
                  onWatch(video);
                }}
                className="px-5 py-2.5 rounded-xl bg-white text-slate-950 hover:bg-slate-200 font-bold text-sm flex items-center gap-2 transition-transform active:scale-95 shadow-lg cursor-pointer"
              >
                <Play className="w-4 h-4 fill-slate-950" />
                <span>Assistir</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
                className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm flex items-center gap-2 transition-transform active:scale-95 shadow-lg cursor-pointer"
              >
                <UploadCloud className="w-4 h-4 text-slate-950" />
                <span>Selecionar Arquivo Novamente</span>
              </button>
            )}

            {onEdit && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onClose();
                  onEdit(video);
                }}
                className="px-4 py-2.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-slate-200 text-sm font-medium flex items-center gap-1.5 border border-slate-700 transition-colors cursor-pointer"
              >
                <Edit3 className="w-4 h-4" />
                <span>Editar</span>
              </button>
            )}
          </div>
        </div>

        {/* Informações detalhadas com scroll se necessário */}
        <div className="p-6 overflow-y-auto custom-scrollbar space-y-4">
          {/* Alerta de arquivo local indisponível após recarregar a preview */}
          {!isAvailable && (
            <div className="p-4 bg-amber-950/40 border border-amber-600/50 rounded-xl text-xs text-amber-200 flex items-start gap-3 shadow-md">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1.5 flex-1">
                <p className="font-semibold text-white text-sm">
                  Arquivo local não disponível nesta sessão
                </p>
                <p className="text-amber-200/90 leading-relaxed">
                  A página foi recarregada e as referências temporárias em memória (<code className="font-mono text-amber-300">blob:</code>) foram reiniciadas pelo navegador. Seus metadados continuam salvos com segurança na biblioteca. Selecione o arquivo original no seu dispositivo para habilitar a reprodução imediata.
                </p>
                {video.originalFileName && (
                  <div className="p-2 bg-black/40 rounded-lg border border-amber-800/40 text-[11px] font-mono text-slate-300 flex items-center justify-between">
                    <span>Arquivo original esperado: <strong className="text-amber-300">{video.originalFileName}</strong></span>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="text-amber-400 hover:text-amber-300 underline font-sans font-semibold cursor-pointer"
                    >
                      Selecionar
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center gap-2 text-xs text-indigo-400 font-medium mb-1.5">
              <span>{video.category}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono text-slate-300">{video.resolution}</span>
              <span aria-hidden="true">·</span>
              <span className="text-slate-400">
                Adicionado em {new Date(video.createdAt).toLocaleDateString('pt-BR')}
              </span>
            </div>
            <h2 className="text-xl font-bold text-white leading-snug">{video.title}</h2>
          </div>

          <p className="text-sm text-slate-300 leading-relaxed">{video.description}</p>

          {/* Grid de Especificações */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-800 text-xs">
            <div className="p-2.5 bg-slate-900/60 rounded-lg border border-slate-800">
              <span className="text-slate-400 block mb-1 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-indigo-400" /> Duração
              </span>
              <span className="text-white font-mono font-medium">
                {video.duration > 0 ? video.durationFormatted : '--:-- (Pendente)'}
              </span>
            </div>

            <div className="p-2.5 bg-slate-900/60 rounded-lg border border-slate-800">
              <span className="text-slate-400 block mb-1 flex items-center gap-1">
                <HardDrive className="w-3.5 h-3.5 text-indigo-400" /> Tamanho Est.
              </span>
              <span className="text-white font-mono font-medium">
                {video.fileSizeFormatted || 'Aprox. 350 MB'}
              </span>
            </div>

            <div className="p-2.5 bg-slate-900/60 rounded-lg border border-slate-800">
              <span className="text-slate-400 block mb-1 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> Acesso
              </span>
              <span className="text-emerald-400 font-medium">Privado / Restrito</span>
            </div>

            <div className="p-2.5 bg-slate-900/60 rounded-lg border border-slate-800">
              <span className="text-slate-400 block mb-1 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-indigo-400" /> Status
              </span>
              <span className="text-slate-200 capitalize">{video.uploadStatus || 'Pronto'}</span>
            </div>
          </div>

          {/* Tags */}
          {video.tags.length > 0 && (
            <div className="pt-2">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-2">
                Palavras-chave
              </span>
              <div className="flex flex-wrap gap-1.5">
                {video.tags.map((t) => (
                  <span
                    key={t}
                    className="text-xs text-slate-300 bg-slate-850 px-2.5 py-1 rounded-md border border-slate-800"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Aviso de Demonstração */}
          <div className="p-3 bg-indigo-950/40 border border-indigo-800/40 rounded-xl text-xs text-indigo-300 flex items-start gap-2">
            <Sparkles className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
            <p>
              {video.demoNotice ||
                'Este item está catalogado para demonstração técnica e teste da interface de reprodução. Vídeos reais serão hospedados em storage seguro conectado ao backend.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
