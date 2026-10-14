import React from 'react';
import {
  ShieldCheck,
  Lock,
  Layers,
  HardDrive,
  Cpu,
  Radio,
  FileCheck2,
  KeyRound,
  CheckCircle2,
  Sliders,
} from 'lucide-react';
import { APP_CONFIG } from '../../config/appConfig';

export const ArchitectureView: React.FC = () => {
  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      {/* Cabeçalho */}
      <div className="pb-4 border-b border-slate-800">
        <div className="flex items-center gap-2 text-indigo-400 text-xs font-semibold uppercase tracking-wider mb-1">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>Diretrizes de Segurança & Roadmap de Engenharia</span>
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">
          Arquitetura da Plataforma Privada
        </h1>
        <p className="text-xs text-slate-400 mt-1 leading-relaxed">
          Planejamento técnico das camadas de autenticação, armazenamento seguro, processamento
          FFmpeg e transmissão HLS para {APP_CONFIG.brandName}.
        </p>
      </div>

      {/* Grid de 4 Pilares da Arquitetura */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Pilar 1: Privacidade e Autenticação */}
        <div className="p-5 bg-[#12131A] rounded-2xl border border-slate-800 space-y-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-950/80 border border-indigo-700/50 flex items-center justify-center text-indigo-400">
            <Lock className="w-5 h-5" />
          </div>
          <h2 className="text-sm font-bold text-white">1. Autenticação & Isolamento</h2>
          <p className="text-xs text-slate-300 leading-relaxed">
            Sem login fictício ou senhas fracas no frontend. Na fase de produção, a plataforma
            utilizará:
          </p>
          <ul className="text-xs text-slate-400 space-y-1.5 list-disc list-inside">
            <li>Tokens JWT assinados com chaves assimétricas (RS256) ou cookies HttpOnly.</li>
            <li>Controle de acesso granular (RBAC: Administrador, Operador, Espectador).</li>
            <li>Zero credenciais ou chaves de serviço no código cliente.</li>
          </ul>
        </div>

        {/* Pilar 2: Armazenamento em Objeto Seguro */}
        <div className="p-5 bg-[#12131A] rounded-2xl border border-slate-800 space-y-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-950/80 border border-indigo-700/50 flex items-center justify-center text-indigo-400">
            <HardDrive className="w-5 h-5" />
          </div>
          <h2 className="text-sm font-bold text-white">2. Armazenamento Seguro</h2>
          <p className="text-xs text-slate-300 leading-relaxed">
            Nenhum arquivo grande é armazenado no banco de dados ou no Git:
          </p>
          <ul className="text-xs text-slate-400 space-y-1.5 list-disc list-inside">
            <li>Upload direto via <strong>Presigned URLs</strong> temporárias (15 min).</li>
            <li>Bucket de armazenamento com bloqueio de acesso público total (Private ACL).</li>
            <li>Download e streaming validados por assinaturas de tempo efêmeras.</li>
          </ul>
        </div>

        {/* Pilar 3: Transcodificação com FFmpeg */}
        <div className="p-5 bg-[#12131A] rounded-2xl border border-slate-800 space-y-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-950/80 border border-indigo-700/50 flex items-center justify-center text-indigo-400">
            <Cpu className="w-5 h-5" />
          </div>
          <h2 className="text-sm font-bold text-white">3. Pipeline FFmpeg & HLS</h2>
          <p className="text-xs text-slate-300 leading-relaxed">
            O fluxo de processamento de vídeo gerará múltiplas qualidades para conexões variadas:
          </p>
          <ul className="text-xs text-slate-400 space-y-1.5 list-disc list-inside">
            <li>Segmentação HLS em blocos de 6 segundos (.ts / fMP4).</li>
            <li>Renditions automatizadas: 1080p (4.5 Mbps), 720p (2.5 Mbps), 480p (1 Mbps).</li>
            <li>Master playlist (.m3u8) adaptativa gerenciada pelo player.</li>
          </ul>
        </div>

        {/* Pilar 4: Player Próprio & Proteção de Mídia */}
        <div className="p-5 bg-[#12131A] rounded-2xl border border-slate-800 space-y-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-950/80 border border-indigo-700/50 flex items-center justify-center text-indigo-400">
            <Radio className="w-5 h-5" />
          </div>
          <h2 className="text-sm font-bold text-white">4. Player Customizado</h2>
          <p className="text-xs text-slate-300 leading-relaxed">
            O player construído nesta primeira fase já está integrado e preparado:
          </p>
          <ul className="text-xs text-slate-400 space-y-1.5 list-disc list-inside">
            <li>Seletor de resolução pronto para HLS.js / Shaka Player.</li>
            <li>Controle de velocidade, buffer e legendas WebVTT.</li>
            <li>Otimização para telas de celular (Android) e atalhos de teclado desktop.</li>
          </ul>
        </div>
      </div>

      {/* Diagrama Visual da Esteira Futura */}
      <div className="p-6 bg-[#12131A] rounded-2xl border border-slate-800 space-y-4">
        <h2 className="text-sm font-bold text-white flex items-center gap-2">
          <Layers className="w-4 h-4 text-indigo-400" />
          <span>Fluxograma da Esteira de Ingestão e Transmissão</span>
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-center">
          <div className="p-3 bg-slate-900 rounded-xl border border-slate-800">
            <div className="text-indigo-400 font-mono text-[11px] mb-1">Passo 01</div>
            <h3 className="text-xs font-semibold text-white mb-1">Admin Seleciona</h3>
            <p className="text-[11px] text-slate-400">
              Metadados + solicitação de URL pré-assinada ao backend seguro.
            </p>
          </div>

          <div className="p-3 bg-slate-900 rounded-xl border border-slate-800">
            <div className="text-indigo-400 font-mono text-[11px] mb-1">Passo 02</div>
            <h3 className="text-xs font-semibold text-white mb-1">Upload Direto</h3>
            <p className="text-[11px] text-slate-400">
              Arquivo é transferido diretamente para o bucket privado sem onerar o servidor web.
            </p>
          </div>

          <div className="p-3 bg-slate-900 rounded-xl border border-slate-800">
            <div className="text-indigo-400 font-mono text-[11px] mb-1">Passo 03</div>
            <h3 className="text-xs font-semibold text-white mb-1">Worker FFmpeg</h3>
            <p className="text-[11px] text-slate-400">
              Gera a playlist master (.m3u8), chunks HLS e áudio AAC estéreo.
            </p>
          </div>

          <div className="p-3 bg-slate-900 rounded-xl border border-slate-800">
            <div className="text-emerald-400 font-mono text-[11px] mb-1">Passo 04</div>
            <h3 className="text-xs font-semibold text-white mb-1">Transmissão</h3>
            <p className="text-[11px] text-slate-400">
              O player privado consome a playlist com validação de token efêmero.
            </p>
          </div>
        </div>
      </div>

      {/* Configuração de Marca & Fácil Alteração */}
      <div className="p-5 bg-[#12131A] rounded-2xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-indigo-400 font-semibold mb-1">
            <Sliders className="w-4 h-4" />
            <span>Identidade Provisória</span>
          </div>
          <h2 className="text-base font-bold text-white">Nome da Marca: {APP_CONFIG.brandName}</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Definido centralmente em <code className="font-mono text-indigo-300">src/config/appConfig.ts</code>,
            permitindo alteração instantânea de nome e slogan a qualquer momento.
          </p>
        </div>

        <div className="px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-xs font-mono text-slate-300 shrink-0">
          Versão {APP_CONFIG.version}
        </div>
      </div>
    </div>
  );
};
