'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { X, Plus, Minus, ShoppingCart, Send, Trash2, Bed, Printer, DollarSign, Hotel, AlertCircle, CheckCircle, FileText, Lock, Search } from 'lucide-react';

interface Props {
  siteId: string;
  table: any | null;
  orderId?: string | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function FBOrderModal({ siteId, table, orderId, isOpen, onClose, onSuccess }: Props) {
  const supabase = createClient();
  const modalContentRef = useRef<HTMLDivElement>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [menuItems, setMenuItems] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [localOrderItems, setLocalOrderItems] = useState<any[]>([]);
  const [currentOrder, setCurrentOrder] = useState<any>(null);
  const [selectedServer, setSelectedServer] = useState<string>('');
  const [servers, setServers] = useState<any[]>([]);
  const [orderType, setOrderType] = useState<'DINE_IN' | 'TAKEAWAY' | 'DELIVERY' | 'ROOM_SERVICE'>('DINE_IN');
  const [orderStatus, setOrderStatus] = useState('open');
  const [chargeToRoom, setChargeToRoom] = useState(false);
  const [selectedStay, setSelectedStay] = useState<any>(null);
  const [occupiedRooms, setOccupiedRooms] = useState<any[]>([]);
  const [searchRoom, setSearchRoom] = useState('');
  const [lastOrderNumber, setLastOrderNumber] = useState<string>('');
  const [printSuccess, setPrintSuccess] = useState(false);
  const [serverName, setServerName] = useState('');
  const [printedQuantities, setPrintedQuantities] = useState<Map<string, number>>(new Map());
  const [allTicketsPrinted, setAllTicketsPrinted] = useState(false);
  const [menuSearchTerm, setMenuSearchTerm] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [favorites, setFavorites] = useState<string[]>([]);
const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

  // ✅ Refs pour éviter les stale closures et les doubles exécutions
  const localOrderItemsRef = useRef(localOrderItems);
  const currentOrderRef = useRef(currentOrder);
  const selectedServerRef = useRef(selectedServer);
  const orderTypeRef = useRef(orderType);
  const deliveryAddressRef = useRef(deliveryAddress);
  const isSavingDraftRef = useRef(false);

  useEffect(() => { localOrderItemsRef.current = localOrderItems; }, [localOrderItems]);
  useEffect(() => { currentOrderRef.current = currentOrder; }, [currentOrder]);
  useEffect(() => { selectedServerRef.current = selectedServer; }, [selectedServer]);
  useEffect(() => { orderTypeRef.current = orderType; }, [orderType]);
  useEffect(() => { deliveryAddressRef.current = deliveryAddress; }, [deliveryAddress]);

  useEffect(() => {
    if (isOpen) {
      console.log('🟢 Modal ouvert - orderId:', orderId, 'table:', table?.number);
      
      setCurrentOrder(null);
      setLocalOrderItems([]);
      setSelectedServer('');
      setServerName('');
      setChargeToRoom(false);
      setSelectedStay(null);
      setPrintedQuantities(new Map());
      setAllTicketsPrinted(false);
      setPrintSuccess(false);
      setLastOrderNumber('');
      setMenuSearchTerm('');
      setDeliveryAddress('');
      setError('');
      isSavingDraftRef.current = false;
      
      if (table) {
        setOrderType('DINE_IN');
      } else {
        setOrderType('DINE_IN');
      }
      
      loadData();
      loadOccupiedRooms();
      
      if (orderId) {
        loadExistingOrderById(orderId);
      } else if (table?.id) {
        loadExistingOrderByTable(table.id);
      }
      
      setTimeout(() => {
        if (modalContentRef.current) {
          modalContentRef.current.scrollTop = 0;
        }
      }, 100);
    }
  }, [isOpen, orderId, table?.id]);

  // Charger les favoris depuis localStorage
useEffect(() => {
  if (isOpen) {
    const saved = localStorage.getItem(`restaurant_favorites_${siteId}`);
    if (saved) setFavorites(JSON.parse(saved));
  }
}, [isOpen, siteId]);

// Sauvegarder les favoris
useEffect(() => {
  localStorage.setItem(`restaurant_favorites_${siteId}`, JSON.stringify(favorites));
}, [favorites, siteId]);

  const loadData = async () => {
    try {
      const { data: cat } = await supabase
        .from('restaurant_categories')
        .select('*')
        .eq('site_id', siteId)
        .eq('is_active', true)
        .order('display_order');
      if (cat) {
        setCategories(cat);
        if (!activeCategory && cat.length > 0) setActiveCategory(cat[0].id);
      }

      const { data: items } = await supabase
        .from('restaurant_items')
        .select('*, restaurant_categories(name, icon)')
        .eq('site_id', siteId)
        .eq('is_available', true)
        .order('display_order');
      if (items) setMenuItems(items);

      const { data: emp } = await supabase
        .from('restaurant_employees')
        .select('id, first_name, last_name, role')
        .eq('site_id', siteId)
        .eq('is_active', true)
        .in('role', ['SERVER', 'CASHIER', 'MANAGER', 'CHEF', 'BARTENDER']);
      if (emp) setServers(emp);
    } catch (err) {
      console.error('Erreur loadData:', err);
    }
  };

  const toggleFavorite = (itemId: string) => {
  setFavorites(prev => {
    if (prev.includes(itemId)) {
      return prev.filter(id => id !== itemId);
    }
    return [...prev, itemId];
  });
};

  const loadOccupiedRooms = async () => {
    try {
      const { data, error } = await supabase
        .from('stays')
        .select(`
          id, folio_balance,
          rooms(id, number, room_categories(code, name)),
          customers(first_name, last_name, phone)
        `)
        .eq('status', 'IN_HOUSE')
        .order('rooms(number)', { ascending: true });

      if (error) throw error;
      setOccupiedRooms(data || []);
    } catch (error) {
      console.error('Erreur chargement chambres:', error);
    }
  };

  const loadExistingOrderById = async (id: string) => {
    try {
      const { data, error } = await supabase
        .from('restaurant_orders')
        .select(`
  id, order_number, server_id, order_type, status, room_id, stay_id, table_id, notes,
  restaurant_employees(first_name, last_name),
  restaurant_order_items(id, menu_item_id, item_name, quantity, unit_price, total_price, notes, status, destination),
  restaurant_tables(number)
`)
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        console.log('✅ Commande chargée par ID:', data.order_number);
        setCurrentOrder(data);
        const normalizedItems = normalizeCart(data.restaurant_order_items || []);
        setLocalOrderItems(normalizedItems);
        setSelectedServer(data.server_id || '');
        setOrderType(data.order_type || 'DINE_IN');
        setOrderStatus(data.status || 'open');
        
        const existingPrinted = new Map<string, number>();
        normalizedItems.forEach((item: any) => {
          existingPrinted.set(item.menu_item_id, item.quantity);
        });
        setPrintedQuantities(existingPrinted);
        setAllTicketsPrinted(true);
        
       // ✅ Correction : restaurant_employees est un tableau
const emp = data.restaurant_employees?.[0];
if (emp) {
  setServerName(`${emp.first_name} ${emp.last_name}`);
}

        // ✅ Charger l'adresse de livraison depuis les notes
if (data.notes) {
  console.log('📝 Notes de la commande:', data.notes);
  
  // Essayer différents formats possibles
  let address = '';
  if (data.notes.includes('📍 Livraison:')) {
    address = data.notes.split('📍 Livraison:')[1].trim();
  } else if (data.notes.includes('Livraison:')) {
    address = data.notes.split('Livraison:')[1].trim();
  }
  
  if (address) {
    setDeliveryAddress(address);
    console.log('📍 Adresse chargée:', address);
  } else {
    console.log('⚠️ Aucune adresse trouvée dans les notes');
  }
}
      }
    } catch (err) {
      console.error('❌ Erreur chargement par orderId:', err);
    }
  };

