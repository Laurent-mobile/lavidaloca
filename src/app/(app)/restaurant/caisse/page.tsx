'use client';
import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  DollarSign, Search, CreditCard, Banknote, Smartphone, BedDouble,
  ArrowRightLeft, Printer, X, CheckCircle2, Lock, History,
  TrendingUp, TrendingDown, Download, RefreshCw, ReceiptText, AlertCircle, Play, Plus, Receipt, Hotel, Check, Clock
} from 'lucide-react';
import NewCashExpenseModal from './components/NewCashExpenseModal';
import { useReconciliationAlert } from '@/hooks/useReconciliationAlert';

interface OrderItem {
  item_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

interface Order {
  id: string;
  order_number: string;
  order_type?: string;
  status: string;
  total_amount: number;
  created_at: string;
  table_id?: string | null;
  room_id?: string | null;
  stay_id?: string | null;
  restaurant_tables?: { number: string } | null;
  rooms?: { number: string } | null;
  restaurant_order_items?: OrderItem[];
}

interface Payment {
  id: string;
  order_id: string;
  method: string;
  amount: number;
  received_amount: number;
  change_amount: number;
  paid_at: string;
  restaurant_orders?: { 
    order_number: string;
    restaurant_tables?: { number: string } | null;
    rooms?: { number: string } | null;
  };
}

interface CashSession {
  id: string;
  opening_float: number;
  opened_at: string;
  status: string;
}

const METHODS = [
  { key: 'CASH', label: 'Espèces', icon: Banknote, color: 'emerald' },
  { key: 'CARD', label: 'Carte', icon: CreditCard, color: 'blue' },
  { key: 'MOBILE_MONEY', label: 'Mobile Money', icon: Smartphone, color: 'amber' },
  { key: 'ROOM_CHARGE', label: 'Chambre', icon: BedDouble, color: 'purple' },
  { key: 'TRANSFER', label: 'Virement', icon: ArrowRightLeft, color: 'slate' },
];

const money = (n: number) => Number(n || 0).toLocaleString('fr-FR');

export default function CaissePage() {
  const supabase = createClient();
  const [siteId, setSiteId] = useState('');
  const [userId, setUserId] = useState('');
  const [tab, setTab] = useState<'vente' | 'session' | 'historique' | 'reconciliations' | 'cloture'>('vente');
  const [showNewExpenseModal, setShowNewExpenseModal] = useState(false);
  const [reconciliations, setReconciliations] = useState<any[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [selected, setSelected] = useState<Order | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [session, setSession] = useState<CashSession | null>(null);
  const [sessionPayments, setSessionPayments] = useState<Payment[]>([]);
  
  const [activeStays, setActiveStays] = useState<any[]>([]);
  const [selectedStayId, setSelectedStayId] = useState('');

  const [cashExpenses, setCashExpenses] = useState<any[]>([]);
  const [loadingExpenses, setLoadingExpenses] = useState(false);
  
  const [search, setSearch] = useState('');
  const [method, setMethod] = useState('CASH');
  const [received, setReceived] = useState('');
  const [notes, setNotes] = useState('');
  const [openingFloat, setOpeningFloat] = useState('0');
  const [counted, setCounted] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  const { alert: reconciliationAlert, loadAlert } = useReconciliationAlert(siteId);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      const { data } = await supabase.from('profiles').select('site_id').eq('id', user.id).maybeSingle();
      if (data?.site_id) setSiteId(data.site_id);
    })();
  }, []);

  useEffect(() => { 
    if (siteId) {
      loadAll();
    }
  }, [siteId]);

  useEffect(() => {
    if (tab === 'session' && session) {
      loadSessionExpenses();
    }
  }, [tab, session]);

  useEffect(() => {
    if (tab === 'reconciliations') {
      loadReconciliationsData();
    }
  }, [tab]);

  const loadSession = async () => {
    const { data } = await supabase.from('cash_sessions')
      .select('*').eq('site_id', siteId).eq('status', 'OPEN')
      .order('opened_at', { ascending: false }).limit(1).maybeSingle();
    setSession(data || null);
    if (data) {
      const { data: p } = await supabase.from('restaurant_payments')
        .select(`
          *,
          restaurant_orders(order_number, table_id, room_id, restaurant_tables(number), rooms(number))
        `)
        .eq('session_id', data.id);
      setSessionPayments(p || []);
    } else {
      setSessionPayments([]);
    }
  };

  const loadReconciliationsData = async () => {
    try {
      const { data: roomCharges, error } = await supabase
        .from('room_charges')
        .select(`
          id, stay_id, order_id, charge_type, amount, charge_date, description,
          stays (id, status, folio_balance, check_out_at, room_id, customer_id, rooms (number), customers (first_name, last_name)),
          restaurant_orders (id, order_number, status, total_amount, created_at)
        `)
        .eq('site_id', siteId)
        .eq('charge_type', 'RESTAURANT')
        .eq('is_voided', false)
        .order('charge_date', { ascending: false });

      if (error) throw error;

      const formatted = (roomCharges || []).map(charge => {
        const stay = Array.isArray(charge.stays) ? charge.stays[0] : charge.stays;
        const order = Array.isArray(charge.restaurant_orders) ? charge.restaurant_orders[0] : charge.restaurant_orders;
        const room = stay ? (Array.isArray(stay.rooms) ? stay.rooms[0] : stay.rooms) : null;
        const customer = stay ? (Array.isArray(stay.customers) ? stay.customers[0] : stay.customers) : null;
        
        const roomNumber = room?.number || '—';
        const customerName = customer ? `${customer.last_name || ''} ${customer.first_name || ''}`.trim() || 'Client' : 'Client';
        
        let reconciliationStatus: 'paid' | 'pending' | 'anomaly' = 'pending';
        if (stay?.status === 'CHECKED_OUT' && Number(stay.folio_balance) === 0) {
          reconciliationStatus = 'paid';
        } else if (stay?.status === 'CHECKED_OUT' && Number(stay.folio_balance) > 0) {
          reconciliationStatus = 'anomaly';
        }

        return {
          id: charge.id,
          order_id: charge.order_id,
          order_number: order?.order_number || 'N/A',
          room_number: roomNumber,
          guest_name: customerName,
          stay_status: stay?.status || 'UNKNOWN',
          total_amount: Number(charge.amount),
          reconciliationStatus,
          reconciliationDate: stay?.check_out_at || null,
          folio_balance: stay?.folio_balance || 0,
          created_at: order?.created_at || charge.charge_date,
        };
      });
      setReconciliations(formatted);
      await loadAlert();
    } catch (error) {
      console.error('Erreur chargement réconciliations:', error);
    }
  };

  const loadActiveStays = async () => {
    try {
      const { data: staysData, error: staysError } = await supabase
        .from('stays')
        .select(`
          id, room_id, folio_balance, check_in_at,
          rooms!room_id (id, number),
          customers (first_name, last_name)
        `)
        .eq('status', 'IN_HOUSE')
        .eq('rooms.site_id', siteId)   // ✅ Filtre multi-site ajouté
        .order('check_in_at', { ascending: false });

      if (staysError) { setActiveStays([]); return; }

      // ✅ Helper : gère le cas objet (many-to-one) ET tableau (one-to-many)
      const pick = (rel: any) => Array.isArray(rel) ? rel[0] : (rel || null);

      setActiveStays((staysData || []).map((stay: any) => ({
        ...stay,
        rooms: pick(stay.rooms),
        customers: pick(stay.customers) || { first_name: 'Client', last_name: 'Inconnu' },
      })));
    } catch (error) {
      setActiveStays([]);
    }
  };

  const loadSessionExpenses = async () => {
    if (!session) return;
    setLoadingExpenses(true);
    try {
      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .eq('site_id', siteId)
        .eq('subtype', 'CAISSE')
        .gte('created_at', session.opened_at)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setCashExpenses(data || []);
    } catch (error) {
      console.error('Erreur chargement dépenses:', error);
    } finally {
      setLoadingExpenses(false);
    }
  };

  const loadAll = async () => {
    // Charger les commandes
    const { data: o } = await supabase.from('restaurant_orders')
      .select(`*, restaurant_tables(number), rooms(number), restaurant_order_items(item_name, quantity, unit_price, total_price)`)
      .eq('site_id', siteId)
      .in('status', ['DRAFT','SENT','PREPARING','READY','SERVED'])
      .order('created_at', { ascending: false });
    setOrders(o || []);

    // ✅ CHARGER LES PAIEMENTS DE LA SESSION ACTIVE (pas tous les paiements)
    if (session) {
      const { data: p } = await supabase.from('restaurant_payments')
        .select(`
          *, 
          restaurant_orders(order_number, table_id, room_id, restaurant_tables(number), rooms(number))
        `)
        .eq('session_id', session.id)
        .order('paid_at', { ascending: false });
      setSessionPayments(p || []);
      
      // Pour l'historique global, charger seulement les paiements récents
      const { data: recentP } = await supabase.from('restaurant_payments')
        .select('*, restaurant_orders(order_number)')
        .eq('site_id', siteId)
        .gte('paid_at', new Date(Date.now() - 7 * 86400000).toISOString()) // 7 derniers jours
        .order('paid_at', { ascending: false })
        .limit(200);
      setPayments(recentP || []);
    } else {
      setSessionPayments([]);
      setPayments([]);
    }
    
    await loadActiveStays();
    await loadSession(); // Recharger la session au cas où elle a changé
    await loadSessionExpenses();
  };

  const reconcileOrder = async (orderId: string) => {
    if (!confirm('Confirmer la réconciliation de cette commande avec la caisse réception ?')) return;
    try {
      await supabase.from('restaurant_orders').update({ status: 'PAID', paid_at: new Date().toISOString() }).eq('id', orderId);
      await supabase.from('payment_reconciliation').insert({
        site_id: siteId, order_id: orderId, reconciliation_date: new Date().toISOString(),
        reconciled_by: userId, notes: 'Réconcilié manuellement - Paiement confirmé par la réception'
      });
      setSuccess('✅ Commande réconciliée avec succès !');
      await loadReconciliationsData();
      await loadAll();
    } catch (error: any) {
      setError('Erreur : ' + error.message);
    }
  };

  const autoReconcile = async () => {
    if (!confirm('Réconcilier automatiquement toutes les commandes dont le séjour est CHECKED_OUT avec folio à 0 ?')) return;
    try {
      const ordersToReconcile = reconciliations.filter(r => r.reconciliationStatus === 'paid');
      if (ordersToReconcile.length === 0) { setSuccess('Aucune commande à réconcilier automatiquement.'); return; }

      for (const order of ordersToReconcile) {
        await supabase.from('restaurant_orders').update({ status: 'PAID', paid_at: order.reconciliationDate || new Date().toISOString() }).eq('id', order.order_id);
        await supabase.from('payment_reconciliation').insert({
          site_id: siteId, order_id: order.order_id, reconciliation_date: new Date().toISOString(),
          reconciled_by: userId, notes: 'Réconciliation automatique - Séjour CHECKED_OUT avec folio réglé'
        });
      }
      setSuccess(`✅ ${ordersToReconcile.length} commande(s) réconciliée(s) automatiquement !`);
      await loadReconciliationsData();
      await loadAll();
    } catch (error: any) {
      setError('Erreur : ' + error.message);
    }
  };

  const openSession = async () => {
    setBusy(true); setError('');
    const { data, error: e } = await supabase.from('cash_sessions')
      .insert({ site_id: siteId, opened_by: userId, opening_float: Number(openingFloat) || 0 })
      .select().single();
    if (e) setError(e.message);
    else { setSession(data); setSuccess('Caisse ouverte.'); await loadSession(); }
    setBusy(false);
  };

  const expectedCash = useMemo(() => {
    const float = Number(session?.opening_float || 0);
    const inCash = sessionPayments.filter(p => p.method === 'CASH').reduce((s,p) => s + Number(p.amount), 0);
    const expenses = cashExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
    return float + inCash - expenses;
  }, [session, sessionPayments, cashExpenses]);

  const closeSession = async () => {
    if (!session) return;
    if (!confirm('Clôturer cette session de caisse ?')) return;
    setBusy(true); setError('');
    const countedNum = Number(counted) || 0;
    const { error: e } = await supabase.from('cash_sessions').update({
      status: 'CLOSED', closed_at: new Date().toISOString(),
      counted_amount: countedNum, expected_amount: expectedCash,
      difference: countedNum - expectedCash
    }).eq('id', session.id);
    if (e) setError(e.message);
    else { setSession(null); setSelected(null); setCounted(''); setSuccess('Caisse clôturée.'); await loadAll(); }
    setBusy(false);
  };

     const handlePrintClosingReport = () => {
    if (!session) return;
    
    const countedNum = Number(counted) || 0;
    const totalIncome = sessionPayments.reduce((s, p) => s + Number(p.amount), 0);
    const totalExpense = cashExpenses.reduce((sum, e) => sum + Number(e.amount), 0);
    const netBalance = totalIncome - totalExpense;
    const difference = countedNum - expectedCash;

    const incomeByMethod: Record<string, number> = {};
    sessionPayments.forEach(p => {
      incomeByMethod[p.method] = (incomeByMethod[p.method] || 0) + Number(p.amount);
    });

    const expenseByCategory: Record<string, number> = {};
    cashExpenses.forEach(e => {
      expenseByCategory[e.category] = (expenseByCategory[e.category] || 0) + Number(e.amount);
    });

    const reportId = `RESTO-${session.id.slice(0, 8).toUpperCase()}`;
    const generatedAt = new Date().toISOString();
    const qrData = `VIDALOCA_RESTO|${reportId}|${generatedAt}|${totalIncome}|${totalExpense}`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(qrData)}`;

    const printWindow = window.open('', '_blank', 'width=900,height=1200');
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Rapport de fermeture de caisse Resto - ${reportId}</title>
        <style>
          @page { size: A4; margin: 15mm; }
          body { font-family: Arial, sans-serif; font-size: 11px; color: #1f2937; margin: 0; padding: 20px; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #d97706; padding-bottom: 15px; margin-bottom: 20px; }
          .header-left h1 { color: #d97706; margin: 0; font-size: 24px; }
          .header-left .subtitle { color: #6b7280; font-size: 12px; margin-top: 4px; }
          .header-left .title { font-size: 18px; font-weight: bold; margin-top: 10px; color: #1f2937; }
          .qr-box { text-align: center; }
          .qr-box img { border: 2px solid #e2e8f0; padding: 5px; border-radius: 8px; }
          .qr-box small { display: block; margin-top: 5px; color: #6b7280; font-size: 10px; }
          .section { margin-bottom: 20px; }
          .section-title { font-size: 14px; font-weight: bold; color: #d97706; border-bottom: 2px solid #d97706; padding-bottom: 5px; margin-bottom: 10px; }
          .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 15px; }
          .info-box { background: #f9fafb; padding: 10px; border-radius: 6px; border-left: 3px solid #d97706; }
          .info-box label { font-size: 10px; color: #6b7280; display: block; margin-bottom: 3px; text-transform: uppercase; font-weight: bold; }
          .info-box value { font-size: 13px; color: #1f2937; font-weight: bold; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
          th { background: #d97706; color: white; padding: 8px; text-align: left; font-size: 11px; }
          td { padding: 6px 8px; border-bottom: 1px solid #e5e7eb; font-size: 11px; }
          tr:nth-child(even) { background: #f9fafb; }
          .total-row { background: #fffbeb !important; font-weight: bold; }
          .total-row td { border-top: 2px solid #d97706; padding: 10px 8px; }
          .highlight-box { background: #fffbeb; border: 2px solid #d97706; padding: 12px; border-radius: 8px; margin: 15px 0; }
          .highlight-box.danger { background: #fef2f2; border-color: #dc2626; }
          .highlight-box.warning { background: #ecfdf5; border-color: #059669; }
          .highlight-box .label { font-size: 11px; color: #6b7280; margin-bottom: 3px; }
          .highlight-box .value { font-size: 18px; font-weight: bold; color: #d97706; }
          .highlight-box.danger .value { color: #dc2626; }
          .highlight-box.warning .value { color: #059669; }
          .footer { margin-top: 40px; border-top: 2px solid #e5e7eb; padding-top: 15px; }
          .authenticity { background: #fef3c7; border: 1px solid #f59e0b; padding: 10px; border-radius: 6px; margin-bottom: 20px; font-size: 11px; color: #92400e; text-align: center; }
          .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-top: 30px; }
          .signature-box { border-top: 1px solid #1f2937; padding-top: 5px; text-align: center; font-size: 11px; }
          .text-right { text-align: right; }
          .text-center { text-align: center; }
          @media print { body { padding: 0; } .no-print { display: none; } }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="header-left">
            <h1>🍽️ LA VIDA-LOCA</h1>
            <div class="subtitle">Hôtel • Resto • Lounge</div>
            <div class="subtitle">📍 Rue 15.293, Ouaga 2000, Ouagadougou</div>
            <div class="subtitle">📞 +226 01 04 11 11</div>
            <div class="title">📊 RAPPORT DE FERMETURE DE CAISSE (RESTAURANT)</div>
            <div class="subtitle">N° Session: ${reportId}</div>
          </div>
          <div class="qr-box">
            <img src="${qrUrl}" alt="QR Code d'authenticité" />
            <small>Document unique<br/>ID: ${reportId}</small>
          </div>
        </div>

        <div class="section">
          <div class="section-title">📋 Informations de session</div>
          <div class="info-grid">
            <div class="info-box"><label>Date d'ouverture</label><value>${new Date(session.opened_at).toLocaleString('fr-FR')}</value></div>
            <div class="info-box"><label>Date de fermeture</label><value>${new Date().toLocaleString('fr-FR')}</value></div>
            <div class="info-box"><label>Fond de caisse initial</label><value>${money(session.opening_float)} FCFA</value></div>
            <div class="info-box"><label>Nombre de transactions</label><value>${sessionPayments.length} vente(s)</value></div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">💰 Récapitulatif financier</div>
          <div class="info-grid">
            <div class="highlight-box"><div class="label">Total encaissé</div><div class="value">${money(totalIncome)} FCFA</div></div>
            <div class="highlight-box danger"><div class="label">Total dépensé</div><div class="value">${money(totalExpense)} FCFA</div></div>
            <div class="highlight-box"><div class="label">Solde net de la session</div><div class="value">${money(netBalance)} FCFA</div></div>
            <div class="highlight-box warning"><div class="label">Fond de caisse + Solde net</div><div class="value">${money(session.opening_float + netBalance)} FCFA</div></div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">💳 Détail des encaissements par mode de paiement</div>
          <table>
            <thead><tr><th>Mode de paiement</th><th>Nombre</th><th class="text-right">Montant</th></tr></thead>
            <tbody>
              ${Object.entries(incomeByMethod).map(([method, amount]) => {
                const count = sessionPayments.filter(p => p.method === method).length;
                const label = METHODS.find(m => m.key === method)?.label || method;
                return `<tr><td>${label}</td><td>${count} transaction(s)</td><td class="text-right">${money(amount)} FCFA</td></tr>`;
              }).join('')}
              <tr class="total-row"><td colspan="2">TOTAL ENCAISSÉ</td><td class="text-right">${money(totalIncome)} FCFA</td></tr>
            </tbody>
          </table>
        </div>

        <div class="section">
          <div class="section-title">📉 Détail des dépenses par catégorie</div>
          <table>
            <thead><tr><th>Catégorie</th><th>Nombre</th><th class="text-right">Montant</th></tr></thead>
            <tbody>
              ${Object.entries(expenseByCategory).map(([cat, amount]) => {
                const count = cashExpenses.filter(e => e.category === cat).length;
                return `<tr><td>${cat}</td><td>${count} dépense(s)</td><td class="text-right">${money(amount)} FCFA</td></tr>`;
              }).join('')}
              <tr class="total-row"><td colspan="2">TOTAL DÉPENSÉ</td><td class="text-right">${money(totalExpense)} FCFA</td></tr>
            </tbody>
          </table>
        </div>

        <div class="section">
          <div class="section-title">🔒 Clôture de caisse</div>
          <div class="info-grid">
            <div class="highlight-box"><div class="label">💰 Montant théorique attendu</div><div class="value">${money(expectedCash)} FCFA</div></div>
            <div class="highlight-box"><div class="label">📦 Montant physiquement compté</div><div class="value">${money(countedNum)} FCFA</div></div>
          </div>
          <div class="highlight-box ${difference === 0 ? '' : difference > 0 ? 'warning' : 'danger'}" style="background: ${difference === 0 ? '#fffbeb' : difference > 0 ? '#ecfdf5' : '#fef2f2'}; border-color: ${difference === 0 ? '#d97706' : difference > 0 ? '#059669' : '#dc2626'};">
            <div class="label">⚖️ Écart de caisse</div>
            <div class="value" style="color: ${difference === 0 ? '#d97706' : difference > 0 ? '#059669' : '#dc2626'};">
              ${difference === 0 ? '✅ AUCUN ÉCART' : (difference > 0 ? '+' : '') + money(difference) + ' FCFA'}
              ${difference > 0 ? '(Excédent)' : difference < 0 ? '(Manquant)' : ''}
            </div>
          </div>
        </div>

        <div class="footer">
          <div class="authenticity">
            🔐 <strong>Document certifié unique</strong> — Ce rapport est protégé par un QR code d'authenticité. Scannez-le pour vérifier l'intégrité des données.
          </div>
          <div class="signatures">
            <div><div class="signature-box"><div style="height: 50px;"></div><div><b>Caissier(ère) Resto</b></div><div style="font-size: 10px; color: #6b7280;">Nom et signature</div></div></div>
            <div><div class="signature-box"><div style="height: 50px;"></div><div><b>Responsable / Directeur</b></div><div style="font-size: 10px; color: #6b7280;">Nom et signature</div></div></div>
          </div>
          <div class="text-center" style="margin-top: 20px; font-size: 10px; color: #6b7280;">
            Document généré le ${new Date().toLocaleString('fr-FR')} • LA VIDA-LOCA PMS
          </div>
        </div>

        <div class="no-print" style="text-align: center; margin-top: 30px;">
          <button onclick="window.print()" style="padding: 12px 30px; background: #d97706; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: bold;">🖨️ Imprimer le rapport</button>
          <button onclick="window.close()" style="padding: 12px 30px; background: #6b7280; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; margin-left: 10px;">Fermer</button>
        </div>
        <script>window.onload = function() { setTimeout(function() { window.print(); }, 500); };</script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  const total = Number(selected?.total_amount || 0);
  const change = Math.max((Number(received) || 0) - total, 0);

  const pay = async () => {
        if (!selected || !session) return;
    // ✅ Les commandes Room Service en DRAFT ou ROOM_CHARGE restent au folio (non encaissables ici)
    // Les commandes Room Service en SERVED (envoyées à la caisse) sont encaissables normalement
    if (selected.order_type === 'ROOM_SERVICE' && ['DRAFT', 'ROOM_CHARGE'].includes(selected.status)) {
      setError('⚠️ Cette commande est imputée au folio de la chambre.\nLe paiement se fait lors du check-out à la réception.');
      return;
    }
    if (method === 'CASH' && (Number(received) || 0) < total) {
      setError('Le montant reçu est inférieur au total.'); return;
    }
        if (method === 'ROOM_CHARGE') {
      if (!selectedStayId) {
        setError('Veuillez sélectionner la chambre à facturer.'); return;
      }
      if (selected.order_type !== 'ROOM_SERVICE') {
        setError('⚠️ Le mode "Chambre" est réservé aux commandes Room Service.\nPour cette commande, utilisez Espèces, Carte ou Mobile Money.');
        return;
      }
    }

    setBusy(true); setError(''); setSuccess('');
    const { data, error: e } = await supabase.rpc('finalize_payment', {
      p_order_id: selected.id, p_session_id: session.id, p_method: method, 
      p_received: Number(received) || 0, p_notes: notes, p_stay_id: method === 'ROOM_CHARGE' ? selectedStayId : null
    });
    
    if (e) { setError(e.message); setBusy(false); return; }

    setSuccess(`✅ Payé — ${data.order_number} · Rendu monnaie : ${money(data.change)} fcfa`);
    printTicket(selected, data);

    if (selected.table_id) {
      await supabase.from('restaurant_tables').update({ status: 'AVAILABLE' }).eq('id', selected.table_id);
    }

    setSelected(null); setReceived(''); setNotes(''); setSelectedStayId('');
    await loadAll();
    // ✅ NOUVEAU : Notifier les autres onglets/pages qu'un paiement a eu lieu
  window.dispatchEvent(new CustomEvent('payment-completed'));
    setBusy(false);
  };

  const printTicket = (order: Order, payData: any) => {
    const w = window.open('', '_blank', 'width=400,height=650');
    if (!w) return;
    const label = METHODS.find(m => m.key === payData.method)?.label || payData.method;
    w.document.write(`<!DOCTYPE html><html><head><title>Ticket ${payData.order_number}</title>
      <style>body{font-family:'Courier New',monospace;font-size:12px;max-width:300px;margin:0 auto;padding:12px;}
      h1{font-size:16px;text-align:center;margin:4px 0;} .c{text-align:center;}
      .line{border-top:1px dashed #000;margin:10px 0;} .row{display:flex;justify-content:space-between;}
      .total{font-size:16px;font-weight:bold;} </style></head><body>
      <div class="c"><img src="/logo.png" style="max-width:120px;margin-bottom:8px;">
      <h1>LA VIDA-LOCA</h1><p>Hotel • Resto • Lounge<br>Rue 15.293, Ouaga 2000<br>+226 01 04 11 11</p></div>
      <div class="line"></div>
      <div class="row"><span>Commande</span><b>${payData.order_number}</b></div>
      <div class="row"><span>Date</span><span>${new Date().toLocaleString('fr-FR')}</span></div>
      <div class="line"></div>
      ${(order.restaurant_order_items || []).map((i: any) => `<div class="row"><span>${i.item_name} x${i.quantity}</span><span>${money(i.total_price)} fcfa</span></div>`).join('')}
      <div class="line"></div>
      <div class="row total"><span>TOTAL</span><span>${money(payData.total)} fcfa</span></div>
      <div class="row"><span>${label}</span><span>${money(payData.received)} fcfa</span></div>
      <div class="row"><span>Rendu monnaie</span><b>${money(payData.change)} fcfa</b></div>
      <div class="line"></div>
      <p class="c">Merci de votre visite !<br>Embrace happiness...</p>
      </body></html>`);
    w.document.close();
    setTimeout(() => { w.print(); w.close(); }, 300);
  };

  const exportCSV = () => {
    const rows = [['Date','Commande','Moyen','Montant','Reçu','Monnaie'],
      ...payments.map(p => [p.paid_at, p.restaurant_orders?.order_number || '', p.method, p.amount, p.received_amount, p.change_amount])];
    const blob = new Blob(['\uFEFF' + rows.map(r => r.join(';')).join('\n')], { type:'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `caisse_resto_${new Date().toISOString().slice(0,10)}.csv`; a.click();
  };

  const filtered = orders.filter(o => o.order_number.toLowerCase().includes(search.toLowerCase()));
  const todayRevenue = payments.filter(p => new Date(p.paid_at).toDateString() === new Date().toDateString()).reduce((s,p) => s + Number(p.amount), 0);
    const locationLabel = (o: Order) => {
    if (o.rooms?.number) return `🛎️ Ch. ${o.rooms.number}`;
    if (o.restaurant_tables?.number) return `Table ${o.restaurant_tables.number}`;
    return 'À emporter';
  };

  return (
    <div className="p-4 lg:p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <DollarSign className="w-7 h-7 text-amber-600" /> Caisse Restaurant
          </h1>
          <p className="text-sm text-slate-500">Encaissement, rendu monnaie et clôture de session.</p>
        </div>
        <button onClick={loadAll} className="flex items-center gap-2 text-sm bg-white border border-slate-200 px-3 py-2 rounded-lg">
          <RefreshCw className="w-4 h-4" /> Actualiser
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="text-xs text-amber-700">CA du jour</div>
          <div className="text-xl font-bold text-amber-900">{money(todayRevenue)} fcfa</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Transactions</div>
          <div className="text-xl font-bold">{payments.length}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">En caisse (théorique)</div>
          <div className="text-xl font-bold">{money(expectedCash)} fcfa</div>
        </div>
        <div className={`rounded-xl p-4 border ${session ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200'}`}>
          <div className="text-xs flex items-center gap-1">
            {session ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
            {session ? 'Caisse ouverte' : 'Caisse fermée'}
          </div>
          <div className="text-xs mt-1 text-slate-600">
            {session ? `Fond : ${money(session.opening_float)} fcfa` : 'Ouvrez une session pour encaisser'}
          </div>
        </div>
      </div>

      <div className="flex gap-2 border-b border-slate-200 overflow-x-auto">
        {([
          ['vente','Ventes',ReceiptText], 
          ['session','Session',DollarSign], 
          ['historique','Historique',History], 
          ['reconciliations','Réconciliations',CheckCircle2], 
          ['cloture','Clôture',Lock]
        ] as const).map(([k,l,Icon]) => {
          const hasAnomaly = k === 'reconciliations' && reconciliationAlert.anomaly > 0;
          const hasPending = k === 'reconciliations' && reconciliationAlert.pending > 0;
          return (
            <button key={k} onClick={() => { setTab(k); if (k === 'reconciliations') loadReconciliationsData(); }}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium relative whitespace-nowrap ${
                tab===k?'border-b-2 border-amber-600 text-amber-700':'text-slate-500'
              }`}>
              <Icon className="w-4 h-4" /> {l}
              {hasAnomaly && <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full animate-pulse">{reconciliationAlert.anomaly}</span>}
              {hasPending && !hasAnomaly && <span className="absolute -top-1 -right-1 bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{reconciliationAlert.pending}</span>}
            </button>
          );
        })}
      </div>

      {(error || success) && (
        <div className={`p-3 rounded-lg text-sm flex items-center gap-2 ${error?'bg-red-50 text-red-800':'bg-emerald-50 text-emerald-800'}`}>
          {error ? <AlertCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
          {error || success}
          <button onClick={()=>{setError('');setSuccess('');}} className="ml-auto"><X className="w-4 h-4" /></button>
        </div>
      )}

      {tab === 'vente' && (
        <div className="grid lg:grid-cols-2 gap-5">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-slate-200">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="N° de commande..." className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm" />
              </div>
            </div>
            <div className="max-h-[520px] overflow-y-auto divide-y divide-slate-100">
              {filtered.length === 0 && <p className="p-8 text-center text-sm text-slate-400">Aucune commande à encaisser.</p>}
                                        {filtered.map(o => {
                const isRoomService = o.order_type === 'ROOM_SERVICE';
                const isFolioLocked = isRoomService && ['DRAFT', 'ROOM_CHARGE'].includes(o.status);
                return (
                  <button key={o.id} onClick={() => {
                      if (isFolioLocked) { setError('⚠️ Commande imputée au folio - Non encaissable ici'); return; }
                      setSelected(o); setReceived(''); setError('');
                      // ✅ PRÉ-REMPLISSAGE INTELLIGENT DU MODE DE PAIEMENT
                      if (isRoomService) {
                        setMethod('ROOM_CHARGE');          // Chambre présélectionnée
                        setSelectedStayId(o.stay_id || ''); // Sa chambre pré-remplie
                      } else {
                        setMethod('CASH');                  // Espèces pour les autres
                        setSelectedStayId('');
                      }
                    }} disabled={isFolioLocked}
                    className={`w-full text-left p-4 hover:bg-slate-50 flex justify-between items-center 
                      ${selected?.id===o.id?'bg-amber-50 border-l-4 border-amber-600':''}
                      ${isFolioLocked ? 'opacity-50 cursor-not-allowed bg-purple-50/30' : ''}
                      ${isRoomService && !isFolioLocked ? 'bg-blue-50/30 border-l-4 border-blue-400' : ''}`}>
                    <div>
                      <div className="font-bold text-slate-900 flex items-center gap-2">
                        {o.order_number}
                        {isRoomService && isFolioLocked && <span className="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">🏨 Folio</span>}
                        {isRoomService && !isFolioLocked && <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">🛎️ Chambre à encaisser</span>}
                      </div>
                      <div className="text-xs text-slate-500">{locationLabel(o)} · {o.restaurant_order_items?.length || 0} article(s)</div>
                      {isFolioLocked && <div className="text-[10px] text-purple-600 mt-1">💳 Facturé au folio - Check-out réception</div>}
                      {isRoomService && !isFolioLocked && <div className="text-[10px] text-blue-600 mt-1">✅ Mode "Chambre" présélectionné - Modifiable</div>}
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-amber-700">{money(o.total_amount)} fcfa</div>
                      <div className="text-[10px] text-slate-400">{o.status}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            {!selected ? (
              <div className="text-center py-20 text-slate-400">
                <ReceiptText className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p className="text-sm">Sélectionnez une commande à gauche</p>
              </div>
            ) : (
              <>
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-bold text-lg">{selected.order_number}</h3>
                    <p className="text-xs text-slate-500">{locationLabel(selected)}</p>
                  </div>
                  <button onClick={()=>setSelected(null)} className="p-1 text-slate-400"><X className="w-4 h-4"/></button>
                </div>
                <div className="max-h-40 overflow-y-auto space-y-1 text-sm">
                  {(selected.restaurant_order_items || []).map((i,idx)=>(
                    <div key={idx} className="flex justify-between text-slate-600">
                      <span>{i.item_name} × {i.quantity}</span><span>{money(i.total_price)} fcfa</span>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between items-center bg-amber-50 p-4 rounded-xl">
                

                  <span className="font-semibold">Total à payer</span>
                  <span className="text-2xl font-bold text-amber-700">{money(total)} fcfa</span>
                </div>
                {selected.order_type === 'ROOM_SERVICE' && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800 flex items-start gap-2">
                    <Hotel className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>
                      <b>Commande Chambre détectée.</b> Le mode <b>"Chambre"</b> est présélectionné (imputation au folio).
                      Si le client souhaite <b>payer directement</b>, choisissez Espèces, Carte ou Mobile Money ci-dessous.
                    </span>
                  </div>
                )}
                <div>
                  <label className="text-xs font-medium text-slate-600 mb-2 block">Moyen de paiement</label>
                  <div className="grid grid-cols-3 gap-2">
                    {METHODS.map(m => (
                      <button key={m.key} onClick={()=>setMethod(m.key)}
                        className={`p-3 rounded-lg border-2 text-xs font-medium flex flex-col items-center gap-1
                          ${method===m.key?'border-amber-500 bg-amber-50 text-amber-700':'border-slate-200 text-slate-600'}`}>
                        <m.icon className="w-5 h-5" />{m.label}
                      </button>
                    ))}
                  </div>
                </div>
                {method === 'CASH' && (
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-slate-600">Montant reçu (fcfa)</label>
                    <input type="number" value={received} onChange={e=>setReceived(e.target.value)} placeholder="0" className="w-full border border-slate-300 rounded-lg px-3 py-2" />
                    <div className="flex gap-2 flex-wrap">
                      {[total,5000,10000,20000,50000].map((v,i)=>(
                        <button key={i} onClick={()=>setReceived(String(Math.max(v,0)))} className="px-3 py-1 bg-slate-100 rounded-lg text-xs font-medium">{i===0?'Juste':`${money(v)}`}</button>
                      ))}
                    </div>
                    <div className="flex justify-between bg-amber-50 p-3 rounded-lg text-sm">
                      <span>Rendu monnaie</span><b className="text-amber-800">{money(change)} fcfa</b>
                    </div>
                  </div>
                )}
                {method === 'ROOM_CHARGE' && (
  <div className="space-y-2">
    <label className="text-xs font-medium text-slate-600">Sélectionner la chambre *</label>
    {activeStays.length === 0 ? (
      <div className="space-y-2">
        <p className="text-sm text-amber-700 bg-amber-50 p-3 rounded-lg flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          Aucune chambre occupée trouvée.
        </p>
        <button 
          onClick={() => window.location.href = '/restaurant/salle'} 
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white text-sm py-2 rounded-lg"
        >
          🏨 Aller au plan de salle
        </button>
      </div>
    ) : (
      <select
        value={selectedStayId}
        onChange={(e) => setSelectedStayId(e.target.value)}
        className="w-full border-2 border-purple-300 rounded-lg px-3 py-2 bg-white text-sm focus:ring-2 focus:ring-purple-500"
      >
        <option value="">-- Choisir une chambre occupée --</option>
        {activeStays.map((stay: any) => (
          <option key={stay.id} value={stay.id}>
            Ch. {stay.rooms?.number || '—'} — {`${stay.customers?.last_name || ''} ${stay.customers?.first_name || ''}`.trim() || 'Client'} (Solde: {money(stay.folio_balance || 0)} fcfa)
          </option>
        ))}
        {/* ✅ Si le stay_id de la commande n'est pas dans la liste (check-out récent), on l'ajoute */}
        {selected?.stay_id && !activeStays.some((s: any) => s.id === selected.stay_id) && (
          <option value={selected.stay_id}>
            Ch. {selected.rooms?.number || '—'} — Client de la commande {selected.order_number}
          </option>
        )}
      </select>
    )}
    <p className="text-xs bg-purple-50 text-purple-800 p-3 rounded-lg flex items-start gap-2">
      <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
      <span>Le montant de <b>{money(total)} fcfa</b> sera ajouté au folio. Le client règlera le total lors de son check-out.</span>
    </p>
  </div>
)}
                <input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Référence / note (optionnel)" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                <button onClick={pay} disabled={busy || !session} className="w-full bg-amber-600 hover:bg-amber-700 disabled:bg-slate-300 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2">
                  {busy ? 'Encaissement...' : <><CheckCircle2 className="w-5 h-5"/> Encaisser et imprimer</>}
                </button>
                {!session && <p className="text-xs text-red-600 text-center">Ouvrez une session dans l'onglet Clôture.</p>}
              </>
            )}
          </div>
        </div>
      )}

      {tab === 'session' && session && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Session de Caisse</h3>
              <p className="text-sm text-slate-500">Ouverte le {new Date(session.opened_at).toLocaleString('fr-FR')}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={loadSession} className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium"><RefreshCw className="w-4 h-4" />Rafraîchir</button>
              <button onClick={() => setShowNewExpenseModal(true)} className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-medium"><Plus className="w-4 h-4" />Nouvelle Dépense</button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
              <div className="text-sm text-emerald-700 mb-2">Ventes Totales</div>
              <div className="text-2xl font-bold text-emerald-900">
                {sessionPayments.reduce((sum, p) => sum + Number(p.amount), 0).toLocaleString('fr-FR')} f CFA
              </div>
              <div className="text-xs text-emerald-700 mt-2">
                {sessionPayments.length} transaction(s)
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <div className="text-sm text-blue-700 mb-2 flex items-center gap-1">
                <Banknote className="w-3 h-3" />
                Ventes Espèces
              </div>
              <div className="text-2xl font-bold text-blue-900">
                {sessionPayments.filter(p => p.method === 'CASH').reduce((sum, p) => sum + Number(p.amount), 0).toLocaleString('fr-FR')} f CFA
              </div>
            </div>

            <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
              <div className="text-sm text-purple-700 mb-2 flex items-center gap-1">
                <Smartphone className="w-3 h-3" />
                Mobile Money
              </div>
              <div className="text-2xl font-bold text-purple-900">
                {sessionPayments.filter(p => p.method === 'MOBILE_MONEY').reduce((sum, p) => sum + Number(p.amount), 0).toLocaleString('fr-FR')} f CFA
              </div>
            </div>

            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <div className="text-sm text-red-700 mb-2 flex items-center gap-1">
                <TrendingDown className="w-3 h-3" />
                Dépenses Caisse
              </div>
              <div className="text-2xl font-bold text-red-900">
                {cashExpenses.reduce((sum, e) => sum + Number(e.amount), 0).toLocaleString('fr-FR')} f CFA
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <div className="text-sm text-amber-700 mb-2 flex items-center gap-1">
                <DollarSign className="w-3 h-3" />
                Solde Théorique
              </div>
              <div className="text-2xl font-bold text-amber-900">
                {expectedCash.toLocaleString('fr-FR')} f CFA
              </div>
              <div className="mt-2 space-y-1 text-xs">
                <div className="flex justify-between text-amber-700">
                  <span>Ouverture:</span>
                  <span>{Number(session.opening_float).toLocaleString('fr-FR')} f CFA</span>
                </div>
                <div className="flex justify-between text-amber-700">
                  <span>+ Espèces:</span>
                  <span>+{sessionPayments.filter(p => p.method === 'CASH').reduce((sum, p) => sum + Number(p.amount), 0).toLocaleString('fr-FR')} f CFA</span>
                </div>
                <div className="flex justify-between text-amber-700">
                  <span>- Dépenses:</span>
                  <span>-{cashExpenses.reduce((sum, e) => sum + Number(e.amount), 0).toLocaleString('fr-FR')} f CFA</span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
            <div className="p-4 border-b border-slate-200">
              <h4 className="font-semibold text-slate-900 flex items-center gap-2">
                <Receipt className="w-4 h-4 text-blue-600" />
                Ventes ({sessionPayments.length})
              </h4>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500 font-semibold">
                  <tr>
                    <th className="px-4 py-3 text-left">HEURE</th>
                    <th className="px-4 py-3 text-left">COMMANDE</th>
                    <th className="px-4 py-3 text-left">TABLE</th>
                    <th className="px-4 py-3 text-left">MÉTHODE</th>
                    <th className="px-4 py-3 text-right">MONTANT</th>
                    <th className="px-4 py-3 text-right">MONNAIE</th>
                    <th className="px-4 py-3 text-right">NET</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sessionPayments.map((payment) => (
                    <tr key={payment.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-600">
                        {new Date(payment.paid_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {payment.restaurant_orders?.order_number || 'N/A'}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {payment.restaurant_orders?.restaurant_tables?.number || 
                         payment.restaurant_orders?.rooms?.number || 
                         'TEST'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                          payment.method === 'CASH' 
                            ? 'bg-emerald-100 text-emerald-800' 
                            : payment.method === 'MOBILE_MONEY'
                            ? 'bg-purple-100 text-purple-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}>
                          {payment.method === 'CASH' ? 'Espèces' : 
                           payment.method === 'MOBILE_MONEY' ? 'Mobile' : 
                           payment.method}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-slate-900">
                        {Number(payment.amount).toLocaleString('fr-FR')} f CFA
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600">
                        {Number(payment.change_amount).toLocaleString('fr-FR')} f CFA
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-slate-900">
                        {Number(payment.received_amount - payment.change_amount).toLocaleString('fr-FR')} fCFA
                      </td>
                    </tr>
                  ))}
                  {sessionPayments.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                        Aucune vente dans cette session
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <h4 className="font-semibold text-slate-900">
                Dépenses de caisse ({cashExpenses.length})
              </h4>
              <button
                onClick={() => setShowNewExpenseModal(true)}
                className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium"
              >
                <Plus className="w-4 h-4" />
                Nouvelle Dépense
              </button>
            </div>
            
            {cashExpenses.length === 0 ? (
              <div className="p-8 text-center text-slate-400">
                <TrendingDown className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>Aucune dépense enregistrée dans cette session</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500 font-semibold">
                    <tr>
                      <th className="px-4 py-3 text-left">HEURE</th>
                      <th className="px-4 py-3 text-left">CATÉGORIE</th>
                      <th className="px-4 py-3 text-left">DESCRIPTION</th>
                      <th className="px-4 py-3 text-left">MÉTHODE</th>
                      <th className="px-4 py-3 text-right">MONTANT</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {cashExpenses.map((expense) => (
                      <tr key={expense.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 text-slate-600">
                          {new Date(expense.created_at).toLocaleTimeString('fr-FR', { 
                            hour: '2-digit', 
                            minute: '2-digit' 
                          })}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                            {expense.category}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-900">
                          {expense.description}
                          {expense.notes && (
                            <div className="text-xs text-slate-500 mt-1">{expense.notes}</div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
                            {expense.payment_method}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-red-600">
                          -{Number(expense.amount).toLocaleString('fr-FR')} f CFA
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-red-50 font-bold">
                    <tr>
                      <td colSpan={4} className="px-4 py-3 text-right">Total dépenses :</td>
                      <td className="px-4 py-3 text-right text-red-700">
                        -{cashExpenses.reduce((sum, e) => sum + Number(e.amount), 0).toLocaleString('fr-FR')} f CFA
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'reconciliations' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-slate-900 flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  Réconciliation Hôtel ↔ Restaurant
                </h3>
                <p className="text-sm text-slate-500 mt-1">
                  Commandes chambre facturées au folio - Statut des paiements
                </p>
              </div>
              <button 
                onClick={autoReconcile}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
              >
                <RefreshCw className="w-4 h-4" /> Réconcilier automatiquement
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                <div className="text-xs text-emerald-700">✅ Payées (réconciliées)</div>
                <div className="text-xl font-bold text-emerald-900">
                  {reconciliations.filter(r => r.reconciliationStatus === 'paid').length}
                </div>
                <div className="text-xs text-emerald-700">
                  {money(reconciliations.filter(r => r.reconciliationStatus === 'paid').reduce((s, r) => s + Number(r.total_amount), 0))} fcfa
                </div>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <div className="text-xs text-amber-700">⏳ En attente (client sur place)</div>
                <div className="text-xl font-bold text-amber-900">
                  {reconciliations.filter(r => r.reconciliationStatus === 'pending').length}
                </div>
                <div className="text-xs text-amber-700">
                  {money(reconciliations.filter(r => r.reconciliationStatus === 'pending').reduce((s, r) => s + Number(r.total_amount), 0))} fcfa
                </div>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <div className="text-xs text-red-700">❌ Anomalies (check-out impayé)</div>
                <div className="text-xl font-bold text-red-900">
                  {reconciliations.filter(r => r.reconciliationStatus === 'anomaly').length}
                </div>
                <div className="text-xs text-red-700">
                  {money(reconciliations.filter(r => r.reconciliationStatus === 'anomaly').reduce((s, r) => s + Number(r.total_amount), 0))} fcfa
                </div>
              </div>
              <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
                <div className="text-xs text-indigo-700">Total commandes chambre</div>
                <div className="text-xl font-bold text-indigo-900">{reconciliations.length}</div>
                <div className="text-xs text-indigo-700">
                  {money(reconciliations.reduce((s, r) => s + Number(r.total_amount), 0))} fcfa
                </div>
              </div>
            </div>
          </div>

          {reconciliationAlert.anomaly > 0 && (
            <div className="bg-red-50 border-2 border-red-300 rounded-xl p-4 flex items-start gap-3 animate-pulse">
              <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h4 className="font-bold text-red-900">
                  ⚠️ {reconciliationAlert.anomaly} commande(s) chambre non réconciliée(s)
                </h4>
                <p className="text-sm text-red-700 mt-1">
                  Des clients ont fait leur check-out mais leur folio n'est pas réglé. 
                  Montant total en risque : <b>{money(reconciliationAlert.anomalyAmount)} fcfa</b>
                </p>
                <p className="text-xs text-red-600 mt-2">
                  → Contactez immédiatement la réception pour régulariser ces situations.
                </p>
              </div>
              <button 
                onClick={() => setTab('reconciliations')}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex-shrink-0"
              >
                Voir les détails
              </button>
            </div>
          )}

          {reconciliationAlert.pending > 0 && reconciliationAlert.anomaly === 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-3">
              <Clock className="w-5 h-5 text-amber-600" />
              <div className="flex-1">
                <p className="text-sm text-amber-800">
                  <b>{reconciliationAlert.pending} commande(s) chambre</b> en attente de check-out client.
                </p>
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200">
              <h4 className="font-semibold text-slate-900">Détail des commandes chambre</h4>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500 font-semibold">
                  <tr>
                    <th className="px-4 py-3 text-left">DATE</th>
                    <th className="px-4 py-3 text-left">N° COMMANDE</th>
                    <th className="px-4 py-3 text-left">CHAMBRE</th>
                    <th className="px-4 py-3 text-left">CLIENT</th>
                    <th className="px-4 py-3 text-left">STATUT SÉJOUR</th>
                    <th className="px-4 py-3 text-right">MONTANT</th>
                    <th className="px-4 py-3 text-center">RÉCONCILIATION</th>
                    <th className="px-4 py-3 text-center">ACTIONS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {reconciliations.map((recon) => (
                    <tr key={recon.id} className={`hover:bg-slate-50 ${
                      recon.reconciliationStatus === 'paid' ? 'bg-emerald-50/30' :
                      recon.reconciliationStatus === 'anomaly' ? 'bg-red-50/30' : ''
                    }`}>
                      <td className="px-4 py-3 text-slate-600">
                        {new Date(recon.created_at).toLocaleDateString('fr-FR')}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {recon.order_number}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        Ch. {recon.room_number}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {recon.guest_name}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                          recon.stay_status === 'CHECKED_OUT' 
                            ? 'bg-slate-200 text-slate-700'
                            : recon.stay_status === 'IN_HOUSE'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-slate-100 text-slate-600'
                        }`}>
                          {recon.stay_status === 'CHECKED_OUT' ? '🚪 Sorti' : 
                           recon.stay_status === 'IN_HOUSE' ? '🏨 Sur place' : recon.stay_status}
                        </span>
                        {recon.stay_status === 'CHECKED_OUT' && recon.folio_balance > 0 && (
                          <div className="text-[10px] text-red-600 mt-1">
                            Solde: {money(recon.folio_balance)} fcfa
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-slate-900">
                        {money(recon.total_amount)} fcfa
                      </td>
                      <td className="px-4 py-3 text-center">
                        {recon.reconciliationStatus === 'paid' && (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                            <CheckCircle2 className="w-3 h-3" /> Payé
                          </span>
                        )}
                        {recon.reconciliationStatus === 'pending' && (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                            <Clock className="w-3 h-3" /> En attente
                          </span>
                        )}
                        {recon.reconciliationStatus === 'anomaly' && (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                            <AlertCircle className="w-3 h-3" /> Anomalie
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {recon.reconciliationStatus !== 'paid' && (
                          <button 
                            onClick={() => reconcileOrder(recon.order_id)}
                            className="inline-flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded text-xs font-medium"
                          >
                            <CheckCircle2 className="w-3 h-3" /> Valider
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {reconciliations.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                        Aucune commande chambre à réconcilier
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
            <h4 className="font-semibold text-indigo-900 mb-2 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" /> Comment ça marche ?
            </h4>
            <ul className="text-sm text-indigo-800 space-y-1 list-disc pl-5">
              <li><b>✅ Payé</b> : Le client a fait son check-out et réglé son folio à la réception. La commande est automatiquement marquée comme réconciliée.</li>
              <li><b>⏳ En attente</b> : Le client est encore dans l'hôtel. La commande sera réconciliée automatiquement lors du check-out.</li>
              <li><b>❌ Anomalie</b> : Le client a fait son check-out mais le folio n'est pas réglé. Action requise avec la réception.</li>
              <li>Le bouton <b>"Réconcilier automatiquement"</b> traite toutes les commandes dont le séjour est CHECKED_OUT avec folio à 0.</li>
            </ul>
          </div>
        </div>
      )}

      {tab === 'historique' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="p-4 flex justify-between items-center border-b">
            <h3 className="font-semibold flex items-center gap-2">
              <History className="w-4 h-4 text-slate-500" />
              Derniers encaissements
            </h3>
            <button onClick={exportCSV} className="flex items-center gap-2 text-sm bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded-lg transition-colors">
              <Download className="w-4 h-4"/> Export CSV
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-left">Commande</th>
                  <th className="px-4 py-3 text-left">Moyen de paiement</th>
                  <th className="px-4 py-3 text-right">Montant</th>
                  <th className="px-4 py-3 text-right">Monnaie</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {payments.map(p => {
                  const isRoomCharge = p.method === 'ROOM_CHARGE';
                  return (
                    <tr key={p.id} className={`hover:bg-slate-50 transition-colors ${isRoomCharge ? 'bg-purple-50/40' : ''}`}>
                      <td className="px-4 py-3 text-slate-600">
                        {new Date(p.paid_at).toLocaleString('fr-FR')}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {p.restaurant_orders?.order_number || 'N/A'}
                      </td>
                      <td className="px-4 py-3">
                        {isRoomCharge ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-100 text-purple-800 border border-purple-200">
                            <Hotel className="w-3.5 h-3.5" />
                            Réception (Folio)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
                            {METHODS.find(m => m.key === p.method)?.label || p.method}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-slate-900">
                        {money(p.amount)} fcfa
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600">
                        {money(p.change_amount)} fcfa
                      </td>
                    </tr>
                  );
                })}
                {payments.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-400">
                      Aucun encaissement enregistré.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'cloture' && (
        <div className="grid md:grid-cols-2 gap-5">
          {!session ? (
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <h3 className="font-bold flex items-center gap-2"><Play className="w-5 h-5 text-amber-600"/> Ouvrir la caisse</h3>
              <label className="block text-sm text-slate-600">Fond de caisse (monnaie de départ)</label>
              <input type="number" value={openingFloat} onChange={e=>setOpeningFloat(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2" />
              <button onClick={openSession} disabled={busy} className="w-full bg-amber-600 text-white font-semibold py-3 rounded-lg disabled:bg-slate-300">Ouvrir la session</button>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <h3 className="font-bold flex items-center gap-2"><Lock className="w-5 h-5"/> Clôture de session</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span>Fond de caisse</span><b>{money(session.opening_float)} fcfa</b></div>
                <div className="flex justify-between"><span>Ventes espèces</span><b>{money(sessionPayments.filter(p=>p.method==='CASH').reduce((s,p)=>s+Number(p.amount),0))} fcfa</b></div>
                <div className="flex justify-between"><span>Autres moyens</span><b>{money(sessionPayments.filter(p=>p.method!=='CASH').reduce((s,p)=>s+Number(p.amount),0))} fcfa</b></div>
                <div className="flex justify-between border-t pt-2"><span>Montant attendu en tiroir</span><b className="text-amber-700">{money(expectedCash)} fcfa</b></div>
              </div>
              <label className="block text-sm text-slate-600">Montant compté dans le tiroir</label>
              <input type="number" value={counted} onChange={e=>setCounted(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2" />
              
              {/* ✅ NOUVEAU BOUTON D'IMPRESSION DU RAPPORT */}
              <button onClick={handlePrintClosingReport} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2">
                <Printer className="w-5 h-5" /> 📄 Imprimer le rapport de fermeture (A4 + QR)
              </button>

              {counted !== '' && (
                <div className={`p-3 rounded-lg text-sm flex justify-between ${Number(counted)-expectedCash===0?'bg-emerald-50 text-emerald-800':'bg-red-50 text-red-800'}`}>
                  <span>Écart de caisse</span><b>{Number(counted)-expectedCash > 0 ? '+' : ''}{money(Number(counted)-expectedCash)} fcfa</b>
                </div>
              )}
              <button onClick={closeSession} disabled={busy} className="w-full bg-slate-800 text-white font-semibold py-3 rounded-lg disabled:bg-slate-300">Clôturer la session</button>
            </div>
          )}

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-6">
            <h3 className="font-semibold mb-3 flex items-center gap-2"><TrendingUp className="w-5 h-5"/> Procédure de clôture</h3>
            <ol className="list-decimal pl-5 space-y-2 text-sm text-slate-600">
              <li>Encaissez toutes les commandes en attente.</li>
              <li>Comptez physiquement les billets et pièces du tiroir.</li>
              <li>Saisissez ce montant ci-contre.</li>
              <li>Imprimez le rapport de fermeture (A4) avec le QR code d'authenticité.</li>
              <li>Un écart nul valide la session. Signalez tout écart au manager.</li>
            </ol>
          </div>
        </div>
      )}

      <NewCashExpenseModal isOpen={showNewExpenseModal} onClose={() => setShowNewExpenseModal(false)} siteId={siteId} onSuccess={() => { loadAll(); }} />
    </div>
  );
}
