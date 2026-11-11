'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { X, Plus, Minus, ShoppingCart, Send, Hotel, Search, CheckCircle } from 'lucide-react';

interface Props {
  siteId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function RoomServiceModal({ siteId, isOpen, onClose, onSuccess }: Props) {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [menuItems, setMenuItems] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [cart, setCart] = useState<any[]>([]);
  const [selectedStay, setSelectedStay] = useState<any>(null);
  const [occupiedRooms, setOccupiedRooms] = useState<any[]>([]);
  const [searchRoom, setSearchRoom] = useState('');
  const [menuSearchTerm, setMenuSearchTerm] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedServer, setSelectedServer] = useState<string>('');
  const [servers, setServers] = useState<any[]>([]);

  useEffect(() => {
    if (isOpen) {
      loadData();
      loadOccupiedRooms();
      setCart([]);
      setSelectedStay(null);
      setSearchRoom('');
      setMenuSearchTerm('');
      setNotes('');
      setSelectedServer('');
    }
  }, [isOpen]);

  const loadData = async () => {
    try {
      // ✅ ÉTAPE 1 : Charger les catégories
      const { data: cat, error: catError } = await supabase
        .from('restaurant_categories')
        .select('id, name, display_order')
        .eq('site_id', siteId)
        .eq('is_active', true)
        .order('display_order');
      
      if (catError) throw catError;
      
      if (cat && cat.length > 0) {
        setCategories(cat);
        if (!activeCategory) setActiveCategory(cat[0].id);
      } else {
        setCategories([]);
      }

      // ✅ ÉTAPE 2 : Charger TOUS les articles disponibles
      const { data: menuData, error: menuError } = await supabase
        .from('restaurant_items')
        .select(`id, name, category_id, price, destination, is_available, stock, stock_quantity`)
        .eq('site_id', siteId)
        .eq('is_available', true)
        .order('name');

      if (menuError) throw menuError;
      if (!menuData || menuData.length === 0) {
        setMenuItems([]);
        return;
      }

      // ✅ ÉTAPE 3 : Charger les fiches techniques
      const { data: allRecipes } = await supabase
        .from('item_recipes')
        .select('menu_item_id, stock_item_id, quantity')
        .eq('site_id', siteId);

      // ✅ ÉTAPE 4 : Charger les stocks de matières premières
      const { data: allStockItems } = await supabase
        .from('stock_items')
        .select('id, name, current_stock, unit')
        .eq('site_id', siteId);

      const stockMap = new Map();
      allStockItems?.forEach(stock => {
        stockMap.set(stock.id, {
          current_stock: stock.current_stock || 0,
          unit: stock.unit
        });
      });

      // ✅ ÉTAPE 5 : Calculer le stock et mapper les catégories
      const menuItemsWithStock = menuData.map(menuItem => {
        const itemRecipes = allRecipes?.filter(r => r.menu_item_id === menuItem.id) || [];
        let stock = 0;

        if (itemRecipes.length > 0) {
          let maxPossibleStock = Infinity;
          let hasValidStock = true;

          for (const recipe of itemRecipes) {
            const stockInfo = stockMap.get(recipe.stock_item_id);
            if (!stockInfo) {
              hasValidStock = false;
              break;
            }
            const currentStock = stockInfo.current_stock;
            const requiredQty = recipe.quantity || 1;
            const possibleWithThisIngredient = Math.floor(currentStock / requiredQty);
            if (possibleWithThisIngredient < maxPossibleStock) {
              maxPossibleStock = possibleWithThisIngredient;
            }
          }

          if (!hasValidStock || maxPossibleStock === Infinity) {
            stock = 0;
          } else {
            stock = maxPossibleStock;
          }
        } else {
          // Si pas de fiche technique, utiliser le stock direct
          stock = menuItem.stock ?? menuItem.stock_quantity ?? 0;
        }

        return {
          id: menuItem.id,
          name: menuItem.name,
          category_id: menuItem.category_id, // ✅ Garder l'ID pour le filtrage
          price: menuItem.price,
          destination: menuItem.destination || undefined,
          stock: stock
        };
      });

      console.log(`✅ ${menuItemsWithStock.length} articles chargés`);
      setMenuItems(menuItemsWithStock);

      // ✅ ÉTAPE 6 : Charger les serveurs
      const { data: emp, error: empError } = await supabase
        .from('restaurant_employees')
        .select('id, first_name, last_name, role')
        .eq('site_id', siteId)
        .eq('is_active', true)
        .in('role', ['SERVER', 'CASHIER', 'MANAGER', 'CHEF', 'BARTENDER']);
      
      if (empError) {
        console.error('❌ Erreur employés:', empError);
      } else {
        setServers(emp || []);
      }
    } catch (err: any) {
      console.error('❌ Erreur loadData:', err.message || err);
    }
  };

