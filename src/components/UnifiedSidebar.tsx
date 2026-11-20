'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getModulesBySection, type UserRole, type Module } from '@/lib/permissions';
import {
    LayoutDashboard, Bed, Calendar, Users, Utensils, DollarSign,
    BarChart3, Moon, Grid3X3, ClipboardList, ChefHat, BookOpen,
    Package, Truck, ShoppingCart, TrendingDown, History, Settings,
    UserCog, Building, ChevronDown, ChevronRight, LogOut,
    Wrench, Landmark
} from 'lucide-react';

// Mapping des icônes
const iconMap: Record<string, any> = {
    LayoutDashboard, Bed, Calendar, Users, Utensils, DollarSign,
    BarChart3, Moon, Grid3X3, ClipboardList, ChefHat, BookOpen,
    Package, Truck, ShoppingCart, TrendingDown, History, Settings,
    UserCog, Building, Wrench, Landmark
};

interface Props {
    role: UserRole;
    siteName: string;
    userEmail: string;
    onLogout: () => void;
}

export default function UnifiedSidebar({ role, siteName, userEmail, onLogout }: Props) {
    const pathname = usePathname();
    const modulesBySection = getModulesBySection(role);
    const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
        PRINCIPAL: true,
        HOTEL: true,
        RESTAURANT: true,
        ACHATS: true, // ✅ Nouvelle section ouverte par défaut
        BANQUE: true,
        ADMIN: role === 'DIRECTOR',
    });

    const toggleSection = (section: string) => {
        setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
    };

    const isActive = (module: Module) => {
        return pathname === module.path || pathname.startsWith(module.path + '/');
    };

    const renderModule = (module: Module) => {
        const Icon = iconMap[module.icon] || LayoutDashboard;
        const active = isActive(module);

        return (
            <Link
                key={module.id}
                href={module.path}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${active
                        ? 'bg-indigo-600 text-white shadow-md'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
            >
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">{module.name}</span>
            </Link>
        );
    };

    const renderSection = (title: string, emoji: string, modules: Module[], sectionKey: string) => {
        if (!modules || modules.length === 0) return null;
        const isExpanded = expandedSections[sectionKey];

        return (
            <div className="mb-4">
                <button
                    onClick={() => toggleSection(sectionKey)}
                    className="flex items-center justify-between w-full px-3 py-2 text-xs font-bold text-slate-400 uppercase tracking-wider hover:text-slate-200 transition-colors"
                >
                    <span>{emoji} {title}</span>
                    {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>
                {isExpanded && (
                    <div className="space-y-1 mt-1">
                        {modules.map(renderModule)}
                    </div>
                )}
            </div>
        );
    };

    return (
        <aside className="w-64 bg-slate-900 text-white flex flex-col h-screen sticky top-0">
            {/* Header */}
            <div className="p-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center p-1 shadow-sm">
                  <img
                    src="/logo.png"
                    alt="LA VIDA-LOCA"
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <h1 className="font-bold text-sm truncate">LA VIDA-LOCA</h1>
                  <p className="text-xs text-slate-400 truncate">{siteName}</p>
                </div>
              </div>
              <div className="mt-3 px-2 py-1 bg-slate-800 rounded text-xs">
                <span className="text-slate-400">Rôle : </span>
                <span className="font-semibold text-indigo-400">{role.replace('_', ' ')}</span>
              </div>
            </div>

            {/* Navigation */}
            <nav className="flex-1 overflow-y-auto p-3">
                {renderSection('PRINCIPAL', '🏠', modulesBySection.PRINCIPAL || [], 'PRINCIPAL')}
                {renderSection('HÔTEL', '🏨', modulesBySection.HOTEL || [], 'HOTEL')}
                {renderSection('RESTAURANT', '🍽️', modulesBySection.RESTAURANT || [], 'RESTAURANT')}
                {/* ✅ NOUVELLE SECTION UNIFIÉE */}
                {renderSection('ACHATS & MAINT.', '📦', modulesBySection.ACHATS || [], 'ACHATS')}
                {renderSection('BANQUE', '🏦', modulesBySection.BANQUE || [], 'BANQUE')}
                {renderSection('ADMINISTRATION', '⚙️', modulesBySection.ADMIN || [], 'ADMIN')}
            </nav>

            {/* Footer utilisateur */}
            <div className="p-3 border-t border-slate-800">
                <div className="flex items-center gap-2 px-2 py-2 mb-2">
                    <div className="w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center text-xs font-bold">
                        {userEmail.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium truncate">{userEmail}</div>
                    </div>
                </div>
                <button
                    onClick={onLogout}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors"
                >
                    <LogOut className="w-4 h-4" />
                    Déconnexion
                </button>
            </div>
        </aside>
    );
}
