export type UserRole =
  | 'DIRECTOR' | 'RECEPTIONIST' | 'RESTAURANT_MANAGER'
  | 'SERVER' | 'CHEF' | 'BARTENDER' | 'CASHIER' | 'HOUSEKEEPING';

export interface Module {
  id: string; 
  name: string; 
  icon: string; 
  path: string;
  section: 'PRINCIPAL' | 'HOTEL' | 'RESTAURANT' | 'BANQUE' | 'ADMIN'; 
  roles: UserRole[];
}

export const MODULES: Module[] = [
  // 🏠 PRINCIPAL (Tableau de bord unifié)
  { 
    id: 'unified-dashboard', 
    name: 'Tableau de bord', 
    icon: 'LayoutDashboard', 
    path: '/', // ✅ Pointe vers src/app/(app)/page.tsx
    section: 'PRINCIPAL', 
    roles: ['DIRECTOR', 'RECEPTIONIST', 'RESTAURANT_MANAGER', 'SERVER', 'CHEF', 'BARTENDER', 'CASHIER', 'HOUSEKEEPING'] 
  },

  // 🏨 HÔTEL
  { id: 'hotel-dashboard', name: 'Tableau de bord', icon: 'LayoutDashboard', path: '/hotel', section: 'HOTEL', roles: ['DIRECTOR', 'RECEPTIONIST', 'RESTAURANT_MANAGER'] },
  { id: 'rooms', name: 'Chambres', icon: 'Bed', path: '/hotel/chambres', section: 'HOTEL', roles: ['DIRECTOR', 'RECEPTIONIST', 'HOUSEKEEPING'] },
  { id: 'reservations', name: 'Réservations', icon: 'Calendar', path: '/hotel/reservations', section: 'HOTEL', roles: ['DIRECTOR', 'RECEPTIONIST'] },
  { id: 'customers', name: 'Clients', icon: 'Users', path: '/hotel/clients', section: 'HOTEL', roles: ['DIRECTOR', 'RECEPTIONIST'] },
  { id: 'room-service', name: 'Room Service', icon: 'Utensils', path: '/hotel/room-service', section: 'HOTEL', roles: ['DIRECTOR', 'RECEPTIONIST', 'SERVER'] },
  { id: 'hotel-cashier', name: 'Caisse Hôtel', icon: 'DollarSign', path: '/hotel/caisse', section: 'HOTEL', roles: ['DIRECTOR', 'RECEPTIONIST', 'CASHIER'] },
  { id: 'maintenance', name: 'Maintenance', icon: 'Wrench', path: '/hotel/maintenance', section: 'HOTEL', roles: ['DIRECTOR', 'RECEPTIONIST', 'HOUSEKEEPING'] },
  { id: 'hotel-expenses', name: 'Dépenses Hôtel', icon: 'TrendingDown', path: '/hotel/depenses', section: 'HOTEL', roles: ['DIRECTOR', 'RECEPTIONIST', 'CASHIER'] },
  { id: 'hotel-reports', name: 'Rapports', icon: 'BarChart3', path: '/hotel/rapports', section: 'HOTEL', roles: ['DIRECTOR', 'RECEPTIONIST'] },
  { id: 'night-audit', name: 'Audit de nuit', icon: 'Moon', path: '/hotel/audit', section: 'HOTEL', roles: ['DIRECTOR', 'RECEPTIONIST'] },

  // 🍽️ RESTAURANT
  { id: 'resto-dashboard', name: 'Tableau de bord', icon: 'LayoutDashboard', path: '/restaurant', section: 'RESTAURANT', roles: ['DIRECTOR', 'RESTAURANT_MANAGER'] },
  { id: 'floor-plan', name: 'Plan de salle', icon: 'Grid3X3', path: '/restaurant/salle', section: 'RESTAURANT', roles: ['DIRECTOR', 'RESTAURANT_MANAGER', 'SERVER', 'CASHIER'] },
  { id: 'orders', name: 'Commandes', icon: 'ClipboardList', path: '/restaurant/commandes', section: 'RESTAURANT', roles: ['DIRECTOR', 'RESTAURANT_MANAGER', 'SERVER', 'CASHIER'] },
  { id: 'kitchen', name: 'Cuisine / Bar', icon: 'ChefHat', path: '/restaurant/cuisine', section: 'RESTAURANT', roles: ['DIRECTOR', 'CHEF', 'BARTENDER'] },
  { id: 'resto-cashier', name: 'Caisse Resto', icon: 'DollarSign', path: '/restaurant/caisse', section: 'RESTAURANT', roles: ['DIRECTOR', 'RESTAURANT_MANAGER', 'CASHIER'] },
  { id: 'menu', name: 'Gestion du Menu', icon: 'BookOpen', path: '/restaurant/menu', section: 'RESTAURANT', roles: ['DIRECTOR', 'RESTAURANT_MANAGER'] },
  { id: 'stock', name: 'Stock / Inventaire', icon: 'Package', path: '/restaurant/stock', section: 'RESTAURANT', roles: ['DIRECTOR', 'RESTAURANT_MANAGER'] },
  { id: 'suppliers', name: 'Fournisseurs', icon: 'Truck', path: '/restaurant/fournisseurs', section: 'RESTAURANT', roles: ['DIRECTOR', 'RESTAURANT_MANAGER'] },
  { id: 'supplier-orders', name: 'Commandes Fourn.', icon: 'ShoppingCart', path: '/restaurant/commandes-frs', section: 'RESTAURANT', roles: ['DIRECTOR', 'RESTAURANT_MANAGER'] },
  { id: 'expenses', name: 'Dépenses', icon: 'TrendingDown', path: '/restaurant/depenses', section: 'RESTAURANT', roles: ['DIRECTOR', 'RESTAURANT_MANAGER', 'CASHIER'] },
  { id: 'cash-history', name: 'Historique Caisses', icon: 'History', path: '/restaurant/historique-caisses', section: 'RESTAURANT', roles: ['DIRECTOR', 'RESTAURANT_MANAGER', 'CASHIER'] },
  { id: 'resto-reports', name: 'Rapports Resto', icon: 'BarChart3', path: '/restaurant/rapports', section: 'RESTAURANT', roles: ['DIRECTOR', 'RESTAURANT_MANAGER'] },
  { id: 'employees', name: 'Employés', icon: 'Users', path: '/restaurant/employes', section: 'RESTAURANT', roles: ['DIRECTOR', 'RESTAURANT_MANAGER'] },

  // 🏦 BANQUE
  { id: 'banque-comptes', name: 'Comptes & Rapprochement', icon: 'Landmark', path: '/banque', section: 'BANQUE', roles: ['DIRECTOR', 'CASHIER', 'RESTAURANT_MANAGER', 'RECEPTIONIST'] },

  // ⚙️ ADMIN
  { id: 'settings', name: 'Paramètres', icon: 'Settings', path: '/parametres', section: 'ADMIN', roles: ['DIRECTOR'] },
  { id: 'users', name: 'Utilisateurs', icon: 'UserCog', path: '/utilisateurs', section: 'ADMIN', roles: ['DIRECTOR'] },
];

export function getModulesForRole(role: UserRole): Module[] {
  return MODULES.filter(m => m.roles.includes(role));
}

export function hasAccess(role: UserRole, moduleId: string): boolean {
  const m = MODULES.find(x => x.id === moduleId);
  return m ? m.roles.includes(role) : false;
}

export function getModulesBySection(role: UserRole): Record<string, Module[]> {
  const modules = getModulesForRole(role);
  return {
    PRINCIPAL: modules.filter(m => m.section === 'PRINCIPAL'),
    HOTEL: modules.filter(m => m.section === 'HOTEL'),
    RESTAURANT: modules.filter(m => m.section === 'RESTAURANT'),
    BANQUE: modules.filter(m => m.section === 'BANQUE'),
    ADMIN: modules.filter(m => m.section === 'ADMIN'),
  };
}
