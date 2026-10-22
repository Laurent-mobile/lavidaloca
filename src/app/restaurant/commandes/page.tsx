'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { 
  ClipboardList, Search, Eye, X, Clock, ChefHat, 
  CheckCircle, Truck, DollarSign, Users, AlertCircle,
  TrendingUp, Calendar, Printer, FileDown, Ban, Plus, Minus, 
  ShoppingCart, Wine, LayoutGrid, List, Bed, Edit, Send, CreditCard
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface MenuItem {
  id: string;
  name: string;
  category: string;
  price: number;
  destination?: string;
}

interface CartItem extends MenuItem {
  quantity: number;
  orderItemId?: string;   // ✅ Ajouté pour le suivi en mode édition
  menuItemId?: string;    // ✅ Ajouté pour le lien avec le menu
}

interface OrderItem {
  id: string;
  item_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  status: string;
  destination?: string;
}

interface RestaurantOrder {
  id: string;
  order_number: string;
  table_id: string | null;
  room_id: string | null;
  room_number?: string;
  order_type?: string;
  status: string;
  total_amount: number;
  created_at: string;
  paid_at?: string;
  cancellation_reason?: string;
  cancelled_at?: string;
  server_id?: string;
  restaurant_tables?: { number: string } | null;
  rooms?: { number: string } | null; 
  restaurant_employees?: { first_name: string; last_name: string } | null;
  restaurant_order_items?: OrderItem[];
}

interface RestaurantTable {
  id: string;
  number: string;
  capacity: number;
  status: string;
}

interface Room {
  id: string;
  number: string;
  floor?: number;
  status: string;
}

interface Employee {
  id: string;
  first_name: string;
  last_name: string;
  role: string;
}

// ✅ FONCTION ROBUSTE pour déterminer la destination
const getDestination = (item: { name?: string; category?: string; destination?: string }): string => {
  // 1. Si la destination est déjà définie, on l'utilise
  if (item.destination) return item.destination;
  
  // 2. Sinon, on déduit basé sur la catégorie et le nom
  const barCategories = ['Boissons', 'Cocktails', 'Vins', 'Bières', 'Softs', 'Cafés', 'Jus'];
  const name = (item.name || '').toLowerCase();
  const category = (item.category || '').toLowerCase();
  
  if (barCategories.some(cat => category.includes(cat.toLowerCase())) ||
      name.includes('jus') ||
      name.includes('eau') ||
      name.includes('coca') ||
      name.includes('mojito') ||
      name.includes('bière') ||
      name.includes('vin') ||
      name.includes('sobra') ||
      name.includes('bissap')) {
    return 'BAR';
  }
  
  // 3. Par défaut, c'est de la cuisine
  return 'KITCHEN';
};

