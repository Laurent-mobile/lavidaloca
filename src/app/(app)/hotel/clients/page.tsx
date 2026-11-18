'use client';
import { useState, useEffect } from 'react';
import { useProfile } from '@/hooks/useHotel';
import { createClient } from '@/lib/supabase/client';
import CustomerHistoryModal from '@/components/CustomerHistoryModal';
import CustomerEditModal from '@/components/CustomerEditModal';
import { Users, Search, Loader2, Award, Edit, Plus } from 'lucide-react';

export default function ClientsPage() {
  const { siteId, loading } = useProfile();
  const supabase = createClient();
  const [rows, setRows] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [selId, setSelId] = useState('');
  const [editingCustomer, setEditingCustomer] = useState<any>(null);
  const [showCreate, setShowCreate] = useState(false);

  const loadCustomers = async () => {
    if (!siteId) return;
    const { data } = await supabase
      .from('customers')
      .select('id, first_name, last_name, phone, email, nationality, is_vip, id_number')
      .eq('site_id', siteId)
      .order('last_name');
    setRows(data || []);
  };

  useEffect(() => {
    if (!siteId) return;
    loadCustomers();
  }, [siteId]);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 text-indigo-600 animate-spin" /></div>;
  if (!siteId) return null;

  const filtered = rows.filter(r =>
    !search || `${r.first_name} ${r.last_name} ${r.phone || ''}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 space-y-4">
      {/* En-tête */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Users className="w-7 h-7 text-indigo-600" /> Clients
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {rows.length} client(s) — cliquez pour voir l'historique
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
        >
          <Plus className="w-4 h-4" /> Nouveau client
        </button>
      </div>

      {/* Recherche */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher un client..."
          className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
        />
      </div>

      {/* Liste des clients */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map(c => (
          <div
            key={c.id}
            onClick={() => setSelId(c.id)}
            className="text-left bg-white border border-slate-200 rounded-lg p-4 hover:border-indigo-300 hover:shadow-sm transition cursor-pointer relative"
          >
            {/* Bouton Modifier */}
            <button
              onClick={(e) => {
                e.stopPropagation(); // ✅ Empêche d'ouvrir l'historique
                setEditingCustomer(c);
              }}
              className="absolute top-3 right-3 bg-blue-50 hover:bg-blue-100 text-blue-600 p-1.5 rounded-lg transition-colors"
              title="Modifier le client"
            >
              <Edit className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2 pr-8">
              <span className="font-bold text-slate-900">{c.last_name} {c.first_name}</span>
              {c.is_vip && (
                <span className="text-xs bg-purple-200 text-purple-900 px-1.5 py-0.5 rounded flex items-center gap-1">
                  <Award className="w-3 h-3" /> VIP
                </span>
              )}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              📞 {c.phone || '—'} • 🌍 {c.nationality || '—'}
            </div>
            {c.email && (
              <div className="text-xs text-slate-500 mt-0.5">✉️ {c.email}</div>
            )}
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="col-span-full text-center py-12 text-slate-400">
            <Users className="w-12 h-12 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Aucun client trouvé</p>
          </div>
        )}
      </div>

      {/* Modal Historique */}
      {selId && (
        <CustomerHistoryModal
          siteId={siteId}
          customerId={selId}
          isOpen={!!selId}
          onClose={() => setSelId('')}
        />
      )}

      {/* Modal Édition */}
      <CustomerEditModal
        siteId={siteId}
        customer={editingCustomer}
        isOpen={!!editingCustomer}
        onClose={() => setEditingCustomer(null)}
        onSuccess={loadCustomers}
      />

      {/* Modal Création (réutilise le même modal avec customer=null) */}
      {showCreate && (
        <CustomerEditModal
          siteId={siteId}
          customer={null}
          isOpen={showCreate}
          onClose={() => setShowCreate(false)}
          onSuccess={() => {
            loadCustomers();
            setShowCreate(false);
          }}
        />
      )}
    </div>
  );
}
