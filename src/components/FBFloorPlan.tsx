'use client';
import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { X, Plus, Users, Coffee, Utensils, Clock,DollarSign, CheckCircle, ShoppingCart, FileText, Truck, Hotel, Filter, ChevronRight, AlertCircle } from 'lucide-react';
import FBOrderModal from './FBOrderModal';

interface Props {
  siteId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  preselectedOrderId?: string | null;
}

export default function FBFloorPlan({ siteId, isOpen, onClose, onSuccess, preselectedOrderId }: Props) {
  const supabase = createClient();
  const [zones, setZones] = useState<any[]>([]);
  const [tables, setTables] = useState<any[]>([]);
  const [activeZone, setActiveZone] = useState<string | null>(null);
  const [selectedTable, setSelectedTable] = useState<any>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [activeOrders, setActiveOrders] = useState<any[]>([]);
  const [filterType, setFilterType] = useState<'ALL' | 'TABLE' | 'TAKEAWAY' | 'DELIVERY' | 'ROOM_SERVICE'>('ALL');
  
  // ✅ NOUVEAU : Commande sélectionnée pour le panneau de détails
  const [selectedOrderDetail, setSelectedOrderDetail] = useState<any>(null);

  useEffect(() => {
    if (isOpen) {
      loadData();
      loadActiveOrders();
      cleanupOldDrafts();
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && preselectedOrderId) {
      const loadOrderForModal = async () => {
        try {
          const { data: order } = await supabase
            .from('restaurant_orders')
            .select(`id, table_id, restaurant_tables(id, number, zone_id, capacity, status)`)
            .eq('id', preselectedOrderId)
            .maybeSingle();

          if (order) {
            setSelectedTable(order.restaurant_tables || null);
            setSelectedOrderId(order.id);
            setShowOrderModal(true);
          }
        } catch (error) {
          console.error('Erreur chargement commande:', error);
        }
      };
      loadOrderForModal();
    }
  }, [isOpen, preselectedOrderId]);

  const loadData = async () => {
    try {
      const { data: z } = await supabase.from('restaurant_zones').select('*').eq('site_id', siteId).eq('is_active', true).order('name');
      if (z) {
        setZones(z);
        if (!activeZone && z.length > 0) setActiveZone(z[0].id);
      }

      const { data: t } = await supabase.from('restaurant_tables').select('*, restaurant_zones(name, color)').eq('site_id', siteId).order('number');
      if (t) setTables(t);
    } catch (error) {
      console.error('Erreur loadData:', error);
    }
  };

  const loadActiveOrders = async () => {
    try {
      const { data, error } = await supabase
        .from('restaurant_orders')
        .select(`
          id, order_number, table_id, order_type, status, total_amount, created_at, server_id, notes,
          restaurant_order_items(id, item_name, quantity),
          restaurant_tables(number),
          restaurant_employees(first_name, last_name)
        `)
        .eq('site_id', siteId)
        .in('status', ['DRAFT', 'SENT', 'PREPARING', 'READY', 'ROOM_CHARGE'])
        .order('created_at', { ascending: true });

      if (error) throw error;

      const formatted = (data || []).map(order => ({
        ...order,
        table_number: order.restaurant_tables?.number || null,
        server_name: order.restaurant_employees ? `${order.restaurant_employees.first_name} ${order.restaurant_employees.last_name}` : 'Inconnu',
        items_count: order.restaurant_order_items?.length || 0
      }));

      setActiveOrders(formatted);
    } catch (error) {
      console.error('Erreur loadActiveOrders:', error);
    }
  };

  const cleanupOldDrafts = async () => {
    try {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      await supabase.from('restaurant_orders').delete().eq('site_id', siteId).eq('status', 'DRAFT').lt('created_at', twoHoursAgo);
    } catch (error) {
      console.error('Erreur nettoyage brouillons:', error);
    }
  };

  const processedOrders = useMemo(() => {
    return activeOrders
      .filter(order => {
        if (filterType === 'ALL') return true;
        if (filterType === 'TABLE') return order.table_id !== null;
        return order.order_type === filterType;
      })
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }, [activeOrders, filterType]);

  const getUrgencyBadge = (createdAt: string, status: string) => {
    if (status === 'DRAFT') return null;
    const minutesAgo = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
    if (minutesAgo > 30) return <span className="text-xs bg-red-100 text-red-800 border border-red-300 px-2 py-0.5 rounded font-bold animate-pulse">🚨 {minutesAgo} min</span>;
    if (minutesAgo > 15) return <span className="text-xs bg-orange-100 text-orange-800 border border-orange-300 px-2 py-0.5 rounded font-bold">⏳ {minutesAgo} min</span>;
    return <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded">🕒 {minutesAgo} min</span>;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'AVAILABLE': return 'bg-emerald-100 border-emerald-400 text-emerald-900';
      case 'OCCUPIED': return 'bg-blue-100 border-blue-400 text-blue-900';
      case 'RESERVED': return 'bg-amber-100 border-amber-400 text-amber-900';
      case 'DIRTY': return 'bg-orange-100 border-orange-400 text-orange-900';
      default: return 'bg-slate-100 border-slate-400 text-slate-900';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'AVAILABLE': return 'Libre';
      case 'OCCUPIED': return 'Occupée';
      case 'RESERVED': return 'Réservée';
      case 'DIRTY': return 'À nettoyer';
      default: return status;
    }
  };

  const handleTableClick = (table: any) => {
    setSelectedTable(table);
    const tableOrder = activeOrders.find(o => o.table_id === table.id);
    setSelectedOrderId(tableOrder ? tableOrder.id : null);
    setShowOrderModal(true);
  };

  const handleCleanTable = async (table: any, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Libérer la table ${table.number} ?`)) return;
    try {
      await supabase.from('restaurant_tables').update({ status: 'AVAILABLE', current_server_id: null }).eq('id', table.id);
      await loadData();
      await loadActiveOrders();
      onSuccess();
    } catch (error) {
      console.error('Erreur libération table:', error);
    }
  };

  const handleDirectOrder = () => {
    setSelectedTable(null);
    setSelectedOrderId(null);
    setShowOrderModal(true);
  };

  // ✅ NOUVEAU : Clic sur une commande dans la liste pour voir les détails
  const handleOrderClick = (order: any) => {
    setSelectedOrderDetail(order);
    if (order.table_id) {
      const table = tables.find(t => t.id === order.table_id);
      setSelectedTable(table || null);
    } else {
      setSelectedTable(null);
    }
    setSelectedOrderId(order.id);
  };

  const handleEditOrder = () => {
    if (selectedOrderDetail) {
      setShowOrderModal(true);
    }
  };

  if (!isOpen) return null;

  const currentZoneTables = activeZone ? tables.filter(t => t.zone_id === activeZone) : tables;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-7xl max-h-[95vh] overflow-hidden flex flex-col">
        {/* En-tête */}
        <div className="bg-gradient-to-r from-amber-600 to-orange-700 text-white px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <Utensils className="w-6 h-6" />
            <div>
              <h2 className="text-xl font-bold">Plan de Salle - Restaurant</h2>
              <p className="text-xs text-amber-100">
                {currentZoneTables.filter(t => t.status === 'OCCUPIED').length} table(s) occupée(s) • {processedOrders.length} commande(s)
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleDirectOrder} className="bg-white/20 hover:bg-white/30 text-white text-sm px-3 py-1.5 rounded-lg font-medium flex items-center gap-1 border border-white/30">
              <Plus className="w-4 h-4" /> Commande directe
            </button>
            <button onClick={onClose} className="hover:bg-white/20 p-2 rounded-lg"><X className="w-5 h-5" /></button>
          </div>
        </div>

        {/* ✅ SPLIT-VIEW : Deux colonnes */}
        <div className="flex-1 flex overflow-hidden">
          {/* Colonne GAUCHE : Plan de salle (60%) */}
          <div className="w-3/5 border-r border-slate-200 overflow-y-auto p-6 space-y-4">
            {/* Filtres de zones */}
            {zones.length > 0 && (
              <div className="flex gap-2 border-b border-slate-200 pb-2">
                <button onClick={() => setActiveZone(null)} className={`px-4 py-2 font-medium text-sm ${activeZone === null ? 'border-b-2 border-amber-600 text-amber-600' : 'text-slate-600 hover:text-slate-900'}`}>
                  Toutes les zones
                </button>
                {zones.map(zone => (
                  <button key={zone.id} onClick={() => setActiveZone(zone.id)} className={`px-4 py-2 font-medium text-sm ${activeZone === zone.id ? 'border-b-2 border-amber-600 text-amber-600' : 'text-slate-600 hover:text-slate-900'}`}>
                    {zone.name}
                  </button>
                ))}
              </div>
            )}

            {/* Statistiques */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-emerald-50 border-2 border-emerald-200 rounded-lg p-3">
                <div className="text-xs font-medium text-emerald-700">🟢 Libres</div>
                <div className="text-2xl font-bold text-emerald-900">{currentZoneTables.filter(t => t.status === 'AVAILABLE').length}</div>
              </div>
              <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-3">
                <div className="text-xs font-medium text-blue-700">🔵 Occupées</div>
                <div className="text-2xl font-bold text-blue-900">{currentZoneTables.filter(t => t.status === 'OCCUPIED').length}</div>
              </div>
              <div className="bg-amber-50 border-2 border-amber-200 rounded-lg p-3">
                <div className="text-xs font-medium text-amber-700">📋 Actives</div>
                <div className="text-2xl font-bold text-amber-900">{activeOrders.length}</div>
              </div>
            </div>

            {/* Grille des tables */}
            <div className="bg-slate-50 rounded-lg border-2 border-slate-200 p-6">
              {currentZoneTables.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <Coffee className="w-12 h-12 mx-auto mb-2 text-slate-300" />
                  <p>Aucune table dans cette zone</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                  {currentZoneTables.map(table => {
                    const tableOrder = activeOrders.find(o => o.table_id === table.id);
                    const isDirty = table.status === 'DIRTY';
                    return (
                      <div key={table.id} className="relative">
                        <button onClick={() => handleTableClick(table)} className={`w-full rounded-lg border-2 p-4 text-left hover:shadow-lg transition-all ${getStatusColor(table.status)}`}>
                          {tableOrder && <div className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold animate-pulse">1</div>}
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-lg font-bold">{table.number}</span>
                            <Users className="w-4 h-4 opacity-60" />
                          </div>
                          <div className="text-xs opacity-80">{getStatusLabel(table.status)}</div>
                          <div className="text-xs mt-1">👥 {table.capacity} pers.</div>
                          {tableOrder && (
                            <div className="mt-2 pt-2 border-t border-current/20">
                              <div className="text-xs font-semibold">{Number(tableOrder.total_amount || 0).toLocaleString('fr-FR')} F</div>
                            </div>
                          )}
                        </button>
                        {isDirty && (
                          <button onClick={(e) => handleCleanTable(table, e)} className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-3 py-1 rounded-full shadow-lg flex items-center gap-1 z-10">
                            <CheckCircle className="w-3 h-3" /> Libérer
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Colonne DROITE : Liste des commandes + Détails (40%) */}
          <div className="w-2/5 flex flex-col overflow-hidden">
            {/* Filtres par type */}
            <div className="flex flex-wrap gap-2 items-center bg-slate-50 p-3 border-b border-slate-200">
              <Filter className="w-4 h-4 text-slate-500" />
              <span className="text-sm font-medium text-slate-700 mr-2">Filtrer :</span>
              {[
                { id: 'ALL', label: 'Toutes', icon: ShoppingCart },
                { id: 'TABLE', label: 'Tables', icon: Utensils },
                { id: 'TAKEAWAY', label: 'Emporter', icon: FileText },
                { id: 'DELIVERY', label: 'Livrer', icon: Truck },
                { id: 'ROOM_SERVICE', label: 'Chambre', icon: Hotel },
              ].map(filter => {
                const Icon = filter.icon;
                return (
                  <button key={filter.id} onClick={() => setFilterType(filter.id as any)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${filterType === filter.id ? 'bg-amber-600 text-white shadow-sm' : 'bg-white text-slate-600 border border-slate-300 hover:bg-slate-100'}`}>
                    <Icon className="w-3.5 h-3.5" />
                    {filter.label}
                  </button>
                );
              })}
            </div>

            {/* Liste des commandes */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {processedOrders.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <Coffee className="w-12 h-12 mx-auto mb-2 text-slate-300" />
                  <p className="text-sm">Aucune commande active</p>
                </div>
              ) : (
                processedOrders.map(order => {
                  const isSelected = selectedOrderDetail?.id === order.id;
                  let TypeIcon = FileText;
                  let colorClass = "bg-slate-50 border-slate-200";

                  if (order.table_number) { TypeIcon = Utensils; colorClass = "bg-blue-50 border-blue-200"; }
                  else if (order.order_type === 'TAKEAWAY') { TypeIcon = FileText; colorClass = "bg-amber-50 border-amber-200"; }
                  else if (order.order_type === 'DELIVERY') { TypeIcon = Truck; colorClass = "bg-indigo-50 border-indigo-200"; }
                  else if (order.order_type === 'ROOM_SERVICE') { TypeIcon = Hotel; colorClass = "bg-purple-50 border-purple-200"; }

                  return (
                    <button
                      key={order.id}
                      onClick={() => handleOrderClick(order)}
                      className={`w-full text-left border-2 rounded-lg p-3 transition-all ${colorClass} ${isSelected ? 'ring-2 ring-amber-500 shadow-md' : 'hover:shadow-sm'}`}
                    >
                      <div className="flex items-start justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <TypeIcon className="w-4 h-4" />
                          <span className="font-bold text-sm">
                            {order.table_number ? `Table ${order.table_number}` : order.order_type === 'TAKEAWAY' ? 'À emporter' : order.order_type === 'DELIVERY' ? 'À livrer' : 'Chambre'}
                          </span>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-bold">{Number(order.total_amount).toLocaleString('fr-FR')} F</div>
                          {getUrgencyBadge(order.created_at, order.status)}
                        </div>
                      </div>
                      <div className="text-xs text-slate-600">#{order.order_number} • {order.server_name}</div>
                      <div className="text-xs text-slate-500 mt-1">{order.items_count} article(s) • {new Date(order.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</div>
                      {order.order_type === 'DELIVERY' && order.notes?.includes('📍') && (
                        <div className="text-xs mt-1 bg-blue-100 p-1 rounded text-blue-900">📍 {order.notes.replace('📍 Livraison: ', '').replace(' Livraison: ', '')}</div>
                      )}
                    </button>
                  );
                })
              )}
            </div>

   {/* Panneau de détails de la commande sélectionnée */}
{selectedOrderDetail && (
  <div className="border-t-2 border-amber-200 bg-amber-50 p-4 flex-shrink-0">
    <div className="flex items-center justify-between mb-2">
      <h4 className="font-bold text-amber-900 flex items-center gap-2">
        <ChevronRight className="w-4 h-4" />
        Détails de la commande
      </h4>
      <button onClick={() => setSelectedOrderDetail(null)} className="text-slate-500 hover:text-slate-700">
        <X className="w-4 h-4" />
      </button>
    </div>
    
    <div className="text-sm text-slate-700 mb-3">
      <div className="font-semibold flex items-center gap-2">
        #{selectedOrderDetail.order_number}
        {getUrgencyBadge(selectedOrderDetail.created_at, selectedOrderDetail.status)}
      </div>
      <div className="text-xs">{selectedOrderDetail.server_name} • {selectedOrderDetail.items_count} article(s)</div>
      <div className="text-lg font-bold text-amber-900 mt-1">{Number(selectedOrderDetail.total_amount).toLocaleString('fr-FR')} F</div>
      
      {/* ✅ Affichage de l'adresse si livraison */}
      {selectedOrderDetail.order_type === 'DELIVERY' && selectedOrderDetail.notes?.includes('📍') && (
        <div className="text-xs mt-2 bg-blue-100 p-2 rounded border border-blue-200 text-blue-900">
          📍 {selectedOrderDetail.notes.replace('📍 Livraison: ', '').replace(' Livraison: ', '')}
        </div>
      )}
    </div>

    <div className="flex gap-2">
      {/* Bouton Modifier */}
      <button 
        onClick={() => {
          if (selectedOrderDetail.table_id) {
            const table = tables.find(t => t.id === selectedOrderDetail.table_id);
            setSelectedTable(table || null);
          } else {
            setSelectedTable(null);
          }
          setSelectedOrderId(selectedOrderDetail.id);
          setShowOrderModal(true);
        }} 
        className="flex-1 bg-slate-600 hover:bg-slate-700 text-white font-semibold py-2 rounded-lg flex items-center justify-center gap-2 text-sm"
      >
        <FileText className="w-4 h-4" />
        Modifier
      </button>

      {/* ✅ Bouton Valider & Caisse (visible si DRAFT, SENT ou PREPARING) */}
      {(selectedOrderDetail.status === 'DRAFT' || selectedOrderDetail.status === 'SENT' || selectedOrderDetail.status === 'PREPARING') && (
        <button 
          onClick={() => {
            if (selectedOrderDetail.table_id) {
              const table = tables.find(t => t.id === selectedOrderDetail.table_id);
              setSelectedTable(table || null);
            } else {
              setSelectedTable(null);
            }
            setSelectedOrderId(selectedOrderDetail.id);
            setShowOrderModal(true); // Ouvre le modal pour validation finale
          }}
          className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2 rounded-lg flex items-center justify-center gap-2 text-sm"
        >
          <DollarSign className="w-4 h-4" />
          Valider & Caisse
        </button>
      )}

      {/* Badge En attente */}
      {selectedOrderDetail.status === 'READY' && (
        <div className="flex-1 bg-blue-100 text-blue-800 font-semibold py-2 rounded-lg flex items-center justify-center gap-2 text-sm border-2 border-blue-300">
          <CheckCircle className="w-4 h-4" />
          En attente de paiement
        </div>
      )}

      {/* Badge Imputée chambre */}
      {selectedOrderDetail.status === 'ROOM_CHARGE' && (
        <div className="flex-1 bg-purple-100 text-purple-800 font-semibold py-2 rounded-lg flex items-center justify-center gap-2 text-sm border-2 border-purple-300">
          <Hotel className="w-4 h-4" />
          Imputée à la chambre
        </div>
      )}
    </div>
  </div>
)}
          </div>
        </div>
      </div>

      {/* Modal de commande (pour édition détaillée) */}
      {showOrderModal && (
        <FBOrderModal
          key={`${selectedTable?.id || 'direct'}-${selectedOrderId || 'new'}`}
          siteId={siteId}
          table={selectedTable}
          orderId={selectedOrderId}
          isOpen={showOrderModal}
          onClose={() => { setShowOrderModal(false); setSelectedTable(null); setSelectedOrderId(null); }}
          onSuccess={() => { 
            setShowOrderModal(false); setSelectedTable(null); setSelectedOrderId(null);
            loadData(); loadActiveOrders(); onSuccess(); 
          }}
        />
      )}
    </div>
  );
}
