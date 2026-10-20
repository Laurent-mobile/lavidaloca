'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { X, FileText, Plus, Utensils } from 'lucide-react';

interface Props {
  siteId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function MenuManagerModal({ siteId, isOpen, onClose, onSuccess }: Props) {
  const supabase = createClient();
  const [categories, setCategories] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [newItem, setNewItem] = useState({ name: '', price: 0, category_id: '', destination: 'KITCHEN' });

  useEffect(() => {
    if (isOpen) loadData();
  }, [isOpen]);

  const loadData = async () => {
    const { data: cat } = await supabase.from('restaurant_categories').select('*').eq('site_id', siteId).eq('is_active', true).order('display_order');
    if (cat) setCategories(cat);
    
    const { data: it } = await supabase.from('restaurant_items').select('*, restaurant_categories(name)').eq('site_id', siteId).order('display_order');
    if (it) setItems(it);
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.from('restaurant_items').insert({
      site_id: siteId,
      name: newItem.name,
      price: newItem.price,
      category_id: newItem.category_id,
      destination: newItem.destination,
      is_available: true
    });
    if (!error) {
      setNewItem({ name: '', price: 0, category_id: '', destination: 'KITCHEN' });
      loadData();
      onSuccess();
    }
    setLoading(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white px-6 py-4 flex items-center justify-between rounded-t-xl sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <Utensils className="w-6 h-6" />
            <h2 className="text-xl font-bold">Gestion des Menus</h2>
          </div>
          <button onClick={onClose} className="hover:bg-white/20 p-2 rounded-lg"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 space-y-6">
          <form onSubmit={handleAddItem} className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-3">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2"><Plus className="w-4 h-4" /> Ajouter un article</h3>
            <div className="grid grid-cols-2 gap-3">
              <input type="text" placeholder="Nom de l'article" value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} className="border border-slate-300 rounded px-2 py-1.5 text-sm" required />
              <input type="number" placeholder="Prix (FCFA)" value={newItem.price} onChange={e => setNewItem({...newItem, price: Number(e.target.value)})} className="border border-slate-300 rounded px-2 py-1.5 text-sm" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <select value={newItem.category_id} onChange={e => setNewItem({...newItem, category_id: e.target.value})} className="border border-slate-300 rounded px-2 py-1.5 text-sm" required>
                <option value="">Choisir une catégorie</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select value={newItem.destination} onChange={e => setNewItem({...newItem, destination: e.target.value})} className="border border-slate-300 rounded px-2 py-1.5 text-sm">
                <option value="KITCHEN">👨‍🍳 Cuisine</option>
                <option value="BAR">🍹 Bar</option>
                <option value="BOTH">🍹👨‍🍳 Les deux</option>
              </select>
            </div>
            <button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-lg disabled:opacity-50">Ajouter l'article</button>
          </form>

          <div>
            <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2"><FileText className="w-4 h-4" /> Articles du menu ({items.length})</h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {items.map(item => (
                <div key={item.id} className="flex items-center justify-between bg-white border border-slate-200 rounded p-3">
                  <div>
                    <div className="font-medium text-sm">{item.name}</div>
                    <div className="text-xs text-slate-500">{item.restaurant_categories?.name} • {item.destination === 'KITCHEN' ? 'Cuisine' : item.destination === 'BAR' ? 'Bar' : 'Les deux'}</div>
                  </div>
                  <div className="font-bold text-blue-900">{Number(item.price).toLocaleString('fr-FR')} F</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
