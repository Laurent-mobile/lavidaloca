'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { X, Wrench, FileText, CheckCircle, Clock, User, AlertTriangle, DollarSign } from 'lucide-react';

interface Props {
  siteId: string;
  requestId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const catIcons: Record<string, string> = { ROOM: '🚪', PLUMBING: '🚿', ELECTRICAL: '⚡', HVAC: '❄️', FURNITURE: '🛏️', APPLIANCE: '📺', OTHER: '🔧' };
const prioCfg: Record<string, { label: string; color: string }> = {
  LOW: { label: 'Basse', color: 'bg-slate-200 text-slate-700' },
  MEDIUM: { label: 'Moyenne', color: 'bg-blue-200 text-blue-900' },
  HIGH: { label: 'Haute', color: 'bg-orange-200 text-orange-900' },
  URGENT: { label: 'Urgente', color: 'bg-red-200 text-red-900' },
};
const statusCfg: Record<string, { label: string; color: string }> = {
  PENDING: { label: 'En attente', color: 'bg-amber-100 text-amber-900' },
  IN_PROGRESS: { label: 'En cours', color: 'bg-blue-100 text-blue-900' },
  COMPLETED: { label: 'Terminée', color: 'bg-emerald-100 text-emerald-900' },
  CANCELLED: { label: 'Annulée', color: 'bg-slate-100 text-slate-700' },
};

export default function MaintenanceDetailModal({ siteId, requestId, isOpen, onClose, onSuccess }: Props) {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [req, setReq] = useState<any>(null);
  const [docs, setDocs] = useState<any[]>([]);

  useEffect(() => {
    if (isOpen && requestId) load();
  }, [isOpen, requestId]);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const { data: r, error: e } = await supabase
        .from('maintenance_requests')
        .select(`id, room_id, category, item_description, issue_description, priority, status, estimated_cost, actual_cost, assigned_to, notes, created_at, completed_at, rooms (number, status)`)
        .eq('id', requestId)
        .single();
      if (e) throw e;
      setReq(Array.isArray(r.rooms) ? { ...r, rooms: r.rooms[0] } : r);

      const { data: d } = await supabase
        .from('maintenance_documents')
        .select('*')
        .eq('maintenance_request_id', requestId)
        .order('created_at', { ascending: false });
      setDocs(d || []);
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  };

  const handleStatus = async (newStatus: string) => {
    setLoading(true);
    try {
      const updates: any = { status: newStatus };
      if (newStatus === 'COMPLETED') updates.completed_at = new Date().toISOString();
      await supabase.from('maintenance_requests').update(updates).eq('id', requestId);
      if (newStatus === 'COMPLETED' && req?.room_id) {
        await supabase.from('rooms').update({ status: 'VACANT', out_of_order_reason: null }).eq('id', req.room_id);
      }
      await load();
      onSuccess();
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  };

  if (!isOpen || !requestId) return null;
  const prio = prioCfg[req?.priority] || prioCfg.MEDIUM;
  const stat = statusCfg[req?.status] || statusCfg.PENDING;
  const totalDocs = docs.reduce((s, d) => s + Number(d.total_amount || d.amount || 0), 0);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="bg-gradient-to-r from-slate-700 to-slate-900 text-white px-6 py-4 flex items-center justify-between rounded-t-xl sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <Wrench className="w-6 h-6" />
            <h2 className="text-xl font-bold">Détail maintenance</h2>
          </div>
          <button onClick={onClose} className="hover:bg-white/20 p-2 rounded-lg"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 space-y-4">
          {error && <div className="bg-red-50 text-red-700 p-3 rounded-lg border border-red-200 text-sm">{error}</div>}
          {loading && !req && <div className="text-center py-8 text-slate-500">Chargement...</div>}

          {req && (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${prio.color}`}>{prio.label}</span>
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${stat.color}`}>{stat.label}</span>
                {req.rooms?.number && <span className="text-xs bg-indigo-100 text-indigo-900 px-2 py-1 rounded">🚪 Chambre {req.rooms.number}</span>}
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                <div className="font-bold text-slate-900 text-lg">{catIcons[req.category]} {req.item_description}</div>
                <p className="text-sm text-slate-600 mt-1">{req.issue_description}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 mt-2">
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Créée le {new Date(req.created_at).toLocaleDateString('fr-FR')}</span>
                  {req.completed_at && <span className="flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Terminée le {new Date(req.completed_at).toLocaleDateString('fr-FR')}</span>}
                  {req.assigned_to && <span className="flex items-center gap-1"><User className="w-3 h-3" /> {req.assigned_to}</span>}
                  {req.estimated_cost > 0 && <span className="flex items-center gap-1"><DollarSign className="w-3 h-3" /> Est. {Number(req.estimated_cost).toLocaleString('fr-FR')} F</span>}
                </div>
              </div>

              {req.notes && <div className="text-sm text-slate-700 bg-amber-50 border border-amber-200 rounded p-2"><b>Notes :</b> {req.notes}</div>}

              {/* Documents */}
              <div>
                <h3 className="font-semibold text-slate-900 mb-2 flex items-center gap-2"><FileText className="w-4 h-4" /> Documents ({docs.length}) — Total : {totalDocs.toLocaleString('fr-FR')} F</h3>
                {docs.length === 0 ? (
                  <p className="text-sm text-slate-500 bg-slate-50 rounded p-3">Aucun document (facture/cotation) associé.</p>
                ) : (
                  <div className="space-y-2">
                    {docs.map(doc => (
                      <div key={doc.id} className="border border-slate-200 rounded-lg p-3 bg-white flex items-center justify-between text-sm">
                        <div>
                          <div className="font-medium text-slate-900">{doc.doc_type === 'INVOICE' ? '🧾 Facture' : doc.doc_type === 'QUOTE' ? '📋 Cotation' : '🧾 Reçu'} — {doc.provider_name || 'Prestataire'}</div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            📅 {new Date(doc.doc_date).toLocaleDateString('fr-FR')}
                            {doc.reference_number && ` • Réf: ${doc.reference_number}`}
                            {doc.status && ` • ${doc.status}`}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-slate-900">{Number(doc.total_amount || doc.amount).toLocaleString('fr-FR')} F</div>
                          {doc.tax_amount > 0 && <div className="text-[10px] text-slate-500">dont TVA {Number(doc.tax_amount).toLocaleString('fr-FR')} F</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-2 border-t border-slate-200">
                {req.status === 'PENDING' && (
                  <button onClick={() => handleStatus('IN_PROGRESS')} disabled={loading} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-lg disabled:opacity-50">▶️ Démarrer</button>
                )}
                {req.status === 'IN_PROGRESS' && (
                  <button onClick={() => handleStatus('COMPLETED')} disabled={loading} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 rounded-lg disabled:opacity-50">✅ Terminer (libère la chambre)</button>
                )}
                {(req.status === 'PENDING' || req.status === 'IN_PROGRESS') && (
                  <button onClick={() => handleStatus('CANCELLED')} disabled={loading} className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold py-2.5 rounded-lg disabled:opacity-50">Annuler</button>
                )}
                <button onClick={onClose} className="px-4 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold py-2.5 rounded-lg">Fermer</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
