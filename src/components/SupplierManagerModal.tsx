'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { X, Package, Plus, Truck } from 'lucide-react';

interface Props {
  siteId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function SupplierManagerModal({ siteId, isOpen, onClose, onSuccess }: Props) {
  const supabase = createClient();
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [newSup, setNewSup] = useState({ name: '', contact_name: '', phone: '', category: 'FOOD' });

  useEffect(() => {
    if (isOpen) loadData();
  }, [isOpen]);

  const loadData = async () => {
    const { data } = await supabase.from('restaurant_suppliers').select('*').eq('site_id', siteId).order('created_at', { ascending: false });
    if (data) setSuppliers(data);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.from('restaurant_suppliers').insert({
      site_id: siteId,
      name: newSup.name,
      contact_name: newSup.contact_name,
      phone: newSup.phone,
      category: newSup.category,
      is_active: true
    });
    if (!error) {
      setNewSup({ name: '', contact_name: '', phone: '', category: 'FOOD' });
      loadData();
      onSuccess();
    }
    setLoading(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="bg-gradient-to-r from-amber-600 to-orange-700 text-white px-6 py-4 flex items-center justify-between rounded-t-xl sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <Truck className="w-6 h-6" />
            <h2 className="text-xl font-bold">Fournisseurs</h2>
          </div>
          <button onClick={onClose} className="hover:bg-white/20 p-2 rounded-lg"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 space-y-6">
          <form onSubmit={handleAdd} className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-3">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2"><Plus className="w-4 h-4" /> Ajouter un fournisseur</h3>
            <div className="grid grid-cols-2 gap-3">
              <input type="text" placeholder="Nom de l'entreprise" value={newSup.name} onChange={e => setNewSup({...newSup, name: e.target.value})} className="border border-slate-300 rounded px-2 py-1.5 text-sm" required />
              <input type="text" placeholder="Nom du contact" value={newSup.contact_name} onChange={e => setNewSup({...newSup, contact_name: e.target.value})} className="border border-slate-300 rounded px-2 py-1.5 text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input type="text" placeholder="Téléphone" value={newSup.phone} onChange={e => setNewSup({...newSup, phone: e.target.value})} className="border border-slate-300 rounded px-2 py-1.5 text-sm" />
              <select value={newSup.category} onChange={e => setNewSup({...newSup, category: e.target.value})} className="border border-slate-300 rounded px-2 py-1.5 text-sm">
                <option value="FOOD">🥩 Nourriture</option>
                <option value="BEVERAGE">🍹 Boissons</option>
                <option value="SUPPLIES">🧴 Fournitures</option>
                <option value="EQUIPMENT">⚙️ Équipement</option>
              </select>
            </div>
            <button type="submit" disabled={loading} className="w-full bg-amber-600 hover:bg-amber-700 text-white font-semibold py-2 rounded-lg disabled:opacity-50">Ajouter le fournisseur</button>
          </form>

          <div>
            <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2"><Package className="w-4 h-4" /> Liste des fournisseurs ({suppliers.length})</h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {suppliers.map(sup => (
                <div key={sup.id} className="flex items-center justify-between bg-white border border-slate-200 rounded p-3">
                  <div>
                    <div className="font-medium text-sm">{sup.name}</div>
                    <div className="text-xs text-slate-500">{sup.category} • Contact: {sup.contact_name || 'N/A'} • {sup.phone || 'N/A'}</div>
                  </div>
                  <div className="text-xs bg-slate-100 px-2 py-1 rounded">{sup.is_active ? '✅ Actif' : '❌ Inactif'}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
