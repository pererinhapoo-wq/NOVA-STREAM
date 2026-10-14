import React, { useState } from 'react';
import { Search, Shield, Video, X } from 'lucide-react';
import { APP_CONFIG } from '../../config/appConfig';
import { ActiveTab, VideoItem } from '../../types/video';

interface HeaderProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  allVideos: VideoItem[];
  onSelectVideo: (video: VideoItem) => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  searchQuery,
  setSearchQuery,
  allVideos,
  onSelectVideo,
}) => {
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Resultados rápidos ao digitar na busca do cabeçalho
  const searchResults =
    searchQuery.trim().length > 1
      ? allVideos.filter(
          (v) =>
            v.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            v.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
            v.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()))
        )
      : [];

  return (
    <header className="sticky top-0 z-40 bg-[#0B0C10]/90 backdrop-blur-md border-b border-slate-800/80 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-6 sm:gap-8">
        {/* Zona 1: Marca em linha única */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => setActiveTab('home')}
            className="flex items-center gap-2.5 text-left group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-lg p-1"
          >
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center text-white shadow-md shadow-indigo-600/20 group-hover:scale-105 transition-transform">
              <Video className="w-4 h-4 fill-white/20" />
            </div>
            <div className="flex flex-col">
              <span className="text-lg font-extrabold tracking-tight text-white whitespace-nowrap leading-none">
                {APP_CONFIG.brandName}
              </span>
              <span className="text-[10px] text-indigo-400 font-medium tracking-wide uppercase mt-0.5">
                Privado
              </span>
            </div>
          </button>
        </div>

        {/* Zona 2: Links de navegação em linha única */}
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-300">
          <button
            onClick={() => setActiveTab('home')}
            className={`whitespace-nowrap transition-colors py-1 ${
              activeTab === 'home'
                ? 'text-white border-b-2 border-indigo-500 font-semibold'
                : 'hover:text-white'
            }`}
          >
            Início
          </button>
          <button
            onClick={() => setActiveTab('library')}
            className={`whitespace-nowrap transition-colors py-1 ${
              activeTab === 'library'
                ? 'text-white border-b-2 border-indigo-500 font-semibold'
                : 'hover:text-white'
            }`}
          >
            Biblioteca
          </button>
          <button
            onClick={() => setActiveTab('admin')}
            className={`whitespace-nowrap transition-colors py-1 ${
              activeTab === 'admin'
                ? 'text-white border-b-2 border-indigo-500 font-semibold'
                : 'hover:text-white'
            }`}
          >
            Ingestão & Upload
          </button>
          <button
            onClick={() => setActiveTab('security')}
            className={`whitespace-nowrap transition-colors py-1 ${
              activeTab === 'security'
                ? 'text-white border-b-2 border-indigo-500 font-semibold'
                : 'hover:text-white'
            }`}
          >
            Arquitetura & Segurança
          </button>
        </nav>

        {/* Zona 3: Busca e Ação Primária */}
        <div className="flex items-center gap-3 shrink-0">
          {/* Campo de Busca Expansível */}
          <div className="relative">
            <div
              className={`flex items-center bg-[#161822] border rounded-lg transition-all duration-200 ${
                isSearchOpen || searchQuery
                  ? 'w-56 sm:w-64 border-indigo-500/80 shadow-sm shadow-indigo-500/20'
                  : 'w-9 sm:w-52 border-slate-800'
              }`}
            >
              <button
                type="button"
                onClick={() => setIsSearchOpen(!isSearchOpen)}
                className="w-9 h-9 flex items-center justify-center text-slate-400 hover:text-white shrink-0"
                aria-label="Pesquisar vídeos"
              >
                <Search className="w-4 h-4" />
              </button>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por título ou tag..."
                className={`bg-transparent text-xs text-white placeholder-slate-500 focus:outline-none w-full pr-3 py-2 ${
                  isSearchOpen || searchQuery ? 'block' : 'hidden sm:block'
                }`}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="pr-2 text-slate-400 hover:text-white"
                  aria-label="Limpar busca"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Dropdown de resultados imediatos */}
            {searchQuery.trim().length > 1 && (
              <div className="absolute top-11 right-0 w-80 max-w-[calc(100vw-2rem)] bg-[#12131A] border border-slate-800 rounded-xl shadow-2xl p-2 z-50">
                <div className="px-2 py-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex justify-between">
                  <span>Resultados ({searchResults.length})</span>
                  <span className="text-indigo-400">Pressione ESC para fechar</span>
                </div>
                {searchResults.length === 0 ? (
                  <div className="px-3 py-4 text-center text-xs text-slate-400">
                    Nenhum vídeo correspondente encontrado.
                  </div>
                ) : (
                  <div className="max-h-64 overflow-y-auto custom-scrollbar space-y-1">
                    {searchResults.map((vid) => (
                      <button
                        key={vid.id}
                        onClick={() => {
                          onSelectVideo(vid);
                          setSearchQuery('');
                        }}
                        className="w-full text-left p-2 rounded-lg hover:bg-slate-800 flex items-center gap-3 group transition-colors"
                      >
                        <img
                          src={vid.posterUrl}
                          alt={vid.title}
                          className="w-12 h-8 object-cover rounded bg-slate-900 shrink-0"
                          referrerPolicy="no-referrer"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-white truncate group-hover:text-indigo-400 transition-colors">
                            {vid.title}
                          </p>
                          <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mt-0.5">
                            <span>{vid.category}</span>
                            <span aria-hidden="true">·</span>
                            <span>{vid.durationFormatted}</span>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Botão de Adicionar / Administrar */}
          <button
            onClick={() => setActiveTab('admin')}
            className="hidden sm:flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 rounded-lg shadow-sm shadow-indigo-600/30 transition-colors whitespace-nowrap"
          >
            <span>+ Adicionar Vídeo</span>
          </button>

          {/* Status Privado */}
          <button
            onClick={() => setActiveTab('security')}
            aria-label="Ver status de privacidade"
            className="flex items-center justify-center w-9 h-9 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 transition-colors"
            title="Acesso Privado Ativo"
          >
            <Shield className="w-4 h-4 text-emerald-400" />
          </button>
        </div>
      </div>
    </header>
  );
};
