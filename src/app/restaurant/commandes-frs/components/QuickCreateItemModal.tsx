'use client';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { X, Package, Save } from 'lucide-react';

interface Props {
  siteId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newItem: any) => void;
  prefillName?: string;
}

const CATEGORIES = [
  'Boissons', 'Alimentation', 'Fruits & Légumes', 'Viandes & Poissons',
  'Produits laitiers', 'Épicerie', 'Hygiène', 'Entretien',
  'Emballages', 'Fournitures', 'Autres'
];

const UNITS = ['unité', 'pièce', 'kg', 'litre', 'carton', 'caisse', 'bouteille', 'sac', 'pack'];

export default function QuickCreateStockItemModal({ siteId, isOpen, onClose, onSuccess, prefillName }: Props) {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: prefillName || '',
    category: 'Alimentation',
    unit: 'unité',
    current_stock: '0',
    last_purchase_price: '',
    min_stock: '0'
  });

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      alert('Veuillez saisir le nom de l\'article');
      return;
    }
    if (!formData.last_purchase_price || parseFloat(formData.last_purchase_price) <= 0) {
      alert('Veuillez saisir un prix d\'achat valide');
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('stock_items')
        .insert({
          site_id: siteId,
          name: formData.name.trim(),
          category: formData.category,
          unit: formData.unit,
          current_stock: parseFloat(formData.current_stock) || 0,
          last_purchase_price: parseFloat(formData.last_purchase_price),
          min_stock: parseFloat(formData.min_stock) || 0,
          is_active: true,
          created_by: user?.id
        })
        .select()
        .single();

      if (error) throw error;

      alert(`✅ Article "${data.name}" créé avec succès !`);
      onSuccess(data);
      
      setFormData({
        name: '',
        category: 'Alimentation',
        unit: 'unité',
        current_stock: '0',
        last_purchase_price: '',
        min_stock: '0'
      });
    } catch (error: any) {
      console.error('Erreur création article:', error);
      alert(`Erreur: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[80] p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
        <div className="bg-gradient-to-r from-emerald-600 to-teal-700 text-white px-6 py-4 flex items-center justify-between rounded-t-xl">
          <div className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            <h3 className="text-lg font-bold">Créer un nouvel article en stock</h3>
          </div>
          <button onClick={onClose} className="hover:bg-white/20 p-2 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg text-sm text-amber-900">
            💡 L'article sera ajouté au stock et disponible immédiatement pour la commande fournisseur.
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Nom de l'article *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full border-2 border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-emerald-500"
              placeholder="Ex: Coca-Cola 33cl, Poulet, Farine..."
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Catégorie *</label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2"
              >
                {CATEGORIES.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Unité *</label>
              <select
                value={formData.unit}
                onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2"
              >
                {UNITS.map(u => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Prix d'achat (F) *
              </label>
              <input
                type="number"
                value={formData.last_purchase_price}
                onChange={(e) => setFormData({ ...formData, last_purchase_price: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2"
                placeholder="Ex: 1500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Stock initial
              </label>
              <input
                type="number"
                value={formData.current_stock}
                onChange={(e) => setFormData({ ...formData, current_stock: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2"
                placeholder="Ex: 50"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Stock minimum (alerte)
            </label>
            <input
              type="number"
              value={formData.min_stock}
              onChange={(e) => setFormData({ ...formData, min_stock: e.target.value })}
              className="w-full border border-slate-300 rounded-lg px-3 py-2"
              placeholder="Ex: 10"
            />
          </div>

          <div className="flex gap-3 pt-4 border-t border-slate-200">
            <button
              onClick={onClose}
              className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold py-3 rounded-lg"
            >
              Annuler
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  Créer et ajouter
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