  // ✅ NOUVELLE APPROCHE : Charger depuis les réservations CHECKED_IN
    const loadOccupiedRooms = async () => {
    try {
      // 1. Charger les réservations CHECKED_IN
      const { data: reservations, error } = await supabase
        .from('reservations')
        .select(`
          id, 
          check_in_date, 
          check_out_date,
          room_id,
          customer_id,
          rooms(id, number)
        `)
        .eq('site_id', siteId)
        .eq('status', 'CHECKED_IN')
        .order('check_in_date', { ascending: false });

      if (error) throw error;

      // 2. Pour chaque réservation, récupérer le client séparément
      const formatted = [];
      for (const res of (reservations || [])) {
        // Récupérer les infos du client
        let customerInfo = { first_name: 'Client', last_name: 'Inconnu', phone: '' };
        
        if (res.customer_id) {
          const { data: customer } = await supabase
            .from('customers')
            .select('first_name, last_name, phone')
            .eq('id', res.customer_id)
            .single();
          
          if (customer) {
            customerInfo = customer;
          }
        }

        // Chercher un stay existant
        const { data: stays } = await supabase
          .from('stays')
          .select('id, folio_balance')
          .eq('reservation_id', res.id)
          .eq('status', 'IN_HOUSE')
          .limit(1);

        const stay = stays?.[0] || null;

        formatted.push({
          id: stay?.id || res.id,
          reservation_id: res.id,
          room_id: res.room_id,
          customer_id: res.customer_id,
          folio_balance: stay?.folio_balance || 0,
          has_stay: !!stay,
          rooms: res.rooms,
          customers: customerInfo
        });
      }

      console.log(`✅ ${formatted.length} chambre(s) occupée(s) chargée(s)`);
      setOccupiedRooms(formatted);
    } catch (error: any) {
      console.error('❌ Erreur chargement chambres:', error?.message || error);
      setOccupiedRooms([]);
    }
  };

  const addToCart = (item: any) => {
    const currentInCart = cart.find(c => c.id === item.id);
    const currentQty = currentInCart?.quantity || 0;
    const availableStock = item.stock || 0;

    if (currentQty >= availableStock) {
      alert(`⚠️ Stock insuffisant pour "${item.name}"\nStock disponible: ${availableStock}`);
      return;
    }

    setCart(prevCart => {
      const existing = prevCart.find(c => c.id === item.id);
      if (existing) {
        return prevCart.map(c =>
          c.id === item.id
            ? { ...c, quantity: c.quantity + 1, total_price: (c.quantity + 1) * c.price }
            : c
        );
      }
      return [...prevCart, {
        id: item.id,
        item_name: item.name,
        quantity: 1,
        unit_price: item.price,
        total_price: item.price,
        destination: item.destination,
        stock: availableStock,
      }];
    });
  };

