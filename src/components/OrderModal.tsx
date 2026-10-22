'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { X, Plus, Minus, ShoppingCart, ChefHat, CheckCircle, AlertCircle } from 'lucide-react';

interface MenuItem {
  id: string;
  name: string;
  category: string;
  price: number;
}

interface CartItem extends MenuItem {
  quantity: number;
}

interface Props {
  siteId: string;
  table: { id: string; number: string; status: string } | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function OrderModal({ siteId, table, isOpen, onClose, onSuccess }: Props) {
  const supabase = createClient();
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeCategory, setActiveCategory] = useState('ALL');

  useEffect(() => {
    if (isOpen) {
      loadMenu();
      setCart([]);
    }
  }, [isOpen]);

  const loadMenu = async () => {
    try {
      // Essaye de charger depuis la table menu_items, sinon utilise un fallback
      const { data, error } = await supabase
        .from('menu_items')
        .select('id, name, category, price')
        .eq('is_active', true)
        .order('category', { ascending: true })
        .order('name', { ascending: true });

      if (data && data.length > 0) {
        setMenuItems(data);
      } else {
        // Fallback de démo si la table est vide ou n'existe pas encore
        setMenuItems([
          { id: '1', name: 'Coca-Cola 33cl', category: 'Boissons', price: 1500 },
          { id: '2', name: 'Eau minérale 50cl', category: 'Boissons', price: 1000 },
          { id: '3', name: 'Poulet Braisé', category: 'Plats', price: 5000 },
          { id: '4', name: 'Riz Blanc', category: 'Plats', price: 1500 },
          { id: '5', name: 'Salade Composée', category: 'Entrées', price: 2500 },
        ]);
      }
    } catch (error) {
      console.error('Erreur chargement menu:', error);
    }
  };

  const addToCart = (item: MenuItem) => {
    setCart(prev => {
      const existing = prev.find(i => i.id === item.id);
      if (existing) {
        return prev.map(i => i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { ...item, quantity: 1 }];
    });
  };

  const removeFromCart = (itemId: string) => {
    setCart(prev => {
      const existing = prev.find(i => i.id === itemId);
      if (existing && existing.quantity > 1) {
        return prev.map(i => i.id === itemId ? { ...i, quantity: i.quantity - 1 } : i);
      }
      return prev.filter(i => i.id !== itemId);
    });
  };

  const totalAmount = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const categories = ['ALL', ...Array.from(new Set(menuItems.map(i => i.category)))];
  const filteredItems = activeCategory === 'ALL' ? menuItems : menuItems.filter(i => i.category === activeCategory);

  const handleSendOrder = async () => {
    if (cart.length === 0 || !table) return;
    setIsSubmitting(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // 1. Créer la commande
      const orderNumber = `CMD-${Date.now().toString().slice(-6)}`;
      const { data: order, error: orderError } = await supabase
        .from('restaurant_orders')
        .insert({
          site_id: siteId,
          table_id: table.id,
          order_number: orderNumber,
          status: 'SENT', // Envoyé directement en cuisine
          total_amount: totalAmount,
          created_by: user?.id,
        })
        .select('id')
        .single();

      if (orderError) throw orderError;

      // 2. Insérer les articles de la commande
      const orderItems = cart.map(item => ({
        order_id: order.id,
        menu_item_id: item.id,
        item_name: item.name,
        quantity: item.quantity,
        unit_price: item.price,
        total_price: item.quantity * item.price,
        status: 'PENDING'
      }));

      const { error: itemsError } = await supabase
        .from('restaurant_order_items')
        .insert(orderItems);

      if (itemsError) throw itemsError;

      // 3. Mettre à jour le statut de la table si elle était libre
      if (table.status === 'AVAILABLE' || table.status === 'RESERVED') {
        await supabase.from('restaurant_tables').update({ status: 'OCCUPIED' }).eq('id', table.id);
      }

      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Erreur envoi commande:', error);
      alert('Erreur lors de l\'envoi de la commande : ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || !table) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-indigo-600 text-white px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <ShoppingCart className="w-6 h-6" />
            <div>
              <h3 className="text-xl font-bold">Nouvelle Commande</h3>
              <p className="text-sm text-indigo-200">Table {table.number} • {table.status === 'AVAILABLE' ? 'Libre' : 'Occupée'}</p>
            </div>
          </div>
          <button onClick={onClose} className="hover:bg-indigo-700 p-2 rounded-lg transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* Left: Menu */}
          <div className="flex-1 flex flex-col border-r border-slate-200">
            {/* Categories */}
            <div className="p-4 border-b border-slate-200 flex gap-2 overflow-x-auto">
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                    activeCategory === cat 
                      ? 'bg-indigo-600 text-white' 
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {cat === 'ALL' ? 'Tout' : cat}
                </button>
              ))}
            </div>
            
            {/* Items Grid */}
            <div className="flex-1 overflow-y-auto p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredItems.map(item => (
                  <button
                    key={item.id}
                    onClick={() => addToCart(item)}
                    className="bg-white border border-slate-200 rounded-xl p-4 text-left hover:border-indigo-300 hover:shadow-md transition-all active:scale-95"
                  >
                    <div className="font-semibold text-slate-900 mb-1">{item.name}</div>
                    <div className="text-xs text-slate-500 mb-2">{item.category}</div>
                    <div className="text-lg font-bold text-indigo-600">{Number(item.price).toLocaleString('fr-FR')} F</div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right: Cart */}
          <div className="w-full md:w-96 bg-slate-50 flex flex-col border-l border-slate-200">
            <div className="p-4 border-b border-slate-200 bg-white">
              <h4 className="font-bold text-slate-900 flex items-center gap-2">
                <ChefHat className="w-5 h-5 text-indigo-600" />
                Panier ({cart.reduce((sum, i) => sum + i.quantity, 0)} articles)
              </h4>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {cart.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <ShoppingCart className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Le panier est vide</p>
                  <p className="text-xs">Cliquez sur un article pour l'ajouter</p>
                </div>
              ) : (
                cart.map(item => (
                  <div key={item.id} className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                    <div className="font-medium text-slate-900 text-sm mb-2">{item.name}</div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => removeFromCart(item.id)}
                          className="w-7 h-7 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <span className="font-bold text-slate-900 w-6 text-center">{item.quantity}</span>
                        <button 
                          onClick={() => addToCart(item)}
                          className="w-7 h-7 flex items-center justify-center rounded-full bg-indigo-100 hover:bg-indigo-200 text-indigo-700"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="font-bold text-slate-900">
                        {Number(item.price * item.quantity).toLocaleString('fr-FR')} F
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Footer Cart */}
            <div className="p-4 bg-white border-t border-slate-200 space-y-3">
              <div className="flex items-center justify-between text-lg font-bold text-slate-900">
                <span>Total</span>
                <span className="text-indigo-600">{Number(totalAmount).toLocaleString('fr-FR')} F</span>
              </div>
              
              {cart.length > 0 ? (
                <button
                  onClick={handleSendOrder}
                  disabled={isSubmitting}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors"
                >
                  {isSubmitting ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <ChefHat className="w-5 h-5" />
                      Envoyer en cuisine
                    </>
                  )}
                </button>
              ) : (
                <button disabled className="w-full bg-slate-200 text-slate-400 font-bold py-3 rounded-xl flex items-center justify-center gap-2 cursor-not-allowed">
                  <AlertCircle className="w-5 h-5" />
                  Panier vide
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
