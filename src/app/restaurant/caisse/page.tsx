//src/app/restaurant/caisse/page.tsx
'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  DollarSign, Search, CreditCard, Banknote, Smartphone, BedDouble,
  ArrowRightLeft, Printer, X, CheckCircle2, Lock, History,
  TrendingUp, TrendingDown, Download, RefreshCw, ReceiptText, AlertCircle, Play, Plus, Receipt, Hotel
} from 'lucide-react';
import NewCashExpenseModal from './components/NewCashExpenseModal';

interface OrderItem {
  item_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}
interface Order {
  id: string;
  order_number: string;
  status: string;
  total_amount: number;
  created_at: string;
  table_id?: string | null;
  room_id?: string | null;
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
    restaurant_tables?: { number: string } | null; // ✅ AJOUTÉ
    rooms?: { number: string } | null;             // ✅ AJOUTÉ
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
  
  // ✅ NOUVEAU : États pour les séjours actifs (chambres occupées)
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

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      const { data } = await supabase.from('profiles').select('site_id').eq('id', user.id).maybeSingle();
      if (data?.site_id) setSiteId(data.site_id);
    })();
  }, []);

  // Remplacez votre useEffect actuel par celui-ci
useEffect(() => { 
  if (siteId) {
    loadAll();
  }
}, [siteId]);

// ✅ NOUVEAU : Charger les dépenses quand on active l'onglet Session
useEffect(() => {
  if (tab === 'session' && session) {
    loadSessionExpenses();
  }
}, [tab, session]);

  const loadSession = async () => {
  const { data } = await supabase.from('cash_sessions')
    .select('*').eq('site_id', siteId).eq('status', 'OPEN')
    .order('opened_at', { ascending: false }).limit(1).maybeSingle();
  setSession(data || null);
  if (data) {
    // ✅ CORRECTION : Charger les relations restaurant_orders et restaurant_tables
    const { data: p } = await supabase.from('restaurant_payments')
      .select(`
        *,
        restaurant_orders(order_number, table_id, room_id, restaurant_tables(number), rooms(number))
      `)
      .eq('session_id', data.id);
    setSessionPayments(p || []);
  } else setSessionPayments([]);
};
// Fonction de chargement
const loadReconciliations = async () => {
  const { data } = await supabase
    .from('payment_reconciliation')
    .select(`
      *,
      restaurant_orders(order_number, total_amount),
      restaurant_payments(paid_at)
    `)
    .order('reconciliation_date', { ascending: false })
    .limit(50);
  
  setReconciliations(data || []);
};