      const updateQuantity = (itemId: string, delta: number) => {
    setCart(prevCart => prevCart.map(c => {
      if (c.id === itemId) {
        const newQty = Math.max(0, c.quantity + delta);
        const availableStock = c.stock ?? 999;
        
        if (newQty > availableStock) {
          alert(`⚠️ Stock maximum atteint: ${availableStock}`);
          return c;
        }
        
        return { ...c, quantity: newQty, total_price: newQty * c.unit_price };
      }
      return c;
    }).filter(c => c.quantity > 0));
  };

  const removeFromCart = (itemId: string) => {
    setCart(prevCart => prevCart.filter(c => c.id !== itemId));
  };

  const cartTotal = cart.reduce((sum, item) => sum + item.total_price, 0);

  const handleSendOrder = async () => {
    if (!selectedStay) {
      alert('Veuillez sélectionner une chambre.');
      return;
    }
    if (cart.length === 0) {
      alert('Le panier est vide.');
      return;
    }
    if (!selectedServer) {
      alert('Veuillez sélectionner un serveur.');
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const orderNumber = `CMD-${Date.now().toString().slice(-6)}`;

      // ✅ Créer un stay si il n'existe pas
      let stayId = selectedStay.id;
      if (!selectedStay.has_stay) {
        const { data: newStay, error: stayError } = await supabase
          .from('stays')
          .insert({
            reservation_id: selectedStay.reservation_id,
            room_id: selectedStay.room_id,
            customer_id: selectedStay.customers?.id, // Si disponible
            nightly_rate: 0, // Sera mis à jour si besoin
            status: 'IN_HOUSE',
            folio_balance: 0
          })
          .select('id')
          .single();

        if (stayError) throw stayError;
        stayId = newStay.id;
        console.log('✅ Stay créé automatiquement:', stayId);
      }

      // 1. Créer la commande Room Service
      const { data: newOrder, error: orderError } = await supabase
        .from('restaurant_orders')
        .insert({
          site_id: siteId,
          order_number: orderNumber,
          table_id: null,
          room_id: selectedStay.room_id,
          stay_id: stayId,
          server_id: selectedServer,
          order_type: 'ROOM_SERVICE',
          status: 'ROOM_CHARGE',
          total_amount: cartTotal,
          notes: notes || `Room Service - Chambre ${selectedStay.rooms?.number}`,
          created_by: user?.id,
          sent_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (orderError) throw orderError;

      // 2. Insérer les articles
      const orderItems = cart.map(item => ({
        order_id: newOrder.id,
        menu_item_id: item.id,
        item_name: item.item_name,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_price: item.total_price,
        destination: item.destination,
        status: 'PENDING',
      }));

      const { error: itemsError } = await supabase.from('restaurant_order_items').insert(orderItems);
      if (itemsError) throw itemsError;

      // 3. Mettre à jour le folio du stay
      const newFolioBalance = (selectedStay.folio_balance || 0) + cartTotal;
      await supabase.from('stays').update({ folio_balance: newFolioBalance }).eq('id', stayId);

      // 4. Enregistrer dans room_charges
      await supabase.from('room_charges').insert({
        site_id: siteId,
        stay_id: stayId,
        room_id: selectedStay.room_id,
        order_id: newOrder.id,
        charge_type: 'RESTAURANT',
        description: `Restaurant - Commande ${orderNumber}`,
        amount: cartTotal,
        charge_date: new Date().toISOString().split('T')[0],
        charged_by: user?.id
      });

      alert(`✅ Commande envoyée en cuisine et imputée à la chambre ${selectedStay.rooms?.number} !\n\nN° ${orderNumber}\nMontant : ${Number(cartTotal).toLocaleString('fr-FR')} F`);
      
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('❌ Erreur commande room service:', err);
      alert(`Erreur: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

    const currentCategoryItems = menuItems.filter(i => 
    i.category_id === activeCategory &&
    (!menuSearchTerm || i.name.toLowerCase().includes(menuSearchTerm.toLowerCase()))
  );

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[95vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-700 text-white px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <Hotel className="w-6 h-6" />
            <div>
              <h2 className="text-xl font-bold">Room Service</h2>
              <p className="text-xs text-indigo-100">Commande directe en chambre</p>
            </div>
          </div>
          <button onClick={onClose} className="hover:bg-white/20 p-2 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Colonne Gauche : Menu */}
          <div className="w-2/3 border-r border-slate-200 overflow-y-auto p-6 space-y-4">
            {/* Sélection de la chambre */}
            <div className="bg-indigo-50 border-2 border-indigo-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <Hotel className="w-5 h-5 text-indigo-700" />
                <h3 className="font-semibold text-indigo-900">Sélectionner la chambre du client *</h3>
              </div>

              <input
                type="text"
                value={searchRoom}
                onChange={(e) => setSearchRoom(e.target.value)}
                placeholder="🔍 Rechercher par numéro de chambre..."
                className="w-full border border-indigo-300 rounded px-3 py-2 text-sm mb-3 bg-white"
              />

              {selectedStay ? (
                <div className="bg-white border-2 border-indigo-400 rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-bold text-indigo-900">🛏️ Chambre {selectedStay.rooms?.number}</div>
                      <div className="text-sm text-slate-700 mt-1">
                        👤 {selectedStay.customers?.first_name} {selectedStay.customers?.last_name}
                      </div>
                      <div className="text-xs text-indigo-600 mt-1 font-semibold">
                        Solde actuel: {Number(selectedStay.folio_balance || 0).toLocaleString('fr-FR')} F
                      </div>
                    </div>
                    <button
                      onClick={() => setSelectedStay(null)}
                      className="text-xs text-red-600 hover:text-red-800 font-medium"
                    >
                      ✕ Changer
                    </button>
                  </div>
                </div>
              ) : (
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {occupiedRooms.filter((r: any) => r.rooms?.number?.toLowerCase().includes(searchRoom.toLowerCase())).map((stay: any) => (
                    <button
                      key={stay.id}
                      onClick={() => setSelectedStay(stay)}
                      className="w-full text-left p-2 bg-white hover:bg-indigo-100 rounded border border-slate-200 hover:border-indigo-400 transition"
                    >
                      <div className="font-semibold text-sm text-slate-900">🛏️ Chambre {stay.rooms?.number}</div>
                      <div className="text-xs text-slate-600">👤 {stay.customers?.first_name} {stay.customers?.last_name}</div>
                    </button>
                  ))}
                  {occupiedRooms.filter((r: any) => r.rooms?.number?.toLowerCase().includes(searchRoom.toLowerCase())).length === 0 && (
                    <div className="text-center py-4 text-sm text-slate-500">Aucune chambre occupée trouvée</div>
                  )}
                </div>
              )}
            </div>

            {/* Menu */}
            <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
              <div className="bg-slate-100 px-4 py-3 border-b border-slate-200">
  <h3 className="font-semibold text-slate-900 text-sm mb-2">
    📋 Menu ({menuItems.length} articles)
  </h3>
  <div className="relative mb-2">
    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
    <input
      type="text"
      placeholder="Rechercher un article..."
      value={menuSearchTerm}
      onChange={(e) => setMenuSearchTerm(e.target.value)}
      className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
    />
  </div>
  
  <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
  <button 
    key="ALL" 
    onClick={() => setActiveCategory('ALL')} 
    className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
      activeCategory === 'ALL' 
        ? 'bg-indigo-600 text-white' 
        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
    }`}
  >
    Tout ({menuItems.length})
  </button>
  {categories.map(cat => {
    const count = menuItems.filter(item => item.category_id === cat.id).length;
    return (
      <button 
        key={cat.id} 
        onClick={() => setActiveCategory(cat.id)} 
        className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
          activeCategory === cat.id 
            ? 'bg-indigo-600 text-white' 
            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
        }`}
      >
        {cat.name} ({count})
      </button>
    );
  })}
</div>
</div>
              
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3 max-h-96 overflow-y-auto">
  {currentCategoryItems.map((item: any) => {
    const stock = item.stock ?? item.stock_quantity ?? 0;
    const isLowStock = stock <= (item.min_stock || 5);

    return (
      <button
        key={item.id}
        onClick={() => addToCart(item)}
        className="w-full bg-white border-2 border-slate-200 hover:border-indigo-400 rounded-lg p-3 text-left transition-colors hover:shadow-sm"
      >
        <div className="font-semibold text-sm text-slate-900">{item.name}</div>
        <div className="text-indigo-700 font-bold text-sm mt-2">
          {Number(item.price).toLocaleString('fr-FR')} F
        </div>
        <div className="flex items-center justify-between mt-2">
          <div className="text-[10px] text-slate-400">
            {item.destination === 'KITCHEN' ? '👨‍🍳 Cuisine' : item.destination === 'BAR' ? '🍹 Bar' : '👨‍🍳 Les deux'}
          </div>
          <div className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
            isLowStock ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
          }`}>
            📦 {stock} dispo.
          </div>
        </div>
      </button>
    );
  })}
  {currentCategoryItems.length === 0 && (
    <div className="col-span-full text-center py-8 text-slate-500 text-sm">
      Aucun article trouvé
    </div>
  )}
</div>
            </div>
          </div>

          {/* Colonne Droite : Panier */}
          <div className="w-1/3 bg-slate-50 flex flex-col flex-shrink-0">
            <div className="p-4 border-b border-slate-200 bg-white">
              <h4 className="font-bold text-slate-900 flex items-center gap-2">
                <ShoppingCart className="w-5 h-5" />
                Panier ({cart.reduce((sum, i) => sum + i.quantity, 0)} articles)
              </h4>
              {selectedStay && (
                <span className="inline-block mt-2 px-2 py-1 bg-indigo-100 text-indigo-800 text-xs font-bold rounded">
                  Chambre {selectedStay.rooms?.number}
                </span>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {cart.length === 0 ? (
                <p className="text-center text-slate-400 mt-8">Panier vide</p>
              ) : (
                cart.map(item => (
                  <div key={item.id} className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                    <div className="font-medium text-sm text-slate-900">{item.item_name}</div>
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center gap-2">
                        <button onClick={() => updateQuantity(item.id, -1)} className="p-1 bg-slate-100 rounded hover:bg-slate-200">
                          <Minus className="w-4 h-4" />
                        </button>
                        <span className="font-bold w-6 text-center">{item.quantity}</span>
                        <button onClick={() => updateQuantity(item.id, 1)} className="p-1 bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200">
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                      <span className="font-bold text-slate-900">{(item.total_price).toLocaleString('fr-FR')} F</span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="p-4 bg-white border-t border-slate-200 space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">👤 Serveur *</label>
                <select
                  value={selectedServer}
                  onChange={(e) => setSelectedServer(e.target.value)}
                  className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
                >
                  <option value="">-- Sélectionner --</option>
                  {servers.map((s: any) => (
                    <option key={s.id} value={s.id}>
                      {s.first_name} {s.last_name}
                    </option>
                  ))}
                </select>
              </div>

              <textarea
                placeholder="Instructions spéciales (ex: sans oignon, étage 2...)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                rows={2}
              />

              <div className="flex justify-between items-center text-lg font-bold text-slate-900 pt-2 border-t border-slate-200">
                <span>Total</span>
                <span>{cartTotal.toLocaleString('fr-FR')} F</span>
              </div>

              <button
                onClick={handleSendOrder}
                disabled={loading || !selectedStay || cart.length === 0 || !selectedServer}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition-colors"
              >
                {loading ? 'Envoi en cours...' : <><Send className="w-5 h-5" /> Envoyer en Cuisine</>}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
