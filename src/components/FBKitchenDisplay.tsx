'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { X, ChefHat, CheckCircle, Clock } from 'lucide-react';

interface Props {
  siteId: string;
  isOpen: boolean;
  onClose: () => void;
  destination?: 'KITCHEN' | 'BAR' | 'BOTH';
}

export default function FBKitchenDisplay({ siteId, isOpen, onClose, destination = 'BOTH' }: Props) {
  const supabase = createClient();
  const [orders, setOrders] = useState<any[]>([]);
  const [filter, setFilter] = useState<'ALL' | 'KITCHEN' | 'BAR'>('ALL');

  useEffect(() => {
    if (isOpen) {
      loadOrders();
      const interval = setInterval(loadOrders, 5000); // Rafraîchir toutes les 5s
      return () => clearInterval(interval);
    }
  }, [isOpen]);

  const loadOrders = async () => {
    const { data } = await supabase
      .from('restaurant_orders')
      .select(`
        id, order_number, table_id, status, created_at, server_id,
        restaurant_tables(number),
        restaurant_order_items(id, item_name, quantity, notes, status, destination),
        restaurant_employees(first_name, last_name)
      `)
      .eq('site_id', siteId)
      .in('status', ['SENT', 'PREPARING', 'READY'])
      .order('created_at', { ascending: true });

    if (data) {
      const filtered = data.map(order => ({
        ...order,
        restaurant_order_items: order.restaurant_order_items.filter((item: any) => {
          if (filter === 'ALL') return true;
          if (filter === 'KITCHEN') return item.destination === 'KITCHEN' || item.destination === 'BOTH';
          if (filter === 'BAR') return item.destination === 'BAR' || item.destination === 'BOTH';
          return true;
        }),
      })).filter(order => order.restaurant_order_items.length > 0);

      setOrders(filtered);
    }
  };

  const handleItemStatusChange = async (itemId: string, newStatus: string, orderId: string) => {
    await supabase.from('restaurant_order_items').update({ status: newStatus }).eq('id', itemId);

    const { data: allItems } = await supabase
      .from('restaurant_order_items')
      .select('status')
      .eq('order_id', orderId);

    if (allItems) {
      const allReady = allItems.every(i => i.status === 'READY' || i.status === 'SERVED');
      if (allReady) {
        await supabase.from('restaurant_orders').update({ status: 'READY' }).eq('id', orderId);
      } else {
        const anyPreparing = allItems.some(i => i.status === 'PREPARING');
        if (anyPreparing) {
          await supabase.from('restaurant_orders').update({ status: 'PREPARING' }).eq('id', orderId);
        }
      }
    }
    loadOrders();
  };

  const handleMarkServed = async (orderId: string) => {
    await supabase.from('restaurant_orders').update({
      status: 'SERVED',
      completed_at: new Date().toISOString(),
    }).eq('id', orderId);
    loadOrders();
  };

  if (!isOpen) return null;

  const pendingCount = orders.filter(o => o.status === 'SENT').length;
  const preparingCount = orders.filter(o => o.status === 'PREPARING').length;
  const readyCount = orders.filter(o => o.status === 'READY').length;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[95vh] overflow-y-auto">
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 text-white px-6 py-4 flex items-center justify-between rounded-t-xl sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <ChefHat className="w-6 h-6" />
            <div>
              <h2 className="text-xl font-bold">{destination === 'KITCHEN' ? '👨‍🍳 Cuisine' : destination === 'BAR' ? '🍹 Bar' : '🍽️ Cuisine & Bar'}</h2>
              <p className="text-xs text-slate-300">{pendingCount} en attente • {preparingCount} en préparation • {readyCount} prêtes</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex gap-1 bg-slate-700 rounded-lg p-1">
              <button onClick={() => setFilter('ALL')} className={`px-3 py-1 rounded text-xs font-medium ${filter === 'ALL' ? 'bg-white text-slate-900' : 'text-white'}`}>Tout</button>
              <button onClick={() => setFilter('KITCHEN')} className={`px-3 py-1 rounded text-xs font-medium ${filter === 'KITCHEN' ? 'bg-white text-slate-900' : 'text-white'}`}>👨‍🍳 Cuisine</button>
              <button onClick={() => setFilter('BAR')} className={`px-3 py-1 rounded text-xs font-medium ${filter === 'BAR' ? 'bg-white text-slate-900' : 'text-white'}`}>🍹 Bar</button>
            </div>
            <button onClick={onClose} className="hover:bg-white/20 p-2 rounded-lg"><X className="w-5 h-5" /></button>
          </div>
        </div>

        <div className="p-6">
          {orders.length === 0 ? (
            <div className="text-center py-12 bg-slate-50 rounded-lg">
              <CheckCircle className="w-16 h-16 mx-auto mb-2 text-emerald-400" />
              <p className="text-lg font-semibold text-slate-700">Aucune commande en cours</p>
              <p className="text-sm text-slate-500">Toutes les commandes sont traitées</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {orders.map(order => (
                <div key={order.id} className={`border-2 rounded-lg p-4 ${order.status === 'SENT' ? 'bg-amber-50 border-amber-300' : order.status === 'PREPARING' ? 'bg-blue-50 border-blue-300' : 'bg-emerald-50 border-emerald-300'}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="font-bold text-lg">{order.restaurant_tables?.number ? `Table ${order.restaurant_tables.number}` : 'Room Service'}</div>
                      <div className="text-xs text-slate-600">#{order.order_number} • {order.restaurant_employees?.first_name} {order.restaurant_employees?.last_name}</div>
                      <div className="text-xs text-slate-500 mt-1"><Clock className="w-3 h-3 inline" /> {new Date(order.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</div>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded font-bold ${order.status === 'SENT' ? 'bg-amber-200 text-amber-900' : order.status === 'PREPARING' ? 'bg-blue-200 text-blue-900' : 'bg-emerald-200 text-emerald-900'}`}>
                      {order.status === 'SENT' ? '⏳ EN ATTENTE' : order.status === 'PREPARING' ? '🔪 EN PRÉP' : '✅ PRÊTE'}
                    </span>
                  </div>

                  <div className="space-y-2">
                    {order.restaurant_order_items.map((item: any) => (
                      <div key={item.id} className={`p-2 rounded border ${item.status === 'PENDING' ? 'bg-white border-slate-200' : item.status === 'PREPARING' ? 'bg-blue-100 border-blue-300' : item.status === 'READY' ? 'bg-emerald-100 border-emerald-300' : 'bg-slate-100 border-slate-300'}`}>
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="font-semibold text-sm">{item.quantity}× {item.item_name}</div>
                            {item.notes && <div className="text-xs text-slate-600 mt-1">📝 {item.notes}</div>}
                            <div className="text-[10px] text-slate-500 mt-1">{item.destination === 'KITCHEN' ? '👨‍🍳' : item.destination === 'BAR' ? '🍹' : '🍹👨‍🍳'}</div>
                          </div>
                          <div className="flex flex-col gap-1">
                            {item.status === 'PENDING' && (<button onClick={() => handleItemStatusChange(item.id, 'PREPARING', order.id)} className="bg-blue-600 text-white text-xs px-2 py-1 rounded">▶️ Démarrer</button>)}
                            {item.status === 'PREPARING' && (<button onClick={() => handleItemStatusChange(item.id, 'READY', order.id)} className="bg-emerald-600 text-white text-xs px-2 py-1 rounded">✅ Prêt</button>)}
                            {item.status === 'READY' && (<span className="text-xs text-emerald-700 font-medium flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Prêt</span>)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {order.status === 'READY' && (
                    <button onClick={() => handleMarkServed(order.id)} className="w-full mt-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2 rounded-lg flex items-center justify-center gap-2">
                      <CheckCircle className="w-4 h-4" /> Marquer comme servie
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
