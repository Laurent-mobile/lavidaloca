'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Utensils,
  DollarSign,
  ClipboardList,
  ChefHat,
  Package,
  BarChart3,
  Settings,
  Users,
  Truck,
  Receipt,
  TrendingDown,
  X,
} from 'lucide-react';

interface SidebarProps {
  userRole: string;
  userName: string;
  isOpen: boolean;
  onClose: () => void;
  pendingOrdersCount?: number;
  kitchenOrdersCount?: number;
}

// ✅ Configuration des menus par rôle
const MENU_ITEMS = [
  {
    section: 'Principal',
    items: [
      { label: 'Tableau de bord', href: '/restaurant', icon: LayoutDashboard, roles: ['ADMIN', 'MANAGER', 'CASHIER', 'SERVER', 'CHEF', 'STOCK_MANAGER', 'DIRECTOR', 'RESTAURANT_MANAGER', 'RESTAURANT_CASHIER'] },
    ],
  },
  {
    section: 'Opérations',
    items: [
      { label: 'Plan de salle', href: '/restaurant/salle', icon: Utensils, roles: ['ADMIN', 'MANAGER', 'SERVER', 'DIRECTOR', 'RESTAURANT_MANAGER'] },
      { label: 'Caisse', href: '/restaurant/caisse', icon: DollarSign, badgeKey: 'pending', roles: ['ADMIN', 'MANAGER', 'CASHIER', 'DIRECTOR', 'RESTAURANT_MANAGER', 'RESTAURANT_CASHIER'] },
      { label: 'Commandes', href: '/restaurant/commandes', icon: ClipboardList, roles: ['ADMIN', 'MANAGER', 'SERVER', 'CHEF', 'DIRECTOR', 'RESTAURANT_MANAGER'] },
      { label: 'Cuisine / Bar', href: '/restaurant/cuisine', icon: ChefHat, badgeKey: 'kitchen', roles: ['ADMIN', 'MANAGER', 'CHEF', 'DIRECTOR', 'RESTAURANT_MANAGER'] },
    ],
  },
  {
    section: 'Gestion',
    items: [
      { label: 'Stock / Inventaire', href: '/restaurant/stock', icon: Package, roles: ['ADMIN', 'MANAGER', 'STOCK_MANAGER', 'DIRECTOR', 'RESTAURANT_MANAGER'] },
      { label: 'Fournisseurs', href: '/restaurant/fournisseurs', icon: Truck, roles: ['ADMIN', 'MANAGER', 'STOCK_MANAGER', 'DIRECTOR', 'RESTAURANT_MANAGER'] },
      { label: 'Commandes Fourn.', href: '/restaurant/commandes-frs', icon: Receipt, roles: ['ADMIN', 'MANAGER', 'STOCK_MANAGER', 'DIRECTOR', 'RESTAURANT_MANAGER'] },
      { label: 'Dépenses', href: '/restaurant/depenses', icon: TrendingDown, roles: ['ADMIN', 'MANAGER', 'CASHIER', 'DIRECTOR', 'RESTAURANT_MANAGER', 'RESTAURANT_CASHIER'] },
    ],
  },
  {
    section: 'Administration',
    items: [
      { label: 'Rapports', href: '/restaurant/rapports', icon: BarChart3, roles: ['ADMIN', 'MANAGER', 'DIRECTOR', 'RESTAURANT_MANAGER'] },
      { label: 'Employés', href: '/restaurant/employes', icon: Users, roles: ['ADMIN', 'MANAGER', 'DIRECTOR', 'RESTAURANT_MANAGER'] },
      { label: 'Administration', href: '/restaurant/admin', icon: Settings, roles: ['ADMIN', 'DIRECTOR'] },
    ],
  },
];

export default function Sidebar({ userRole, userName, isOpen, onClose, pendingOrdersCount = 0, kitchenOrdersCount = 0 }: SidebarProps) {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === '/restaurant') return pathname === '/restaurant';
    return pathname.startsWith(href);
  };

  const getBadge = (badgeKey?: string) => {
    if (badgeKey === 'pending' && pendingOrdersCount > 0) return pendingOrdersCount;
    if (badgeKey === 'kitchen' && kitchenOrdersCount > 0) return kitchenOrdersCount;
    return 0;
  };

  return (
    <>
      {/* Overlay mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 h-full w-64 bg-slate-900 text-white z-50 transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:z-auto flex flex-col ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-orange-600 rounded-lg flex items-center justify-center font-bold text-white text-lg shadow-lg">
              VL
            </div>
            <div>
              <div className="font-bold text-sm">LA VIDA-LOCA</div>
              <div className="text-xs text-slate-400">Gestion Restaurant</div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="lg:hidden text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Menus */}
        <div className="flex-1 overflow-y-auto py-4 px-3">
          {MENU_ITEMS.map((section) => {
            const visibleItems = section.items.filter(item => item.roles.includes(userRole));
            if (visibleItems.length === 0) return null;

            return (
              <div key={section.section} className="mb-4">
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-3 mb-2">
                  {section.section}
                </div>
                <nav className="space-y-1">
                  {visibleItems.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item.href);
                    const badge = getBadge(item.badgeKey);

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={onClose}
                        className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                          active
                            ? 'bg-emerald-600 text-white shadow-md'
                            : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <Icon className="w-5 h-5" />
                          <span>{item.label}</span>
                        </div>
                        {badge > 0 && (
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                            item.badgeKey === 'kitchen' 
                              ? 'bg-red-500 text-white animate-pulse' 
                              : 'bg-amber-500 text-white'
                          }`}>
                            {badge}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </nav>
              </div>
            );
          })}
        </div>

        {/* Footer utilisateur */}
        <div className="p-4 border-t border-slate-800 bg-slate-900 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-full flex items-center justify-center text-sm font-bold shadow">
              {userName?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{userName || 'Utilisateur'}</div>
              <div className="text-xs text-slate-400 truncate">{userRole}</div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
