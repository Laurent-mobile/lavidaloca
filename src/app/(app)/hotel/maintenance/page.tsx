'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useHotelRooms } from '@/hooks/useHotel';
import { Wrench, Plus, Trash2, FileText, AlertTriangle, CheckCircle, History, X, Save } from 'lucide-react';
import MaintenanceDetailModal from '@/components/MaintenanceDetailModal';

const categories = [
  { id: 'ROOM', label: 'Chambre (général)', icon: '🚪' },
  { id: 'PLUMBING', label: 'Plomberie', icon: '🚿' },
  { id: 'ELECTRICAL', label: 'Électricité', icon: '⚡' },
  { id: 'HVAC', label: 'Climatisation', icon: '❄️' },
  { id: 'FURNITURE', label: 'Mobilier', icon: '🛏️' },
  { id: 'APPLIANCE', label: 'Appareils', icon: '📺' },
  { id: 'OTHER', label: 'Autre', icon: '🔧' },
];

const priorities = [
  { id: 'LOW', label: 'Basse', color: 'bg-slate-200 text-slate-700' },
  { id: 'MEDIUM', label: 'Moyenne', color: 'bg-blue-200 text-blue-900' },
  { id: 'HIGH', label: 'Haute', color: 'bg-orange-200 text-orange-900' },
  { id: 'URGENT', label: 'Urgente', color: 'bg-red-200 text-red-900' },
];

const docTypes = [
  { id: 'QUOTE', label: 'Cotation / Devis', icon: '📋' },
  { id: 'INVOICE', label: 'Facture', icon: '🧾' },
  { id: 'RECEIPT', label: 'Reçu', icon: '🧾' },
];