// Charger les réconciliations quand on active l'onglet
useEffect(() => {
  if (tab === 'reconciliations') {
    loadReconciliations();
  }
}, [tab]);
   const loadActiveStays = async () => {
  try {
    console.log('🔍 Chargement des séjours actifs...');
    
    const { data: staysData, error: staysError } = await supabase
      .from('stays')
      .select(`
        id, folio_balance,
        rooms!room_id(number),
        customers(first_name, last_name)
      `)
      .eq('status', 'IN_HOUSE')
      .order('check_in_at', { ascending: false });

    if (staysError) {
      console.error('❌ Erreur Supabase:', staysError);
      setActiveStays([]);
      return;
    }

    console.log('✅ Séjours trouvés:', staysData?.length || 0);
    console.log('📦 Données brutes:', staysData);

    if (staysData && staysData.length > 0) {
      // ✅ CORRECTION CRUCIALE : Extraire correctement les tableaux de jointures
      const formattedStays = staysData.map(stay => ({
        ...stay,
        // rooms est un tableau [{ number: "110" }], on prend le premier élément
        rooms: stay.rooms?.[0] || null,
        // customers est un tableau [{ first_name: "VEST", last_name: "TEST" }]
        customers: stay.customers?.[0] || { first_name: 'Client', last_name: 'Inconnu' }
      }));
      
      console.log('📦 Données formatées:', formattedStays);
      setActiveStays(formattedStays);
    } else {
      console.warn('⚠️ Aucun séjour IN_HOUSE trouvé');
      setActiveStays([]);
    }
  } catch (error) {
    console.error('❌ Erreur chargement séjours:', error);
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
    const { data: o } = await supabase.from('restaurant_orders')
      .select(`*, restaurant_tables(number), rooms(number),
        restaurant_order_items(item_name, quantity, unit_price, total_price)`)
      .eq('site_id', siteId)
      .in('status', ['DRAFT','SENT','PREPARING','READY','SERVED'])
      .order('created_at', { ascending: false });
    setOrders(o || []);

    const { data: p } = await supabase.from('restaurant_payments')
      .select('*, restaurant_orders(order_number)')
      .eq('site_id', siteId)
      .order('paid_at', { ascending: false }).limit(200);
    setPayments(p || []);
    
        // ✅ CORRECTION : Utiliser la fonction qui formate correctement les données
    await loadActiveStays();
    
    await loadSession();
  await loadSessionExpenses();
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
  const expenses = cashExpenses.reduce((sum, e) => sum + (e.amount || 0), 0); // ✅ Soustraire les dépenses
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

  const total = Number(selected?.total_amount || 0);
  const change = Math.max((Number(received) || 0) - total, 0);

  const pay = async () => {
    if (!selected || !session) return;
    if (method === 'CASH' && (Number(received) || 0) < total) {
      setError('Le montant reçu est inférieur au total.'); return;
    }
    // ✅ NOUVEAU : Validation obligatoire pour ROOM_CHARGE
    if (method === 'ROOM_CHARGE' && !selectedStayId) {
      setError('Veuillez sélectionner la chambre à facturer.'); return;
    }

    setBusy(true); setError(''); setSuccess('');
    const { data, error: e } = await supabase.rpc('finalize_payment', {
      p_order_id: selected.id, 
      p_session_id: session.id,
      p_method: method, 
      p_received: Number(received) || 0, 
      p_notes: notes,
      p_stay_id: method === 'ROOM_CHARGE' ? selectedStayId : null // ✅ Passage du stay_id
    });
    
    if (e) { setError(e.message); setBusy(false); return; }

    setSuccess(`✅ Payé — ${data.order_number} · Rendu monnaie : ${money(data.change)} F`);
printTicket(selected, data);

// ✅ NOUVEAU : Libérer la table après paiement
if (selected.table_id) {
  await supabase.from('restaurant_tables').update({ status: 'AVAILABLE' }).eq('id', selected.table_id);
}

setSelected(null); setReceived(''); setNotes(''); setSelectedStayId('');
await loadAll(); setBusy(false);
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
      <h1>HAPPINESS</h1><p>Hotel • Resto • Lounge<br>Ouaga 2000 — +226 57 40 11 11</p></div>
      <div class="line"></div>
      <div class="row"><span>Commande</span><b>${payData.order_number}</b></div>
      <div class="row"><span>Date</span><span>${new Date().toLocaleString('fr-FR')}</span></div>
      <div class="line"></div>
      ${(order.restaurant_order_items || []).map(i => `<div class="row"><span>${i.item_name} x${i.quantity}</span><span>${money(i.total_price)}</span></div>`).join('')}
      <div class="line"></div>
      <div class="row total"><span>TOTAL</span><span>${money(payData.total)} F</span></div>
      <div class="row"><span>${label}</span><span>${money(payData.received)} F</span></div>
      <div class="row"><span>Rendu monnaie</span><b>${money(payData.change)} F</b></div>
      <div class="line"></div>
      <p class="c">Merci de votre visite !<br>Embrace happiness...</p>
      </body></html>`);
    w.document.close();
    setTimeout(() => { w.print(); w.close(); }, 300);
  };

  const exportCSV = () => {
    const rows = [['Date','Commande','Moyen','Montant','Reçu','Monnaie'],
      ...payments.map(p => [p.paid_at, p.restaurant_orders?.order_number || '', p.method,
        p.amount, p.received_amount, p.change_amount])];
    const blob = new Blob(['\uFEFF' + rows.map(r => r.join(';')).join('\n')], { type:'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `caisse_${new Date().toISOString().slice(0,10)}.csv`; a.click();
  };

  const filtered = orders.filter(o => o.order_number.toLowerCase().includes(search.toLowerCase()));
  const todayRevenue = payments.filter(p => new Date(p.paid_at).toDateString() === new Date().toDateString())
    .reduce((s,p) => s + Number(p.amount), 0);
  const locationLabel = (o: Order) => o.restaurant_tables?.number
    ? `Table ${o.restaurant_tables.number}` : o.rooms?.number ? `Ch. ${o.rooms.number}` : 'À emporter';

  return (
    <div className="p-4 lg:p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <DollarSign className="w-7 h-7 text-emerald-600" /> Caisse
          </h1>
          <p className="text-sm text-slate-500">Encaissement, rendu monnaie et clôture de session.</p>
        </div>
        <button onClick={loadAll} className="flex items-center gap-2 text-sm bg-white border border-slate-200 px-3 py-2 rounded-lg">
          <RefreshCw className="w-4 h-4" /> Actualiser
        </button>
      </div>

      {/* Stats + session */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
          <div className="text-xs text-emerald-700">CA du jour</div>
          <div className="text-xl font-bold text-emerald-900">{money(todayRevenue)} F</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Transactions</div>
          <div className="text-xl font-bold">{payments.length}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">En caisse (théorique)</div>
          <div className="text-xl font-bold">{money(expectedCash)} F</div>
        </div>
        <div className={`rounded-xl p-4 border ${session ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
          <div className="text-xs flex items-center gap-1">
            {session ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
            {session ? 'Caisse ouverte' : 'Caisse fermée'}
          </div>
          <div className="text-xs mt-1 text-slate-600">
            {session ? `Fond : ${money(session.opening_float)} F` : 'Ouvrez une session pour encaisser'}
          </div>
        </div>
      </div>

         {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200">
  {([
    ['vente','Ventes',ReceiptText], 
    ['session','Session',DollarSign], 
    ['historique','Historique',History], 
    ['reconciliations','Réconciliations',CheckCircle2], // ✅ NOUVEL ONGLET
    ['cloture','Clôture',Lock]
  ] as const).map(([k,l,Icon]) => (
    <button key={k} onClick={() => setTab(k)}
      className={`flex items-center gap-2 px-4 py-3 text-sm font-medium ${
        tab===k?'border-b-2 border-emerald-600 text-emerald-700':'text-slate-500'
      }`}>
      <Icon className="w-4 h-4" /> {l}
    </button>
  ))}
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
          {/* Liste des commandes */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-slate-200">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="N° de commande..."
                  className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm" />
              </div>
            </div>
            <div className="max-h-[520px] overflow-y-auto divide-y divide-slate-100">
              {filtered.length === 0 && <p className="p-8 text-center text-sm text-slate-400">Aucune commande à encaisser.</p>}
              {filtered.map(o => (
                <button key={o.id} onClick={()=>{setSelected(o);setReceived('');setError('');setSelectedStayId('');}}
                  className={`w-full text-left p-4 hover:bg-slate-50 flex justify-between items-center ${selected?.id===o.id?'bg-emerald-50 border-l-4 border-emerald-600':''}`}>
                  <div>
                    <div className="font-bold text-slate-900">{o.order_number}</div>
                    <div className="text-xs text-slate-500">{locationLabel(o)} · {o.restaurant_order_items?.length || 0} article(s)</div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-emerald-700">{money(o.total_amount)} F</div>
                    <div className="text-[10px] text-slate-400">{o.status}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Paiement */}
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
                      <span>{i.item_name} × {i.quantity}</span><span>{money(i.total_price)} F</span>
                    </div>
                  ))}
                </div>

                <div className="flex justify-between items-center bg-emerald-50 p-4 rounded-xl">
                  <span className="font-semibold">Total à payer</span>
                  <span className="text-2xl font-bold text-emerald-700">{money(total)} F</span>
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-600 mb-2 block">Moyen de paiement</label>
                  <div className="grid grid-cols-3 gap-2">
                    {METHODS.map(m => (
                      <button key={m.key} onClick={()=>setMethod(m.key)}
                        className={`p-3 rounded-lg border-2 text-xs font-medium flex flex-col items-center gap-1
                          ${method===m.key?'border-emerald-500 bg-emerald-50 text-emerald-700':'border-slate-200 text-slate-600'}`}>
                        <m.icon className="w-5 h-5" />{m.label}
                      </button>
                    ))}
                  </div>
                </div>

                {method === 'CASH' && (
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-slate-600">Montant reçu (F)</label>
                    <input type="number" value={received} onChange={e=>setReceived(e.target.value)}
                      placeholder="0" className="w-full border border-slate-300 rounded-lg px-3 py-2" />
                    <div className="flex gap-2 flex-wrap">
                      {[total,5000,10000,20000,50000].map((v,i)=>(
                        <button key={i} onClick={()=>setReceived(String(Math.max(v,0)))}
                          className="px-3 py-1 bg-slate-100 rounded-lg text-xs font-medium">
                          {i===0?'Juste':`${money(v)}`}
                        </button>
                      ))}
                    </div>
                    <div className="flex justify-between bg-amber-50 p-3 rounded-lg text-sm">
                      <span>Rendu monnaie</span><b className="text-amber-800">{money(change)} F</b>
                    </div>
                  </div>
                )}

                {/* ✅ NOUVEAU : Sélecteur de chambre pour ROOM_CHARGE */}
{method === 'ROOM_CHARGE' && (
  <div className="space-y-2">
    <label className="text-xs font-medium text-slate-600">Sélectionner la chambre *</label>
        {/* DEBUG */}
{process.env.NODE_ENV === 'development' && (
  <div className="text-xs text-slate-500 mb-2">
    Debug: activeStays.length = {activeStays.length}
  </div>
)}
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
          🏨 Aller au plan de salle pour faire un check-in
        </button>
      </div>
    ) : (
      <select 
  value={selectedStayId} 
  onChange={(e) => setSelectedStayId(e.target.value)}
  className="w-full border-2 border-purple-300 rounded-lg px-3 py-2 bg-white text-sm focus:ring-2 focus:ring-purple-500"
>
  <option value="">-- Choisir une chambre occupée --</option>
  {activeStays.map(stay => (
    <option key={stay.id} value={stay.id}>
       Ch. {stay.rooms?.number} — {stay.customers?.first_name} {stay.customers?.last_name} 
      (Solde: {money(stay.folio_balance || 0)} F)
    </option>
  ))}
</select>
    )}
    <p className="text-xs bg-purple-50 text-purple-800 p-3 rounded-lg flex items-start gap-2">
      <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
      <span>Le montant de <b>{money(total)} F</b> sera ajouté au folio de cette chambre. Le client règlera le total lors de son check-out.</span>
    </p>
  </div>
)}

                <input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Référence / note (optionnel)"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />

                <button onClick={pay} disabled={busy || !session}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2">
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
    {/* Header de la session */}
    <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between">
      <div>
        <h3 className="text-lg font-bold text-slate-900">Session de Caisse</h3>
        <p className="text-sm text-slate-500">
          Ouverte le {new Date(session.opened_at).toLocaleString('fr-FR')}
        </p>
      </div>
      <div className="flex gap-2">
        <button
          onClick={loadSession}
          className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium"
        >
          <RefreshCw className="w-4 h-4" />
          Rafraîchir
        </button>
        <button
          onClick={() => setShowNewExpenseModal(true)}
          className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          Nouvelle Dépense
        </button>
      </div>
    </div>

    {/* Cartes de statistiques */}
    <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
      {/* Ventes Totales */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
        <div className="text-sm text-emerald-700 mb-2">Ventes Totales</div>
        <div className="text-2xl font-bold text-emerald-900">
          {sessionPayments.reduce((sum, p) => sum + Number(p.amount), 0).toLocaleString('fr-FR')} f CFA
        </div>
        <div className="text-xs text-emerald-700 mt-2">
          {sessionPayments.length} transaction(s)
        </div>
        <div className="mt-2 space-y-1 text-xs">
          <div className="flex justify-between text-emerald-700">
            <span>Espèces:</span>
            <span className="font-medium">
              {((sessionPayments.filter(p => p.method === 'CASH').reduce((sum, p) => sum + Number(p.amount), 0) / 
                (sessionPayments.reduce((sum, p) => sum + Number(p.amount), 0) || 1)) * 100).toFixed(1)}%
            </span>
          </div>
          <div className="flex justify-between text-emerald-700">
            <span>Mobile:</span>
            <span className="font-medium">
              {((sessionPayments.filter(p => p.method === 'MOBILE_MONEY').reduce((sum, p) => sum + Number(p.amount), 0) / 
                (sessionPayments.reduce((sum, p) => sum + Number(p.amount), 0) || 1)) * 100).toFixed(1)}%
            </span>
          </div>
        </div>
      </div>

      {/* Ventes Espèces */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <div className="text-sm text-blue-700 mb-2 flex items-center gap-1">
          <Banknote className="w-3 h-3" />
          Ventes Espèces
        </div>
        <div className="text-2xl font-bold text-blue-900">
          {sessionPayments.filter(p => p.method === 'CASH').reduce((sum, p) => sum + Number(p.amount), 0).toLocaleString('fr-FR')} f CFA
        </div>
        <div className="text-xs text-blue-700 mt-2">
          {sessionPayments.filter(p => p.method === 'CASH').length} transaction(s)
        </div>
        <div className="text-xs text-blue-600 mt-1">
          Moyenne: {(sessionPayments.filter(p => p.method === 'CASH').reduce((sum, p) => sum + Number(p.amount), 0) / 
            (sessionPayments.filter(p => p.method === 'CASH').length || 1)).toLocaleString('fr-FR')} f CFA/trx
        </div>
      </div>

      {/* Mobile Money */}
      <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
        <div className="text-sm text-purple-700 mb-2 flex items-center gap-1">
          <Smartphone className="w-3 h-3" />
          Mobile Money
        </div>
        <div className="text-2xl font-bold text-purple-900">
          {sessionPayments.filter(p => p.method === 'MOBILE_MONEY').reduce((sum, p) => sum + Number(p.amount), 0).toLocaleString('fr-FR')} f CFA
        </div>
        <div className="text-xs text-purple-700 mt-2">
          {sessionPayments.filter(p => p.method === 'MOBILE_MONEY').length} transaction(s)
        </div>
        <div className="text-xs text-purple-600 mt-1">
          Moyenne: {(sessionPayments.filter(p => p.method === 'MOBILE_MONEY').reduce((sum, p) => sum + Number(p.amount), 0) / 
            (sessionPayments.filter(p => p.method === 'MOBILE_MONEY').length || 1)).toLocaleString('fr-FR')} f CFA/trx
        </div>
      </div>

      {/* Dépenses Caisse */}
      <div className="bg-red-50 border border-red-200 rounded-xl p-4">
        <div className="text-sm text-red-700 mb-2 flex items-center gap-1">
          <TrendingDown className="w-3 h-3" />
          Dépenses Caisse
        </div>
        <div className="text-2xl font-bold text-red-900">
          {cashExpenses.reduce((sum, e) => sum + Number(e.amount), 0).toLocaleString('fr-FR')} f CFA
        </div>
        <div className="text-xs text-red-700 mt-2">
          {cashExpenses.length} dépense(s)
        </div>
        <div className="text-xs text-red-600 mt-1">
          Moyenne: {(cashExpenses.reduce((sum, e) => sum + Number(e.amount), 0) / (cashExpenses.length || 1)).toLocaleString('fr-FR')} f CFA/dépense
        </div>
      </div>

      {/* Solde Théorique */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
        <div className="text-sm text-amber-700 mb-2 flex items-center gap-1">
          <DollarSign className="w-3 h-3" />
          Solde Théorique
        </div>
        <div className="text-2xl font-bold text-amber-900">
          {expectedCash.toLocaleString('fr-FR')} f CFA
        </div>
        <div className="inline-flex items-center gap-1 text-xs bg-amber-200 text-amber-800 px-2 py-0.5 rounded mt-2">
          Calculé
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

    {/* Tableau des ventes */}
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
                    {payment.method === 'CASH' && <Banknote className="w-3 h-3" />}
                    {payment.method === 'MOBILE_MONEY' && <Smartphone className="w-3 h-3" />}
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
                  {Number(payment.received_amount - payment.change_amount).toLocaleString('fr-FR')} f CFA
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

    {/* Dépenses de caisse */}
    {/* Dépenses de caisse */}
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
  <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
    <div className="p-4 border-b border-slate-200 flex items-center justify-between">
      <div>
        <h3 className="font-bold text-slate-900 flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          Réconciliations Réception → Restaurant
        </h3>
        <p className="text-sm text-slate-500 mt-1">
          Commandes restaurant payées via la caisse de l'hôtel (réception)
        </p>
      </div>
      <button 
        onClick={loadReconciliations}
        className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded-lg text-sm"
      >
        <RefreshCw className="w-4 h-4" /> Rafraîchir
      </button>
    </div>

    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500 font-semibold">
          <tr>
            <th className="px-4 py-3 text-left">DATE RÉCONCILIATION</th>
            <th className="px-4 py-3 text-left">COMMANDE</th>
            <th className="px-4 py-3 text-left">MONTANT</th>
            <th className="px-4 py-3 text-left">PAYÉ LE</th>
            <th className="px-4 py-3 text-left">RÉCONCILIÉ PAR</th>
            <th className="px-4 py-3 text-left">NOTES</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {reconciliations.map((recon) => (
            <tr key={recon.id} className="hover:bg-slate-50">
              <td className="px-4 py-3 text-slate-600">
                {new Date(recon.reconciliation_date).toLocaleString('fr-FR')}
              </td>
              <td className="px-4 py-3 font-medium text-slate-900">
                {recon.restaurant_orders?.order_number || 'N/A'}
              </td>
              <td className="px-4 py-3 text-right font-bold text-emerald-700">
                {money(recon.restaurant_orders?.total_amount || 0)} f CFA
              </td>
              <td className="px-4 py-3 text-slate-600">
                {recon.restaurant_payments?.paid_at 
                  ? new Date(recon.restaurant_payments.paid_at).toLocaleString('fr-FR')
                  : 'N/A'
                }
              </td>
              <td className="px-4 py-3 text-slate-600">
                {recon.reconciled_by ? 'Réception' : 'Système'}
              </td>
              <td className="px-4 py-3 text-slate-500 text-xs">
                {recon.notes}
              </td>
            </tr>
          ))}
          {reconciliations.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                Aucune réconciliation enregistrée
              </td>
            </tr>
          )}
        </tbody>
      </table>
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
                        {money(p.amount)} F
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600">
                        {money(p.change_amount)} F
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
              <h3 className="font-bold flex items-center gap-2"><Play className="w-5 h-5 text-emerald-600"/> Ouvrir la caisse</h3>
              <label className="block text-sm text-slate-600">Fond de caisse (monnaie de départ)</label>
              <input type="number" value={openingFloat} onChange={e=>setOpeningFloat(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2" />
              <button onClick={openSession} disabled={busy}
                className="w-full bg-emerald-600 text-white font-semibold py-3 rounded-lg disabled:bg-slate-300">
                Ouvrir la session
              </button>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <h3 className="font-bold flex items-center gap-2"><Lock className="w-5 h-5"/> Clôture de session</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span>Fond de caisse</span><b>{money(session.opening_float)} F</b></div>
                <div className="flex justify-between"><span>Ventes espèces</span><b>{money(sessionPayments.filter(p=>p.method==='CASH').reduce((s,p)=>s+Number(p.amount),0))} F</b></div>
                <div className="flex justify-between"><span>Autres moyens</span><b>{money(sessionPayments.filter(p=>p.method!=='CASH').reduce((s,p)=>s+Number(p.amount),0))} F</b></div>
                <div className="flex justify-between border-t pt-2"><span>Montant attendu en tiroir</span><b className="text-emerald-700">{money(expectedCash)} F</b></div>
              </div>
              <label className="block text-sm text-slate-600">Montant compté dans le tiroir</label>
              <input type="number" value={counted} onChange={e=>setCounted(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2" />
              {counted !== '' && (
                <div className={`p-3 rounded-lg text-sm flex justify-between ${Number(counted)-expectedCash===0?'bg-emerald-50 text-emerald-800':'bg-red-50 text-red-800'}`}>
                  <span>Écart de caisse</span><b>{Number(counted)-expectedCash > 0 ? '+' : ''}{money(Number(counted)-expectedCash)} F</b>
                </div>
              )}
              <button onClick={closeSession} disabled={busy}
                className="w-full bg-slate-800 text-white font-semibold py-3 rounded-lg disabled:bg-slate-300">
                Clôturer la session
              </button>
            </div>
          )}

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-6">
            <h3 className="font-semibold mb-3 flex items-center gap-2"><TrendingUp className="w-5 h-5"/> Procédure de clôture</h3>
            <ol className="list-decimal pl-5 space-y-2 text-sm text-slate-600">
              <li>Encaissez toutes les commandes en attente.</li>
              <li>Comptez physiquement les billets et pièces du tiroir.</li>
              <li>Saisissez ce montant ci-contre.</li>
              <li>Un écart nul valide la session. Signalez tout écart au manager.</li>
              <li>Exportez l'historique en CSV pour la comptabilité.</li>
            </ol>
          </div>
        </div>
      )}
            <NewCashExpenseModal
        isOpen={showNewExpenseModal}
        onClose={() => setShowNewExpenseModal(false)}
        siteId={siteId}
        onSuccess={() => {
          loadAll(); // ✅ Correction : utilise loadAll() pour recharger les données
        }}
      />
    </div>
  );
}