export default function CommandesPage() {
  const supabase = createClient();
  const [siteId, setSiteId] = useState<string>('');
  const [orders, setOrders] = useState<RestaurantOrder[]>([]);
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<RestaurantOrder | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);

  const [activeTab, setActiveTab] = useState<'new' | 'list'>('list');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [orderType, setOrderType] = useState<'DINE_IN' | 'TAKEAWAY' | 'DELIVERY' | 'ROOM_SERVICE'>('DINE_IN');
  const [selectedTableId, setSelectedTableId] = useState('');
  const [selectedRoomId, setSelectedRoomId] = useState('');
  const [selectedServerId, setSelectedServerId] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [activeCategory, setActiveCategory] = useState('ALL');
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [originalItems, setOriginalItems] = useState<OrderItem[]>([]);

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
      loadOrders();
      loadTables(); 
      loadRooms();
      loadMenu();
      loadEmployees();
    }
  }, [siteId, editingOrderId]); // ✅ Ajouter editingOrderId comme dépendance

  const loadEmployees = async () => {
    try {
      const { data } = await supabase
        .from('restaurant_employees')
        .select('id, first_name, last_name, role')
        .eq('site_id', siteId)
        .eq('is_active', true)
        .order('first_name', { ascending: true });
      setEmployees(data || []);
    } catch (error) {
      console.error('Erreur chargement employés:', error);
      setEmployees([]);
    }
  };

  const loadOrders = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('restaurant_orders')
        .select(`
          *,
          restaurant_tables(number),
          rooms(number),
          restaurant_employees!restaurant_orders_server_id_fkey(first_name, last_name),
          restaurant_order_items(id, item_name, quantity, unit_price, total_price, status, destination)
        `)
        .eq('site_id', siteId)
        .order('created_at', { ascending: false });
      
      if (error) {
        console.warn('⚠️ Erreur chargement commandes:', error.message);
        const { data: fallbackData } = await supabase
          .from('restaurant_orders')
          .select(`
            *,
            restaurant_tables(number),
            restaurant_employees!restaurant_orders_server_id_fkey(first_name, last_name),
            restaurant_order_items(id, item_name, quantity, unit_price, total_price, status, destination)
          `)
          .eq('site_id', siteId)
          .order('created_at', { ascending: false });
        setOrders(fallbackData || []);
        return;
      }
      setOrders(data || []);
    } catch (error: any) {
      console.error('❌ Erreur chargement commandes:', error.message);
    } finally {
      setLoading(false);
    }
  };

  const loadTables = async () => {
    try {
      let query = supabase
        .from('restaurant_tables')
        .select('id, number, capacity, status')
        .eq('site_id', siteId)
        .order('number', { ascending: true });
      
      // Si on n'est PAS en train de modifier, on ne montre que les tables libres
      if (!editingOrderId) {
        query = query.eq('status', 'AVAILABLE');
      }
      
      const { data } = await query;
      setTables(data || []);
    } catch (error) {
      console.error('Erreur tables:', error);
    }
  };

  const loadRooms = async () => {
    try {
      const { data } = await supabase
        .from('rooms')
        .select('id, number, floor, status')
        .eq('site_id', siteId)
        .order('number', { ascending: true });
      setRooms(data || []);
    } catch (error) {
      setRooms([]);
    }
  };

  const loadMenu = async () => {
    try {
      const { data } = await supabase
        .from('restaurant_items')
        .select(`
          id, 
          name, 
          restaurant_categories(name),
          price, 
          destination, 
          is_available
        `)
        .eq('site_id', siteId)
        .eq('is_available', true)
        .order('name');
      
      if (data && data.length > 0) {
        const formatted = data.map(item => ({
          id: item.id,
          name: item.name,
          category: (item as any).restaurant_categories?.name || 'Autres',
          price: item.price,
          destination: item.destination || undefined
        }));
        setMenuItems(formatted);
      } else {
        setMenuItems([
          { id: '1', name: 'Coca-Cola 33cl', category: 'Boissons', price: 1500, destination: 'BAR' },
          { id: '2', name: 'Jus de bissap', category: 'Boissons', price: 1000, destination: 'BAR' },
          { id: '3', name: 'SOBBRA', category: 'Boissons', price: 1000, destination: 'BAR' },
          { id: '4', name: 'Poulet Braisé', category: 'Plats principaux', price: 5000, destination: 'KITCHEN' },
          { id: '5', name: 'RIZ', category: 'Plats principaux', price: 1500, destination: 'KITCHEN' },
          { id: '6', name: 'SALADE', category: 'Entrées', price: 2500, destination: 'KITCHEN' },
        ]);
      }
    } catch (error) {
      console.error('Erreur menu:', error);
    }
  };

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'DRAFT': return { label: 'Brouillon', badgeColor: 'bg-slate-100 text-slate-800 border-slate-200', cardBg: 'bg-slate-50', cardBorder: 'border-slate-300', icon: ClipboardList, nextStatus: 'SENT' };
      case 'SENT': return { label: 'Envoyée', badgeColor: 'bg-blue-100 text-blue-800 border-blue-200', cardBg: 'bg-blue-50', cardBorder: 'border-blue-300', icon: Truck, nextStatus: 'PREPARING' };
      case 'PREPARING': return { label: 'En prép.', badgeColor: 'bg-amber-100 text-amber-800 border-amber-200', cardBg: 'bg-amber-50', cardBorder: 'border-amber-300', icon: ChefHat, nextStatus: 'READY' };
      case 'READY': return { label: 'Prête', badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-200', cardBg: 'bg-emerald-50', cardBorder: 'border-emerald-300', icon: CheckCircle, nextStatus: 'SERVED' };
      case 'SERVED': return { label: 'Servie', badgeColor: 'bg-purple-100 text-purple-800 border-purple-200', cardBg: 'bg-purple-50', cardBorder: 'border-purple-300', icon: Users, nextStatus: 'PAID' };
      case 'PAID': return { label: 'Payée', badgeColor: 'bg-green-100 text-green-800 border-green-200', cardBg: 'bg-green-50', cardBorder: 'border-green-300', icon: DollarSign, nextStatus: null };
      case 'CANCELLED': return { label: 'Annulée', badgeColor: 'bg-red-100 text-red-800 border-red-200', cardBg: 'bg-red-50', cardBorder: 'border-red-300', icon: Ban, nextStatus: null };
      default: return { label: status, badgeColor: 'bg-slate-100 text-slate-800 border-slate-200', cardBg: 'bg-slate-50', cardBorder: 'border-slate-300', icon: ClipboardList, nextStatus: null };
    }
  };

      const getOrderTypeLabel = (type: string | undefined) => {
    const t = type || 'DINE_IN';
    switch (t) {
      case 'DINE_IN': return 'Sur place';
      case 'TAKEAWAY': return 'À emporter';
      case 'DELIVERY': return 'Livraison';
      case 'ROOM_SERVICE': return 'Chambre';
      default: return 'Sur place';
    }
  };

  const getOrderTypeIcon = (type: string | undefined) => {
    const t = type || 'DINE_IN';
    switch (t) {
      case 'DINE_IN': return '🍽️';
      case 'TAKEAWAY': return '🥡';
      case 'DELIVERY': return '🚚';
      case 'ROOM_SERVICE': return '🛎️';
      default: return '🍽️';
    }
  };

  const handleStatusChange = async (orderId: string, newStatus: string) => {
    if (!confirm(`Changer le statut vers "${getStatusConfig(newStatus).label}" ?`)) return;
    setIsUpdating(true);
    try {
      const updateData: any = { status: newStatus };
      if (newStatus === 'PAID') updateData.paid_at = new Date().toISOString();
      if (newStatus === 'SENT') updateData.sent_at = new Date().toISOString();
      if (['PAID', 'CANCELLED'].includes(newStatus)) updateData.completed_at = new Date().toISOString();
      
      await supabase.from('restaurant_orders').update(updateData).eq('id', orderId);
      loadOrders();
      if (selectedOrder?.id === orderId) setSelectedOrder({ ...selectedOrder, status: newStatus });
    } catch (error) {
      alert('Erreur lors du changement de statut.');
    } finally {
      setIsUpdating(false);
    }
  };

  const openCancelModal = (order: RestaurantOrder) => {
    setSelectedOrder(order);
    setCancelReason('');
    setIsCancelModalOpen(true);
  };

  const handleCancelOrder = async () => {
    if (!selectedOrder || !cancelReason.trim()) {
      alert('Veuillez saisir un motif d\'annulation.');
      return;
    }
    setIsCancelling(true);
    try {
      const updateData: any = { 
        status: 'CANCELLED',
        cancellation_reason: cancelReason,
        cancelled_at: new Date().toISOString(),
        completed_at: new Date().toISOString()
      };
      if (selectedOrder.table_id) {
        await supabase.from('restaurant_tables').update({ status: 'AVAILABLE' }).eq('id', selectedOrder.table_id);
      }
      await supabase.from('restaurant_orders').update(updateData).eq('id', selectedOrder.id);
      setIsCancelModalOpen(false);
      setCancelReason('');
      setSelectedOrder(null);
      loadOrders();
      loadTables();
      alert('✅ Commande annulée.');
    } catch (error) {
      alert('Erreur lors de l\'annulation.');
    } finally {
      setIsCancelling(false);
    }
  };

    const addToCart = (item: MenuItem) => {
    setCart(prev => {
      // Chercher si l'article existe déjà dans le panier
      const existingIndex = prev.findIndex(i => {
        // 1. Correspondance par ID du menu (le plus fiable)
        if (item.id && i.menuItemId && i.menuItemId === item.id) return true;
        // 2. Correspondance par ID direct (fallback)
        if (item.id && i.id === item.id) return true;
        // 3. Correspondance par nom (si les IDs sont manquants)
        return i.name.toLowerCase() === item.name.toLowerCase();
      });
      
      if (existingIndex >= 0) {
        // ✅ Augmenter la quantité au lieu de créer un doublon
        const newCart = [...prev];
        newCart[existingIndex] = {
          ...newCart[existingIndex],
          quantity: newCart[existingIndex].quantity + 1
        };
        return newCart;
      }
      
      // Nouvel article : on ajoute menuItemId pour le suivi futur
      return [...prev, { ...item, quantity: 1, menuItemId: item.id }];
    });
  };

  const removeFromCart = (itemId: string) => {
    setCart(prev => {
      const existing = prev.find(i => i.id === itemId);
      if (existing && existing.quantity > 1) return prev.map(i => i.id === itemId ? { ...i, quantity: i.quantity - 1 } : i);
      return prev.filter(i => i.id !== itemId);
    });
  };

  const totalAmount = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const categories = ['ALL', ...Array.from(new Set(menuItems.map(i => i.category)))];
  const filteredItems = activeCategory === 'ALL' ? menuItems : menuItems.filter(i => i.category === activeCategory);

  const openEditOrder = (order: RestaurantOrder) => {
  if (['PAID', 'CANCELLED'].includes(order.status)) {
    alert('Impossible de modifier une commande payée ou annulée.');
    return;
  }
  
  console.log('📋 Ouverture édition commande:', order.order_number);
  console.log('🪑 Table ID:', order.table_id);
  
  setEditingOrderId(order.id);
  setOrderType(order.order_type as any);
  setSelectedTableId(order.table_id || '');
  setSelectedRoomId(order.room_id || '');
  setSelectedServerId(order.server_id || '');
  
  // ✅ CORRECTION : Mapper correctement les IDs pour éviter les doublons
  const cartItems = order.restaurant_order_items?.map(item => ({
    orderItemId: item.id,             // ID de la ligne dans la commande
    menuItemId: (item as any).menu_item_id || '', // ID de l'article dans le menu
    id: item.id,                      // Pour la compatibilité avec removeFromCart
    name: item.item_name,
    category: '', 
    price: item.unit_price,
    quantity: item.quantity,
    destination: item.destination
  })) || [];
  
  setCart(cartItems);
  setOriginalItems(order.restaurant_order_items || []);
  setActiveTab('new');
};

    const handleCommander = async () => {
    if (cart.length === 0) { alert('Ajoutez au moins un article.'); return; }
    if (orderType === 'DINE_IN' && !selectedTableId) { alert('Sélectionnez une table.'); return; }
    if (orderType === 'ROOM_SERVICE' && !selectedRoomId) { alert('Sélectionnez une chambre.'); return; }
    if (!selectedServerId) { alert('Sélectionnez un serveur.'); return; }
    
    setIsSubmittingOrder(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (editingOrderId) {
        // ==========================================
        // MODE ÉDITION : Gestion des ajouts et modifications
        // ==========================================
        const newItems: CartItem[] = [];
        const updatedItems: CartItem[] = [];
        
        cart.forEach(cartItem => {
          const original = originalItems.find(orig => 
            orig.id === cartItem.orderItemId || 
            ((orig as any).menu_item_id === cartItem.menuItemId && cartItem.menuItemId) ||
            orig.item_name.toLowerCase() === cartItem.name.toLowerCase()
          );
          
          if (!original) {
            // C'est un tout nouvel article
            newItems.push(cartItem);
          } else if (original.quantity !== cartItem.quantity || original.unit_price !== cartItem.price) {
            // C'est un article existant dont la quantité ou le prix a changé
            updatedItems.push(cartItem);
          }
        });
        
        // 1. Insérer les nouveaux articles
        if (newItems.length > 0) {
          const itemsToInsert = newItems.map(item => ({
            order_id: editingOrderId,
            menu_item_id: item.menuItemId || item.id || null, // ✅ Évite l'erreur 409
            item_name: item.name,
            quantity: item.quantity,
            unit_price: item.price,
            total_price: item.quantity * item.price,
            status: 'PENDING',
            destination: getDestination(item)
          }));
          await supabase.from('restaurant_order_items').insert(itemsToInsert);
        }
        
        // 2. Mettre à jour les articles existants modifiés
        for (const item of updatedItems) {
          await supabase.from('restaurant_order_items')
            .update({ 
              quantity: item.quantity,
              total_price: item.quantity * item.price
            })
            .eq('id', item.orderItemId);
        }
        
        // 3. Mettre à jour le total et le statut de la commande
        const newTotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        await supabase.from('restaurant_orders').update({ 
          total_amount: newTotal,
          status: 'SENT'
        }).eq('id', editingOrderId);

        // 4. Préparer les données pour l'impression (Nouveaux + Modifiés)
        const kitchenItemsToPrint = [
          ...newItems.filter(i => getDestination(i) === 'KITCHEN'),
          ...updatedItems.filter(i => getDestination(i) === 'KITCHEN')
        ];
        
        const barItemsToPrint = [
          ...newItems.filter(i => getDestination(i) === 'BAR'),
          ...updatedItems.filter(i => getDestination(i) === 'BAR')
        ];

        // 5. Déclencher l'impression si nécessaire
        if (kitchenItemsToPrint.length > 0 || barItemsToPrint.length > 0) {
          const tempOrder: RestaurantOrder = {
            id: editingOrderId,
            order_number: orders.find(o => o.id === editingOrderId)?.order_number || '',
            table_id: selectedTableId || null,
            room_id: selectedRoomId || null,
            order_type: orderType,
            status: 'SENT',
            total_amount: newTotal,
            created_at: new Date().toISOString(),
            restaurant_tables: tables.find(t => t.id === selectedTableId) ? { number: tables.find(t => t.id === selectedTableId)!.number } : null,
            rooms: rooms.find(r => r.id === selectedRoomId) ? { number: rooms.find(r => r.id === selectedRoomId)!.number } : null,
            restaurant_order_items: [
              ...kitchenItemsToPrint.map(item => ({
                id: item.orderItemId || item.id,
                item_name: item.name,
                quantity: item.quantity,
                unit_price: item.price,
                total_price: item.quantity * item.price,
                status: 'PENDING',
                destination: getDestination(item)
              })),
              ...barItemsToPrint.map(item => ({
                id: item.orderItemId || item.id,
                item_name: item.name,
                quantity: item.quantity,
                unit_price: item.price,
                total_price: item.quantity * item.price,
                status: 'PENDING',
                destination: getDestination(item)
              }))
            ]
          };

          if (kitchenItemsToPrint.length > 0) {
            setTimeout(() => handlePrintKitchenBond(tempOrder), 0);
          }
          if (barItemsToPrint.length > 0) {
            setTimeout(() => handlePrintBarBond(tempOrder), 300); // Délai pour éviter le chevauchement des fenêtres d'impression
          }
          
          alert('✅ Commande mise à jour et bons imprimés !');
        } else {
          alert('✅ Commande mise à jour avec succès !');
        }

      } else {
        // ==========================================
        // MODE CRÉATION : Nouvelle commande
        // ==========================================
        const orderNumber = `CMD-${Date.now().toString().slice(-6)}`;
        const orderData: any = {
          site_id: siteId,
          order_type: orderType,
          order_number: orderNumber,
          status: 'SENT',
          total_amount: totalAmount,
          subtotal: totalAmount,
          tax_amount: 0,
          discount_amount: 0,
          created_by: user?.id,
          server_id: selectedServerId,
          sent_at: new Date().toISOString(),
        };
        
        if (orderType === 'DINE_IN') orderData.table_id = selectedTableId;
        if (orderType === 'ROOM_SERVICE') {
          orderData.room_id = selectedRoomId;
          orderData.charge_to_room = true;
          const room = rooms.find(r => r.id === selectedRoomId);
          if (room) orderData.room_number = room.number;
        }

        const { data: order, error: orderError } = await supabase
          .from('restaurant_orders')
          .insert(orderData)
          .select('id')
          .single();
        if (orderError) throw orderError;

        const orderItems = cart.map(item => ({
          order_id: order.id,
          menu_item_id: item.menuItemId || item.id || null,
          item_name: item.name,
          quantity: item.quantity,
          unit_price: item.price,
          total_price: item.quantity * item.price,
          status: 'PENDING',
          destination: getDestination(item)
        }));
        await supabase.from('restaurant_order_items').insert(orderItems);

        if (orderType === 'DINE_IN' && selectedTableId) {
          await supabase.from('restaurant_tables').update({ status: 'OCCUPIED' }).eq('id', selectedTableId);
        }

        const kitchenItems = cart.filter(i => getDestination(i) === 'KITCHEN');
        const barItems = cart.filter(i => getDestination(i) === 'BAR');
        
        const tempOrder: RestaurantOrder = {
          id: order.id,
          order_number: orderNumber,
          table_id: selectedTableId || null,
          room_id: selectedRoomId || null,
          order_type: orderType,
          status: 'SENT',
          total_amount: totalAmount,
          created_at: new Date().toISOString(),
          restaurant_tables: tables.find(t => t.id === selectedTableId) ? { number: tables.find(t => t.id === selectedTableId)!.number } : null,
          rooms: rooms.find(r => r.id === selectedRoomId) ? { number: rooms.find(r => r.id === selectedRoomId)!.number } : null,
          restaurant_order_items: cart.map(item => ({
            id: item.id,
            item_name: item.name,
            quantity: item.quantity,
            unit_price: item.price,
            total_price: item.quantity * item.price,
            status: 'PENDING',
            destination: getDestination(item)
          }))
        };

        if (kitchenItems.length > 0) {
          setTimeout(() => handlePrintKitchenBond(tempOrder), 0);
        }
        if (barItems.length > 0) {
          setTimeout(() => handlePrintBarBond(tempOrder), 300);
        }

        alert(`✅ Commande ${orderNumber} envoyée et bons imprimés !`);
      }

      // ==========================================
      // NETTOYAGE ET RECHARGEMENT
      // ==========================================
      setCart([]);
      setSelectedTableId('');
      setSelectedRoomId('');
      setSelectedServerId('');
      setEditingOrderId(null);
      setOriginalItems([]);
      setActiveTab('list');
      loadOrders();
      loadTables();
      
    } catch (error: any) {
      console.error('Erreur commande:', error);
      alert('Erreur : ' + error.message);
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  const handleValiderPourCaisse = async () => {
    if (cart.length === 0) { alert('Ajoutez au moins un article.'); return; }
    if (orderType === 'DINE_IN' && !selectedTableId) { alert('Sélectionnez une table.'); return; }
    if (orderType === 'ROOM_SERVICE' && !selectedRoomId) { alert('Sélectionnez une chambre.'); return; }
    if (!selectedServerId) { alert('Sélectionnez un serveur.'); return; }
    
    if (!confirm('Valider cette commande et l\'envoyer à la caisse ?')) return;
    
    setIsSubmittingOrder(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (editingOrderId) {
        const newItems = cart.filter(item => !originalItems.find(orig => orig.id === item.id));
        
        if (newItems.length > 0) {
          const orderItems = newItems.map(item => ({
            order_id: editingOrderId,
            menu_item_id: item.id,
            item_name: item.name,
            quantity: item.quantity,
            unit_price: item.price,
            total_price: item.quantity * item.price,
            status: 'PENDING',
            destination: getDestination(item) // ✅
          }));
          await supabase.from('restaurant_order_items').insert(orderItems);
        }

        const currentOrder = orders.find(o => o.id === editingOrderId);
        const currentTotal = currentOrder?.total_amount || 0;
        const addedTotal = newItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        
        await supabase.from('restaurant_orders').update({ 
          total_amount: currentTotal + addedTotal,
          status: 'SERVED'
        }).eq('id', editingOrderId);

        alert('✅ Commande validée et envoyée à la caisse !');
      } else {
        const orderNumber = `CMD-${Date.now().toString().slice(-6)}`;
        const orderData: any = {
          site_id: siteId,
          order_type: orderType,
          order_number: orderNumber,
          status: 'SERVED',
          total_amount: totalAmount,
          subtotal: totalAmount,
          tax_amount: 0,
          discount_amount: 0,
          created_by: user?.id,
          server_id: selectedServerId,
          sent_at: new Date().toISOString(),
        };
        
        if (orderType === 'DINE_IN') orderData.table_id = selectedTableId;
        if (orderType === 'ROOM_SERVICE') {
          orderData.room_id = selectedRoomId;
          orderData.charge_to_room = true;
          const room = rooms.find(r => r.id === selectedRoomId);
          if (room) orderData.room_number = room.number;
        }

        const { data: order, error: orderError } = await supabase
          .from('restaurant_orders')
          .insert(orderData)
          .select('id')
          .single();
        if (orderError) throw orderError;

        const orderItems = cart.map(item => ({
          order_id: order.id,
          menu_item_id: item.id,
          item_name: item.name,
          quantity: item.quantity,
          unit_price: item.price,
          total_price: item.quantity * item.price,
          status: 'PENDING',
          destination: getDestination(item) // ✅
        }));
        await supabase.from('restaurant_order_items').insert(orderItems);

        if (orderType === 'DINE_IN' && selectedTableId) {
          await supabase.from('restaurant_tables').update({ status: 'OCCUPIED' }).eq('id', selectedTableId);
        }

        alert(`✅ Commande ${orderNumber} validée et envoyée à la caisse !`);
      }

      setCart([]);
      setSelectedTableId('');
      setSelectedRoomId('');
      setSelectedServerId('');
      setEditingOrderId(null);
      setOriginalItems([]);
      setActiveTab('list');
      loadOrders();
      loadTables();
    } catch (error: any) {
      alert('Erreur : ' + error.message);
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  const getLocationLabel = (order: RestaurantOrder) => {
    if (order.order_type === 'DINE_IN') return `Table ${order.restaurant_tables?.number || '-'}`;
    if (order.order_type === 'ROOM_SERVICE') return `Ch. ${order.room_number || order.rooms?.number || '-'}`;
    if (order.order_type === 'TAKEAWAY') return 'À emporter';
    if (order.order_type === 'DELIVERY') return 'Livraison';
    return '-';
  };

  const handlePrintTicket = (order: RestaurantOrder) => {
    const printWindow = window.open('', '_blank', 'width=400,height=600');
    if (!printWindow) { alert('Autorisez les popups.'); return; }
    const items = order.restaurant_order_items || [];
    printWindow.document.write(`
      <!DOCTYPE html><html><head><title>Ticket ${order.order_number}</title>
      <style>body{font-family:'Courier New',monospace;font-size:12px;padding:10px;max-width:300px;margin:0 auto;}
      .header{text-align:center;border-bottom:1px dashed #000;padding-bottom:10px;margin-bottom:10px;}
      .header h1{font-size:16px;margin:0;}.header p{margin:2px 0;font-size:11px;}
      .info{margin:10px 0;font-size:11px;}.info div{display:flex;justify-content:space-between;}
      .items{border-top:1px dashed #000;border-bottom:1px dashed #000;padding:10px 0;margin:10px 0;}
      .item{display:flex;justify-content:space-between;margin:4px 0;}
      .total{display:flex;justify-content:space-between;font-weight:bold;font-size:14px;margin-top:10px;}
      .footer{text-align:center;margin-top:20px;font-size:10px;}</style></head><body>
      <div class="header"><h1>LA VIDA-LOCA</h1><p>Restaurant</p>
      <p>${new Date().toLocaleDateString('fr-FR')} ${new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</p></div>
      <div class="info">
        <div><span>N°:</span><span>${order.order_number}</span></div>
        <div><span>Lieu:</span><span>${getLocationLabel(order)}</span></div>
        <div><span>Type:</span><span>${getOrderTypeLabel(order.order_type || 'DINE_IN')}</span></div>
      </div>
      <div class="items">${items.map(i=>`<div class="item"><span>${i.item_name} x${i.quantity}</span><span>${Number(i.total_price).toLocaleString('fr-FR')} F</span></div>`).join('')}</div>
      <div class="total"><span>TOTAL</span><span>${Number(order.total_amount).toLocaleString('fr-FR')} F</span></div>
      <div class="footer"><p>Merci de votre visite !</p></div></body></html>
    `);
    printWindow.document.close();
    setTimeout(() => { printWindow.print(); printWindow.close(); }, 250);
  };

  const handlePrintKitchenBond = (order: RestaurantOrder) => {
    const items = (order.restaurant_order_items || []).filter(i => i.destination === 'KITCHEN');
    if (items.length === 0) { alert('Aucun article de cuisine.'); return; }
    const printWindow = window.open('', '_blank', 'width=600,height=700');
    if (!printWindow) { alert('Autorisez les popups.'); return; }
    const location = getLocationLabel(order).toUpperCase();
    printWindow.document.write(`
      <!DOCTYPE html><html><head><title>Bon Cuisine ${order.order_number}</title>
      <style>body{font-family:'Arial',sans-serif;padding:20px;max-width:500px;margin:0 auto;}
      .header{background:#1e40af;color:white;padding:15px;text-align:center;border-radius:8px;margin-bottom:20px;}
      .header h1{margin:0;font-size:24px;}.header p{margin:5px 0 0;font-size:14px;opacity:0.9;}
      .info{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:20px;}
      .info-box{background:#f3f4f6;padding:10px;border-radius:6px;}
      .info-box label{font-size:11px;color:#6b7280;display:block;}
      .info-box strong{font-size:16px;color:#1f2937;}
      .location{background:#fef3c7;border:2px solid #f59e0b;padding:15px;text-align:center;border-radius:8px;margin-bottom:20px;}
      .location strong{font-size:28px;color:#92400e;}
      .items{border:2px solid #1e40af;border-radius:8px;overflow:hidden;margin-bottom:20px;}
      .item{display:flex;justify-content:space-between;padding:12px 15px;border-bottom:1px solid #e5e7eb;}
      .item:last-child{border-bottom:none;}
      .item-name{font-weight:bold;font-size:14px;color:#1f2937;}
      .item-qty{background:#1e40af;color:white;padding:4px 12px;border-radius:20px;font-weight:bold;font-size:16px;}
      .footer{text-align:center;color:#6b7280;font-size:12px;margin-top:20px;}
      .timestamp{font-size:11px;color:#9ca3af;text-align:center;margin-top:10px;}
      @media print{body{padding:10px;}}</style></head><body>
      <div class="header"><h1>👨‍🍳 BON DE CUISINE</h1><p>LA VIDA-LOCA Restaurant</p></div>
      <div class="location"><strong>${location}</strong></div>
      <div class="info">
        <div class="info-box"><label>N° Commande</label><strong>${order.order_number}</strong></div>
        <div class="info-box"><label>Heure</label><strong>${new Date(order.created_at).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</strong></div>
        <div class="info-box"><label>Type</label><strong>${getOrderTypeIcon(order.order_type || 'DINE_IN')} ${getOrderTypeLabel(order.order_type || 'DINE_IN')}</strong></div>
        <div class="info-box"><label>Articles</label><strong>${items.length}</strong></div>
      </div>
      <div class="items">${items.map(i=>`<div class="item"><span class="item-name">${i.item_name}</span><span class="item-qty">x${i.quantity}</span></div>`).join('')}</div>
      <div class="footer"><p><strong>⚠️ À préparer immédiatement</strong></p><p class="timestamp">Imprimé le ${new Date().toLocaleString('fr-FR')}</p></div></body></html>
    `);
    printWindow.document.close();
    setTimeout(() => { printWindow.print(); printWindow.close(); }, 250);
  };

  const handlePrintBarBond = (order: RestaurantOrder) => {
    const items = (order.restaurant_order_items || []).filter(i => i.destination === 'BAR');
    if (items.length === 0) { alert('Aucun article de bar.'); return; }
    const printWindow = window.open('', '_blank', 'width=600,height=700');
    if (!printWindow) { alert('Autorisez les popups.'); return; }
    const location = getLocationLabel(order).toUpperCase();
    printWindow.document.write(`
      <!DOCTYPE html><html><head><title>Bon Bar ${order.order_number}</title>
      <style>body{font-family:'Arial',sans-serif;padding:20px;max-width:500px;margin:0 auto;}
      .header{background:#7c2d12;color:white;padding:15px;text-align:center;border-radius:8px;margin-bottom:20px;}
      .header h1{margin:0;font-size:24px;}.header p{margin:5px 0 0;font-size:14px;opacity:0.9;}
      .info{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:20px;}
      .info-box{background:#f3f4f6;padding:10px;border-radius:6px;}
      .info-box label{font-size:11px;color:#6b7280;display:block;}
      .info-box strong{font-size:16px;color:#1f2937;}
      .location{background:#fef3c7;border:2px solid #f59e0b;padding:15px;text-align:center;border-radius:8px;margin-bottom:20px;}
      .location strong{font-size:28px;color:#92400e;}
      .items{border:2px solid #7c2d12;border-radius:8px;overflow:hidden;margin-bottom:20px;}
      .item{display:flex;justify-content:space-between;padding:12px 15px;border-bottom:1px solid #e5e7eb;}
      .item:last-child{border-bottom:none;}
      .item-name{font-weight:bold;font-size:14px;color:#1f2937;}
      .item-qty{background:#7c2d12;color:white;padding:4px 12px;border-radius:20px;font-weight:bold;font-size:16px;}
      .footer{text-align:center;color:#6b7280;font-size:12px;margin-top:20px;}
      .timestamp{font-size:11px;color:#9ca3af;text-align:center;margin-top:10px;}
      @media print{body{padding:10px;}}</style></head><body>
      <div class="header"><h1>🍹 BON DE BAR</h1><p>LA VIDA-LOCA Restaurant</p></div>
      <div class="location"><strong>${location}</strong></div>
      <div class="info">
        <div class="info-box"><label>N° Commande</label><strong>${order.order_number}</strong></div>
        <div class="info-box"><label>Heure</label><strong>${new Date(order.created_at).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</strong></div>
        <div class="info-box"><label>Type</label><strong>${getOrderTypeIcon(order.order_type || 'DINE_IN')} ${getOrderTypeLabel(order.order_type || 'DINE_IN')}</strong></div>
        <div class="info-box"><label>Articles</label><strong>${items.length}</strong></div>
      </div>
      <div class="items">${items.map(i=>`<div class="item"><span class="item-name">${i.item_name}</span><span class="item-qty">x${i.quantity}</span></div>`).join('')}</div>
      <div class="footer"><p><strong>⚠️ À préparer immédiatement</strong></p><p class="timestamp">Imprimé le ${new Date().toLocaleString('fr-FR')}</p></div></body></html>
    `);
    printWindow.document.close();
    setTimeout(() => { printWindow.print(); printWindow.close(); }, 250);
  };

  const handleExportPDF = (order: RestaurantOrder) => {
    const doc = new jsPDF();
    const items = order.restaurant_order_items || [];
    doc.setFontSize(20); doc.setTextColor(79, 70, 229);
    doc.text('LA VIDA-LOCA', 105, 20, { align: 'center' });
    doc.setFontSize(12); doc.setTextColor(100, 100, 100);
    doc.text('Restaurant - Facture', 105, 28, { align: 'center' });
    doc.setDrawColor(200, 200, 200); doc.line(20, 35, 190, 35);
    doc.setFontSize(10); doc.setTextColor(50, 50, 50);
    doc.text(`N°: ${order.order_number}`, 20, 45);
    doc.text(`Date: ${new Date(order.created_at).toLocaleString('fr-FR')}`, 20, 52);
        doc.text(`Lieu: ${getLocationLabel(order)}`, 20, 59);
    doc.text(`Type: ${getOrderTypeLabel(order.order_type || 'DINE_IN')}`, 20, 66);
    doc.text(`Statut: ${getStatusConfig(order.status).label}`, 20, 73);
    const tableData = items.map(i => [i.item_name, i.quantity.toString(), `${Number(i.unit_price).toLocaleString('fr-FR')} F`, `${Number(i.total_price).toLocaleString('fr-FR')} F`]);
    autoTable(doc, {
      startY: 80, head: [['Article', 'Qté', 'Prix unit.', 'Total']], body: tableData,
      theme: 'striped', headStyles: { fillColor: [79, 70, 229], textColor: 255 },
      styles: { fontSize: 10 },
      columnStyles: { 0: { cellWidth: 80 }, 1: { cellWidth: 30, halign: 'center' }, 2: { cellWidth: 40, halign: 'right' }, 3: { cellWidth: 40, halign: 'right' } }
    });
    const finalY = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(14); doc.setTextColor(79, 70, 229); doc.setFont(undefined, 'bold');
    doc.text('TOTAL:', 140, finalY); doc.text(`${Number(order.total_amount).toLocaleString('fr-FR')} F`, 190, finalY, { align: 'right' });
    doc.setFontSize(9); doc.setTextColor(150, 150, 150); doc.setFont(undefined, 'normal');
    doc.text('Merci de votre visite !', 105, 280, { align: 'center' });
    doc.save(`Commande_${order.order_number}.pdf`);
  };

  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      const matchesStatus = statusFilter === 'ALL' || order.status === statusFilter;
      const matchesSearch = order.order_number.toLowerCase().includes(search.toLowerCase()) ||
        order.restaurant_tables?.number.toLowerCase().includes(search.toLowerCase()) ||
        order.rooms?.number.toLowerCase().includes(search.toLowerCase());
      return matchesStatus && matchesSearch;
    });
  }, [orders, statusFilter, search]);

  const sortedOrders = useMemo(() => {
    const activeStatuses = ['DRAFT', 'SENT', 'PREPARING', 'READY', 'SERVED'];
    return [...filteredOrders].sort((a, b) => {
      const aIsActive = activeStatuses.includes(a.status);
      const bIsActive = activeStatuses.includes(b.status);
      if (aIsActive && !bIsActive) return -1;
      if (!aIsActive && bIsActive) return 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [filteredOrders]);

  const stats = useMemo(() => ({
    total: orders.length,
    active: orders.filter(o => !['PAID', 'CANCELLED'].includes(o.status)).length,
    paid: orders.filter(o => o.status === 'PAID').length,
    revenue: orders.filter(o => o.status === 'PAID').reduce((sum, o) => sum + (o.total_amount || 0), 0),
  }), [orders]);

  const todayOrders = useMemo(() => {
    const today = new Date().toDateString();
    return orders.filter(o => new Date(o.created_at).toDateString() === today);
  }, [orders]);

  return (
    <div className="p-4 lg:p-6 h-full space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <ClipboardList className="w-7 h-7 text-indigo-600" />
            Commandes Restaurant
          </h1>
          <p className="text-sm text-slate-500 mt-1">Prise de commande et gestion des commandes.</p>
        </div>
      </div>

      <div className="flex gap-2 border-b border-slate-200">
        <button onClick={() => { setActiveTab('new'); setEditingOrderId(null); setCart([]); setSelectedServerId(''); }} className={`flex items-center gap-2 px-4 py-3 font-medium text-sm transition-colors ${activeTab === 'new' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-slate-600 hover:text-slate-900'}`}>
          <Plus className="w-4 h-4" /> Nouvelle Commande
        </button>
        <button onClick={() => setActiveTab('list')} className={`flex items-center gap-2 px-4 py-3 font-medium text-sm transition-colors ${activeTab === 'list' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-slate-600 hover:text-slate-900'}`}>
          <ClipboardList className="w-4 h-4" /> Liste ({orders.length})
        </button>
      </div>

      {activeTab === 'new' ? (
        <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-220px)]">
          {editingOrderId && (
            <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-40 bg-amber-500 text-white px-6 py-3 rounded-lg shadow-lg flex items-center gap-3">
              <Edit className="w-5 h-5" />
              <span className="font-semibold">Mode Édition : Commande {orders.find(o => o.id === editingOrderId)?.order_number}</span>
              <button onClick={() => { setEditingOrderId(null); setCart([]); setSelectedServerId(''); }} className="ml-2 hover:bg-amber-600 px-2 py-1 rounded">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
            <div className="p-4 border-b border-slate-200">
              <label className="block text-sm font-medium text-slate-700 mb-2">Type de commande *</label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <button onClick={() => setOrderType('DINE_IN')} className={`py-2 px-3 rounded-lg font-medium text-sm transition-colors ${orderType === 'DINE_IN' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
                  🍽️ Sur place
                </button>
                <button onClick={() => setOrderType('TAKEAWAY')} className={`py-2 px-3 rounded-lg font-medium text-sm transition-colors ${orderType === 'TAKEAWAY' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
                  🥡 À emporter
                </button>
                <button onClick={() => setOrderType('DELIVERY')} className={`py-2 px-3 rounded-lg font-medium text-sm transition-colors ${orderType === 'DELIVERY' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
                  🚚 Livraison
                </button>
                <button onClick={() => setOrderType('ROOM_SERVICE')} className={`py-2 px-3 rounded-lg font-medium text-sm transition-colors ${orderType === 'ROOM_SERVICE' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
                  🛎️ Chambre
                </button>
              </div>
              
              {orderType === 'DINE_IN' && (
                <select value={selectedTableId} onChange={(e) => setSelectedTableId(e.target.value)} className="mt-3 w-full border border-slate-300 rounded-lg px-3 py-2 bg-white">
                  <option value="">-- Sélectionner une table --</option>
                  {tables.map(t => <option key={t.id} value={t.id}>Table {t.number} ({t.capacity} places)</option>)}
                </select>
              )}
              
              {orderType === 'ROOM_SERVICE' && (
                <select value={selectedRoomId} onChange={(e) => setSelectedRoomId(e.target.value)} className="mt-3 w-full border border-slate-300 rounded-lg px-3 py-2 bg-white">
                  <option value="">-- Sélectionner une chambre --</option>
                  {rooms.length === 0 ? (
                    <option value="" disabled>Aucune chambre disponible</option>
                  ) : (
                    rooms.map(r => <option key={r.id} value={r.id}>Chambre {r.number} ({r.floor ? `Étage ${r.floor}, ` : ''}{r.status})</option>)
                  )}
                </select>
              )}

              <div className="mt-3">
                <label className="block text-sm font-medium text-slate-700 mb-1">Serveur *</label>
                <select 
                  value={selectedServerId} 
                  onChange={(e) => setSelectedServerId(e.target.value)} 
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white"
                >
                  <option value="">-- Sélectionner un serveur --</option>
                  {employees.length === 0 ? (
                    <option value="" disabled>Aucun employé disponible</option>
                  ) : (
                    employees.map(emp => (
                      <option key={emp.id} value={emp.id}>
                        {emp.first_name} {emp.last_name} ({emp.role})
                      </option>
                    ))
                  )}
                </select>
              </div>
            </div>

            <div className="p-4 border-b border-slate-200 flex gap-2 overflow-x-auto">
              {categories.map(cat => (
                <button key={cat} onClick={() => setActiveCategory(cat)} className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${activeCategory === cat ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
                  {cat === 'ALL' ? 'Tout' : cat}
                </button>
              ))}
            </div>
            
            <div className="flex-1 overflow-y-auto p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredItems.map(item => (
                  <button key={item.id} onClick={() => addToCart(item)} className="bg-white border border-slate-200 rounded-xl p-4 text-left hover:border-indigo-300 hover:shadow-md transition-all active:scale-95">
                    <div className="font-semibold text-slate-900 mb-1">{item.name}</div>
                    <div className="text-xs text-slate-500 mb-2">{item.category}</div>
                    <div className="text-lg font-bold text-indigo-600">{Number(item.price).toLocaleString('fr-FR')} F</div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="w-full lg:w-96 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col">
            <div className="p-4 border-b border-slate-200 bg-indigo-50">
              <h4 className="font-bold text-slate-900 flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-indigo-600" />
                Panier ({cart.reduce((sum, i) => sum + i.quantity, 0)})
              </h4>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {cart.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <ShoppingCart className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Le panier est vide</p>
                </div>
              ) : (
                cart.map(item => (
                  <div key={item.id} className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                    <div className="font-medium text-slate-900 text-sm mb-2">{item.name}</div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <button onClick={() => removeFromCart(item.id)} className="w-7 h-7 flex items-center justify-center rounded-full bg-white hover:bg-slate-200 text-slate-700 border border-slate-300">
                          <Minus className="w-4 h-4" />
                        </button>
                        <span className="font-bold text-slate-900 w-6 text-center">{item.quantity}</span>
                        <button onClick={() => addToCart(item)} className="w-7 h-7 flex items-center justify-center rounded-full bg-indigo-100 hover:bg-indigo-200 text-indigo-700">
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="font-bold text-slate-900">{Number(item.price * item.quantity).toLocaleString('fr-FR')} F</div>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="p-4 border-t border-slate-200 space-y-3 bg-slate-50">
              <div className="flex items-center justify-between text-lg font-bold text-slate-900">
                <span>Total</span>
                <span className="text-indigo-600">{Number(totalAmount).toLocaleString('fr-FR')} F</span>
              </div>
              
              <div className="grid grid-cols-2 gap-2">
                <button 
                  onClick={handleCommander} 
                  disabled={isSubmittingOrder || cart.length === 0 || (orderType === 'DINE_IN' && !selectedTableId) || (orderType === 'ROOM_SERVICE' && !selectedRoomId) || !selectedServerId} 
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors"
                  title="Émet les bons de cuisine et de bar"
                >
                  {isSubmittingOrder ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <><Send className="w-5 h-5" />Commander</>}
                </button>
                <button 
                  onClick={handleValiderPourCaisse} 
                  disabled={isSubmittingOrder || cart.length === 0 || (orderType === 'DINE_IN' && !selectedTableId) || (orderType === 'ROOM_SERVICE' && !selectedRoomId) || !selectedServerId} 
                  className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors"
                  title="Valide et envoie à la caisse pour paiement"
                >
                  {isSubmittingOrder ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <><CreditCard className="w-5 h-5" />Caisse</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <div className="text-xs text-slate-500 mb-1">Total</div>
              <div className="text-2xl font-bold text-slate-900">{stats.total}</div>
              <div className="text-xs text-slate-400 mt-1">{todayOrders.length} aujourd'hui</div>
            </div>
            <div className="bg-blue-50 rounded-xl border border-blue-200 p-4 shadow-sm">
              <div className="text-xs text-blue-700 mb-1">En cours</div>
              <div className="text-2xl font-bold text-blue-900">{stats.active}</div>
            </div>
            <div className="bg-emerald-50 rounded-xl border border-emerald-200 p-4 shadow-sm">
              <div className="text-xs text-emerald-700 mb-1">Payées</div>
              <div className="text-2xl font-bold text-emerald-900">{stats.paid}</div>
            </div>
            <div className="bg-indigo-50 rounded-xl border border-indigo-200 p-4 shadow-sm">
              <div className="text-xs text-indigo-700 mb-1">Chiffre d'affaires</div>
              <div className="text-2xl font-bold text-indigo-900">{Number(stats.revenue).toLocaleString('fr-FR')} F</div>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input type="text" placeholder="Rechercher..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-4 py-2 border border-slate-300 rounded-lg bg-white text-sm cursor-pointer">
              <option value="ALL">Tous les statuts</option>
              <option value="DRAFT">📝 Brouillon</option>
              <option value="SENT">🚚 Envoyée</option>
              <option value="PREPARING">👨‍🍳 En préparation</option>
              <option value="READY">✅ Prête</option>
              <option value="SERVED">🍽️ Servie</option>
              <option value="PAID">💰 Payée</option>
              <option value="CANCELLED">❌ Annulée</option>
            </select>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div></div>
          ) : sortedOrders.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
              <ClipboardList className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h3 className="text-lg font-medium text-slate-900">Aucune commande</h3>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-semibold text-slate-900">
                  {statusFilter === 'ALL' || ['DRAFT', 'SENT', 'PREPARING', 'READY', 'SERVED'].includes(statusFilter) 
                    ? 'Commandes en cours (Prioritaires)' 
                    : 'Historique des commandes'}
                </h3>
                <div className="flex bg-slate-100 rounded-lg p-1">
                  <button 
                    onClick={() => setViewMode('cards')}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1 ${viewMode === 'cards' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                  >
                    <LayoutGrid className="w-4 h-4" /> Cartes
                  </button>
                  <button 
                    onClick={() => setViewMode('table')}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1 ${viewMode === 'table' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                  >
                    <List className="w-4 h-4" /> Tableau
                  </button>
                </div>
              </div>

              {viewMode === 'cards' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {sortedOrders.map((order) => {
                    const statusConfig = getStatusConfig(order.status);
                    const StatusIcon = statusConfig.icon;
                    const itemsCount = order.restaurant_order_items?.reduce((sum, i) => sum + i.quantity, 0) || 0;
                    const canAdvance = statusConfig.nextStatus !== null;
                    const isFinished = ['PAID', 'CANCELLED'].includes(order.status);
                    const canEdit = !['PAID', 'CANCELLED'].includes(order.status);
                    
                    return (
                      <div 
                        key={order.id} 
                        onClick={() => { setSelectedOrder(order); setIsDetailOpen(true); }}
                        className={`rounded-xl border-2 p-4 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all cursor-pointer group 
                          ${statusConfig.cardBg} ${statusConfig.cardBorder} 
                          ${isFinished ? 'opacity-70 grayscale-[0.2] hover:opacity-100 hover:grayscale-0' : ''}`}
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <div className="font-bold text-slate-900 text-lg">{order.order_number}</div>
                            <div className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                              <Clock className="w-3 h-3" />
                              {new Date(order.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${statusConfig.badgeColor}`}>
                            <StatusIcon className="w-3 h-3" />
                            {statusConfig.label}
                          </span>
                        </div>

                        <div className="space-y-2 mb-4">
                          <div className="flex items-center gap-2 text-sm text-slate-700">
                            {order.order_type === 'DINE_IN' ? <Users className="w-4 h-4 text-slate-400" /> : 
                             order.order_type === 'ROOM_SERVICE' ? <Bed className="w-4 h-4 text-slate-400" /> : 
                             <ShoppingCart className="w-4 h-4 text-slate-400" />}
                            <span className="font-medium">{getLocationLabel(order)}</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm text-slate-700">
                            <ClipboardList className="w-4 h-4 text-slate-400" />
                            <span>{itemsCount} article{itemsCount > 1 ? 's' : ''}</span>
                          </div>
                          {order.restaurant_employees && (
                            <div className="flex items-center gap-2 text-sm text-slate-700">
                              <Users className="w-4 h-4 text-slate-400" />
                              <span>{order.restaurant_employees.first_name} {order.restaurant_employees.last_name}</span>
                            </div>
                          )}
                        </div>

                        <div className="border-t border-slate-200/50 pt-3 flex items-center justify-between">
                          <div className="text-xl font-bold text-slate-900">
                            {Number(order.total_amount).toLocaleString('fr-FR')} F
                          </div>
                          <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                            {canEdit && (
                              <button 
                                onClick={() => openEditOrder(order)}
                                className="p-2 bg-white text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors shadow-sm"
                                title="Modifier la commande"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                            )}
                            {canAdvance && (
                              <button 
                                onClick={() => handleStatusChange(order.id, statusConfig.nextStatus)}
                                className="p-2 bg-white text-emerald-600 border border-emerald-200 rounded-lg hover:bg-emerald-50 transition-colors shadow-sm"
                                title={`Passer à: ${getStatusConfig(statusConfig.nextStatus).label}`}
                              >
                                <TrendingUp className="w-4 h-4" />
                              </button>
                            )}
                            <button 
                              onClick={() => { setSelectedOrder(order); setIsDetailOpen(true); }}
                              className="p-2 bg-white text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors shadow-sm"
                              title="Voir les détails"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            {!isFinished && (
                              <button 
                                onClick={() => openCancelModal(order)}
                                className="p-2 bg-white text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors shadow-sm"
                                title="Annuler"
                              >
                                <Ban className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500 font-semibold">
                          <th className="px-6 py-4">N°</th>
                          <th className="px-6 py-4">Lieu</th>
                          <th className="px-6 py-4">Serveur</th>
                          <th className="px-6 py-4">Type</th>
                          <th className="px-6 py-4 text-center">Articles</th>
                          <th className="px-6 py-4 text-right">Total</th>
                          <th className="px-6 py-4">Date</th>
                          <th className="px-6 py-4 text-center">Statut</th>
                          <th className="px-6 py-4 text-center">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {sortedOrders.map((order) => {
                          const statusConfig = getStatusConfig(order.status);
                          const StatusIcon = statusConfig.icon;
                          const itemsCount = order.restaurant_order_items?.length || 0;
                          const itemsQty = order.restaurant_order_items?.reduce((sum, i) => sum + i.quantity, 0) || 0;
                          const canCancel = !['PAID', 'CANCELLED'].includes(order.status);
                          const isFinished = ['PAID', 'CANCELLED'].includes(order.status);
                          const canEdit = !isFinished;
                          return (
                            <tr key={order.id} className={`hover:bg-slate-50 transition-colors group ${isFinished ? 'opacity-70 hover:opacity-100' : ''}`}>
                              <td className="px-6 py-4 font-bold text-indigo-600">{order.order_number}</td>
                              <td className="px-6 py-4 font-medium text-slate-900">{getLocationLabel(order)}</td>
                              <td className="px-6 py-4 text-sm text-slate-700">
                                {order.restaurant_employees 
                                  ? `${order.restaurant_employees.first_name} ${order.restaurant_employees.last_name}`
                                  : <span className="text-slate-400">-</span>
                                }
                              </td>
                              <td className="px-6 py-4 text-sm text-slate-700">
                                {getOrderTypeIcon(order.order_type || 'DINE_IN')} {getOrderTypeLabel(order.order_type || 'DINE_IN')}
                              </td>
                              <td className="px-6 py-4 text-center text-sm text-slate-700"><span className="font-medium">{itemsQty}</span><span className="text-xs text-slate-500 ml-1">({itemsCount})</span></td>
                              <td className="px-6 py-4 text-right font-bold text-slate-900">{Number(order.total_amount).toLocaleString('fr-FR')} F</td>
                              <td className="px-6 py-4 text-sm text-slate-600">
                                <div className="flex items-center gap-1">
                                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                                  {new Date(order.created_at).toLocaleDateString('fr-FR',{day:'2-digit',month:'short'})}
                                  <span className="text-xs text-slate-400 ml-1">{new Date(order.created_at).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</span>
                                </div>
                              </td>
                              <td className="px-6 py-4 text-center">
                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${statusConfig.badgeColor}`}>
                                  <StatusIcon className="w-3.5 h-3.5" />{statusConfig.label}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-center">
                                <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  {canEdit && (
                                    <button onClick={() => openEditOrder(order)} className="p-1.5 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg" title="Modifier"><Edit className="w-4 h-4" /></button>
                                  )}
                                  <button onClick={() => { setSelectedOrder(order); setIsDetailOpen(true); }} className="p-1.5 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg" title="Détail"><Eye className="w-4 h-4" /></button>
                                  {statusConfig.nextStatus && (
                                    <button onClick={() => handleStatusChange(order.id, statusConfig.nextStatus)} disabled={isUpdating} className="p-1.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg disabled:opacity-50" title="Avancer"><TrendingUp className="w-4 h-4" /></button>
                                  )}
                                  {canCancel && (
                                    <button onClick={() => openCancelModal(order)} className="p-1.5 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg" title="Annuler"><Ban className="w-4 h-4" /></button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {isDetailOpen && selectedOrder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className={`px-6 py-4 flex items-center justify-between sticky top-0 z-10 ${getStatusConfig(selectedOrder.status).badgeColor} border-b-2`}>
              <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <ClipboardList className="w-6 h-6" />
                Commande {selectedOrder.order_number}
              </h3>
              <button onClick={() => setIsDetailOpen(false)} className="hover:bg-white/50 p-2 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-slate-50 p-3 rounded-lg">
                  <div className="text-xs text-slate-500 mb-1">Lieu</div>
                  <div className="font-semibold text-slate-900">{getLocationLabel(selectedOrder)}</div>
                </div>
                <div className="bg-slate-50 p-3 rounded-lg">
                  <div className="text-xs text-slate-500 mb-1">Serveur</div>
                  <div className="font-semibold text-slate-900">
                    {selectedOrder.restaurant_employees 
                      ? `${selectedOrder.restaurant_employees.first_name} ${selectedOrder.restaurant_employees.last_name}`
                      : '-'
                    }
                  </div>
                </div>
                <div className="bg-slate-50 p-3 rounded-lg">
                  <div className="text-xs text-slate-500 mb-1">Type</div>
                  <div className="font-semibold text-slate-900">{getOrderTypeIcon(selectedOrder.order_type || 'DINE_IN')} {getOrderTypeLabel(selectedOrder.order_type || 'DINE_IN')}</div>
                </div>
                <div className="bg-slate-50 p-3 rounded-lg">
                  <div className="text-xs text-slate-500 mb-1">Total</div>
                  <div className="font-bold text-indigo-600 text-lg">{Number(selectedOrder.total_amount).toLocaleString('fr-FR')} F</div>
                </div>
              </div>

              {selectedOrder.restaurant_order_items && selectedOrder.restaurant_order_items.length > 0 && (
                <div>
                  <h4 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                    <ClipboardList className="w-4 h-4" />Articles ({selectedOrder.restaurant_order_items.length})
                  </h4>
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-100">
                        <tr><th className="px-4 py-2 text-left">Article</th><th className="px-4 py-2 text-center">Qté</th><th className="px-4 py-2 text-center">Destination</th><th className="px-4 py-2 text-right">Prix unit.</th><th className="px-4 py-2 text-right">Total</th></tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {selectedOrder.restaurant_order_items.map((item) => (
                          <tr key={item.id} className="hover:bg-slate-50">
                            <td className="px-4 py-2 font-medium text-slate-900">{item.item_name}</td>
                            <td className="px-4 py-2 text-center">{item.quantity}</td>
                            <td className="px-4 py-2 text-center">
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                item.destination === 'KITCHEN' 
                                  ? 'bg-blue-100 text-blue-800' 
                                  : 'bg-amber-100 text-amber-800'
                              }`}>
                                {item.destination === 'KITCHEN' ? '👨‍🍳 Cuisine' : '🍹 Bar'}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-right">{Number(item.unit_price).toLocaleString('fr-FR')} F</td>
                            <td className="px-4 py-2 text-right font-bold">{Number(item.total_price).toLocaleString('fr-FR')} F</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-slate-50 font-bold">
                        <tr><td colSpan={4} className="px-4 py-3 text-right">TOTAL :</td><td className="px-4 py-3 text-right text-lg text-indigo-600">{Number(selectedOrder.total_amount).toLocaleString('fr-FR')} F</td></tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <h4 className="font-semibold text-slate-900">Impressions</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <button onClick={() => handlePrintKitchenBond(selectedOrder)} className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg transition-colors">
                    <ChefHat className="w-5 h-5" />Bon Cuisine
                  </button>
                  <button onClick={() => handlePrintBarBond(selectedOrder)} className="flex items-center justify-center gap-2 bg-amber-600 hover:bg-amber-700 text-white font-semibold py-3 rounded-lg transition-colors">
                    <Wine className="w-5 h-5" />Bon Bar
                  </button>
                  <button onClick={() => handlePrintTicket(selectedOrder)} className="flex items-center justify-center gap-2 bg-slate-600 hover:bg-slate-700 text-white font-semibold py-3 rounded-lg transition-colors">
                    <Printer className="w-5 h-5" />Ticket Client
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-3 pt-2 border-t border-slate-200">
                {!['PAID', 'CANCELLED'].includes(selectedOrder.status) && (
                  <button onClick={() => { setIsDetailOpen(false); openEditOrder(selectedOrder); }} className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-lg transition-colors">
                    <Edit className="w-4 h-4" />Modifier
                  </button>
                )}
                <button onClick={() => handleExportPDF(selectedOrder)} className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-lg transition-colors">
                  <FileDown className="w-4 h-4" />Export PDF
                </button>
                {!['PAID', 'CANCELLED'].includes(selectedOrder.status) && (
                  <button onClick={() => { setIsDetailOpen(false); openCancelModal(selectedOrder); }} className="flex-1 flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold py-2.5 rounded-lg transition-colors">
                    <Ban className="w-4 h-4" />Annuler
                  </button>
                )}
              </div>

              <div className="space-y-3">
                <h4 className="font-semibold text-slate-900">Changer le statut</h4>
                <div className="flex flex-wrap gap-2">
                  {(['SENT', 'PREPARING', 'READY', 'SERVED', 'PAID', 'CANCELLED'] as const).map(status => {
                    const config = getStatusConfig(status);
                    const StatusIcon = config.icon;
                    const isCurrent = selectedOrder.status === status;
                    return (
                      <button key={status} onClick={() => handleStatusChange(selectedOrder.id, status)} disabled={isCurrent || isUpdating} className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-colors ${isCurrent ? `${config.badgeColor} ring-2 ring-offset-2 ring-indigo-500` : 'bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-50'}`}>
                        <StatusIcon className="w-4 h-4" />{config.label}{isCurrent && <CheckCircle className="w-4 h-4" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {selectedOrder.status === 'CANCELLED' && selectedOrder.cancellation_reason && (
                <div className="bg-red-50 p-3 rounded-lg border border-red-200 text-sm text-red-900">
                  <div className="font-semibold mb-1 flex items-center gap-1"><Ban className="w-4 h-4" />Motif d'annulation</div>
                  <div>{selectedOrder.cancellation_reason}</div>
                  {selectedOrder.cancelled_at && <div className="text-xs text-red-700 mt-1">Annulée le {new Date(selectedOrder.cancelled_at).toLocaleString('fr-FR')}</div>}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {isCancelModalOpen && selectedOrder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="bg-red-600 text-white px-6 py-4 flex items-center justify-between">
              <h3 className="text-lg font-bold flex items-center gap-2"><Ban className="w-5 h-5" />Annuler la commande</h3>
              <button onClick={() => { setIsCancelModalOpen(false); setCancelReason(''); }} className="hover:bg-red-700 p-1 rounded"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-red-50 p-3 rounded-lg border border-red-200 text-sm text-red-900">
                <strong>Commande :</strong> {selectedOrder.order_number}<br/>
                <strong>Total :</strong> {Number(selectedOrder.total_amount).toLocaleString('fr-FR')} F
              </div>
              <div className="bg-amber-50 p-3 rounded-lg border border-amber-200 text-sm text-amber-900 flex items-start gap-2">
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <div><strong>Attention :</strong> Action irréversible.</div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Motif d'annulation *</label>
                <textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-red-500 outline-none" rows={4} placeholder="Ex: Client parti, erreur..." required />
              </div>
              <div className="flex gap-3">
                <button onClick={() => { setIsCancelModalOpen(false); setCancelReason(''); }} className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold py-2.5 rounded-lg">Annuler</button>
                <button onClick={handleCancelOrder} disabled={isCancelling || !cancelReason.trim()} className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-2.5 rounded-lg disabled:opacity-50 flex items-center justify-center gap-2">
                  {isCancelling ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <><Ban className="w-4 h-4" />Confirmer</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
