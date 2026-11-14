'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { 
  Store, Search, Plus, Edit2, Trash2, X, CheckCircle, 
  AlertCircle, Phone, Mail, MapPin, User, Save
} from 'lucide-react';

interface Supplier {
  id: string;
  name: string;
  contact_name: string;
  phone: string;
  email: string;
  address: string;
  is_active: boolean;
  created_at: string;
}

export default function SuppliersPage() {
  const supabase = createClient();
  const [siteId, setSiteId] = useState<string>('');
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // États Modales
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  
  // États Formulaires
  const [newSupplier, setNewSupplier] = useState({ name: '', contact_name: '', phone: '', email: '', address: '' });
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [editForm, setEditForm] = useState({ name: '', contact_name: '', phone: '', email: '', address: '' });
  const [supplierToDelete, setSupplierToDelete] = useState<Supplier | null>(null);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase.from('profiles').select('site_id').eq('id', user.id).maybeSingle();
        if (profile) setSiteId(profile.site_id || '');
      }
      loadSuppliers();
    };
    init();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadSuppliers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('suppliers')
        .select('*')
        .order('name', { ascending: true });
      if (error) throw error;
      setSuppliers(data || []);
    } catch (error) {
      console.error('Erreur chargement fournisseurs:', error);
    } finally {
      setLoading(false);
    }
  };

  // --- HANDLERS AJOUT ---
  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSupplier.name) return;
    setIsSubmitting(true);
    try {
      const { error } = await supabase.from('suppliers').insert({
        site_id: siteId,
        ...newSupplier,
        is_active: true
      });
      if (error) throw error;
      setNewSupplier({ name: '', contact_name: '', phone: '', email: '', address: '' });
      setIsAddModalOpen(false);
      loadSuppliers();
    } catch (error) {
      console.error('Erreur ajout:', error);
      alert('Erreur lors de l\'ajout du fournisseur.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- HANDLERS MODIFICATION ---
  const openEditModal = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setEditForm({
      name: supplier.name,
      contact_name: supplier.contact_name || '',
      phone: supplier.phone || '',
      email: supplier.email || '',
      address: supplier.address || ''
    });
    setIsEditModalOpen(true);
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSupplier) return;
    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from('suppliers')
        .update(editForm)
        .eq('id', editingSupplier.id);
      if (error) throw error;
      setIsEditModalOpen(false);
      setEditingSupplier(null);
      loadSuppliers();
    } catch (error) {
      console.error('Erreur modification:', error);
      alert('Erreur lors de la modification.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- HANDLERS SUPPRESSION ---
  const openDeleteModal = (supplier: Supplier) => {
    setSupplierToDelete(supplier);
    setDeleteError('');
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!supplierToDelete) return;
    setIsSubmitting(true);
    setDeleteError('');
    try {
      // Vérification de sécurité : a-t-il des commandes ? (Optionnel mais recommandé)
      // Pour l'instant, on fait une suppression simple avec confirmation
      
      const { error } = await supabase.from('suppliers').delete().eq('id', supplierToDelete.id);
      if (error) throw error;
      
      setSupplierToDelete(null);
      setIsDeleteModalOpen(false);
      loadSuppliers();
    } catch (error) {
      console.error('Erreur suppression:', error);
      setDeleteError('Une erreur est survenue. Ce fournisseur est peut-être lié à des commandes.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- FILTRES ---
  const filteredSuppliers = useMemo(() => {
    return suppliers.filter(s => 
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      (s.contact_name && s.contact_name.toLowerCase().includes(search.toLowerCase())) ||
      (s.phone && s.phone.includes(search))
    );
  }, [suppliers, search]);

  // ✅ UNE SEULE INSTRUCTION RETURN (Règle Turbopack)
  return (
    <div className="p-4 lg:p-6 h-full space-y-6">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Store className="w-7 h-7 text-indigo-600" />
            Gestion des Fournisseurs
          </h1>
          <p className="text-sm text-slate-500 mt-1">Gérez vos partenaires et leurs coordonnées.</p>
        </div>
        <button 
          onClick={() => setIsAddModalOpen(true)}
          className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-lg font-medium transition-colors shadow-sm"
        >
          <Plus className="w-5 h-5" />
          Nouveau Fournisseur
        </button>
      </div>

      {/* Barre de recherche */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            placeholder="Rechercher par nom, contact ou téléphone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
          />
        </div>
      </div>

      {/* Tableau des fournisseurs */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : filteredSuppliers.length === 0 ? (
          <div className="text-center py-16">
            <Store className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-lg font-medium text-slate-900">Aucun fournisseur trouvé</h3>
            <p className="text-slate-500 text-sm">Ajoutez votre premier fournisseur ou modifiez votre recherche.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500 font-semibold">
                  <th className="px-6 py-4">Entreprise</th>
                  <th className="px-6 py-4">Contact</th>
                  <th className="px-6 py-4">Téléphone</th>
                  <th className="px-6 py-4">Email</th>
                  <th className="px-6 py-4 text-center">Statut</th>
                  <th className="px-6 py-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredSuppliers.map((supplier) => (
                  <tr key={supplier.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="font-medium text-slate-900">{supplier.name}</div>
                      {supplier.address && (
                        <div className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                          <MapPin className="w-3 h-3" /> {supplier.address}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {supplier.contact_name ? (
                        <div className="flex items-center gap-2 text-sm text-slate-700">
                          <User className="w-4 h-4 text-slate-400" /> {supplier.contact_name}
                        </div>
                      ) : (
                        <span className="text-sm text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {supplier.phone ? (
                        <div className="flex items-center gap-2 text-sm text-slate-700">
                          <Phone className="w-4 h-4 text-slate-400" /> {supplier.phone}
                        </div>
                      ) : (
                        <span className="text-sm text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {supplier.email ? (
                        <div className="flex items-center gap-2 text-sm text-slate-700">
                          <Mail className="w-4 h-4 text-slate-400" /> {supplier.email}
                        </div>
                      ) : (
                        <span className="text-sm text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      {supplier.is_active ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 border border-emerald-200">
                          <CheckCircle className="w-3.5 h-3.5" /> Actif
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
                          <X className="w-3.5 h-3.5" /> Inactif
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => openEditModal(supplier)}
                          className="p-1.5 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg"
                          title="Modifier"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => openDeleteModal(supplier)}
                          className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg"
                          title="Supprimer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* --- MODALES --- */}

      {/* Modale Ajout */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="bg-indigo-600 text-white px-6 py-4 flex items-center justify-between">
              <h3 className="text-lg font-bold flex items-center gap-2"><Plus className="w-5 h-5" /> Nouveau Fournisseur</h3>
              <button onClick={() => setIsAddModalOpen(false)} className="hover:bg-indigo-700 p-1 rounded"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleAdd} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nom de l'entreprise *</label>
                <input type="text" required value={newSupplier.name} onChange={(e) => setNewSupplier({ ...newSupplier, name: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="Ex: Distributeur Boissons Ouest" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nom du contact</label>
                  <input type="text" value={newSupplier.contact_name} onChange={(e) => setNewSupplier({ ...newSupplier, contact_name: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="Ex: Jean Dupont" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Téléphone</label>
                  <input type="text" value={newSupplier.phone} onChange={(e) => setNewSupplier({ ...newSupplier, phone: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="Ex: 01 23 45 67 89" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                <input type="email" value={newSupplier.email} onChange={(e) => setNewSupplier({ ...newSupplier, email: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="contact@fournisseur.com" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Adresse</label>
                <textarea value={newSupplier.address} onChange={(e) => setNewSupplier({ ...newSupplier, address: e.target.value })} rows={2} className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="Adresse complète..." />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setIsAddModalOpen(false)} className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold py-2.5 rounded-lg">Annuler</button>
                <button type="submit" disabled={isSubmitting} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-lg disabled:opacity-50 flex items-center justify-center gap-2">
                  {isSubmitting ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <><CheckCircle className="w-4 h-4" />Enregistrer</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modale Modification */}
      {isEditModalOpen && editingSupplier && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="bg-blue-600 text-white px-6 py-4 flex items-center justify-between">
              <h3 className="text-lg font-bold flex items-center gap-2"><Edit2 className="w-5 h-5" /> Modifier le Fournisseur</h3>
              <button onClick={() => setIsEditModalOpen(false)} className="hover:bg-blue-700 p-1 rounded"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleEdit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nom de l'entreprise *</label>
                <input type="text" required value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nom du contact</label>
                  <input type="text" value={editForm.contact_name} onChange={(e) => setEditForm({ ...editForm, contact_name: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Téléphone</label>
                  <input type="text" value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                <input type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Adresse</label>
                <textarea value={editForm.address} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} rows={2} className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setIsEditModalOpen(false)} className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold py-2.5 rounded-lg">Annuler</button>
                <button type="submit" disabled={isSubmitting} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-lg disabled:opacity-50 flex items-center justify-center gap-2">
                  {isSubmitting ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <><Save className="w-4 h-4" />Enregistrer</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modale Confirmation Suppression */}
      {isDeleteModalOpen && supplierToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="bg-red-600 text-white px-6 py-4 flex items-center justify-between">
              <h3 className="text-lg font-bold flex items-center gap-2"><AlertCircle className="w-5 h-5" /> Confirmation</h3>
              <button onClick={() => setIsDeleteModalOpen(false)} className="hover:bg-red-700 p-1 rounded"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6">
              {deleteError ? (
                <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-lg text-sm mb-4 flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <p>{deleteError}</p>
                </div>
              ) : (
                <p className="text-slate-700 mb-6">
                  Êtes-vous sûr de vouloir supprimer le fournisseur <strong>"{supplierToDelete.name}"</strong> ? Cette action est irréversible.
                </p>
              )}
              <div className="flex gap-3">
                <button onClick={() => setIsDeleteModalOpen(false)} className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold py-2.5 rounded-lg">
                  {deleteError ? 'Fermer' : 'Annuler'}
                </button>
                {!deleteError && (
                  <button onClick={confirmDelete} disabled={isSubmitting} className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-2.5 rounded-lg disabled:opacity-50 flex items-center justify-center gap-2">
                    {isSubmitting ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <><Trash2 className="w-4 h-4" />Supprimer</>}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
