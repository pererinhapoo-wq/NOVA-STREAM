import React from 'react';
import { APP_CONFIG } from '../../config/appConfig';
import { ShieldCheck, Video } from 'lucide-react';
import { ActiveTab } from '../../types/video';

interface FooterProps {
  setActiveTab: (tab: ActiveTab) => void;
}

export const Footer: React.FC<FooterProps> = ({ setActiveTab }) => {
  return (
    <footer className="mt-20 border-t border-slate-800/80 bg-[#0B0C10] text-slate-400 text-xs pb-16 md:pb-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Marca e status */}
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-indigo-600/30 flex items-center justify-center text-indigo-400">
            <Video className="w-3.5 h-3.5" />
          </div>
          <span className="font-semibold text-slate-200">{APP_CONFIG.brandName}</span>
          <span aria-hidden="true" className="text-slate-700">·</span>
          <span>{APP_CONFIG.brandTagline}</span>
        </div>

        {/* Links de navegação */}
        <div className="flex items-center gap-6">
          <button
            onClick={() => setActiveTab('home')}
            className="hover:text-slate-200 transition-colors"
          >
            Início
          </button>
          <button
            onClick={() => setActiveTab('library')}
            className="hover:text-slate-200 transition-colors"
          >
            Biblioteca
          </button>
          <button
            onClick={() => setActiveTab('admin')}
            className="hover:text-slate-200 transition-colors"
          >
            Ingestão
          </button>
          <button
            onClick={() => setActiveTab('security')}
            className="hover:text-slate-200 transition-colors flex items-center gap-1"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Segurança</span>
          </button>
        </div>

        {/* Aviso de Demonstração Técnica */}
        <div className="text-[11px] text-slate-400 text-center sm:text-right">
          Fase 1: Interface & Arquitetura Preparada · Uso Privado
        </div>
      </div>
    </footer>
  );
};
