'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useProfile } from '@/hooks/useHotel';
import RoomServiceOrderDetailModal from '@/components/RoomServiceOrderDetailModal';
import {
  Hotel, Plus, Minus, ShoppingCart, Send, Search, CheckCircle,
  Clock, DollarSign, AlertCircle, X, ChefHat, FileText, TrendingUp,
  Bed, User, Loader2, Calendar
} from 'lucide-react';

interface MenuItem {
  id: string;
  name: string;
  category_id: string;
  category?: string;       // ✅ AJOUTÉ
  price: number;
  destination?: string;
  stock?: number;          // ✅ AJOUTÉ
  stockManaged?: boolean;  // ✅ AJOUTÉ
}

interface CartItem extends MenuItem {
  quantity: number;
  total_price: number;
  menuItemId?: string;     // ✅ AJOUTÉ
}

interface RoomServiceOrder {
  id: string;
  order_number: string;
  room_number: string;
  customer_name: string;
  stay_id: string;
  room_id: string;
  total_amount: number;
  status: string;
  created_at: string;
  paid_at?: string;
  items: any[];
  server_name?: string;
  order_type?: string;
}

export default function RoomServicePage() {
  const supabase = createClient();
  const { siteId, loading: profileLoading } = useProfile();
  
  const [loading, setLoading] = useState(false);
  const [hotelInfo, setHotelInfo] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'new' | 'pending' | 'history'>('new');
  
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('ALL');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [occupiedRooms, setOccupiedRooms] = useState<any[]>([]);
  const [selectedStay, setSelectedStay] = useState<any>(null);
  const [searchRoom, setSearchRoom] = useState('');
  const [menuSearchTerm, setMenuSearchTerm] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedServer, setSelectedServer] = useState('');
  const [servers, setServers] = useState<any[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  
  const [pendingOrders, setPendingOrders] = useState<RoomServiceOrder[]>([]);
  const [paidOrders, setPaidOrders] = useState<RoomServiceOrder[]>([]);
  
  const getWeekRange = () => {
    const now = new Date();
    const day = now.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const monday = new Date(now);
    monday.setDate(now.getDate() + diffToMonday);
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    return {
      start: monday.toISOString().split('T')[0],
      end: sunday.toISOString().split('T')[0],
    };
  };

  const weekRange = getWeekRange();
  const [startDate, setStartDate] = useState(weekRange.start);
  const [endDate, setEndDate] = useState(weekRange.end);

  useEffect(() => {
    if (siteId) {
      loadMenuData();
      loadOccupiedRooms();
      loadPendingOrders();
      loadPaidOrders();
      loadHotelInfo();
    }
  }, [siteId, startDate, endDate]);

  const loadMenuData = async () => {
    try {
      const { data: cat } = await supabase
        .from('restaurant_categories')
        .select('id, name, display_order')
        .eq('site_id', siteId)
        .eq('is_active', true)
        .order('display_order');
      if (cat) setCategories(cat);
      if (cat?.length && !activeCategory) setActiveCategory(cat[0].id);

      const { data: menuData, error: menuError } = await supabase
        .from('restaurant_items')
        .select(`id, name, category_id, restaurant_categories(name), price, destination, is_available`)
        .eq('site_id', siteId)
        .eq('is_available', true)
        .order('name');

      if (menuError) throw menuError;
      if (!menuData || menuData.length === 0) {
        setMenuItems([]);
        return;
      }

      // 1. Charger les fiches techniques
      const { data: allRecipes } = await supabase
        .from('item_recipes')
        .select('menu_item_id, stock_item_id, quantity')
        .eq('site_id', siteId);

      // 2. Charger les stocks actuels
      const { data: allStockItems } = await supabase
        .from('stock_items')
        .select('id, name, current_stock, unit')
        .eq('site_id', siteId);

      const stockMap = new Map();
      allStockItems?.forEach(stock => {
        stockMap.set(stock.id, { current_stock: Number(stock.current_stock) || 0, unit: stock.unit });
      });

      // 3. Calculer le stock disponible pour chaque article du menu
      const menuItemsWithStock = menuData.map(menuItem => {
        const itemRecipes = allRecipes?.filter(r => r.menu_item_id === menuItem.id) || [];
        
        // ✅ RÈGLE STRICTE : Pas de fiche technique = Stock à 0 (Indisponible)
        if (itemRecipes.length === 0) {
          return {
            id: menuItem.id,
            name: menuItem.name,
            category_id: menuItem.category_id,
            category: (menuItem as any).restaurant_categories?.name || 'Autres',
            price: menuItem.price,
            destination: menuItem.destination || undefined,
            stock: 0,
            stockManaged: true
          };
        }

        // ✅ CAS 2 : Fiche technique présente → calcul du stock réel (limitant)
        let maxPossibleStock = Infinity;
        let hasValidStock = true;
        for (const recipe of itemRecipes) {
          const stockInfo = stockMap.get(recipe.stock_item_id);
          if (!stockInfo) { hasValidStock = false; break; }
          const requiredQty = Number(recipe.quantity) || 1;
          const possibleWithThisIngredient = Math.floor(Number(stockInfo.current_stock) / requiredQty);
          if (possibleWithThisIngredient < maxPossibleStock) maxPossibleStock = possibleWithThisIngredient;
        }

        return {
          id: menuItem.id,
          name: menuItem.name,
          category_id: menuItem.category_id,
          category: (menuItem as any).restaurant_categories?.name || 'Autres',
          price: menuItem.price,
          destination: menuItem.destination || undefined,
          stock: hasValidStock ? Math.max(0, maxPossibleStock) : 0,
          stockManaged: true
        };
      });

      setMenuItems(menuItemsWithStock);

      const { data: emp } = await supabase
        .from('restaurant_employees')
        .select('id, first_name, last_name, role')
        .eq('site_id', siteId)
        .eq('is_active', true)
        .in('role', ['SERVER', 'CASHIER', 'MANAGER', 'CHEF', 'BARTENDER']);
      if (emp) setServers(emp);
    } catch (err) {
      console.error('Erreur chargement menu:', err);
    }
  };

  const loadOccupiedRooms = async () => {
    try {
      const { data: occupiedRooms, error: roomsError } = await supabase
        .from('rooms')
        .select(`
          id, number, floor, status, category_id,
          room_categories (code, name, base_price)
        `)
        .eq('site_id', siteId)
        .eq('status', 'OCCUPIED')
        .order('number', { ascending: true });

      if (roomsError) throw roomsError;
      if (!occupiedRooms || occupiedRooms.length === 0) {
        setOccupiedRooms([]);
        return;
      }

      const formatted = [];
      for (const room of occupiedRooms) {
        const { data: stays } = await supabase
          .from('stays')
          .select('id, customer_id, folio_balance, reservation_id')
          .eq('room_id', room.id)
          .eq('status', 'IN_HOUSE')
          .limit(1);

        const stay = stays?.[0] || null;

        let customerInfo = { first_name: 'Client', last_name: 'Inconnu', phone: '' };
        if (stay?.customer_id) {
          const { data: customer } = await supabase
            .from('customers')
            .select('first_name, last_name, phone')
            .eq('id', stay.customer_id)
            .maybeSingle();
          if (customer) customerInfo = customer;
        }

        formatted.push({
          id: stay?.id || room.id,
          room_id: room.id,
          room_number: room.number,
          folio_balance: stay?.folio_balance || 0,
          has_stay: !!stay,
          rooms: { id: room.id, number: room.number },
          customers: customerInfo,
        });
      }
      setOccupiedRooms(formatted);
    } catch (error: any) {
      console.error('❌ Erreur chargement chambres:', error?.message || error);
      setOccupiedRooms([]);
    }
  };

  // ✅ CORRECTION : Inclure TOUTES les commandes liées à une chambre
  // (ROOM_SERVICE + TABLE avec stay_id ou room_id)
  const loadPendingOrders = async () => {
    try {
      const { data } = await supabase
        .from('restaurant_orders')
        .select(`
          id, order_number, order_type, stay_id, room_id, total_amount, status, created_at, server_id,
          restaurant_order_items(id, item_name, quantity, unit_price, total_price)
        `)
        .eq('site_id', siteId)
        // ✅ Toutes les commandes en cours, peu importe order_type
        .in('status', ['ROOM_CHARGE', 'SENT', 'READY', 'SERVED'])
        .order('created_at', { ascending: false });

      // Filtrer côté client : ne garder que celles liées à une chambre
      const roomLinked = (data || []).filter(o => o.stay_id || o.room_id);

      const formatted: RoomServiceOrder[] = [];
      for (const order of roomLinked) {
        let roomNumber = '—';
        let customerName = 'Client';
        
        if (order.room_id) {
          const { data: room } = await supabase
            .from('rooms')
            .select('number')
            .eq('id', order.room_id)
            .maybeSingle();
          if (room) roomNumber = room.number;
        }
        
        if (order.stay_id) {
          const { data: stay } = await supabase
            .from('stays')
            .select('customer_id')
            .eq('id', order.stay_id)
            .maybeSingle();
          if (stay?.customer_id) {
            const { data: cust } = await supabase
              .from('customers')
              .select('first_name, last_name')
              .eq('id', stay.customer_id)
              .maybeSingle();
            if (cust) customerName = `${cust.last_name} ${cust.first_name}`;
          }
        }
        
        let serverName = '—';
        if (order.server_id) {
          const { data: srv } = await supabase
            .from('restaurant_employees')
            .select('first_name, last_name')
            .eq('id', order.server_id)
            .maybeSingle();
          if (srv) serverName = `${srv.first_name} ${srv.last_name}`;
        }
        
        formatted.push({
          ...order,
          room_number: roomNumber,
          customer_name: customerName,
          server_name: serverName,
          items: order.restaurant_order_items || []
        });
      }
      setPendingOrders(formatted);
    } catch (err) {
      console.error('Erreur chargement commandes:', err);
    }
  };

  const loadPaidOrders = async () => {
    try {
      const startOfDay = new Date(startDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(endDate);
      endOfDay.setHours(23, 59, 59, 999);

      const { data } = await supabase
        .from('restaurant_orders')
        .select(`
          id, order_number, order_type, stay_id, room_id, total_amount, status, created_at, paid_at, server_id,
          restaurant_order_items(id, item_name, quantity, unit_price, total_price)
        `)
        .eq('site_id', siteId)
        .eq('status', 'PAID')
        .gte('paid_at', startOfDay.toISOString())
        .lte('paid_at', endOfDay.toISOString())
        .order('paid_at', { ascending: false });

      // Filtrer : commandes liées à une chambre
      const roomLinked = (data || []).filter(o => o.stay_id || o.room_id);

      const formatted: RoomServiceOrder[] = [];
      for (const order of roomLinked) {
        let roomNumber = '—';
        let customerName = 'Client';
        
        if (order.room_id) {
          const { data: room } = await supabase
            .from('rooms')
            .select('number')
            .eq('id', order.room_id)
            .maybeSingle();
          if (room) roomNumber = room.number;
        }
        
        if (order.stay_id) {
          const { data: stay } = await supabase
            .from('stays')
            .select('customer_id')
            .eq('id', order.stay_id)
            .maybeSingle();
          if (stay?.customer_id) {
            const { data: cust } = await supabase
              .from('customers')
              .select('first_name, last_name')
              .eq('id', stay.customer_id)
              .maybeSingle();
            if (cust) customerName = `${cust.last_name} ${cust.first_name}`;
          }
        }
        
        formatted.push({
          ...order,
          room_number: roomNumber,
          customer_name: customerName,
          items: order.restaurant_order_items || []
        });
      }
      setPaidOrders(formatted);
    } catch (err) {
      console.error('Erreur chargement historique:', err);
    }
  };
const loadHotelInfo = async () => {
  try {
    const { data } = await supabase
      .from('sites')
      .select('name, phone, email, address')
      .eq('id', siteId)
      .maybeSingle();
    if (data) setHotelInfo(data);
  } catch (err) {
    console.error('Erreur chargement hôtel:', err);
  }
};
const addToCart = (item: MenuItem) => {
  setCart(prev => {
    const existing = prev.find(i => i.id === item.id);
    if (existing) {
      return prev.map(i => i.id === item.id
        ? { ...i, quantity: i.quantity + 1, total_price: (i.quantity + 1) * (i.price || 0) }
        : i);
    }
    return [...prev, { 
      ...item, 
      quantity: 1, 
      total_price: item.price || 0,
      price: item.price || 0 
    }];
  });
};

const updateQuantity = (itemId: string, delta: number) => {
  setCart(prev => prev.map(c => {
    if (c.id === itemId) {
      const newQty = Math.max(0, c.quantity + delta);
      return { 
        ...c, 
        quantity: newQty, 
        total_price: newQty * (c.price || 0) 
      };
    }
    return c;
  }).filter(c => c.quantity > 0));
};

  const cartTotal = cart.reduce((sum, item) => sum + Number(item.total_price ?? item.price * item.quantity ?? 0), 0);

  const handleSendOrder = async () => {
    if (!selectedStay) { alert('Veuillez sélectionner une chambre.'); return; }
    if (cart.length === 0) { alert('Le panier est vide.'); return; }
    if (!selectedServer) { alert('Veuillez sélectionner un serveur.'); return; }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const orderNumber = `CMD-${Date.now().toString().slice(-6)}`;

      let stayId = selectedStay.id;
      if (!selectedStay.has_stay) {
        const { data: newStay, error: stayError } = await supabase
          .from('stays')
          .insert({
            site_id: siteId,
            reservation_id: selectedStay.reservation_id,
            room_id: selectedStay.room_id,
            customer_id: null,
            nightly_rate: 0,
            status: 'IN_HOUSE',
            folio_balance: 0
          })
          .select('id')
          .single();
        if (stayError) throw stayError;
        stayId = newStay.id;
      }

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
          status: 'SENT',
          total_amount: cartTotal,
          notes: notes || `Room Service - Chambre ${selectedStay.rooms?.number}`,
          created_by: user?.id,
          sent_at: new Date().toISOString(),
        })
        .select('id')
        .single();
      if (orderError) throw orderError;

      const orderItems = cart.map(item => ({
        order_id: newOrder.id,
        menu_item_id: item.id,
        item_name: item.name,
        quantity: item.quantity,
        unit_price: item.price,
        total_price: item.total_price,
        destination: item.destination,
        status: 'PENDING',
      }));
      await supabase.from('restaurant_order_items').insert(orderItems);

      alert(`✅ Commande ${orderNumber} envoyée en cuisine !\nChambre ${selectedStay.rooms?.number}\nMontant : ${cartTotal.toLocaleString('fr-FR')} fcfa`);

      setCart([]);
      setSelectedStay(null);
      setNotes('');
      setSelectedServer('');
      setSearchRoom('');
      loadPendingOrders();
      loadOccupiedRooms();
    } catch (err: any) {
      alert(`Erreur: ${err.message}`);
    }
    setLoading(false);
  };

  const handlePayOrder = async (order: RoomServiceOrder) => {
    if (!confirm(`Confirmer le paiement de ${order.total_amount.toLocaleString('fr-FR')} F pour la chambre ${order.room_number} ?\n\nLe montant sera imputé au folio du client.`)) return;
    
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      await supabase.from('restaurant_orders')
        .update({ status: 'PAID', paid_at: new Date().toISOString() })
        .eq('id', order.id);

      if (order.stay_id) {
        await supabase.from('room_charges').insert({
          site_id: siteId,
          stay_id: order.stay_id,
          room_id: order.room_id,
          order_id: order.id,
          charge_type: 'RESTAURANT',
          description: `Commande ${order.order_number}`,
          amount: order.total_amount,
          charge_date: new Date().toISOString().split('T')[0],
          charged_by: user?.id
        });

        const { data: stay } = await supabase
          .from('stays')
          .select('folio_balance')
          .eq('id', order.stay_id)
          .single();
        if (stay) {
          await supabase.from('stays')
            .update({ folio_balance: (stay.folio_balance || 0) + order.total_amount })
            .eq('id', order.stay_id);
        }
      }

      alert(`✅ Paiement enregistré !\nImputé à la chambre ${order.room_number}\nMontant : ${order.total_amount.toLocaleString('fr-FR')} fcfa`);
      
      loadPendingOrders();
      loadPaidOrders();
      loadOccupiedRooms();
    } catch (err: any) {
      alert(`Erreur: ${err.message}`);
    }
    setLoading(false);
  };
