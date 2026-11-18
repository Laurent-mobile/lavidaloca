'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { X, Save, User, Phone, Mail, Globe, CreditCard, Award, FileText, AlertCircle } from 'lucide-react';

interface Props {
  siteId: string;
  customer: any; // null = mode création
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function CustomerEditModal({ siteId, customer, isOpen, onClose, onSuccess }: Props) {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const isEdit = !!customer;
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    phone: '',
    email: '',
    id_number: '',
    nationality: '',
    is_vip: false,
    notes: '',
  });

  useEffect(() => {
    if (isOpen && customer) {
      setForm({
        first_name: customer.first_name || '',
        last_name: customer.last_name || '',
        phone: customer.phone || '',
        email: customer.email || '',
        id_number: customer.id_number || '',
        nationality: customer.nationality || '',
        is_vip: customer.is_vip || false,
        notes: customer.notes || '',
      });
      setError('');
    } else if (isOpen && !customer) {
      // Mode création : formulaire vide
      setForm({
        first_name: '',
        last_name: '',
        phone: '',
        email: '',
        id_number: '',
        nationality: '',
        is_vip: false,
        notes: '',
      });
      setError('');
    }
  }, [isOpen, customer]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.first_name.trim() || !form.last_name.trim()) {
      setError('Le nom et le prénom sont obligatoires.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      if (isEdit) {
        // ✅ MODE ÉDITION
        const { error: updateError } = await supabase
          .from('customers')
          .update({
            first_name: form.first_name.trim(),
            last_name: form.last_name.trim(),
            phone: form.phone.trim(),
            email: form.email.trim(),
            id_number: form.id_number.trim(),
            nationality: form.nationality.trim(),
            is_vip: form.is_vip,
            notes: form.notes.trim(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', customer.id);

        if (updateError) throw updateError;
        alert('✅ Client modifié avec succès !');
      } else {
        // ✅ MODE CRÉATION
        const { error: insertError } = await supabase
          .from('customers')
          .insert({
            site_id: siteId,
            first_name: form.first_name.trim(),
            last_name: form.last_name.trim(),
            phone: form.phone.trim(),
            email: form.email.trim(),
            id_number: form.id_number.trim(),
            nationality: form.nationality.trim(),
            is_vip: form.is_vip,
            notes: form.notes.trim(),
          });

        if (insertError) throw insertError;
        alert('✅ Client créé avec succès !');
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Erreur:', err);
      setError(err.message || 'Erreur lors de l\'enregistrement');
    }
    setLoading(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="bg-gradient-to-r from-indigo-600 to-purple-700 text-white px-6 py-4 flex items-center justify-between rounded-t-xl sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <User className="w-6 h-6" />
            <div>
              <h2 className="text-xl font-bold">
                {isEdit ? 'Modifier le client' : 'Nouveau client'}
              </h2>
              <p className="text-xs text-indigo-100">
                {isEdit ? `${customer.first_name} ${customer.last_name}` : 'Créer une nouvelle fiche client'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="hover:bg-white/20 p-2 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 text-red-700 p-3 rounded-lg border border-red-200 text-sm flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Nom et Prénom */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                <User className="w-3 h-3 inline mr-1" /> Prénom *
              </label>
              <input
                type="text"
                value={form.first_name}
                onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Nom *</label>
              <input
                type="text"
                value={form.last_name}
                onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                required
              />
            </div>
          </div>

          {/* Téléphone et Email */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                <Phone className="w-3 h-3 inline mr-1" /> Téléphone
              </label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder="+226 ..."
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                <Mail className="w-3 h-3 inline mr-1" /> Email
              </label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder="client@example.com"
              />
            </div>
          </div>

          {/* Numéro d'identité et Nationalité */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                <CreditCard className="w-3 h-3 inline mr-1" /> N° Pièce d'identité
              </label>
              <input
                type="text"
                value={form.id_number}
                onChange={(e) => setForm({ ...form, id_number: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder="CNI, Passeport..."
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                <Globe className="w-3 h-3 inline mr-1" /> Nationalité
              </label>
              <input
                type="text"
                value={form.nationality}
                onChange={(e) => setForm({ ...form, nationality: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder="Burkinabè, Français..."
              />
            </div>
          </div>

          {/* VIP */}
          <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg p-3">
            <input
              type="checkbox"
              id="is_vip"
              checked={form.is_vip}
              onChange={(e) => setForm({ ...form, is_vip: e.target.checked })}
              className="w-5 h-5 text-amber-600 rounded focus:ring-amber-500"
            />
            <label htmlFor="is_vip" className="flex items-center gap-2 cursor-pointer flex-1">
              <Award className="w-5 h-5 text-amber-600" />
              <div>
                <div className="font-semibold text-amber-900 text-sm">Client VIP</div>
                <div className="text-xs text-amber-700">Bénéficie d'un traitement prioritaire</div>
              </div>
            </label>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              <FileText className="w-3 h-3 inline mr-1" /> Notes internes
            </label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={3}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              placeholder="Préférences, allergies, remarques..."
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold py-2.5 rounded-lg"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-lg flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {loading ? 'Enregistrement...' : (isEdit ? 'Enregistrer les modifications' : 'Créer le client')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
