import React, { useState } from 'react';
import { X, Save, AlertCircle } from 'lucide-react';
import { VideoItem, VideoCategory, VideoResolution } from '../../types/video';
import { APP_CONFIG } from '../../config/appConfig';

interface VideoEditModalProps {
  video: VideoItem | null;
  onClose: () => void;
  onSave: (updated: VideoItem) => void;
}

export const VideoEditModal: React.FC<VideoEditModalProps> = ({ video, onClose, onSave }) => {
  if (!video) return null;

  const [title, setTitle] = useState(video.title || '');
  const [description, setDescription] = useState(video.description || '');
  const [category, setCategory] = useState<VideoCategory>(video.category || 'Documentários & Demos');
  const [resolution, setResolution] = useState<VideoResolution>(video.resolution || 'N/D');
  const [tagsStr, setTagsStr] = useState(Array.isArray(video.tags) ? video.tags.join(', ') : '');
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (video) {
      setTitle(video.title || '');
      setDescription(video.description || '');
      setCategory(video.category || 'Documentários & Demos');
      setResolution(video.resolution || 'N/D');
      setTagsStr(Array.isArray(video.tags) ? video.tags.join(', ') : '');
      setError(null);
    }
  }, [video]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!title.trim()) {
      setError('O título é obrigatório.');
      return;
    }

    const parsedTags = tagsStr
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    onSave({
      ...video,
      title: title.trim(),
      description: description.trim(),
      category,
      resolution,
      tags: parsedTags,
    });
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-lg bg-[#12131A] border border-slate-800 rounded-2xl overflow-hidden shadow-2xl"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <h2 className="text-base font-bold text-white">Editar Informações do Vídeo</h2>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-950/50 border border-red-800 text-red-300 rounded-lg text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Título do Vídeo
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-[#181A24] border border-slate-700/80 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
              placeholder="Ex: Treinamento de Novos Líderes..."
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Descrição
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-[#181A24] border border-slate-700/80 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors resize-none"
              placeholder="Breve resumo do conteúdo deste vídeo..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Categoria
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as VideoCategory)}
                className="w-full bg-[#181A24] border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 transition-colors"
              >
                {APP_CONFIG.categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Resolução Máxima
              </label>
              <select
                value={resolution}
                onChange={(e) => setResolution(e.target.value as VideoResolution)}
                className="w-full bg-[#181A24] border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 transition-colors"
              >
                <option value="N/D">N/D (Não Detectada / Pendente)</option>
                <option value="4K">4K Ultra HD</option>
                <option value="1080p">1080p Full HD</option>
                <option value="720p">720p HD</option>
                <option value="480p">480p SD</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Tags / Palavras-chave (separadas por vírgula)
            </label>
            <input
              type="text"
              value={tagsStr}
              onChange={(e) => setTagsStr(e.target.value)}
              className="w-full bg-[#181A24] border border-slate-700/80 rounded-lg px-3.5 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 transition-colors font-mono"
              placeholder="Treinamento, Engenharia, Privado"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors flex items-center gap-1.5 shadow"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Salvar Alterações</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