const handleSendToCashier = async (order: RoomServiceOrder) => {
  if (!confirm(`Envoyer la commande ${order.order_number} à la caisse du restaurant pour encaissement ?\n\nLe client paiera directement en caisse.`)) return;
  setLoading(true);
  try {
    // ✅ Changement de statut : la commande devient "SERVED" (prête à encaisser)
    const { error } = await supabase
      .from('restaurant_orders')
      .update({ 
        status: 'SERVED',
        order_type: 'ROOM_SERVICE'
      })
      .eq('id', order.id);
    
    if (error) throw error;
    
    alert(`✅ Commande ${order.order_number} envoyée à la caisse du restaurant !\n\nLe client peut maintenant payer directement en caisse.`);
    loadPendingOrders();
  } catch (err: any) {
    alert(`Erreur: ${err.message}`);
  }
  setLoading(false);
};
  const currentCategoryItems = menuItems.filter(i =>
    (activeCategory === 'ALL' || i.category_id === activeCategory) &&
    (!menuSearchTerm || i.name.toLowerCase().includes(menuSearchTerm.toLowerCase()))
  );

  const totalPending = pendingOrders.reduce((sum, o) => sum + o.total_amount, 0);
  const totalPaid = paidOrders.reduce((sum, o) => sum + o.total_amount, 0);

  if (profileLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
      </div>
    );
  }
  if (!siteId) return null;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Hotel className="w-7 h-7 text-indigo-600" />
            Room Service
          </h1>
          <p className="text-sm text-slate-500 mt-1">Commandes en chambre • {pendingOrders.length} en cours</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-amber-50 border-2 border-amber-200 rounded-lg p-4">
          <div className="text-xs font-medium text-amber-700 mb-1 flex items-center gap-1">
            <Clock className="w-4 h-4" /> En cours
          </div>
          <div className="text-2xl font-bold text-amber-900">{pendingOrders.length}</div>
          <div className="text-xs text-amber-700">{Number(totalPending).toLocaleString('fr-FR')} fcfa</div>
        </div>
        <div className="bg-emerald-50 border-2 border-emerald-200 rounded-lg p-4">
          <div className="text-xs font-medium text-emerald-700 mb-1 flex items-center gap-1">
            <TrendingUp className="w-4 h-4" /> Encaissé (période)
          </div>
          <div className="text-2xl font-bold text-emerald-900">{paidOrders.length}</div>
          <div className="text-xs text-emerald-700">{Number(totalPaid).toLocaleString('fr-FR')} fcfa</div>
        </div>
        <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4">
          <div className="text-xs font-medium text-blue-700 mb-1 flex items-center gap-1">
            <Bed className="w-4 h-4" /> Chambres occupées
          </div>
          <div className="text-2xl font-bold text-blue-900">{occupiedRooms.length}</div>
          <div className="text-xs text-blue-700">disponibles pour Room Service</div>
        </div>
      </div>

      <div className="flex gap-2 border-b border-slate-200 flex-wrap">
        <button
          onClick={() => setActiveTab('new')}
          className={`flex items-center gap-2 px-4 py-2 font-medium text-sm transition-colors ${
            activeTab === 'new' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Plus className="w-4 h-4" /> Nouvelle commande
        </button>
        <button
          onClick={() => setActiveTab('pending')}
          className={`flex items-center gap-2 px-4 py-2 font-medium text-sm transition-colors ${
            activeTab === 'pending' ? 'border-b-2 border-amber-600 text-amber-600' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Clock className="w-4 h-4" /> Commandes en cours ({pendingOrders.length})
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`flex items-center gap-2 px-4 py-2 font-medium text-sm transition-colors ${
            activeTab === 'history' ? 'border-b-2 border-emerald-600 text-emerald-600' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <FileText className="w-4 h-4" /> Historique ({paidOrders.length})
        </button>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-1 shadow-sm">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <input
              type="date"
              value={startDate}
              max={endDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="text-xs font-medium text-slate-700 outline-none bg-transparent"
            />
            <span className="text-xs text-slate-400">→</span>
            <input
              type="date"
              value={endDate}
              min={startDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="text-xs font-medium text-slate-700 outline-none bg-transparent"
            />
          </div>
          <button
            onClick={() => {
              const today = new Date().toISOString().split('T')[0];
              setStartDate(today);
              setEndDate(today);
            }}
            className="text-[10px] font-semibold bg-indigo-100 text-indigo-700 px-2 py-1 rounded hover:bg-indigo-200"
          >
            Jour
          </button>
          <button
            onClick={() => {
              const now = new Date();
              setStartDate(new Date(now.getTime() - 7 * 86400000).toISOString().split('T')[0]);
              setEndDate(now.toISOString().split('T')[0]);
            }}
            className="text-[10px] font-semibold bg-amber-100 text-amber-700 px-2 py-1 rounded hover:bg-amber-200"
          >
            7j
          </button>
          <button
            onClick={() => {
              const now = new Date();
              setStartDate(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]);
              setEndDate(now.toISOString().split('T')[0]);
            }}
            className="text-[10px] font-semibold bg-emerald-100 text-emerald-700 px-2 py-1 rounded hover:bg-emerald-200"
          >
            Mois
          </button>
          <button
            onClick={() => {
              const range = getWeekRange();
              setStartDate(range.start);
              setEndDate(range.end);
            }}
            className="text-[10px] font-semibold bg-purple-100 text-purple-700 px-2 py-1 rounded hover:bg-purple-200"
          >
            Semaine
          </button>
        </div>
      </div>

      {activeTab === 'new' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-indigo-50 border-2 border-indigo-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <Hotel className="w-5 h-5 text-indigo-700" />
                <h3 className="font-semibold text-indigo-900">Sélectionner la chambre *</h3>
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
                        Solde folio: {Number(selectedStay.folio_balance || 0).toLocaleString('fr-FR')} fcfa
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
                  {occupiedRooms
                    .filter((r: any) => r.rooms?.number?.toLowerCase().includes(searchRoom.toLowerCase()))
                    .map((stay: any) => (
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

            <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
              <div className="bg-slate-100 px-4 py-3 border-b border-slate-200">
                <h3 className="font-semibold text-slate-900 text-sm mb-2">📋 Menu ({menuItems.length} articles)</h3>
                <div className="relative mb-2">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                  <input
                    type="text"
                    placeholder="Rechercher un article..."
                    value={menuSearchTerm}
                    onChange={(e) => setMenuSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  <button
                    onClick={() => setActiveCategory('ALL')}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap ${
                      activeCategory === 'ALL' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700'
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
                        className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap ${
                          activeCategory === cat.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700'
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
  const isOutOfStock = item.stock !== undefined && item.stock <= 0;
  return (
    <button
      key={item.id}
      onClick={() => !isOutOfStock && addToCart(item)}
      disabled={isOutOfStock}
      className={`w-full bg-white border-2 rounded-lg p-3 text-left transition relative ${
        isOutOfStock 
          ? 'border-red-200 bg-red-50 opacity-70 cursor-not-allowed' 
          : 'border-slate-200 hover:border-indigo-400'
      }`}
    >
      {isOutOfStock && (
        <div className="absolute top-2 right-2 bg-red-600 text-white text-[10px] font-bold px-2 py-1 rounded-full">
          RUPTURE
        </div>
      )}
      <div className="font-semibold text-sm text-slate-900">{item.name}</div>
      <div className="text-indigo-700 font-bold text-sm mt-2">
        {Number(item.price).toLocaleString('fr-FR')} fcfa
      </div>
      <div className="text-[10px] text-slate-400 mt-1">
        {item.destination === 'KITCHEN' ? '👨‍🍳 Cuisine' : item.destination === 'BAR' ? '🍹 Bar' : '👨‍🍳 Les deux'}
      </div>
      <div className={`text-[10px] mt-1 font-medium flex items-center gap-1 ${isOutOfStock ? 'text-red-600' : 'text-emerald-600'}`}>
        {isOutOfStock ? <>❌ Indisponible</> : <>✅ Stock: {item.stock}</>}
      </div>
    </button>
  );
})}
                {currentCategoryItems.length === 0 && (
                  <div className="col-span-full text-center py-8 text-slate-500 text-sm">Aucun article trouvé</div>
                )}
              </div>
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 flex flex-col">
            <h4 className="font-bold text-slate-900 flex items-center gap-2 mb-3">
              <ShoppingCart className="w-5 h-5" />
              Panier ({cart.reduce((sum, i) => sum + i.quantity, 0)} articles)
            </h4>
            {selectedStay && (
              <div className="bg-indigo-100 text-indigo-800 text-xs font-bold rounded px-2 py-1 mb-3">
                🛏️ Chambre {selectedStay.rooms?.number}
              </div>
            )}
            <div className="flex-1 overflow-y-auto space-y-2 max-h-64">
              {cart.length === 0 ? (
                <p className="text-center text-slate-400 mt-8 text-sm">Panier vide</p>
              ) : (
                cart.map(item => (
                  <div key={item.id} className="bg-white p-2 rounded border border-slate-200">
                    <div className="font-medium text-sm text-slate-900">{item.name}</div>
                    <div className="flex items-center justify-between mt-1">
                      <div className="flex items-center gap-1">
                        <button onClick={() => updateQuantity(item.id, -1)} className="p-1 bg-slate-100 rounded hover:bg-slate-200">
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="font-bold w-6 text-center text-sm">{item.quantity}</span>
                        <button onClick={() => updateQuantity(item.id, 1)} className="p-1 bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200">
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                      <span className="font-bold text-sm">{Number(item.total_price ?? item.price * item.quantity ?? 0).toLocaleString('fr-FR')} fcfa</span>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="mt-3 space-y-2 border-t border-slate-200 pt-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">👤 Serveur *</label>
                <select
                  value={selectedServer}
                  onChange={(e) => setSelectedServer(e.target.value)}
                  className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
                >
                  <option value="">-- Sélectionner --</option>
                  {servers.map((s: any) => (
                    <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>
                  ))}
                </select>
              </div>
              <textarea
                placeholder="Instructions spéciales..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
                rows={2}
              />
              <div className="flex justify-between items-center text-lg font-bold pt-2 border-t border-slate-200">
                <span>Total</span>
                <span className="text-indigo-600">{cartTotal.toLocaleString('fr-FR')} fcfa</span>
              </div>
              <button
                onClick={handleSendOrder}
                disabled={loading || !selectedStay || cart.length === 0 || !selectedServer}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-bold py-2 rounded-lg flex items-center justify-center gap-2"
              >
                <Send className="w-4 h-4" />
                {loading ? 'Envoi...' : 'Envoyer au restaurant'}
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'pending' && (
        <div>
          {pendingOrders.length === 0 ? (
            <div className="text-center py-12 bg-slate-50 rounded-lg">
              <CheckCircle className="w-12 h-12 mx-auto mb-2 text-emerald-400" />
              <p className="text-sm text-slate-500">Aucune commande Room Service en cours</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {pendingOrders.map(order => (
                <div
                  key={order.id}
                  onClick={() => setSelectedOrder(order)}
                  className="w-full text-left bg-white border-2 border-amber-200 rounded-lg p-4 hover:shadow-md hover:border-amber-400 transition cursor-pointer"
                > 
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="font-bold text-slate-900 text-lg">🛏️ Chambre {order.room_number}</div>
                      <div className="text-xs text-slate-600">#{order.order_number}</div>
                      <div className="text-xs text-indigo-700 mt-1">👤 {order.customer_name}</div>
                      <div className="text-xs text-slate-500">👷 {order.server_name}</div>
                      {order.order_type && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded mt-1 inline-block ${
                          order.order_type === 'ROOM_SERVICE' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                        }`}>
                          {order.order_type === 'ROOM_SERVICE' ? '🏨 Room Service' : '🍽️ Restaurant'}
                        </span>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-bold text-amber-900">
                        {Number(order.total_amount).toLocaleString('fr-FR')} fcfa
                      </div>
                      <div className="text-xs text-amber-700 bg-amber-200 px-2 py-0.5 rounded inline-block mt-1">
                        {order.status === 'ROOM_CHARGE' ? 'Imputé' : order.status === 'SENT' ? 'Envoyé' : 'Prêt'}
                      </div>
                    </div>
                  </div>
                  <div className="text-xs text-slate-500 mt-2 border-t border-amber-100 pt-2 space-y-1">
                    {order.items.slice(0, 3).map((item: any, idx: number) => (
                      <div key={idx} className="flex justify-between">
                        <span>{item.quantity}x {item.item_name}</span>
                        <span className="font-medium">{Number(item.total_price).toLocaleString('fr-FR')} fcfa</span>
                      </div>
                    ))}
                    {order.items.length > 3 && (
                      <div className="text-[10px] text-slate-400 italic">+ {order.items.length - 3} autre(s) article(s)</div>
                    )}
                  </div>
                  <div className="text-xs text-slate-400 mt-2">
                    🕐 {new Date(order.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                <div className="flex gap-2 mt-3">
  {order.status !== 'ROOM_CHARGE' && order.status !== 'SERVED' && (
    <button
      onClick={(e) => {
        e.stopPropagation();
        handlePayOrder(order);
      }}
      disabled={loading}
      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold py-2 rounded-lg flex items-center justify-center gap-2 disabled:opacity-50"
    >
      <DollarSign className="w-4 h-4" />
      {loading ? 'Traitement...' : 'Imputer au folio'}
    </button>
  )}
  {order.status !== 'ROOM_CHARGE' && order.status !== 'SERVED' && (
    <button
      onClick={(e) => {
        e.stopPropagation();
        handleSendToCashier(order);
      }}
      disabled={loading}
      className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-2 rounded-lg flex items-center justify-center gap-2 disabled:opacity-50"
    >
      <ShoppingCart className="w-4 h-4" />
      Envoyer à la caisse
    </button>
  )}
  {order.status === 'SERVED' && (
    <div className="flex-1 bg-blue-100 border-2 border-blue-300 text-blue-900 text-sm font-semibold py-2 rounded-lg flex items-center justify-center gap-2">
      <ShoppingCart className="w-4 h-4" />
      En attente de paiement en caisse
    </div>
  )}
  {order.status === 'ROOM_CHARGE' && (
    <div className="flex-1 bg-purple-100 border-2 border-purple-300 text-purple-900 text-sm font-semibold py-2 rounded-lg flex items-center justify-center gap-2">
      <DollarSign className="w-4 h-4" />
      Imputé au folio
    </div>
  )}
</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'history' && (
  <div>
    {paidOrders.length === 0 ? (
      <div className="text-center py-12 bg-slate-50 rounded-lg">
        <FileText className="w-12 h-12 mx-auto mb-2 text-slate-300" />
        <p className="text-sm text-slate-500">Aucune commande payée pour cette période</p>
      </div>
    ) : (
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-xs uppercase text-slate-600 font-semibold border-b border-slate-200">
              <tr>
                <th className="px-3 py-3 text-left">N° Commande</th>
                <th className="px-3 py-3 text-left">Chambre / Client</th>
                <th className="px-3 py-3 text-left">Date & Heure</th>
                <th className="px-3 py-3 text-left">Articles</th>
                <th className="px-3 py-3 text-right">Montant</th>
                <th className="px-3 py-3 text-center">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paidOrders.map(order => (
                <tr key={order.id} className="hover:bg-slate-50 transition-colors">
                  {/* Colonne 1 : N° Commande + Type */}
                  <td className="px-3 py-3">
                    <div className="font-mono font-bold text-slate-900 text-xs">#{order.order_number}</div>
                    <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded mt-1 ${
                      order.order_type === 'ROOM_SERVICE' 
                        ? 'bg-purple-100 text-purple-700' 
                        : 'bg-blue-100 text-blue-700'
                    }`}>
                      {order.order_type === 'ROOM_SERVICE' ? '🏨 Room Service' : '🍽️ Restaurant'}
                    </span>
                  </td>

                  {/* Colonne 2 : Chambre + Client */}
                  <td className="px-3 py-3">
                    <div className="font-semibold text-slate-900 text-xs flex items-center gap-1">
                      🛏️ Ch. {order.room_number}
                    </div>
                    <div className="text-xs text-slate-600 mt-0.5">👤 {order.customer_name}</div>
                  </td>

                  {/* Colonne 3 : Date & Heure */}
                  <td className="px-3 py-3">
                    <div className="text-xs text-slate-700 flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-slate-400" />
                      {new Date(order.paid_at || order.created_at).toLocaleDateString('fr-FR')}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5 ml-4">
                      🕐 {new Date(order.paid_at || order.created_at).toLocaleTimeString('fr-FR', { 
                        hour: '2-digit', 
                        minute: '2-digit' 
                      })}
                    </div>
                  </td>

                  {/* Colonne 4 : Articles (liste compacte) */}
                  <td className="px-3 py-3">
                    <div className="text-xs text-slate-700 space-y-0.5">
                      {order.items.slice(0, 3).map((item: any, idx: number) => (
                        <div key={idx} className="flex justify-between gap-2">
                          <span className="truncate">
                            <span className="font-bold text-slate-900">{item.quantity}x</span> {item.item_name}
                          </span>
                          <span className="text-slate-500 whitespace-nowrap">
                            {Number(item.total_price).toLocaleString('fr-FR')} fcfa
                          </span>
                        </div>
                      ))}
                      {order.items.length > 3 && (
                        <div className="text-[10px] text-slate-400 italic">
                          + {order.items.length - 3} autre(s)
                        </div>
                      )}
                    </div>
                  </td>

                  {/* Colonne 5 : Montant */}
                  <td className="px-3 py-3 text-right">
                    <div className="font-bold text-emerald-900 text-sm">
                      {Number(order.total_amount).toLocaleString('fr-FR')} fcfa
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      {order.items.length} article(s)
                    </div>
                  </td>

                  {/* Colonne 6 : Statut */}
                  <td className="px-3 py-3 text-center">
                    <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium bg-emerald-100 text-emerald-800">
                      <CheckCircle className="w-3 h-3" /> Payé
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-emerald-50 border-t-2 border-emerald-200">
              <tr>
                <td colSpan={4} className="px-3 py-3 text-right font-bold text-slate-700">
                  TOTAL ({paidOrders.length} commande(s))
                </td>
                <td className="px-3 py-3 text-right font-bold text-emerald-900 text-base">
                  {Number(totalPaid).toLocaleString('fr-FR')} fcfa
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    )}
  </div>
)}

      <RoomServiceOrderDetailModal
        siteId={siteId}
        order={selectedOrder}
        isOpen={!!selectedOrder}
        onClose={() => setSelectedOrder(null)}
        onSuccess={() => {
          loadPendingOrders();
          loadPaidOrders();
          loadOccupiedRooms();
        }}
      />
    </div>
  );
}
