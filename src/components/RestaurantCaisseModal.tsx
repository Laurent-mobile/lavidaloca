'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { X, DollarSign, TrendingUp, TrendingDown, Printer, ShoppingCart, CheckCircle, Clock, AlertCircle, CreditCard, Smartphone, Banknote, FileText, Hotel, Plus, Receipt, RotateCcw } from 'lucide-react';

interface Props {
  siteId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface PendingOrder {
  id: string;
  order_number: string;
  table_id: string | null;
  table_number?: string;
  total_amount: number;
  status: string;
  created_at: string;
  server_name?: string;
  items: any[];
  stay_id?: string;
  room_number?: string;
  guest_name?: string;
}

const paymentMethods = [
  { id: 'CASH', label: 'Espèces', icon: Banknote, color: 'emerald' },
  { id: 'CARD', label: 'Carte bancaire', icon: CreditCard, color: 'blue' },
  { id: 'MOBILE_MONEY', label: 'Mobile Money', icon: Smartphone, color: 'purple' },
  { id: 'CHECK', label: 'Chèque', icon: FileText, color: 'amber' },
  { id: 'BANK_TRANSFER', label: 'Virement', icon: Banknote, color: 'indigo' },
  { id: 'ROOM_CHARGE', label: 'Imputer à une chambre', icon: Hotel, color: 'indigo' }
];

const expenseCategories = [
  { id: 'SUPPLIES', label: 'Fournitures', icon: '🧴' },
  { id: 'FOOD', label: 'Nourriture', icon: '🍽️' },
  { id: 'TRANSPORT', label: 'Transport', icon: '🚗' },
  { id: 'MAINTENANCE', label: 'Maintenance', icon: '🔧' },
  { id: 'OTHER', label: 'Autre', icon: '📦' },
];

export default function RestaurantCaisseModal({ siteId, isOpen, onClose, onSuccess }: Props) {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'pending' | 'room_charges' | 'history'>('pending');
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const [roomCharges, setRoomCharges] = useState<PendingOrder[]>([]);
  const [paidTransactions, setPaidTransactions] = useState<any[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<PendingOrder | null>(null);
  const [showPayment, setShowPayment] = useState(false);
  const [amountReceived, setAmountReceived] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [reportDate, setReportDate] = useState(new Date().toISOString().split('T')[0]);
  
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseCategory, setExpenseCategory] = useState('OTHER');
  const [expenseDescription, setExpenseDescription] = useState('');
  const [expenseNote, setExpenseNote] = useState('');
  const [activeStays, setActiveStays] = useState<any[]>([]);
  const [selectedStayId, setSelectedStayId] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadPendingOrders();
      loadRoomCharges();
      loadPaidTransactions();
      loadActiveStays();
    }
  }, [isOpen, reportDate]);

  useEffect(() => {
    const handleNavigateToPayment = async (event: any) => {
      const orderId = event.detail?.orderId;
      if (orderId) {
        await new Promise(resolve => setTimeout(resolve, 300));
        await loadPendingOrders();
        setTimeout(() => {
          loadPendingOrders().then(() => {
            const order = pendingOrders.find(o => o.id === orderId);
            if (order) {
              setSelectedOrder(order);
              setActiveTab('pending');
              setShowPayment(true);
              setAmountReceived(order.total_amount.toString());
            } else {
              supabase
                .from('restaurant_orders')
                .select(`
                  id, order_number, table_id, total_amount, status, created_at, server_id,
                  restaurant_order_items(id, item_name, quantity, unit_price, total_price),
                  restaurant_tables(number),
                  restaurant_employees(first_name, last_name)
                `)
                .eq('id', orderId)
                .maybeSingle()
                .then(({ data }) => {
                  if (data) {
                    const formatted = {
                      ...data,
                      table_number: data.restaurant_tables?.[0]?.number || 'Direct',
                      server_name: data.restaurant_employees?.[0]
                        ? `${data.restaurant_employees[0].first_name} ${data.restaurant_employees[0].last_name}`
                        : 'Inconnu',
                      items: data.restaurant_order_items || []
                    };
                    setSelectedOrder(formatted);
                    setActiveTab('pending');
                    setShowPayment(true);
                    setAmountReceived(formatted.total_amount.toString());
                  }
                });
            }
          });
        }, 400);
      }
    };

    window.addEventListener('navigate-to-payment', handleNavigateToPayment);
    return () => window.removeEventListener('navigate-to-payment', handleNavigateToPayment);
  }, [pendingOrders]);

  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => {
      loadPendingOrders();
      loadPaidTransactions();
    }, 10000);
    return () => clearInterval(interval);
  }, [isOpen]);

  const loadPendingOrders = async () => {
    setLoading(true);
    try {
      const { data: orders, error } = await supabase
        .from('restaurant_orders')
        .select(`
          id, order_number, table_id, total_amount, status, created_at, server_id,
          restaurant_order_items(id, item_name, quantity, unit_price, total_price),
          restaurant_tables(number),
          restaurant_employees(first_name, last_name)
        `)
        .eq('site_id', siteId)
        .in('status', ['READY', 'ready', 'SERVED'])
        .order('created_at', { ascending: true });

      if (error) throw error;

      const formattedOrders: PendingOrder[] = (orders || []).map(order => ({
        id: order.id,
        order_number: order.order_number,
        table_id: order.table_id,
        table_number: order.restaurant_tables?.[0]?.number || 'Direct',
        total_amount: order.total_amount || 0,
        status: order.status,
        created_at: order.created_at,
        server_name: order.restaurant_employees?.[0]
          ? `${order.restaurant_employees[0].first_name} ${order.restaurant_employees[0].last_name}` 
          : 'Inconnu',
        items: order.restaurant_order_items || []
      }));

      setPendingOrders(formattedOrders);
    } catch (error) {
      console.error('Erreur chargement commandes en attente:', error);
    } finally {
      setLoading(false);
    }
  };

    const loadActiveStays = async () => {
    const { data, error } = await supabase
      .from('stays')
      .select(`id, folio_balance, rooms(number), customers(first_name, last_name)`)
      .eq('site_id', siteId)
      .eq('status', 'IN_HOUSE')
      .order('check_in_at', { ascending: false });
    
    if (error) {
      console.error('Erreur chargement séjours actifs:', error);
      setActiveStays([]);
      return;
    }
    
    // ✅ CORRECTION : Formater les données car Supabase retourne les jointures en tableaux
    const formatted = (data || []).map(stay => ({
      ...stay,
      rooms: stay.rooms?.[0] || null,
      customers: stay.customers?.[0] || { first_name: 'Client', last_name: 'Inconnu' }
    }));
    
    setActiveStays(formatted);
  };

  const loadRoomCharges = async () => {
    try {
      const { data: orders, error } = await supabase
        .from('restaurant_orders')
        .select(`
          id, order_number, table_id, total_amount, status, created_at, server_id, stay_id,
          restaurant_order_items(id, item_name, quantity, unit_price, total_price),
          restaurant_tables(number),
          restaurant_employees(first_name, last_name),
          stays(folio_balance, rooms(number), customers(first_name, last_name))
        `)
        .eq('site_id', siteId)
        .eq('status', 'ROOM_CHARGE')
        .order('created_at', { ascending: true });

      if (error) throw error;

      const formattedCharges: PendingOrder[] = (orders || []).map(order => {
        const stay = order.stays?.[0];
        return {
          id: order.id,
          order_number: order.order_number,
          table_id: order.table_id,
          table_number: order.restaurant_tables?.[0]?.number || 'Direct',
          total_amount: order.total_amount || 0,
          status: order.status,
          created_at: order.created_at,
          server_name: order.restaurant_employees?.[0]
            ? `${order.restaurant_employees[0].first_name} ${order.restaurant_employees[0].last_name}` 
            : 'Inconnu',
          items: order.restaurant_order_items || [],
          stay_id: order.stay_id,
          room_number: stay?.rooms?.[0]?.number,
          guest_name: stay?.customers?.[0]
            ? `${stay.customers[0].first_name} ${stay.customers[0].last_name}` 
            : undefined
        };
      });

      setRoomCharges(formattedCharges);
    } catch (error) {
      console.error('Erreur chargement room charges:', error);
    }
  };

  const loadPaidTransactions = async () => {
    try {
      const startOfDay = new Date(reportDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(reportDate);
      endOfDay.setHours(23, 59, 59, 999);

      const { data, error } = await supabase
        .from('restaurant_cash_transactions')
        .select('*')
        .eq('site_id', siteId)
        .eq('status', 'PAID')
        .gte('transaction_date', startOfDay.toISOString())
        .lte('transaction_date', endOfDay.toISOString())
        .order('transaction_date', { ascending: false });

      if (!error) setPaidTransactions(data || []);
    } catch (error) {
      console.error('Erreur chargement historique:', error);
    }
  };

  const handleAddExpense = async () => {
    if (!expenseAmount || parseFloat(expenseAmount) <= 0) {
      alert('Veuillez saisir un montant valide.');
      return;
    }
    if (!expenseDescription.trim()) {
      alert('Veuillez décrire la dépense.');
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { error } = await supabase.from('restaurant_cash_transactions').insert({
        site_id: siteId,
        type: 'EXPENSE',
        category: expenseCategory,
        amount: parseFloat(expenseAmount),
        payment_method: 'CASH',
        status: 'PAID',
        provider_name: 'Caisse Restaurant',
        description: expenseDescription,
        notes: expenseNote,
        received_by: user?.id,
        transaction_date: new Date().toISOString(),
      });

      if (error) throw error;

      alert('✅ Dépense enregistrée avec succès !');
      setShowExpenseForm(false);
      setExpenseAmount('');
      setExpenseCategory('OTHER');
      setExpenseDescription('');
      setExpenseNote('');
      await loadPaidTransactions();
      onSuccess();
    } catch (error: any) {
      console.error('Erreur enregistrement dépense:', error);
      alert(`Erreur: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleReprintReceipt = async (transaction: any) => {
    try {
      let orderItems: any[] = [];
      if (transaction.reference_id && transaction.reference_table === 'restaurant_orders') {
        const { data: orderData, error: orderError } = await supabase
          .from('restaurant_orders')
          .select(`
            order_number,
            restaurant_order_items(id, item_name, quantity, unit_price, total_price),
            restaurant_tables(number),
            restaurant_employees(first_name, last_name)
          `)
          .eq('id', transaction.reference_id)
          .maybeSingle();

        if (orderError) {
          console.error('Erreur chargement commande:', orderError);
        } else if (orderData) {
          orderItems = orderData.restaurant_order_items || [];
          transaction.order_number = orderData.order_number;
          transaction.table_number = orderData.restaurant_tables?.[0]?.number || 'Direct';
          transaction.server_name = orderData.restaurant_employees?.[0]
            ? `${orderData.restaurant_employees[0].first_name} ${orderData.restaurant_employees[0].last_name}` 
            : 'Inconnu';
        }
      }

      const printWindow = window.open('', '_blank', 'width=300,height=600');
      if (!printWindow) return;

      const methodLabels: any = {
        'CASH': '💵 Espèces',
        'CARD': '💳 Carte',
        'MOBILE_MONEY': '📱 Mobile Money',
        'CHECK': '📝 Chèque',
        'BANK_TRANSFER': '🏦 Virement'
      };

      printWindow.document.write(`
        <html>
        <head>
          <title>Duplicata ${transaction.receipt_number}</title>
          <style>
            body { font-family: 'Courier New', monospace; font-size: 12px; margin: 0; padding: 10px; width: 80mm; }
            .center { text-align: center; }
            .row { display: flex; justify-content: space-between; margin: 4px 0; }
            .divider { border-top: 1px dashed #000; margin: 8px 0; }
            .bold { font-weight: bold; }
            .duplicate { background: #fbbf24; color: #78350f; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: bold; display: inline-block; margin-bottom: 8px; }
          </style>
        </head>
        <body>
          <div class="center">
            <div class="bold" style="font-size: 16px;">LA VIDA-LOCA</div>
            <div>Restaurant & Bar</div>
            <div class="divider"></div>
            <div class="duplicate">📄 DUPLICATA</div>
            <div class="bold">TICKET DE CAISSE</div>
            <div>N° ${transaction.receipt_number || 'N/A'}</div>
            <div>${new Date(transaction.transaction_date || transaction.created_at).toLocaleString('fr-FR')}</div>
            <div>Table: ${transaction.table_number || 'N/A'}</div>
            <div>Serveur: ${transaction.server_name || 'N/A'}</div>
            ${transaction.order_number ? `<div>Commande: ${transaction.order_number}</div>` : ''}
          </div>
          <div class="divider"></div>
          ${orderItems.length > 0 ? `
            ${orderItems.map((item: any) => `
              <div class="row">
                <span>${item.quantity}x ${item.item_name}</span>
                <span>${Number(item.total_price).toLocaleString('fr-FR')} F</span>
              </div>
            `).join('')}
            <div class="divider"></div>
          ` : ''}
          <div class="row bold">
            <span>TOTAL</span>
            <span>${Number(transaction.amount).toLocaleString('fr-FR')} F</span>
          </div>
          <div class="row">
            <span>Mode</span>
            <span>${methodLabels[transaction.payment_method] || transaction.payment_method}</span>
          </div>
          ${transaction.amount_received ? `
          <div class="row">
            <span>Reçu</span>
            <span>${Number(transaction.amount_received).toLocaleString('fr-FR')} F</span>
          </div>
          ` : ''}
          ${transaction.change_amount > 0 ? `
          <div class="row bold">
            <span>Rendu</span>
            <span>${Number(transaction.change_amount).toLocaleString('fr-FR')} F</span>
          </div>
          ` : ''}
          <div class="divider"></div>
          <div class="center">Document de vérification</div>
          <script>
            window.onload = function() { setTimeout(function() { window.print(); window.close(); }, 300); };
          </script>
        </body>
        </html>
      `);
      printWindow.document.close();
    } catch (error) {
      console.error('Erreur réimpression:', error);
      alert('Erreur lors de la réimpression du ticket');
    }
  };

  const handleProcessPayment = async () => {
    if (!selectedOrder) return;
    const received = parseFloat(amountReceived) || 0;
    
    if (paymentMethod === 'ROOM_CHARGE' && !selectedStayId) {
      alert('⚠️ Veuillez sélectionner la chambre du client dans la liste.');
      return;
    }

    if (paymentMethod === 'CASH' && received < selectedOrder.total_amount) {
      alert('Le montant reçu est insuffisant !');
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const change = paymentMethod === 'CASH' ? received - selectedOrder.total_amount : 0;
      const receiptNumber = `REC-${Date.now().toString().slice(-8)}`;

      if (paymentMethod === 'ROOM_CHARGE') {
        // --- LOGIQUE D'IMPUTATION SUR CHAMBRE ---
        const selectedStay = activeStays.find(s => s.id === selectedStayId);
        
        // 1. Mettre à jour le statut de la commande
        await supabase.from('restaurant_orders').update({ status: 'ROOM_CHARGE' }).eq('id', selectedOrder.id);

        // 2. Créer l'imputation dans room_charges
        await supabase.from('room_charges').insert({
          site_id: siteId,
          stay_id: selectedStayId,
          order_id: selectedOrder.id,
          charge_type: 'RESTAURANT',
          amount: selectedOrder.total_amount,
          description: `Commande ${selectedOrder.order_number} - ${selectedOrder.items.length} article(s)`,
          charge_date: new Date().toISOString(),
          is_voided: false
        });

        // 3. Mettre à jour le solde du folio du client
        await supabase.from('stays').update({
          folio_balance: (selectedStay?.folio_balance || 0) + selectedOrder.total_amount
        }).eq('id', selectedStayId);

        // 4. Enregistrer la transaction pour la traçabilité de la caisse
        await supabase.from('restaurant_cash_transactions').insert({
          site_id: siteId,
          type: 'INCOME',
          category: 'ROOM_CHARGE',
          amount: selectedOrder.total_amount,
          payment_method: 'ROOM_CHARGE',
          status: 'PAID',
          provider_name: `Chambre ${selectedStay?.rooms?.number}`,
          description: `Imputation commande ${selectedOrder.order_number}`,
          reference_id: selectedOrder.id,
          reference_table: 'restaurant_orders',
          received_by: user?.id,
          transaction_date: new Date().toISOString(),
        });

        // ✅ CORRECTION MAJEURE : Libérer la table après imputation à la chambre
        if (selectedOrder.table_id) {
          await supabase.from('restaurant_tables').update({ status: 'AVAILABLE' }).eq('id', selectedOrder.table_id);
        }

        alert(`✅ Imputé avec succès à la chambre ${selectedStay?.rooms?.number} !\nLe solde du folio a été mis à jour et la table a été libérée.`);

      } else {
        // --- LOGIQUE DE PAIEMENT CLASSIQUE (Espèces, Carte, etc.) ---
        const { error: orderError } = await supabase
          .from('restaurant_orders')
          .update({ status: 'PAID', paid_at: new Date().toISOString() })
          .eq('id', selectedOrder.id);
        if (orderError) throw orderError;

        const { error: txError } = await supabase.from('restaurant_cash_transactions').insert({
          site_id: siteId, type: 'INCOME', category: 'FB_PAYMENT', amount: selectedOrder.total_amount,
          payment_method: paymentMethod, status: 'PAID',
          provider_name: selectedOrder.table_number ? `Table ${selectedOrder.table_number}` : 'Comptoir',
          description: `Paiement commande ${selectedOrder.order_number}`, reference_id: selectedOrder.id,
          reference_table: 'restaurant_orders', received_by: user?.id, amount_received: received,
          change_amount: change, receipt_number: receiptNumber, transaction_date: new Date().toISOString(),
        });
        if (txError) throw txError;

        // ✅ CORRECTION : Libérer la table après paiement classique (AVAILABLE au lieu de DIRTY)
        if (selectedOrder.table_id) {
          await supabase.from('restaurant_tables').update({ status: 'AVAILABLE' }).eq('id', selectedOrder.table_id);
        }
        
        printReceipt(selectedOrder, received, change, receiptNumber, paymentMethod);
        alert(`✅ Paiement réussi !\nMode: ${paymentMethod}\nMonnaie rendue: ${change.toLocaleString('fr-FR')} F\nLa table a été libérée.`);
      }

      // Réinitialisation et rafraîchissement
      setShowPayment(false);
      setSelectedOrder(null);
      setSelectedStayId('');
      setAmountReceived('');
      setPaymentMethod('CASH');
      await loadPendingOrders();
      await loadRoomCharges();
      await loadPaidTransactions();
      await loadActiveStays();
      onSuccess();

    } catch (error: any) {
      console.error('Erreur paiement:', error);
      alert(`Erreur: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const printReceipt = (order: PendingOrder, received: number, change: number, receiptNumber: string, method: string) => {
    const methodLabels: any = {
      'CASH': '💵 Espèces',
      'CARD': '💳 Carte',
      'MOBILE_MONEY': '📱 Mobile Money',
      'CHECK': '📝 Chèque',
      'BANK_TRANSFER': '🏦 Virement'
    };

    const printWindow = window.open('', '_blank', 'width=300,height=600');
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
      <head>
        <title>Reçu ${receiptNumber}</title>
        <style>
          body { font-family: 'Courier New', monospace; font-size: 12px; margin: 0; padding: 10px; width: 80mm; }
          .center { text-align: center; }
          .row { display: flex; justify-content: space-between; margin: 4px 0; }
          .divider { border-top: 1px dashed #000; margin: 8px 0; }
          .bold { font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="center">
          <div class="bold" style="font-size: 16px;">LA VIDA-LOCA</div>
          <div>Restaurant & Bar</div>
          <div class="divider"></div>
          <div class="bold">TICKET DE CAISSE</div>
          <div>N° ${receiptNumber}</div>
          <div>${new Date().toLocaleString('fr-FR')}</div>
          <div>Table: ${order.table_number}</div>
          <div>Serveur: ${order.server_name}</div>
        </div>
        <div class="divider"></div>
        ${order.items.map((item: any) => `
          <div class="row">
            <span>${item.quantity}x ${item.item_name}</span>
            <span>${Number(item.total_price).toLocaleString('fr-FR')} F</span>
          </div>
        `).join('')}
        <div class="divider"></div>
        <div class="row bold">
          <span>TOTAL</span>
          <span>${Number(order.total_amount).toLocaleString('fr-FR')} F</span>
        </div>
        <div class="row">
          <span>Mode</span>
          <span>${methodLabels[method]}</span>
        </div>
        <div class="row">
          <span>Reçu</span>
          <span>${Number(received).toLocaleString('fr-FR')} F</span>
        </div>
        ${change > 0 ? `
        <div class="row bold">
          <span>Rendu</span>
          <span>${Number(change).toLocaleString('fr-FR')} F</span>
        </div>
        ` : ''}
        <div class="divider"></div>
        <div class="center">Merci de votre visite !</div>
        <script>
          window.onload = function() { setTimeout(function() { window.print(); window.close(); }, 300); };
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  const totalIncome = paidTransactions.filter(t => t.type === 'INCOME').reduce((sum, t) => sum + Number(t.amount), 0);
  const totalExpense = paidTransactions.filter(t => t.type === 'EXPENSE').reduce((sum, t) => sum + Number(t.amount), 0);
  const netBalance = totalIncome - totalExpense;

  if (!isOpen) return null;

  const categoryLabels: Record<string, string> = {
    FB_PAYMENT: 'Paiement',
    ROOM_PAYMENT: 'Chambre',
    ROOM_CHARGE: 'Imputation Chambre',
    SUPPLIES: 'Fournitures',
    FOOD: 'Nourriture',
    TRANSPORT: 'Transport',
    MAINTENANCE: 'Maintenance',
    OTHER: 'Autre',
    SALARY: 'Salaires',
    UTILITIES: 'Factures',
  };

  const getCategoryLabel = (category: string) => {
    return categoryLabels[category] || category;
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[95vh] overflow-y-auto">
        <div className="bg-gradient-to-r from-emerald-600 to-teal-700 text-white px-6 py-4 flex items-center justify-between rounded-t-xl sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <DollarSign className="w-6 h-6" />
            <div>
              <h2 className="text-xl font-bold">Caisse Restaurant</h2>
              <p className="text-xs text-emerald-100">
                {pendingOrders.length} à encaisser • {roomCharges.length} charges chambres
              </p>
            </div>
          </div>
          <button onClick={onClose} className="hover:bg-white/20 p-2 rounded-lg"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 space-y-4">
          <div className="flex gap-2 border-b border-slate-200">
            <button 
              onClick={() => setActiveTab('pending')} 
              className={`flex items-center gap-2 px-4 py-2 font-medium text-sm transition-colors ${activeTab === 'pending' ? 'border-b-2 border-emerald-600 text-emerald-600' : 'text-slate-600 hover:text-slate-900'}`}
            >
              <ShoppingCart className="w-4 h-4" /> À encaisser ({pendingOrders.length})
            </button>
            <button 
              onClick={() => setActiveTab('room_charges')} 
              className={`flex items-center gap-2 px-4 py-2 font-medium text-sm transition-colors ${activeTab === 'room_charges' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-slate-600 hover:text-slate-900'}`}
            >
              <Hotel className="w-4 h-4" /> Charges Chambres ({roomCharges.length})
            </button>
            <button 
              onClick={() => setActiveTab('history')} 
              className={`flex items-center gap-2 px-4 py-2 font-medium text-sm transition-colors ${activeTab === 'history' ? 'border-b-2 border-emerald-600 text-emerald-600' : 'text-slate-600 hover:text-slate-900'}`}
            >
              <Clock className="w-4 h-4" /> Historique
            </button>
            <div className="ml-auto flex items-center gap-2">
              <input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} className="border border-slate-300 rounded px-2 py-1 text-sm" />
            </div>
          </div>

          {activeTab === 'pending' && (
            <div>
              {loading ? (
                <div className="text-center py-8">Chargement...</div>
              ) : pendingOrders.length === 0 ? (
                <div className="text-center py-12 bg-slate-50 rounded-lg">
                  <CheckCircle className="w-12 h-12 mx-auto mb-2 text-emerald-400" />
                  <p className="text-sm text-slate-500">Aucune commande en attente de paiement</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {pendingOrders.map(order => (
                    <button
                      key={order.id}
                      onClick={() => {
                        setSelectedOrder(order);
                        setShowPayment(true);
                        setAmountReceived(order.total_amount.toString());
                      }}
                      className="text-left bg-amber-50 border-2 border-amber-200 hover:border-amber-400 rounded-lg p-4 transition-shadow hover:shadow-md"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <div className="font-bold text-slate-900 text-lg">Table {order.table_number}</div>
                          <div className="text-xs text-slate-600">#{order.order_number} • {order.server_name}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-xl font-bold text-amber-900">{Number(order.total_amount).toLocaleString('fr-FR')} F</div>
                          <div className="text-xs text-amber-700 bg-amber-200 px-2 py-0.5 rounded inline-block mt-1">À encaisser</div>
                        </div>
                      </div>
                      <div className="text-xs text-slate-500 mt-2 border-t border-amber-200 pt-2">
                        {order.items.length} article(s) • {new Date(order.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'room_charges' && (
            <div>
              <div className="bg-indigo-50 border-2 border-indigo-200 rounded-lg p-4 mb-4">
                <div className="flex items-start gap-3">
                  <Hotel className="w-6 h-6 text-indigo-700 flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold text-indigo-900">Commandes imputées aux chambres</h3>
                    <p className="text-xs text-indigo-700 mt-1">
                      Ces commandes ont été directement imputées au folio des clients. Le paiement se fera lors du check-out.
                    </p>
                  </div>
                </div>
              </div>

              {roomCharges.length === 0 ? (
                <div className="text-center py-12 bg-slate-50 rounded-lg">
                  <Hotel className="w-12 h-12 mx-auto mb-2 text-slate-300" />
                  <p className="text-sm text-slate-500">Aucune charge chambre en attente</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {roomCharges.map(order => (
                    <div
                      key={order.id}
                      className="text-left bg-indigo-50 border-2 border-indigo-200 rounded-lg p-4"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <div className="font-bold text-slate-900 text-lg">
                            Table {order.table_number} ➔ Chambre {order.room_number}
                          </div>
                          <div className="text-xs text-slate-600">#{order.order_number} • {order.server_name}</div>
                          <div className="text-xs text-indigo-700 mt-1">👤 {order.guest_name}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-xl font-bold text-indigo-900">{Number(order.total_amount).toLocaleString('fr-FR')} F</div>
                          <div className="text-xs text-indigo-700 bg-indigo-200 px-2 py-0.5 rounded inline-block mt-1 flex items-center gap-1">
                            <Hotel className="w-3 h-3" /> Au folio
                          </div>
                        </div>
                      </div>
                      <div className="text-xs text-slate-500 mt-2 border-t border-indigo-200 pt-2">
                        {order.items.length} article(s) • {new Date(order.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                      <div className="mt-2 text-xs bg-indigo-100 text-indigo-800 px-2 py-1 rounded flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" />
                        Paiement au check-out de la chambre
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'history' && (
            <div>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-emerald-50 border-2 border-emerald-200 rounded-lg p-4">
                  <div className="text-xs font-medium text-emerald-700 mb-1 flex items-center gap-1"><TrendingUp className="w-4 h-4" /> Encaissé</div>
                  <div className="text-2xl font-bold text-emerald-900">+ {Number(totalIncome).toLocaleString('fr-FR')} F</div>
                </div>
                <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4">
                  <div className="text-xs font-medium text-red-700 mb-1 flex items-center gap-1"><TrendingDown className="w-4 h-4" /> Dépensé</div>
                  <div className="text-2xl font-bold text-red-900">- {Number(totalExpense).toLocaleString('fr-FR')} F</div>
                </div>
                <div className={`border-2 rounded-lg p-4 ${netBalance >= 0 ? 'bg-blue-50 border-blue-200' : 'bg-orange-50 border-orange-200'}`}>
                  <div className={`text-xs font-medium mb-1 flex items-center gap-1 ${netBalance >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>
                    <DollarSign className="w-4 h-4" /> Solde net
                  </div>
                  <div className={`text-2xl font-bold ${netBalance >= 0 ? 'text-blue-900' : 'text-orange-900'}`}>
                    {Number(netBalance).toLocaleString('fr-FR')} F
                  </div>
                </div>
              </div>

              <button
                onClick={() => setShowExpenseForm(true)}
                className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2 mb-4"
              >
                <Plus className="w-5 h-5" />
                Enregistrer une petite dépense
              </button>

              {paidTransactions.length === 0 ? (
                <div className="text-center py-8 bg-slate-50 rounded-lg text-sm text-slate-500">Aucune transaction pour cette date</div>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {paidTransactions.map(t => (
                    <div key={t.id} className={`flex items-center justify-between p-3 rounded border text-sm ${t.type === 'INCOME' ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                      <div className="flex items-center gap-3 flex-1">
                        <span className="text-xs text-slate-500 w-12">{new Date(t.transaction_date || t.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                        <span className={`text-xs px-2 py-0.5 rounded ${t.type === 'INCOME' ? 'bg-emerald-200 text-emerald-900' : 'bg-red-200 text-red-900'}`}>
                          {t.type === 'INCOME' ? '📈' : '📉'} {getCategoryLabel(t.category)}
                        </span>
                        <span className="text-xs text-slate-700 flex-1">{t.description} {t.provider_name && <span className="text-slate-500">({t.provider_name})</span>}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`font-bold ${t.type === 'INCOME' ? 'text-emerald-700' : 'text-red-700'}`}>
                          {t.type === 'INCOME' ? '+' : '-'}{Number(t.amount).toLocaleString('fr-FR')} F
                        </span>
                        {t.type === 'INCOME' && t.receipt_number && (
                          <button
                            onClick={() => handleReprintReceipt(t)}
                            className="bg-slate-700 hover:bg-slate-800 text-white px-2 py-1 rounded text-xs flex items-center gap-1"
                            title="Réimprimer le ticket"
                          >
                            <RotateCcw className="w-3 h-3" />
                            Réimprimer
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showPayment && selectedOrder && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[95vh] overflow-y-auto">
            <div className="bg-gradient-to-r from-emerald-600 to-teal-700 text-white px-6 py-4 rounded-t-xl">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <DollarSign className="w-5 h-5" />
                Encaissement
              </h3>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-slate-50 p-4 rounded-lg">
                <div className="text-xs text-slate-600 mb-1">Commande</div>
                <div className="font-bold text-slate-900">Table {selectedOrder.table_number} (#{selectedOrder.order_number})</div>
                <div className="text-xs text-slate-500 mt-1">{selectedOrder.items.length} article(s) • {selectedOrder.server_name}</div>
              </div>
              
              <div className="border-2 border-amber-200 bg-amber-50 p-4 rounded-lg text-center">
                <div className="text-xs mb-1 text-amber-700">Montant à encaisser</div>
                <div className="text-3xl font-bold text-amber-900">{Number(selectedOrder.total_amount).toLocaleString('fr-FR')} F</div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">💳 Mode de paiement</label>
                <div className="grid grid-cols-2 gap-2">
                  {paymentMethods.map(method => {
                    const Icon = method.icon;
                    return (
                      <button
                        key={method.id}
                        onClick={() => setPaymentMethod(method.id)}
                        className={`p-3 rounded-lg border-2 transition flex items-center gap-2 text-sm ${
                          paymentMethod === method.id
                            ? `border-${method.color}-500 bg-${method.color}-50 text-${method.color}-900`
                            : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                        }`}
                      >
                        <Icon className="w-5 h-5" />
                        <span className="font-medium">{method.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {paymentMethod === 'ROOM_CHARGE' && (
                <div className="bg-indigo-50 border-2 border-indigo-200 p-4 rounded-lg space-y-3">
                  <label className="block text-sm font-bold text-indigo-900 flex items-center gap-2">
                    <Hotel className="w-4 h-4" /> Sélectionner la chambre du client *
                  </label>
                  
                  {activeStays.length === 0 ? (
                    <p className="text-sm text-red-600 bg-red-50 p-2 rounded">
                      ⚠️ Aucune chambre n'est actuellement occupée. Impossible d'imputer la facture.
                    </p>
                  ) : (
                    <select
                      value={selectedStayId}
                      onChange={(e) => setSelectedStayId(e.target.value)}
                      className="w-full border-2 border-indigo-300 rounded-lg px-3 py-3 bg-white text-sm focus:ring-2 focus:ring-indigo-500 font-medium"
                    >
                      <option value="">-- Choisir une chambre occupée --</option>
                      {activeStays.map(stay => (
                        <option key={stay.id} value={stay.id}>
                          🚪 Ch. {stay.rooms?.number} — {stay.customers?.first_name} {stay.customers?.last_name} 
                          (Solde actuel: {Number(stay.folio_balance || 0).toLocaleString('fr-FR')} F)
                        </option>
                      ))}
                    </select>
                  )}
                  
                  <p className="text-xs text-indigo-700 bg-indigo-100 p-2 rounded flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>
                      Le montant de <b>{Number(selectedOrder.total_amount).toLocaleString('fr-FR')} F</b> sera ajouté au folio de cette chambre. 
                      Le client règlera le total lors de son check-out.
                    </span>
                  </p>
                </div>
              )}

              {paymentMethod === 'CASH' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">💵 Montant reçu du client (FCFA)</label>
                    <input 
                      type="number" 
                      min={selectedOrder.total_amount} 
                      value={amountReceived} 
                      onChange={(e) => setAmountReceived(e.target.value)} 
                      className="w-full border-2 border-slate-300 rounded-lg px-4 py-3 text-2xl font-bold text-center focus:ring-2 focus:ring-emerald-500" 
                      autoFocus 
                    />
                    <button type="button" onClick={() => setAmountReceived(selectedOrder.total_amount.toString())} className="text-xs text-emerald-600 hover:text-emerald-800 mt-1">
                      💡 Mettre le montant exact
                    </button>
                  </div>

                  {parseFloat(amountReceived) >= selectedOrder.total_amount && (
                    <div className="bg-emerald-50 border-2 border-emerald-300 p-3 rounded-lg">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium text-emerald-900"> Monnaie à rendre</span>
                        <span className="text-2xl font-bold text-emerald-900">
                          {Number(parseFloat(amountReceived) - selectedOrder.total_amount).toLocaleString('fr-FR')} F
                        </span>
                      </div>
                    </div>
                  )}

                  {parseFloat(amountReceived) < selectedOrder.total_amount && parseFloat(amountReceived) > 0 && (
                    <div className="bg-red-50 border border-red-200 p-3 rounded-lg text-sm text-red-900 flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      <span>Montant insuffisant. Il manque {Number(selectedOrder.total_amount - parseFloat(amountReceived)).toLocaleString('fr-FR')} F</span>
                    </div>
                  )}
                </>
              )}

              <div className="flex gap-2 pt-2">
                <button 
                  onClick={() => { setShowPayment(false); setSelectedOrder(null); }} 
                  className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold py-3 rounded-lg"
                >
                  Annuler
                </button>
                <button 
                  onClick={handleProcessPayment} 
                  disabled={loading || (paymentMethod === 'CASH' && parseFloat(amountReceived) < selectedOrder.total_amount)} 
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 rounded-lg disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <CheckCircle className="w-5 h-5" />
                  {loading ? 'Traitement...' : 'Valider le paiement'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showExpenseForm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="bg-gradient-to-r from-red-600 to-red-800 text-white px-6 py-4 rounded-t-xl">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <TrendingDown className="w-5 h-5" />
                Enregistrer une dépense
              </h3>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">💰 Montant (FCFA) *</label>
                <input 
                  type="number" 
                  min="1"
                  value={expenseAmount} 
                  onChange={(e) => setExpenseAmount(e.target.value)} 
                  className="w-full border-2 border-slate-300 rounded-lg px-4 py-3 text-2xl font-bold text-center focus:ring-2 focus:ring-red-500" 
                  placeholder="0"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">📂 Catégorie *</label>
                <select
                  value={expenseCategory}
                  onChange={(e) => setExpenseCategory(e.target.value)}
                  className="w-full border-2 border-slate-300 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-red-500"
                >
                  {expenseCategories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.icon} {cat.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1"> Description *</label>
                <input 
                  type="text" 
                  value={expenseDescription} 
                  onChange={(e) => setExpenseDescription(e.target.value)} 
                  className="w-full border-2 border-slate-300 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-red-500" 
                  placeholder="Ex: Achat de citron, essence moto..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1"> Notes (optionnel)</label>
                <textarea 
                  value={expenseNote} 
                  onChange={(e) => setExpenseNote(e.target.value)} 
                  rows={2}
                  className="w-full border-2 border-slate-300 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-red-500" 
                  placeholder="Détails supplémentaires..."
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button 
                  onClick={() => { setShowExpenseForm(false); setExpenseAmount(''); setExpenseDescription(''); }} 
                  className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold py-3 rounded-lg"
                >
                  Annuler
                </button>
                <button 
                  onClick={handleAddExpense} 
                  disabled={loading || !expenseAmount || !expenseDescription.trim()} 
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-3 rounded-lg disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <CheckCircle className="w-5 h-5" />
                  {loading ? 'Enregistrement...' : 'Enregistrer la dépense'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
