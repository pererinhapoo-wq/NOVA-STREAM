import React from 'react';
import { Home, Library, UploadCloud, ShieldCheck } from 'lucide-react';
import { ActiveTab } from '../../types/video';

interface BottomNavProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, setActiveTab }) => {
  const navItems = [
    { id: 'home' as ActiveTab, label: 'Início', icon: Home },
    { id: 'library' as ActiveTab, label: 'Biblioteca', icon: Library },
    { id: 'admin' as ActiveTab, label: 'Ingestão', icon: UploadCloud },
    { id: 'security' as ActiveTab, label: 'Segurança', icon: ShieldCheck },
  ];

  return (
    <nav
      aria-label="Navegação móvel"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#0B0C10]/95 backdrop-blur-lg border-t border-slate-800/80 px-2 py-1"
    >
      <div className="grid grid-cols-4 items-center h-14">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`min-h-[44px] min-w-[44px] flex flex-col items-center justify-center transition-colors ${
                isActive ? 'text-indigo-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Icon className={`w-5 h-5 transition-transform ${isActive ? 'scale-110' : ''}`} />
              <span className="text-[11px] tracking-tight mt-1 whitespace-nowrap">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
