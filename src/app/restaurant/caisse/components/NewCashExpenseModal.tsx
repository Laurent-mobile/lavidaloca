'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { X, Banknote, Smartphone, AlertCircle, Save } from 'lucide-react';

interface Category {
  id: string;
  name: string;
  category_type: string;
}

interface NewCashExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  siteId: string;
  onSuccess: () => void;
}

export default function NewCashExpenseModal({ isOpen, onClose, siteId, onSuccess }: NewCashExpenseModalProps) {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  
  const [form, setForm] = useState({
    category: '',
    description: '',
    amount: '',
    notes: '',
    payment_method: 'Espèces'
  });

  useEffect(() => {
    if (isOpen) {
      loadCategories();
    }
  }, [isOpen]);

  const loadCategories = async () => {
    try {
      const { data } = await supabase
        .from('expense_categories')
        .select('id, name, category_type')
        .eq('is_active', true)
        .order('name');
      setCategories(data || []);
    } catch (error) {
      console.error('Erreur chargement catégories:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!form.category || !form.description || !form.amount) {
      alert('Veuillez remplir tous les champs obligatoires');
      return;
    }

    if (parseFloat(form.amount) <= 0) {
      alert('Le montant doit être supérieur à 0');
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase.from('expenses').insert({
        site_id: siteId,
        date: new Date().toISOString().split('T')[0],
        category: form.category,
        description: form.description,
        type: 'COURANTE',
        subtype: 'CAISSE',
        amount: parseFloat(form.amount),
        payment_method: form.payment_method,
        notes: form.notes || null,
        is_recurring: false,
        created_by: user?.id
      });

      if (error) throw error;

      // Réinitialiser le formulaire
      setForm({
        category: '',
        description: '',
        amount: '',
        notes: '',
        payment_method: 'Espèces'
      });

      onSuccess();
      onClose();
      alert('✅ Dépense de caisse enregistrée avec succès !');
    } catch (error: any) {
      console.error('Erreur création dépense:', error);
      alert(`Erreur: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between rounded-t-xl">
          <h3 className="text-lg font-bold text-slate-900">Nouvelle Dépense de Caisse</h3>
          <button 
            onClick={onClose}
            className="hover:bg-slate-100 p-2 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Formulaire */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Catégorie */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Catégorie <span className="text-red-500">*</span>
            </label>
            <select
              value={form.category}
              onChange={(e) => setForm({...form, category: e.target.value})}
              className="w-full border border-slate-300 rounded-lg px-3 py-2.5 bg-white focus:ring-2 focus:ring-purple-500 outline-none"
              required
            >
              <option value="">Sélectionner une catégorie</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.name}>{cat.name}</option>
              ))}
            </select>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Description <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => setForm({...form, description: e.target.value})}
              className="w-full border border-slate-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-purple-500 outline-none"
              placeholder="Ex: Achat de fournitures, Retrait espèces, etc."
              required
            />
          </div>

          {/* Montant */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Montant (f CFA) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              min="0"
              step="100"
              value={form.amount}
              onChange={(e) => setForm({...form, amount: e.target.value})}
              className="w-full border border-slate-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-purple-500 outline-none"
              placeholder="0"
              required
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Notes (optionnel)
            </label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({...form, notes: e.target.value})}
              className="w-full border border-slate-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-purple-500 outline-none resize-y"
              rows={3}
              placeholder="Détails supplémentaires..."
            />
          </div>

          {/* Mode de paiement */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Mode de paiement
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setForm({...form, payment_method: 'Espèces'})}
                className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border-2 font-medium text-sm transition-all ${
                  form.payment_method === 'Espèces'
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Banknote className="w-4 h-4" />
                Espèces
              </button>
              <button
                type="button"
                onClick={() => setForm({...form, payment_method: 'Mobile Money'})}
                className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border-2 font-medium text-sm transition-all ${
                  form.payment_method === 'Mobile Money'
                    ? 'border-purple-500 bg-purple-50 text-purple-700'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Smartphone className="w-4 h-4" />
                Mobile Money
              </button>
            </div>
            <div className="mt-2 flex items-start gap-1.5 text-xs text-amber-700 bg-amber-50 p-2 rounded-lg">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <span>Pour les dépenses de caisse, utilisez "Espèces" pour déduire du solde de caisse</span>
            </div>
          </div>

          {/* Boutons d'action */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold py-3 rounded-lg transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white font-semibold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Enregistrer la Dépense
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