  const loadExistingOrderByTable = async (tableId: string) => {
    try {
      const { data, error } = await supabase
        .from('restaurant_orders')
        .select(`
          id, order_number, server_id, order_type, status,
          restaurant_employees(first_name, last_name),
          restaurant_order_items(id, menu_item_id, item_name, quantity, unit_price, total_price, notes, status, destination)
        `)
        .eq('table_id', tableId)
        .in('status', ['DRAFT', 'SENT', 'PREPARING', 'READY', 'SERVED'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        console.log('✅ Commande chargée par table:', data.order_number);
        setCurrentOrder(data);
        const normalizedItems = normalizeCart(data.restaurant_order_items || []);
        setLocalOrderItems(normalizedItems);
        setSelectedServer(data.server_id || '');
        setOrderType(data.order_type || 'DINE_IN');
        setOrderStatus(data.status || 'open');
        
        const existingPrinted = new Map<string, number>();
        normalizedItems.forEach((item: any) => {
          existingPrinted.set(item.menu_item_id, item.quantity);
        });
        setPrintedQuantities(existingPrinted);
        setAllTicketsPrinted(true);

        const emp = data.restaurant_employees?.[0];
if (emp) {
  setServerName(`${emp.first_name} ${emp.last_name}`);
} else {
        console.log('ℹ️ Aucune commande pour cette table');
      }
    } catch (err) {
      console.error('❌ Erreur chargement par table:', err);
    }
  };

  const normalizeCart = (cartItems: any[]): any[] => {
    const map = new Map<string, any>();
    cartItems.forEach(item => {
      const key = item.menu_item_id;
      if (map.has(key)) {
        const existing = map.get(key);
        existing.quantity += item.quantity;
        existing.total_price = existing.quantity * existing.unit_price;
      } else {
        map.set(key, { ...item });
      }
    });
    return Array.from(map.values());
  };

  // ✅ saveDraftOrder avec verrouillage anti-double-exécution
  const saveDraftOrder = useCallback(async () => {
    if (isSavingDraftRef.current) {
      console.log('⏭️ saveDraftOrder ignoré (déjà en cours)');
      return null;
    }

    if (table || chargeToRoom) return null;
    
    const items = localOrderItemsRef.current;
    const server = selectedServerRef.current;
    const type = orderTypeRef.current;
    const address = deliveryAddressRef.current;
    const order = currentOrderRef.current;

    if (items.length === 0) return null;
    if (!server) return null;

    isSavingDraftRef.current = true;
    console.log('💾 Début saveDraftOrder...', { itemsCount: items.length, server, type, address });
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const orderNumber = order?.order_number || `CMD-${Date.now().toString().slice(-6)}`;
      let orderIdToUse = order?.id;

      if (!orderIdToUse) {
        console.log('📝 Création d\'un nouveau brouillon...');
        const { data: newOrder, error: orderError } = await supabase
          .from('restaurant_orders')
          .insert({
            site_id: siteId,
            order_number: orderNumber,
            table_id: null,
            server_id: server,
            order_type: type,
            status: 'DRAFT',
            total_amount: items.reduce((sum, item) => sum + item.total_price, 0),
            notes: type === 'DELIVERY' && address ? `📍 Livraison: ${address}` : '',
            created_by: user?.id,
          })
          .select('id')
          .single();

        if (orderError) {
          console.error('❌ Erreur création brouillon:', orderError);
          isSavingDraftRef.current = false;
          return null;
        }
        
        orderIdToUse = newOrder.id;
        setCurrentOrder({ ...newOrder, order_number: orderNumber });
        console.log('✅ Brouillon créé:', orderIdToUse);
      } else {
        console.log('🔄 Mise à jour du brouillon existant:', orderIdToUse);
        const { error: updateError } = await supabase.from('restaurant_orders').update({
          total_amount: items.reduce((sum, item) => sum + item.total_price, 0),
          order_type: type,
          notes: type === 'DELIVERY' && address ? `📍 Livraison: ${address}` : (order?.notes || ''),
        }).eq('id', orderIdToUse);

        if (updateError) {
          console.error('❌ Erreur update brouillon:', updateError);
          isSavingDraftRef.current = false;
          return null;
        }
      }

      // ✅ Utiliser upsert pour éviter les conflits 409
      for (const item of items) {
        const { error: itemError } = await supabase
          .from('restaurant_order_items')
          .upsert({
            order_id: orderIdToUse,
            menu_item_id: item.menu_item_id,
            item_name: item.item_name,
            quantity: item.quantity,
            unit_price: item.unit_price,
            total_price: item.total_price,
            notes: item.notes,
            destination: item.destination,
            status: 'PENDING',
          }, {
            onConflict: 'order_id,menu_item_id'
          });

        if (itemError) {
          console.error('❌ Erreur upsert item:', itemError);
          isSavingDraftRef.current = false;
          return null;
        }
      }

      console.log('✅ Brouillon sauvegardé avec succès');
      return orderIdToUse;
    } catch (err: any) {
      console.error('❌ Erreur saveDraftOrder:', err);
      return null;
    } finally {
      isSavingDraftRef.current = false;
    }
  }, [table, chargeToRoom, siteId]);

  // ✅ NOUVEAU : Sauvegarder automatiquement quand l'adresse de livraison change
  useEffect(() => {
    if (orderType === 'DELIVERY' && !table && !chargeToRoom && localOrderItems.length > 0 && deliveryAddress.trim()) {
      const timer = setTimeout(() => {
        console.log('💾 Sauvegarde auto de l\'adresse de livraison...');
        saveDraftOrder();
      }, 1000); // Attend 1 seconde après la dernière frappe
      return () => clearTimeout(timer);
    }
  }, [deliveryAddress, orderType, table, chargeToRoom, localOrderItems.length, saveDraftOrder]);

  const addToCart = (item: any) => {
    setLocalOrderItems(prevCart => {
      const existing = prevCart.find(c => c.menu_item_id === item.id);
      let newCart;
      if (existing) {
        newCart = prevCart.map(c =>
          c.menu_item_id === item.id
            ? { ...c, quantity: c.quantity + 1, total_price: (c.quantity + 1) * c.unit_price }
            : c
        );
      } else {
        newCart = [...prevCart, {
          menu_item_id: item.id,
          item_name: item.name,
          quantity: 1,
          unit_price: item.price,
          total_price: item.price,
          destination: item.destination,
          status: 'PENDING',
        }];
      }
      
      if (!table && !chargeToRoom) {
        setTimeout(() => {
          console.log('⏰ Appel de saveDraftOrder après ajout...');
          saveDraftOrder();
        }, 500);
      }
      
      return newCart;
    });
  };

  const updateQuantity = (itemId: string, delta: number) => {
    setLocalOrderItems(prevCart => prevCart.map(c => {
      if (c.menu_item_id === itemId) {
        const newQty = Math.max(0, c.quantity + delta);
        return { ...c, quantity: newQty, total_price: newQty * c.unit_price };
      }
      return c;
    }).filter(c => c.quantity > 0));
  };

  const removeFromCart = (itemId: string) => {
    setLocalOrderItems(prevCart => prevCart.filter(c => c.menu_item_id !== itemId));
  };

  const cartTotal = localOrderItems.reduce((sum, item) => sum + item.total_price, 0);

  const getItemsToPrint = (mode: 'all' | 'new') => {
    const itemsToPrint: any[] = [];
    localOrderItems.forEach(item => {
      const printedQty = printedQuantities.get(item.menu_item_id) || 0;
      const currentQty = item.quantity;
      const qtyToPrint = currentQty - printedQty;

      if (qtyToPrint > 0) {
        itemsToPrint.push({
          ...item,
          quantity: qtyToPrint,
          total_price: qtyToPrint * item.unit_price,
          isIncrement: mode === 'new' && printedQty > 0,
          previousQty: printedQty
        });
      }
    });
    return itemsToPrint;
  };

  const printTickets = (tickets: { type: string; items: any[]; title: string }[]) => {
    tickets.forEach((ticket, index) => {
      setTimeout(() => {
        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = 'none';
        iframe.style.visibility = 'hidden';
        document.body.appendChild(iframe);

        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!doc) return;

        const isKitchen = ticket.type === 'kitchen';
        const locationText = table 
          ? `Table ${table.number}` 
          : (chargeToRoom && selectedStay ? `Chambre ${selectedStay.rooms?.number}` : 'À emporter');

        const orderNumber = currentOrder?.order_number || lastOrderNumber || 'Nouvelle';
        const server = servers.find(s => s.id === selectedServer);
        const serverDisplayName = server 
          ? `${server.first_name} ${server.last_name}` 
          : (serverName || 'Non spécifié');

        doc.open();
        doc.write(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>${ticket.title}</title>
            <style>
              @page { size: 80mm auto; margin: 0; }
              body { font-family: 'Courier New', monospace; width: 80mm; margin: 0; padding: 10px; font-size: 12px; color: #000; }
              .header { text-align: center; border-bottom: 2px dashed #000; padding-bottom: 8px; margin-bottom: 8px; }
              .header h1 { margin: 0; font-size: 16px; }
              .title { background: #000; color: #fff; padding: 4px; text-align: center; font-weight: bold; margin: 8px 0; }
              .info { margin: 8px 0; font-size: 11px; }
              .info-row { display: flex; justify-content: space-between; margin: 3px 0; }
              .items { border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 8px 0; margin: 8px 0; }
              .item { display: flex; justify-content: space-between; margin: 4px 0; font-size: 13px; font-weight: bold; }
              .item-qty { width: 40px; text-align: center; }
              .footer { text-align: center; font-size: 10px; margin-top: 12px; border-top: 2px dashed #000; padding-top: 8px; }
              @media print { body { margin: 0; padding: 5px; } }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>LA VIDA-LOCA</h1>
              <div>Restaurant & Bar</div>
            </div>
            <div class="title">${isKitchen ? '👨‍🍳 BON DE CUISINE' : '🍹 BON DE BAR'}</div>
            <div class="info">
              <div class="info-row"><span>N° Commande:</span><span><strong>${orderNumber}</strong></span></div>
              <div class="info-row"><span>Destination:</span><span><strong>${locationText}</strong></span></div>
              <div class="info-row"><span>Serveur:</span><span><strong>${serverDisplayName}</strong></span></div>
              <div class="info-row"><span>Heure:</span><span><strong>${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</strong></span></div>
              ${orderType === 'DELIVERY' ? `<div class="info-row"><span>Livraison:</span><span><strong>${deliveryAddress}</strong></span></div>` : ''}
            </div>
            <div class="items">
              ${ticket.items.map((item: any) => `
                <div class="item">
                  <span class="item-qty">${item.quantity}×</span>
                  <span style="flex: 1;">${item.item_name}${item.isIncrement ? ' (ajout)' : ''}</span>
                </div>
              `).join('')}
            </div>
            <div class="footer">
              <div>⏰ ${ticket.title}</div>
              <div style="margin-top: 4px;">Merci de préparer rapidement !</div>
            </div>
            <script>
              window.onload = function() {
                setTimeout(function() {
                  window.print();
                  setTimeout(function() {
                    if (window.parent && window.parent.document.body.contains(window.frameElement)) {
                      window.parent.document.body.removeChild(window.frameElement);
                    }
                  }, 500);
                }, 300);
              };
            </script>
          </body>
          </html>
        `);
        doc.close();
      }, index * 800);
    });
  };

  const handleValidateAndSendToCashier = async () => {
    if (localOrderItems.length === 0) { 
      setError('Ajoutez au moins un article.'); 
      return; 
    }
    if (!selectedServer) { 
      setError('Veuillez sélectionner un serveur.'); 
      return; 
    }
    if (orderType === 'DELIVERY' && !deliveryAddress.trim()) {
      setError('Veuillez saisir l\'adresse de livraison.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const orderNumber = currentOrder?.order_number || `CMD-${Date.now().toString().slice(-6)}`;
      let orderIdToUse = currentOrder?.id;

      const finalStatus = chargeToRoom ? 'ROOM_CHARGE' : 'READY';

      console.log('🔄 Début de la validation...', {
        orderIdToUse,
        itemsCount: localOrderItems.length,
        cartTotal,
        isRoomCharge: chargeToRoom,
        finalStatus
      });

      if (!orderIdToUse) {
        const { data: newOrder, error: orderError } = await supabase
          .from('restaurant_orders')
          .insert({
            site_id: siteId,
            order_number: orderNumber,
            table_id: table?.id || null,
            room_id: chargeToRoom ? selectedStay?.rooms?.id : null,
            stay_id: chargeToRoom ? selectedStay?.id : null,
            server_id: selectedServer,
            order_type: orderType,
            status: finalStatus,
            total_amount: cartTotal,
            notes: orderType === 'DELIVERY' ? `📍 Livraison: ${deliveryAddress}` : (currentOrder?.notes || ''),
            created_by: user?.id,
            sent_at: new Date().toISOString(),
          })
          .select('id')
          .single();

        if (orderError) throw new Error(`Erreur création commande: ${orderError.message}`);
        orderIdToUse = newOrder.id;
        console.log('✅ Nouvelle commande créée:', orderIdToUse);
      } else {
        const { error: updateError } = await supabase
          .from('restaurant_orders')
          .update({
            total_amount: cartTotal,
            status: finalStatus,
            order_type: orderType,
            notes: orderType === 'DELIVERY' ? `📍 Livraison: ${deliveryAddress}` : (currentOrder?.notes || ''),
            sent_at: new Date().toISOString(),
          })
          .eq('id', orderIdToUse);

        if (updateError) throw new Error(`Erreur update commande: ${updateError.message}`);

        
      }

     // ✅ Utiliser upsert au lieu de insert pour éviter les conflits 409
for (let i = 0; i < localOrderItems.length; i++) {
  const item = localOrderItems[i];
  const { error: itemError } = await supabase
    .from('restaurant_order_items')
    .upsert({
      order_id: orderIdToUse,
      menu_item_id: item.menu_item_id,
      item_name: item.item_name,
      quantity: item.quantity,
      unit_price: item.unit_price,
      total_price: item.total_price,
      notes: item.notes,
      destination: item.destination,
      status: 'PENDING',
    }, {
      onConflict: 'order_id,menu_item_id'
    });

  if (itemError) {
    console.error('Erreur insertion article:', itemError);
    throw new Error(`Erreur insertion article: ${itemError.message}`);
  }
}

      if (chargeToRoom && selectedStay && orderIdToUse) {
        const newFolioBalance = (selectedStay.folio_balance || 0) + cartTotal;
        
        await supabase.from('stays').update({ 
          folio_balance: newFolioBalance 
        }).eq('id', selectedStay.id);

        await supabase.from('room_charges').insert({
          site_id: siteId,
          stay_id: selectedStay.id,
          room_id: selectedStay.rooms?.id || null,
          order_id: orderIdToUse,
          charge_type: 'RESTAURANT',
          description: `Restaurant - Commande ${orderNumber}`,
          amount: cartTotal,
          charge_date: new Date().toISOString().split('T')[0],
          charged_by: user?.id
        });
        console.log('✅ Room Charge imputé au folio');
      }

      if (table) {
        const newTableStatus = chargeToRoom ? 'DIRTY' : 'OCCUPIED';
        
        await supabase.from('restaurant_tables').update({
          status: newTableStatus,
        }).eq('id', table.id);
        
        console.log(`🪑 Table ${table.number} → statut ${newTableStatus}`);
      }

      if (!chargeToRoom) {
        const paymentEvent = new CustomEvent('navigate-to-payment', {
          detail: { 
            orderId: orderIdToUse, 
            tableNumber: table?.number, 
            orderNumber: orderNumber 
          }
        });
        window.dispatchEvent(paymentEvent);
      }
await new Promise(resolve => setTimeout(resolve, 500));
      setLastOrderNumber(orderNumber);
      setLoading(false);
      onSuccess();
      
      if (chargeToRoom) {
        alert(`✅ Commande imputée à la chambre ${selectedStay?.rooms?.number} !\n\nN° ${orderNumber}\nMontant : ${Number(cartTotal).toLocaleString('fr-FR')} F\n\nLe paiement se fera au check-out du client.`);
      } else {
        alert(`✅ Commande validée et envoyée à la caisse !\n\nN° ${orderNumber}\nMontant : ${Number(cartTotal).toLocaleString('fr-FR')} F`);
      }
      
    } catch (err: any) {
      console.error('❌ Erreur complète:', err);
      setError(err.message || 'Une erreur est survenue');
      setLoading(false);
    }
  };

  const handlePrintAllTickets = async () => {
    if (localOrderItems.length === 0) {
      setError('Aucun article à imprimer.');
      return;
    }
    if (allTicketsPrinted) {
      setError('⚠️ Les tickets ont déjà été imprimés. Utilisez "Imprimer les ajouts".');
      return;
    }

    const itemsToPrint = getItemsToPrint('all');
    if (itemsToPrint.length === 0) {
      setError('Aucun article à imprimer.');
      return;
    }

    const kitchenItems = itemsToPrint.filter(i => i.destination === 'KITCHEN' || i.destination === 'BOTH');
    const barItems = itemsToPrint.filter(i => i.destination === 'BAR' || i.destination === 'BOTH');

    const ticketsToPrint = [];
    if (kitchenItems.length > 0) ticketsToPrint.push({ type: 'kitchen', items: kitchenItems, title: 'Tous les articles - Cuisine' });
    if (barItems.length > 0) ticketsToPrint.push({ type: 'bar', items: barItems, title: 'Tous les articles - Bar' });

    if (ticketsToPrint.length > 0) {
      printTickets(ticketsToPrint);
      
      const newPrintedQuantities = new Map<string, number>();
      localOrderItems.forEach(item => newPrintedQuantities.set(item.menu_item_id, item.quantity));
      setPrintedQuantities(newPrintedQuantities);
      setAllTicketsPrinted(true);
      setPrintSuccess(true);
      
      alert(`✅ Tous les tickets imprimés !\n👨‍🍳 Cuisine: ${kitchenItems.reduce((sum, i) => sum + i.quantity, 0)}\n🍹 Bar: ${barItems.reduce((sum, i) => sum + i.quantity, 0)}`);
    }
  };

  const handlePrintNewItems = async () => {
    const newItems = getItemsToPrint('new');
    if (newItems.length === 0) {
      setError('Aucun nouvel article ou augmentation à imprimer.');
      return;
    }

    const kitchenItems = newItems.filter(i => i.destination === 'KITCHEN' || i.destination === 'BOTH');
    const barItems = newItems.filter(i => i.destination === 'BAR' || i.destination === 'BOTH');

    const ticketsToPrint = [];
    if (kitchenItems.length > 0) ticketsToPrint.push({ type: 'kitchen', items: kitchenItems, title: `NOUVEAUX ARTICLES - Cuisine` });
    if (barItems.length > 0) ticketsToPrint.push({ type: 'bar', items: barItems, title: `NOUVEAUX ARTICLES - Bar` });

    if (ticketsToPrint.length > 0) {
      printTickets(ticketsToPrint);
      
      const updatedPrintedQuantities = new Map(printedQuantities);
      newItems.forEach(item => {
        const currentPrinted = updatedPrintedQuantities.get(item.menu_item_id) || 0;
        updatedPrintedQuantities.set(item.menu_item_id, currentPrinted + item.quantity);
      });
      setPrintedQuantities(updatedPrintedQuantities);
      setPrintSuccess(true);
      
      alert(`✅ Nouveaux articles imprimés !\n👨‍🍳 Cuisine: ${kitchenItems.reduce((sum, i) => sum + i.quantity, 0)}\n🍹 Bar: ${barItems.reduce((sum, i) => sum + i.quantity, 0)}`);
    }
  };

  if (!isOpen) return null;

  const currentCategoryItems = menuItems.filter(i => 
    i.category_id === activeCategory &&
    (!menuSearchTerm || i.name.toLowerCase().includes(menuSearchTerm.toLowerCase()))
  );
  const isPaid = currentOrder?.status === 'PAID';
  const isRoomCharge = chargeToRoom && selectedStay;
  const isAlreadyAtCashier = currentOrder?.status === 'READY' || currentOrder?.status === 'PAID';

  const locationText = table 
    ? (isRoomCharge ? `Table ${table.number} ➔ Chambre ${selectedStay?.rooms?.number}` : `Table ${table.number}`)
    : (isRoomCharge ? `Chambre ${selectedStay?.rooms?.number}` : 'Commande directe');

  const itemsWithNewQty = getItemsToPrint('new');
  const newItemsCount = itemsWithNewQty.length;
  const newTotalQty = itemsWithNewQty.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-7xl max-h-[95vh] overflow-hidden flex flex-col">
        <div className={`px-6 py-4 flex items-center justify-between rounded-t-xl z-10 text-white flex-shrink-0 ${
          isRoomCharge ? 'bg-gradient-to-r from-indigo-600 to-purple-700' :
          isPaid ? 'bg-gradient-to-r from-emerald-600 to-green-700' :
          'bg-gradient-to-r from-amber-600 to-orange-700'
        }`}>
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              <ShoppingCart className="w-6 h-6" />
              {locationText}
              {currentOrder && <span className="text-sm bg-white/20 px-2 py-0.5 rounded ml-2">#{currentOrder.order_number}</span>}
              {isRoomCharge && (
                <span className="text-xs bg-white/30 px-2 py-1 rounded ml-2 flex items-center gap-1">
                  <Hotel className="w-3 h-3" />
                  Chambre {selectedStay?.rooms?.number}
                </span>
              )}
            </h2>
            <p className="text-xs opacity-90">
              {currentOrder ? `Statut: ${currentOrder.status} • ${serverName}` : 'Nouvelle commande'}
              {isRoomCharge && ` • Client: ${selectedStay?.customers?.first_name} ${selectedStay?.customers?.last_name}`}
            </p>
          </div>
          <button onClick={onClose} className="hover:bg-white/20 p-2 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div ref={modalContentRef} className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-4">
            {error && (
              <div className="bg-red-50 text-red-700 p-3 rounded-lg border border-red-200 text-sm flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {lastOrderNumber && !isPaid && (
              <div className="bg-emerald-50 border-2 border-emerald-300 p-3 rounded-lg flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-emerald-700" />
                <div className="flex-1">
                  <div className="font-semibold text-emerald-900 text-sm">✅ Commande envoyée {printSuccess ? '& imprimée' : ''} !</div>
                  <div className="text-xs text-emerald-700">
                    N° {lastOrderNumber}
                    {isRoomCharge && ` • Imputée à la chambre ${selectedStay?.rooms?.number}`}
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">👤 Serveur *</label>
                <select
                  value={selectedServer}
                  onChange={(e) => setSelectedServer(e.target.value)}
                  className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
                >
                  <option value="">-- Sélectionner un serveur --</option>
                  {servers.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.first_name} {s.last_name} ({s.role})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Type de commande</label>
                <div className="flex gap-1 flex-wrap">
                  <button
                    onClick={() => { setOrderType('DINE_IN'); setChargeToRoom(false); }}
                    disabled={!!table}
                    className={`flex-1 min-w-[80px] text-xs py-2 rounded border-2 transition-colors ${
                      orderType === 'DINE_IN' && !chargeToRoom 
                        ? 'border-amber-500 bg-amber-50 text-amber-900' 
                        : 'border-slate-200 bg-white text-slate-600'
                    } ${!!table ? 'opacity-60 cursor-not-allowed' : 'hover:bg-slate-50'}`}
                  >
                    🍽️ Sur place
                  </button>

                  <button
                    onClick={() => { setOrderType('TAKEAWAY'); setChargeToRoom(false); }}
                    disabled={!!table}
                    className={`flex-1 min-w-[80px] text-xs py-2 rounded border-2 transition-colors ${
                      orderType === 'TAKEAWAY' 
                        ? 'border-amber-500 bg-amber-50 text-amber-900' 
                        : 'border-slate-200 bg-white text-slate-600'
                    } ${!!table ? 'opacity-60 cursor-not-allowed' : 'hover:bg-slate-50'}`}
                  >
                    🥡 À emporter
                  </button>

                  <button
                    onClick={() => { setOrderType('DELIVERY'); setChargeToRoom(false); }}
                    disabled={!!table}
                    className={`flex-1 min-w-[80px] text-xs py-2 rounded border-2 transition-colors ${
                      orderType === 'DELIVERY' 
                        ? 'border-amber-500 bg-amber-50 text-amber-900' 
                        : 'border-slate-200 bg-white text-slate-600'
                    } ${!!table ? 'opacity-60 cursor-not-allowed' : 'hover:bg-slate-50'}`}
                  >
                    🛵 À livrer
                  </button>

                  <button
                    onClick={() => { setOrderType('ROOM_SERVICE'); setChargeToRoom(true); }}
                    className={`flex-1 min-w-[80px] text-xs py-2 rounded border-2 transition-colors ${
                      chargeToRoom 
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-900' 
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    🛎️ Chambre
                  </button>
                </div>
                
                {table && (
                  <p className="text-xs text-amber-700 mt-1.5 flex items-center gap-1 bg-amber-50 px-2 py-1 rounded border border-amber-200">
                    ℹ️ Type <strong>"Sur place"</strong> sélectionné automatiquement pour la table {table.number}.
                  </p>
                )}
              </div>
            </div>

            {orderType === 'DELIVERY' && (
              <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-3 mt-2">
                <label className="block text-xs font-medium text-blue-900 mb-1">📍 Adresse de livraison *</label>
                <input
                  type="text"
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  placeholder="Ex: Ouaga 2000, Secteur 15, Maison n°42..."
                  className="w-full border border-blue-300 rounded px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            )}

            {chargeToRoom && (
              <div className="bg-indigo-50 border-2 border-indigo-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Hotel className="w-5 h-5 text-indigo-700" />
                  <h3 className="font-semibold text-indigo-900">Sélectionner la chambre du client</h3>
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
                    </div>
                    <button
                      onClick={() => { setSelectedStay(null); setChargeToRoom(false); }}
                      className="mt-2 text-xs text-red-600 hover:text-red-800"
                    >
                      ✕ Changer de chambre
                    </button>
                  </div>
                ) : (
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {occupiedRooms.filter(r => r.rooms?.number?.toLowerCase().includes(searchRoom.toLowerCase())).map(stay => (
                      <button
                        key={stay.id}
                        onClick={() => setSelectedStay(stay)}
                        className="w-full text-left p-2 bg-white hover:bg-indigo-100 rounded border border-slate-200 hover:border-indigo-400 transition"
                      >
                        <div className="font-semibold text-sm text-slate-900">🛏️ Chambre {stay.rooms?.number}</div>
                        <div className="text-xs text-slate-600"> {stay.customers?.first_name} {stay.customers?.last_name}</div>
                      </button>
                    ))}
                    {occupiedRooms.length === 0 && (
                      <div className="text-center py-4 text-sm text-slate-500">Aucune chambre occupée trouvée</div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {!isPaid && (
  <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
    <div className="bg-slate-100 px-4 py-3 border-b border-slate-200">
      <h3 className="font-semibold text-slate-900 text-sm mb-2"> Menu</h3>
      <div className="relative mb-2">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
        <input
          type="text"
          placeholder="Rechercher un article..."
          value={menuSearchTerm}
          onChange={(e) => setMenuSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent"
        />
      </div>
      
      {/* ✅ NOUVEAU : Bouton Favoris + Catégories */}
      <div className="flex gap-1 overflow-x-auto">
        {favorites.length > 0 && (
          <button
            onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
            className={`flex items-center gap-1 px-3 py-2 rounded text-sm font-medium whitespace-nowrap ${
              showFavoritesOnly ? 'bg-amber-500 text-white' : 'bg-white text-slate-700 hover:bg-slate-200'
            }`}
          >
             Favoris ({favorites.length})
          </button>
        )}
        {categories.map(cat => (
          <button
            key={cat.id}
            onClick={() => { setActiveCategory(cat.id); setShowFavoritesOnly(false); }}
            className={`flex items-center gap-1 px-3 py-2 rounded text-sm font-medium whitespace-nowrap ${
              activeCategory === cat.id && !showFavoritesOnly ? 'bg-amber-500 text-white' : 'bg-white text-slate-700 hover:bg-slate-200'
            }`}
          >
            <span>{cat.icon || '️'}</span> {cat.name}
          </button>
        ))}
      </div>
    </div>
    
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3 max-h-96 overflow-y-auto">
      {(showFavoritesOnly 
        ? menuItems.filter(item => favorites.includes(item.id))
        : currentCategoryItems
      ).map(item => (
        <div key={item.id} className="relative">
          <button
            onClick={() => addToCart(item)}
            className="w-full bg-white border-2 border-slate-200 hover:border-amber-400 rounded-lg p-3 text-left transition-colors hover:shadow-sm"
          >
            <div className="font-semibold text-sm text-slate-900">{item.name}</div>
            <div className="text-amber-700 font-bold text-sm mt-2">
              {Number(item.price).toLocaleString('fr-FR')} F
            </div>
            <div className="text-[10px] text-slate-400 mt-1">
              {item.destination === 'KITCHEN' ? '👨‍🍳 Cuisine' : item.destination === 'BAR' ? '🍹 Bar' : '👨‍🍳 Les deux'}
            </div>
          </button>
          {/* ✅ Bouton favori (étoile) */}
          <button
            onClick={(e) => { e.stopPropagation(); toggleFavorite(item.id); }}
            className={`absolute top-1 right-1 w-6 h-6 rounded-full flex items-center justify-center text-xs ${
              favorites.includes(item.id) ? 'bg-amber-400 text-white' : 'bg-slate-200 text-slate-400 hover:bg-slate-300'
            }`}
            title={favorites.includes(item.id) ? 'Retirer des favoris' : 'Ajouter aux favoris'}
          >
            {favorites.includes(item.id) ? '★' : '☆'}
          </button>
        </div>
      ))}
      {(showFavoritesOnly ? menuItems.filter(item => favorites.includes(item.id)) : currentCategoryItems).length === 0 && (
        <div className="col-span-full text-center py-8 text-slate-500 text-sm">
          {showFavoritesOnly ? 'Aucun favori. Cliquez sur ☆ pour en ajouter.' : 'Aucun article trouvé'}
        </div>
      )}
    </div>
  </div>
)}

              <div className="border-2 border-amber-200 rounded-lg bg-amber-50 flex flex-col">
                <div className="px-4 py-3 border-b border-amber-200 bg-amber-100">
                  <h3 className="font-semibold text-amber-900 flex items-center gap-2">
                    <ShoppingCart className="w-5 h-5" />
                    Panier ({localOrderItems.reduce((sum, i) => sum + i.quantity, 0)} articles)
                    {isAlreadyAtCashier && (
                      <span className="ml-auto text-xs bg-slate-200 text-slate-700 px-2 py-1 rounded flex items-center gap-1">
                        <Lock className="w-3 h-3" /> Envoyée en caisse
                      </span>
                    )}

                    {!isAlreadyAtCashier && newItemsCount > 0 && (
                      <span className="ml-auto text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded flex items-center gap-1">
                        🆕 {newTotalQty} à imprimer
                      </span>
                    )}
                    {allTicketsPrinted && newItemsCount === 0 && (
                      <span className="ml-auto text-xs bg-emerald-100 text-emerald-800 px-2 py-1 rounded flex items-center gap-1">
                        <Lock className="w-3 h-3" /> Tous imprimés
                      </span>
                    )}
                  </h3>
                </div>

                <div className="flex-1 overflow-y-auto max-h-96 p-3">
                  {localOrderItems.length === 0 ? (
                    <p className="text-sm text-slate-500 text-center py-8">Panier vide</p>
                  ) : (
                    <div className="space-y-2">
                      {localOrderItems.map(item => {
                        const printedQty = printedQuantities.get(item.menu_item_id) || 0;
                        const newQty = item.quantity - printedQty;
                        const hasNewQty = newQty > 0;
                        
                        return (
                          <div
                            key={`${item.menu_item_id}-${item.unit_price}`}
                            className={`flex items-center justify-between bg-white p-2 rounded border ${
                              hasNewQty ? 'border-blue-400 bg-blue-50' : 'border-slate-200'
                            }`}
                          >
                            <div className="flex-1">
                              <div className="font-medium text-sm flex items-center gap-2 flex-wrap">
                                {item.item_name}
                                {hasNewQty && (
                                  <span className="text-xs bg-blue-500 text-white px-1.5 py-0.5 rounded">
                                    {printedQty > 0 ? `+${newQty}` : `${newQty} nouveau`}
                                  </span>
                                )}
                                {printedQty > 0 && !hasNewQty && (
                                  <span className="text-xs bg-slate-300 text-slate-700 px-1.5 py-0.5 rounded">
                                    ✓ imprimé
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-slate-500">
                                {Number(item.unit_price).toLocaleString('fr-FR')} F × {item.quantity}
                              </div>
                            </div>
                            {!isAlreadyAtCashier && (
                              <div className="flex items-center gap-2">
                                <button onClick={() => updateQuantity(item.menu_item_id, -1)} className="bg-slate-200 hover:bg-slate-300 w-6 h-6 rounded flex items-center justify-center">
                                  <Minus className="w-3 h-3" />
                                </button>
                                <span className="font-bold text-sm w-6 text-center">{item.quantity}</span>
                                <button onClick={() => updateQuantity(item.menu_item_id, 1)} className="bg-slate-200 hover:bg-slate-300 w-6 h-6 rounded flex items-center justify-center">
                                  <Plus className="w-3 h-3" />
                                </button>
                                <span className="font-bold text-sm w-20 text-right">
                                  {Number(item.total_price).toLocaleString('fr-FR')} F
                                </span>
                                <button onClick={() => removeFromCart(item.menu_item_id)} className="text-red-600 hover:text-red-800 p-1">
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="border-t-2 border-amber-300 bg-amber-100 p-4">
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-lg font-bold text-amber-900">Total</span>
                    <span className="text-2xl font-bold text-amber-900">
                      {Number(cartTotal).toLocaleString('fr-FR')} F
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={handlePrintAllTickets}
                      disabled={loading || localOrderItems.length === 0 || allTicketsPrinted}
                      className={`font-semibold py-2 px-2 rounded-lg disabled:opacity-50 flex flex-col items-center justify-center gap-1 text-xs ${
                        allTicketsPrinted
                          ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                          : 'bg-blue-600 hover:bg-blue-700 text-white'
                      }`}
                    >
                      {allTicketsPrinted ? <><Lock className="w-4 h-4" /><span>Déjà imprimé</span></> : <><Printer className="w-4 h-4" /><span>Imprimer tout</span></>}
                    </button>

                    <button
                      onClick={handlePrintNewItems}
                      disabled={loading || newItemsCount === 0}
                      className={`font-semibold py-2 px-2 rounded-lg disabled:opacity-50 flex flex-col items-center justify-center gap-1 text-xs ${
                        newItemsCount > 0 ? 'bg-purple-600 hover:bg-purple-700 text-white' : 'bg-slate-300 text-slate-500'
                      }`}
                    >
                      <FileText className="w-4 h-4" />
                      <span>Ajouts ({newTotalQty})</span>
                    </button>

                    <button
                      onClick={handleValidateAndSendToCashier}
                      disabled={
                        loading || 
                        localOrderItems.length === 0 || 
                        !selectedServer || 
                        (chargeToRoom && !selectedStay) ||
                        (orderType === 'DELIVERY' && !deliveryAddress.trim()) ||
                        isAlreadyAtCashier
                      }
                      className={`font-semibold py-2 px-2 rounded-lg flex flex-col items-center justify-center gap-1 text-xs transition-colors ${
                        isAlreadyAtCashier
                          ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                          : 'bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50'
                      }`}
                      title={isAlreadyAtCashier ? "Cette commande a déjà été envoyée à la caisse et ne peut plus être modifiée." : "Valider et envoyer à la caisse"}
                    >
                      {isAlreadyAtCashier ? (
                        <>
                          <Lock className="w-4 h-4" />
                          <span>Déjà en caisse</span>
                        </>
                      ) : (
                        <>
                          <DollarSign className="w-4 h-4" />
                          <span>Valider & Caisse</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <button 
              onClick={onClose} 
              className="w-full bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold py-2 rounded-lg"
            >
              Fermer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
