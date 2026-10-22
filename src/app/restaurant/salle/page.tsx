'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { 
  LayoutGrid, Search, Plus, X, CheckCircle, AlertCircle, 
  Users, Edit2, Trash2, Save
} from 'lucide-react';

interface Zone {
  id: string;
  name: string;
  description: string;
  color: string;
  is_active: boolean;
}

interface RestaurantTable {
  id: string;
  number: string;
  capacity: number;
  zone_id: string;
  status: 'AVAILABLE' | 'OCCUPIED' | 'RESERVED' | 'DIRTY' | 'OUT_OF_ORDER';
  restaurant_zones?: Zone;
}

const ZONE_ICONS: Record<string, string> = {
  'Salle principale': '🍽️',
  'Terrasse': '☀️',
  'VIP': '👑',
  'BAR': '🍹',
};

const COLOR_CLASSES: Record<string, string> = {
  'blue': 'bg-blue-500',
  'green': 'bg-emerald-500',
  'purple': 'bg-purple-500',
  'red': 'bg-red-500',
  'amber': 'bg-amber-500',
  'orange': 'bg-orange-500',
};

export default function SallePage() {
  const supabase = createClient();
  const [siteId, setSiteId] = useState<string>('');
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [zoneFilter, setZoneFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [search, setSearch] = useState('');

  // États CRUD table
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTable, setEditingTable] = useState<RestaurantTable | null>(null);
  const [form, setForm] = useState({ number: '', capacity: 4, zone_id: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tableToDelete, setTableToDelete] = useState<RestaurantTable | null>(null);
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase.from('profiles').select('site_id').eq('id', user.id).maybeSingle();
        if (profile) setSiteId(profile.site_id || '');
      }
    };
    init();
  }, []);

  useEffect(() => {
    if (siteId) {
      loadZones();
      loadTables();
    }
  }, [siteId]);

  const loadZones = async () => {
    const { data } = await supabase.from('restaurant_zones').select('*').eq('site_id', siteId).eq('is_active', true).order('name');
    setZones(data || []);
  };

  const loadTables = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('restaurant_tables')
        .select(`*, restaurant_zones!zone_id(id, name, description, color, is_active)`)
        .eq('site_id', siteId)
        .order('number', { ascending: true });
      if (error) throw error;
      setTables(data || []);
    } catch (error: any) {
      console.error('Erreur chargement tables:', error.message);
    } finally {
      setLoading(false);
    }
  };

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'AVAILABLE': return { label: 'Libre', color: 'bg-emerald-500', textColor: 'text-emerald-700', bgColor: 'bg-emerald-50', borderColor: 'border-emerald-300', icon: CheckCircle };
      case 'OCCUPIED': return { label: 'Occupée', color: 'bg-red-500', textColor: 'text-red-700', bgColor: 'bg-red-50', borderColor: 'border-red-300', icon: Users };
      case 'RESERVED': return { label: 'Réservée', color: 'bg-amber-500', textColor: 'text-amber-700', bgColor: 'bg-amber-50', borderColor: 'border-amber-300', icon: AlertCircle };
      case 'DIRTY': return { label: 'À nettoyer', color: 'bg-orange-500', textColor: 'text-orange-700', bgColor: 'bg-orange-50', borderColor: 'border-orange-300', icon: AlertCircle };
      case 'OUT_OF_ORDER': return { label: 'Hors service', color: 'bg-slate-500', textColor: 'text-slate-700', bgColor: 'bg-slate-50', borderColor: 'border-slate-300', icon: AlertCircle };
      default: return { label: status, color: 'bg-slate-500', textColor: 'text-slate-700', bgColor: 'bg-slate-50', borderColor: 'border-slate-300', icon: AlertCircle };
    }
  };

  const getZoneIcon = (zoneName?: string) => zoneName ? (ZONE_ICONS[zoneName] || '🍽️') : '🍽️';
  const getZoneColorClass = (color?: string) => color ? (COLOR_CLASSES[color.toLowerCase()] || 'bg-slate-500') : 'bg-slate-500';

  const filteredTables = useMemo(() => {
    return tables.filter(table => {
      const matchesZone = zoneFilter === 'ALL' || table.zone_id === zoneFilter;
      const matchesStatus = statusFilter === 'ALL' || table.status === statusFilter;
      const matchesSearch = table.number.toLowerCase().includes(search.toLowerCase());
      return matchesZone && matchesStatus && matchesSearch;
    });
  }, [tables, zoneFilter, statusFilter, search]);

  const openCreateForm = () => {
    setEditingTable(null);
    setForm({ number: '', capacity: 4, zone_id: zones[0]?.id || '' });
    setIsFormOpen(true);
  };

  const openEditForm = (table: RestaurantTable) => {
    if (table.status === 'OCCUPIED') {
      alert('Impossible de modifier une table occupée.');
      return;
    }
    setEditingTable(table);
    setForm({ number: table.number, capacity: table.capacity, zone_id: table.zone_id });
    setIsFormOpen(true);
  };

  const handleSaveTable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.number || !form.zone_id) {
      alert('Le numéro et la zone sont obligatoires.');
      return;
    }
    setIsSubmitting(true);
    try {
      if (editingTable) {
        const { error } = await supabase.from('restaurant_tables')
          .update({ number: form.number, capacity: form.capacity, zone_id: form.zone_id })
          .eq('id', editingTable.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('restaurant_tables')
          .insert({ site_id: siteId, number: form.number, capacity: form.capacity, zone_id: form.zone_id, status: 'AVAILABLE' });
        if (error) throw error;
      }
      setIsFormOpen(false);
      loadTables();
      alert('✅ Table enregistrée !');
    } catch (error: any) {
      console.error('Erreur:', error);
      alert('Erreur : ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const openDeleteModal = (table: RestaurantTable) => {
    setTableToDelete(table);
    setDeleteError('');
  };

  const handleDeleteTable = async () => {
    if (!tableToDelete) return;
    setIsSubmitting(true);
    setDeleteError('');
    try {
      if (tableToDelete.status === 'OCCUPIED') {
        setDeleteError('Impossible de supprimer une table occupée. Libérez-la d\'abord.');
        setIsSubmitting(false);
        return;
      }
      const { error } = await supabase.from('restaurant_tables').delete().eq('id', tableToDelete.id);
      if (error) throw error;
      setTableToDelete(null);
      loadTables();
      alert('✅ Table supprimée !');
    } catch (error: any) {
      setDeleteError('Erreur : ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const stats = useMemo(() => ({
    available: tables.filter(t => t.status === 'AVAILABLE').length,
    occupied: tables.filter(t => t.status === 'OCCUPIED').length,
    reserved: tables.filter(t => t.status === 'RESERVED').length,
    dirty: tables.filter(t => t.status === 'DIRTY').length,
    total: tables.length,
  }), [tables]);

  return (
    <div className="p-4 lg:p-6 h-full space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <LayoutGrid className="w-7 h-7 text-indigo-600" />
            Plan de Salle
          </h1>
          <p className="text-sm text-slate-500 mt-1">Gérez vos tables, zones et leur organisation.</p>
        </div>
        <button 
          onClick={openCreateForm}
          className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-lg font-medium transition-colors shadow-sm"
        >
          <Plus className="w-5 h-5" />
          Nouvelle Table
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <div className="text-xs text-slate-500 mb-1">Total</div>
          <div className="text-2xl font-bold text-slate-900">{stats.total}</div>
        </div>
        <div className="bg-emerald-50 rounded-xl border border-emerald-200 p-4 shadow-sm">
          <div className="text-xs text-emerald-700 mb-1">Libres</div>
          <div className="text-2xl font-bold text-emerald-900">{stats.available}</div>
        </div>
        <div className="bg-red-50 rounded-xl border border-red-200 p-4 shadow-sm">
          <div className="text-xs text-red-700 mb-1">Occupées</div>
          <div className="text-2xl font-bold text-red-900">{stats.occupied}</div>
        </div>
        <div className="bg-amber-50 rounded-xl border border-amber-200 p-4 shadow-sm">
          <div className="text-xs text-amber-700 mb-1">Réservées</div>
          <div className="text-2xl font-bold text-amber-900">{stats.reserved}</div>
        </div>
        <div className="bg-orange-50 rounded-xl border border-orange-200 p-4 shadow-sm">
          <div className="text-xs text-orange-700 mb-1">À nettoyer</div>
          <div className="text-2xl font-bold text-orange-900">{stats.dirty}</div>
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input type="text" placeholder="Rechercher une table..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
        </div>
        <select value={zoneFilter} onChange={(e) => setZoneFilter(e.target.value)} className="px-4 py-2 border border-slate-300 rounded-lg bg-white text-sm cursor-pointer">
          <option value="ALL">Toutes les zones</option>
          {zones.map(z => <option key={z.id} value={z.id}>{getZoneIcon(z.name)} {z.name}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-4 py-2 border border-slate-300 rounded-lg bg-white text-sm cursor-pointer">
          <option value="ALL">Tous les statuts</option>
          <option value="AVAILABLE">Libre</option>
          <option value="OCCUPIED">Occupée</option>
          <option value="RESERVED">Réservée</option>
          <option value="DIRTY">À nettoyer</option>
          <option value="OUT_OF_ORDER">Hors service</option>
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : filteredTables.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
          <LayoutGrid className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-slate-900">Aucune table trouvée</h3>
          <p className="text-slate-500 text-sm">Cliquez sur "Nouvelle Table" pour commencer.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {filteredTables.map((table) => {
            const statusConfig = getStatusConfig(table.status);
            const zoneName = table.restaurant_zones?.name || 'Zone';
            const zoneIcon = getZoneIcon(zoneName);
            const zoneColor = getZoneColorClass(table.restaurant_zones?.color);
            
            return (
              <div key={table.id} className={`relative rounded-xl border-2 p-4 transition-all hover:shadow-lg ${statusConfig.bgColor} ${statusConfig.borderColor}`}>
                <div className={`absolute top-2 right-2 w-3 h-3 rounded-full ${statusConfig.color} ${table.status === 'OCCUPIED' ? 'animate-pulse' : ''}`}></div>
                
                <div className="text-center mb-3">
                  <div className="text-3xl font-bold text-slate-900">{table.number}</div>
                  <div className="text-xs text-slate-600 mt-1 flex items-center justify-center gap-1">
                    <span className={`inline-block w-2 h-2 rounded-full ${zoneColor}`}></span>
                    {zoneIcon} {zoneName}
                  </div>
                </div>

                <div className="flex items-center justify-center gap-1 text-xs text-slate-600 mb-3">
                  <Users className="w-3 h-3" />
                  <span>{table.capacity} places</span>
                </div>

                <div className={`text-xs font-medium text-center py-1 rounded ${statusConfig.textColor} bg-white/50 mb-2`}>
                  {statusConfig.label}
                </div>

                {/* Actions CRUD */}
                <div className="flex gap-1 pt-2 border-t border-current/20">
                  <button 
                    onClick={() => openEditForm(table)}
                    disabled={table.status === 'OCCUPIED'}
                    className="flex-1 flex items-center justify-center gap-1 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white text-xs font-medium py-1.5 rounded transition-colors"
                    title="Modifier"
                  >
                    <Edit2 className="w-3 h-3" />
                    Modifier
                  </button>
                  <button 
                    onClick={() => openDeleteModal(table)}
                    disabled={table.status === 'OCCUPIED'}
                    className="flex items-center justify-center bg-red-600 hover:bg-red-700 disabled:bg-slate-300 text-white text-xs font-medium py-1.5 px-2 rounded transition-colors"
                    title="Supprimer"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modale Création/Modification Table */}
      {isFormOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="bg-indigo-600 text-white px-6 py-4 flex items-center justify-between">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <LayoutGrid className="w-5 h-5" />
                {editingTable ? 'Modifier la table' : 'Nouvelle Table'}
              </h3>
              <button onClick={() => setIsFormOpen(false)} className="hover:bg-indigo-700 p-1 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveTable} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Numéro de table *</label>
                <input 
                  type="text" 
                  required 
                  value={form.number} 
                  onChange={(e) => setForm({ ...form, number: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="Ex: T01, T02..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Capacité (places) *</label>
                <input 
                  type="number" 
                  min="1" 
                  max="20" 
                  required 
                  value={form.capacity} 
                  onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Zone *</label>
                <select 
                  value={form.zone_id} 
                  onChange={(e) => setForm({ ...form, zone_id: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  <option value="">-- Sélectionner une zone --</option>
                  {zones.map(z => <option key={z.id} value={z.id}>{getZoneIcon(z.name)} {z.name}</option>)}
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setIsFormOpen(false)} className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold py-2.5 rounded-lg">
                  Annuler
                </button>
                <button type="submit" disabled={isSubmitting} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-lg disabled:opacity-50 flex items-center justify-center gap-2">
                  {isSubmitting ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <><Save className="w-4 h-4" />Enregistrer</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modale Suppression */}
      {tableToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm">
            <div className="bg-red-600 text-white px-6 py-4 flex items-center justify-between">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <AlertCircle className="w-5 h-5" />
                Confirmer la suppression
              </h3>
              <button onClick={() => setTableToDelete(null)} className="hover:bg-red-700 p-1 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              {deleteError ? (
                <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-lg text-sm mb-4">
                  {deleteError}
                </div>
              ) : (
                <p className="text-slate-700 mb-6">
                  Voulez-vous vraiment supprimer la table <strong>{tableToDelete.number}</strong> ?
                </p>
              )}
              <div className="flex gap-3">
                <button onClick={() => setTableToDelete(null)} className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold py-2.5 rounded-lg">
                  {deleteError ? 'Fermer' : 'Annuler'}
                </button>
                {!deleteError && (
                  <button onClick={handleDeleteTable} disabled={isSubmitting} className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-2.5 rounded-lg disabled:opacity-50 flex items-center justify-center gap-2">
                    {isSubmitting ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <><Trash2 className="w-4 h-4" />Supprimer</>}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