export default function MaintenancePage() {
  const supabase = createClient();
  const { siteId, loading: roomsLoading, rooms } = useHotelRooms();
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'active' | 'history'>('active');
  const [requests, setRequests] = useState<any[]>([]);
  const [historyRequests, setHistoryRequests] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [showDocForm, setShowDocForm] = useState<string | null>(null);
  const [documents, setDocuments] = useState<Record<string, any[]>>({});
  const [roomBlocked, setRoomBlocked] = useState('');
  const [detailId, setDetailId] = useState<string | null>(null);
  
  const [form, setForm] = useState({
    room_id: '',
    category: 'ROOM',
    item_description: '',
    issue_description: '',
    priority: 'MEDIUM',
    estimated_cost: 0,
    assigned_to: '',
    notes: '',
  });

  const [docForm, setDocForm] = useState({
    maintenance_request_id: '',
    doc_type: 'INVOICE',
    provider_name: '',
    provider_phone: '',
    amount: 0,
    tax_amount: 0,
    doc_date: new Date().toISOString().split('T')[0],
    reference_number: '',
    description: '',
    notes: '',
  });

  useEffect(() => {
    if (siteId) {
      loadRequests();
      if (activeTab === 'history') loadHistory();
    }
  }, [siteId, activeTab]);

  useEffect(() => {
    if (form.room_id) checkRoomAvailability(form.room_id);
    else setRoomBlocked('');
  }, [form.room_id, rooms]);

  const checkRoomAvailability = (roomId: string) => {
    const room = rooms.find(r => r.id === roomId);
    if (!room) { setRoomBlocked(''); return; }
    if (room.status === 'OCCUPIED') setRoomBlocked('🚫 IMPOSSIBLE : Cette chambre est actuellement OCCUPÉE par un client.');
    else if (room.status === 'RESERVED') setRoomBlocked('⚠️ ATTENTION : Cette chambre est RÉSERVÉE.');
    else setRoomBlocked('');
  };

  const loadRequests = async () => {
    if (!siteId) return;
    const { data, error } = await supabase
      .from('maintenance_requests')
      .select(`id, room_id, category, item_description, issue_description, priority, status, estimated_cost, actual_cost, assigned_to, notes, created_at, completed_at, rooms (number, status)`)
      .eq('site_id', siteId)
      .in('status', ['PENDING', 'IN_PROGRESS'])
      .order('created_at', { ascending: false });
    
    if (data) {
      setRequests(data);
      const docsMap: Record<string, any[]> = {};
      for (const req of data) {
        const { data: docs } = await supabase.from('maintenance_documents').select('*').eq('maintenance_request_id', req.id).order('created_at', { ascending: false });
        if (docs) docsMap[req.id] = docs;
      }
      setDocuments(docsMap);
    }
  };

  const loadHistory = async () => {
    if (!siteId) return;
    const { data } = await supabase
      .from('maintenance_requests')
      .select(`id, room_id, category, item_description, issue_description, priority, status, estimated_cost, actual_cost, assigned_to, notes, created_at, completed_at, rooms (number)`)
      .eq('site_id', siteId)
      .in('status', ['COMPLETED', 'CANCELLED'])
      .order('completed_at', { ascending: false });
    if (data) setHistoryRequests(data);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    if (roomBlocked && roomBlocked.includes('IMPOSSIBLE')) {
      setError(roomBlocked);
      setLoading(false);
      return;
    }
    if (!form.item_description.trim() || !form.issue_description.trim()) {
      setError('Description de l\'équipement et du problème obligatoires.');
      setLoading(false);
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('maintenance_requests').insert({
      site_id: siteId, room_id: form.room_id || null, category: form.category, item_description: form.item_description,
      issue_description: form.issue_description, priority: form.priority, estimated_cost: form.estimated_cost,
      assigned_to: form.assigned_to, notes: form.notes, status: 'PENDING', reported_by: user?.id,
    });
    if (error) {
      setError(error.message);
    } else {
      if (form.room_id) {
        await supabase.from('rooms').update({ status: 'OUT_OF_ORDER', out_of_order_reason: `${form.category}: ${form.issue_description}` }).eq('id', form.room_id);
      }
      loadRequests();
      setShowForm(false);
      setForm({ room_id: '', category: 'ROOM', item_description: '', issue_description: '', priority: 'MEDIUM', estimated_cost: 0, assigned_to: '', notes: '' });
    }
    setLoading(false);
  };

  const handleStatusChange = async (id: string, newStatus: string, roomId?: string) => {
    const updates: any = { status: newStatus };
    if (newStatus === 'COMPLETED') updates.completed_at = new Date().toISOString();
    
    await supabase.from('maintenance_requests').update(updates).eq('id', id);
    
    if (newStatus === 'COMPLETED') {
      const { data: docs } = await supabase.from('maintenance_documents').select('*').eq('maintenance_request_id', id).in('status', ['PENDING', 'APPROVED']);
      if (docs && docs.length > 0) {
        const { data: { user } } = await supabase.auth.getUser();
        for (const doc of docs) {
          await supabase.from('cash_transactions').insert({
            site_id: siteId, type: 'EXPENSE', category: 'MAINTENANCE', amount: doc.total_amount || doc.amount,
            payment_method: 'CASH', status: 'PENDING', provider_name: doc.provider_name,
            description: `Paiement ${doc.doc_type === 'INVOICE' ? 'facture' : 'cotation'} - ${doc.description || doc.reference_number || 'Maintenance'}`,
            reference_id: doc.id, reference_table: 'maintenance_documents', received_by: user?.id,
          });
          await supabase.from('maintenance_documents').update({ status: 'PAID', paid_at: new Date().toISOString() }).eq('id', doc.id);
        }
      }
      if (roomId) {
        await supabase.from('rooms').update({ status: 'VACANT', out_of_order_reason: null }).eq('id', roomId);
      }
    }
    loadRequests();
    if (activeTab === 'history') loadHistory();
  };

  const handleDelete = async (id: string, roomId?: string) => {
    if (!confirm('Supprimer cette demande de maintenance ?')) return;
    await supabase.from('maintenance_requests').delete().eq('id', id);
    if (roomId) await supabase.from('rooms').update({ status: 'VACANT', out_of_order_reason: null }).eq('id', roomId);
    loadRequests();
  };

  const handleSaveDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    const total = docForm.amount + docForm.tax_amount;
    const { error } = await supabase.from('maintenance_documents').insert({
      site_id: siteId, maintenance_request_id: docForm.maintenance_request_id, doc_type: docForm.doc_type,
      provider_name: docForm.provider_name, provider_phone: docForm.provider_phone, amount: docForm.amount,
      tax_amount: docForm.tax_amount, total_amount: total, doc_date: docForm.doc_date, reference_number: docForm.reference_number,
      description: docForm.description, notes: docForm.notes, status: 'PENDING', created_by: user?.id,
    });
    if (!error) {
      loadRequests();
      setShowDocForm(null);
      setDocForm({ maintenance_request_id: '', doc_type: 'INVOICE', provider_name: '', provider_phone: '', amount: 0, tax_amount: 0, doc_date: new Date().toISOString().split('T')[0], reference_number: '', description: '', notes: '' });
    } else {
      setError(error.message);
    }
    setLoading(false);
  };

  const handleDeleteDocument = async (docId: string) => {
    if (!confirm('Supprimer ce document ?')) return;
    await supabase.from('maintenance_documents').delete().eq('id', docId);
    loadRequests();
  };

  const handleDocStatusChange = async (docId: string, newStatus: string) => {
    const updates: any = { status: newStatus };
    if (newStatus === 'PAID') {
      updates.paid_at = new Date().toISOString();
      const { data: doc } = await supabase.from('maintenance_documents').select('*').eq('id', docId).single();
      if (doc) {
        const { data: { user } } = await supabase.auth.getUser();
        await supabase.from('cash_transactions').insert({
          site_id: siteId, type: 'EXPENSE', category: 'MAINTENANCE', amount: doc.total_amount || doc.amount,
          payment_method: 'CASH', status: 'PENDING', provider_name: doc.provider_name,
          description: `Paiement ${doc.doc_type === 'INVOICE' ? 'facture' : 'cotation'} - ${doc.description || doc.reference_number || 'Maintenance'}`,
          reference_id: doc.id, reference_table: 'maintenance_documents', received_by: user?.id,
        });
      }
    }
    await supabase.from('maintenance_documents').update(updates).eq('id', docId);
    loadRequests();
  };

  if (roomsLoading) return <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>;
  if (!siteId) return null;

  return (
    <div className="p-6 space-y-6">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Wrench className="w-7 h-7 text-slate-700" /> Maintenance
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {requests.filter(r => r.status === 'PENDING').length} en attente • {requests.filter(r => r.status === 'IN_PROGRESS').length} en cours
          </p>
        </div>
        <button onClick={() => { setShowForm(!showForm); setShowDocForm(null); }} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          <Plus className="w-4 h-4" /> Nouvelle demande
        </button>
      </div>

      {error && <div className="bg-red-50 text-red-700 p-3 rounded-lg border border-red-200 text-sm flex items-start gap-2"><AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" /><span>{error}</span></div>}
      {roomBlocked && showForm && (
        <div className={`p-3 rounded-lg border text-sm flex items-start gap-2 ${roomBlocked.includes('IMPOSSIBLE') ? 'bg-red-50 border-red-200 text-red-900' : 'bg-amber-50 border-amber-200 text-amber-900'}`}>
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" /><span>{roomBlocked}</span>
        </div>
      )}

      {/* Onglets */}
      <div className="flex gap-2 border-b border-slate-200">
        <button onClick={() => setActiveTab('active')} className={`flex items-center gap-2 px-4 py-2 font-medium text-sm transition-colors ${activeTab === 'active' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-slate-600 hover:text-slate-900'}`}>
          <Wrench className="w-4 h-4" /> En cours ({requests.length})
        </button>
        <button onClick={() => setActiveTab('history')} className={`flex items-center gap-2 px-4 py-2 font-medium text-sm transition-colors ${activeTab === 'history' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-slate-600 hover:text-slate-900'}`}>
          <History className="w-4 h-4" /> Historique ({historyRequests.length})
        </button>
      </div>

      {activeTab === 'active' && (
        <div className="space-y-6">
          {/* Formulaire de création */}
          {showForm && (
            <div className="border-2 border-slate-200 rounded-xl p-5 bg-slate-50 space-y-4 shadow-sm">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-slate-900 flex items-center gap-2"><Plus className="w-4 h-4" /> Nouvelle demande de maintenance</h3>
                <button type="button" onClick={() => setShowForm(false)} className="text-xs text-slate-600 hover:text-slate-900 flex items-center gap-1"><X className="w-3 h-3" /> Annuler</button>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Chambre concernée</label>
                    <select value={form.room_id} onChange={(e) => setForm({ ...form, room_id: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
                      <option value="">-- Aucune (maintenance générale) --</option>
                      {rooms.map(r => (<option key={r.id} value={r.id} disabled={r.status === 'OCCUPIED'}>Chambre {r.number} ({r.room_categories?.code}) {r.status === 'OCCUPIED' ? '🚫 OCCUPÉE' : r.status === 'RESERVED' ? '⚠️ RÉSERVÉE' : '✓ Libre'}</option>))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Catégorie *</label>
                    <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
                      {categories.map(c => (<option key={c.id} value={c.id}>{c.icon} {c.label}</option>))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Équipement / Élément concerné *</label>
                  <input type="text" value={form.item_description} onChange={(e) => setForm({ ...form, item_description: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="Ex: Climatiseur split, Robinet salle de bain..." required />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Description du problème *</label>
                  <textarea value={form.issue_description} onChange={(e) => setForm({ ...form, issue_description: e.target.value })} rows={2} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" required />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Priorité</label>
                    <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
                      {priorities.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Coût estimé (FCFA)</label>
                    <input type="number" min="0" value={form.estimated_cost} onChange={(e) => setForm({ ...form, estimated_cost: Number(e.target.value) })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Technicien</label>
                    <input type="text" value={form.assigned_to} onChange={(e) => setForm({ ...form, assigned_to: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                  </div>
                </div>
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setShowForm(false)} className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold py-2.5 rounded-lg transition-colors">Annuler</button>
                  <button type="submit" disabled={loading || Boolean(roomBlocked && roomBlocked.includes('IMPOSSIBLE'))} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 rounded-lg disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
                    <Save className="w-4 h-4" /> {loading ? 'Enregistrement...' : '✅ Créer la demande'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Liste des demandes */}
          {requests.length === 0 ? (
            <div className="text-center py-12 bg-slate-50 rounded-xl border border-slate-200 border-dashed">
              <Wrench className="w-12 h-12 mx-auto mb-3 text-slate-300" />
              <p className="text-sm text-slate-500 font-medium">Aucune demande de maintenance en cours</p>
            </div>
          ) : (
            <div className="space-y-4">
              {requests.map((req) => {
                const priority = priorities.find(p => p.id === req.priority);
                const status = req.status === 'PENDING' ? { label: 'En attente', color: 'bg-amber-100 text-amber-900' } : { label: 'En cours', color: 'bg-blue-100 text-blue-900' };
                const reqDocs = documents[req.id] || [];
                const totalDocs = reqDocs.reduce((sum, d) => sum + Number(d.total_amount || 0), 0);
                return (
                  <div key={req.id} className="border border-slate-200 rounded-xl p-5 bg-white shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between mb-4">
                      <button onClick={() => setDetailId(req.id)} className="flex-1 text-left">
                        <div className="flex items-center gap-2 flex-wrap mb-2">
                          <span className="font-bold text-slate-900">{categories.find(c => c.id === req.category)?.icon} {req.item_description}</span>
                          <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${priority?.color}`}>{priority?.label}</span>
                          <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${status.color}`}>{status.label}</span>
                        </div>
                        <p className="text-sm text-slate-600 mb-3">{req.issue_description}</p>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                          {req.rooms?.number && <span className="flex items-center gap-1">🚪 Chambre {req.rooms.number}</span>}
                          {req.assigned_to && <span className="flex items-center gap-1">👷 {req.assigned_to}</span>}
                          {req.estimated_cost > 0 && <span className="flex items-center gap-1">💰 Est: {Number(req.estimated_cost).toLocaleString('fr-FR')} F</span>}
                          {totalDocs > 0 && <span className="font-semibold text-indigo-700 flex items-center gap-1">📄 Docs: {Number(totalDocs).toLocaleString('fr-FR')} F</span>}
                          <span className="flex items-center gap-1">📅 {new Date(req.created_at).toLocaleDateString('fr-FR')}</span>
                        </div>
                      </button>
                      <button onClick={() => handleDelete(req.id, req.room_id)} className="text-red-500 hover:text-red-700 hover:bg-red-50 p-2 rounded-lg transition-colors" title="Supprimer"><Trash2 className="w-4 h-4" /></button>
                    </div>

                    {reqDocs.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-slate-100">
                        <h4 className="text-xs font-semibold text-slate-700 mb-3 flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" /> Documents associés ({reqDocs.length})</h4>
                        <div className="space-y-2">
                          {reqDocs.map(doc => (
                            <div key={doc.id} className="flex items-center justify-between bg-slate-50 p-3 rounded-lg border border-slate-200 text-sm">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="font-medium text-slate-900">{docTypes.find(d => d.id === doc.doc_type)?.icon} {docTypes.find(d => d.id === doc.doc_type)?.label}</span>
                                  <span className="text-slate-600">- {doc.provider_name}</span>
                                  {doc.reference_number && <span className="text-slate-500 text-xs">({doc.reference_number})</span>}
                                </div>
                                <div className="text-slate-500 text-xs flex items-center gap-3">
                                  <span>📅 {new Date(doc.doc_date).toLocaleDateString('fr-FR')}</span>
                                  <span className="font-semibold text-slate-700">💰 {Number(doc.total_amount).toLocaleString('fr-FR')} F</span>
                                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${doc.status === 'PAID' ? 'bg-emerald-100 text-emerald-900' : doc.status === 'APPROVED' ? 'bg-blue-100 text-blue-900' : doc.status === 'REJECTED' ? 'bg-red-100 text-red-900' : 'bg-amber-100 text-amber-900'}`}>{doc.status}</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5">
                                {doc.status === 'PENDING' && (<>
                                  <button onClick={() => handleDocStatusChange(doc.id, 'APPROVED')} className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-md font-medium transition-colors">Approuver</button>
                                  <button onClick={() => handleDocStatusChange(doc.id, 'REJECTED')} className="text-xs bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-md font-medium transition-colors">Rejeter</button>
                                </>)}
                                {doc.status === 'APPROVED' && (<button onClick={() => handleDocStatusChange(doc.id, 'PAID')} className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-md font-medium transition-colors">Marquer payé</button>)}
                                <button onClick={() => handleDeleteDocument(doc.id)} className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1.5 rounded-md transition-colors"><Trash2 className="w-4 h-4" /></button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2 pt-4 mt-4 border-t border-slate-100">
                      {req.status === 'PENDING' && (<button onClick={() => handleStatusChange(req.id, 'IN_PROGRESS', req.room_id)} className="flex-1 min-w-[120px] text-xs bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg font-medium transition-colors">▶️ Démarrer</button>)}
                      {req.status === 'IN_PROGRESS' && (<button onClick={() => handleStatusChange(req.id, 'COMPLETED', req.room_id)} className="flex-1 min-w-[120px] text-xs bg-emerald-600 hover:bg-emerald-700 text-white py-2 rounded-lg font-medium transition-colors">✅ Terminer</button>)}
                      <button onClick={() => { setShowDocForm(showDocForm === req.id ? null : req.id); setShowForm(false); setDocForm({ ...docForm, maintenance_request_id: req.id }); }} className="flex-1 min-w-[120px] text-xs bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg font-medium flex items-center justify-center gap-1.5 transition-colors">
                        <FileText className="w-3.5 h-3.5" /> {reqDocs.length > 0 ? 'Ajouter document' : '📄 Facture/Cotation'}
                      </button>
                      <button onClick={() => handleStatusChange(req.id, 'CANCELLED', req.room_id)} className="text-xs bg-slate-200 hover:bg-slate-300 text-slate-700 px-4 py-2 rounded-lg font-medium transition-colors">Annuler</button>
                    </div>

                    {showDocForm === req.id && (
                      <form onSubmit={handleSaveDocument} className="mt-4 p-4 bg-indigo-50 border border-indigo-200 rounded-xl space-y-3">
                        <h4 className="font-semibold text-sm text-indigo-900 flex items-center gap-1.5"><FileText className="w-4 h-4" /> Nouveau document</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">Type *</label>
                            <select value={docForm.doc_type} onChange={(e) => setDocForm({ ...docForm, doc_type: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
                              {docTypes.map(d => <option key={d.id} value={d.id}>{d.icon} {d.label}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">N° référence</label>
                            <input type="text" value={docForm.reference_number} onChange={(e) => setDocForm({ ...docForm, reference_number: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="FAC-2026-001" />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-700 mb-1">Nom du prestataire *</label>
                          <input type="text" value={docForm.provider_name} onChange={(e) => setDocForm({ ...docForm, provider_name: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" required placeholder="Entreprise XYZ" />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">Montant HT (FCFA) *</label>
                            <input type="number" min="0" value={docForm.amount} onChange={(e) => setDocForm({ ...docForm, amount: Number(e.target.value) })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" required />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">TVA / Taxes (FCFA)</label>
                            <input type="number" min="0" value={docForm.tax_amount} onChange={(e) => setDocForm({ ...docForm, tax_amount: Number(e.target.value) })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                          </div>
                        </div>
                        <div className="bg-white p-3 rounded-lg border border-indigo-200 text-right">
                          <span className="text-xs text-slate-600">Total TTC: </span>
                          <span className="font-bold text-indigo-900 text-lg">{Number(docForm.amount + docForm.tax_amount).toLocaleString('fr-FR')} F</span>
                        </div>
                        <div className="flex gap-3 pt-2">
                          <button type="button" onClick={() => setShowDocForm(null)} className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 text-sm font-semibold py-2.5 rounded-lg transition-colors">Annuler</button>
                          <button type="submit" disabled={loading} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold py-2.5 rounded-lg disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">{loading ? 'Enregistrement...' : '💾 Enregistrer le document'}</button>
                        </div>
                      </form>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === 'history' && (
        <div>
          {historyRequests.length === 0 ? (
            <div className="text-center py-12 bg-slate-50 rounded-xl border border-slate-200 border-dashed">
              <History className="w-12 h-12 mx-auto mb-3 text-slate-300" />
              <p className="text-sm text-slate-500 font-medium">Aucun historique de maintenance</p>
            </div>
          ) : (
            <div className="space-y-3">
              {historyRequests.map((req) => {
                const priority = priorities.find(p => p.id === req.priority);
                const isCompleted = req.status === 'COMPLETED';
                return (
                  <div key={req.id} className={`border rounded-xl p-4 bg-white shadow-sm ${isCompleted ? 'border-emerald-200' : 'border-slate-200'}`}>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-2">
                          <span className="font-bold text-slate-900">{categories.find(c => c.id === req.category)?.icon} {req.item_description}</span>
                          <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${priority?.color}`}>{priority?.label}</span>
                          <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${isCompleted ? 'bg-emerald-100 text-emerald-900' : 'bg-slate-100 text-slate-700'}`}>{isCompleted ? '✅ Terminée' : '❌ Annulée'}</span>
                        </div>
                        <p className="text-sm text-slate-600 mb-2">{req.issue_description}</p>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                          {req.rooms?.number && <span>🚪 Chambre {req.rooms.number}</span>}
                          {req.assigned_to && <span>👷 {req.assigned_to}</span>}
                          <span>📅 {req.completed_at ? new Date(req.completed_at).toLocaleDateString('fr-FR') : new Date(req.created_at).toLocaleDateString('fr-FR')}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <MaintenanceDetailModal
  siteId={siteId}
  requestId={detailId}
  isOpen={!!detailId}
  onClose={() => setDetailId(null)}
  onSuccess={() => { loadRequests(); if (activeTab === 'history') loadHistory(); }}
/>
    </div>
  );
}
