'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useProfile } from '@/hooks/useHotel';
import { 
  Settings, Plus, Bed, Tag, Edit, Trash2, Save, XCircle, 
  ArrowLeft, Loader2, Percent 
} from 'lucide-react';

export default function ParametresPage() {
  const supabase = createClient();
  const router = useRouter();
  const { siteId, loading: profileLoading } = useProfile();
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'category' | 'room' | 'tax'>('category');
  
  const [categories, setCategories] = useState<any[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);
  const [taxSettings, setTaxSettings] = useState<any>(null);
  const [taxForm, setTaxForm] = useState({ tax_name: 'TVA', tax_rate: 18, tax_number: '' });

  const [catForm, setCatForm] = useState({
    id: '',
    code: '',
    name: '',
    base_price: 0,
    max_adults: 2,
    max_children: 2,
    description: '',
  });
  const [isEditingCat, setIsEditingCat] = useState(false);

  const [roomForm, setRoomForm] = useState({
    id: '',
    number: '',
    floor: 1,
    category_id: '',
  });
  const [isEditingRoom, setIsEditingRoom] = useState(false);

  useEffect(() => {
    if (siteId) {
      loadData();
      resetForms();
    }
  }, [siteId]);

  const loadData = async () => {
    if (!siteId) return;
    const { data: cat } = await supabase
      .from('room_categories')
      .select('*')
      .eq('site_id', siteId)
      .order('code');
    if (cat) setCategories(cat);

    const { data: rm } = await supabase
      .from('rooms')
      .select('id, number, floor, status, category_id, room_categories (code, name)')
      .eq('site_id', siteId)
      .order('number');
    if (rm) setRooms(rm);

    const { data: tax } = await supabase
      .from('tax_settings')
      .select('*')
      .eq('site_id', siteId)
      .single();
    if (tax) {
      setTaxSettings(tax);
      setTaxForm({ tax_name: tax.tax_name, tax_rate: tax.tax_rate, tax_number: tax.tax_number || '' });
    }
  };

  const resetForms = () => {
    setCatForm({ id: '', code: '', name: '', base_price: 0, max_adults: 2, max_children: 2, description: '' });
    setRoomForm({ id: '', number: '', floor: 1, category_id: '' });
    setIsEditingCat(false);
    setIsEditingRoom(false);
    setError('');
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (!catForm.code.trim() || !catForm.name.trim()) {
      setError('Code et nom obligatoires.');
      setLoading(false);
      return;
    }

    const payload = {
      site_id: siteId,
      code: catForm.code.toUpperCase(),
      name: catForm.name,
      base_price: catForm.base_price,
      max_adults: catForm.max_adults,
      max_children: catForm.max_children,
      description: catForm.description,
    };

    let error;
    if (isEditingCat && catForm.id) {
      const res = await supabase.from('room_categories').update(payload).eq('id', catForm.id);
      error = res.error;
    } else {
      const res = await supabase.from('room_categories').insert({ ...payload, is_active: true });
      error = res.error;
    }

    if (error) {
      setError(error.message);
    } else {
      loadData();
      resetForms();
    }
    setLoading(false);
  };

  const handleSaveRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (!roomForm.number.trim() || !roomForm.category_id) {
      setError('Numéro et catégorie obligatoires.');
      setLoading(false);
      return;
    }

    const payload = {
      site_id: siteId,
      number: roomForm.number,
      floor: roomForm.floor,
      category_id: roomForm.category_id,
    };

    let error;
    if (isEditingRoom && roomForm.id) {
      const res = await supabase.from('rooms').update(payload).eq('id', roomForm.id);
      error = res.error;
    } else {
      const res = await supabase.from('rooms').insert({ ...payload, status: 'VACANT' });
      error = res.error;
    }

    if (error) {
      setError(error.message);
    } else {
      loadData();
      resetForms();
    }
    setLoading(false);
  };

  const handleEditCategory = (cat: any) => {
    setCatForm({
      id: cat.id,
      code: cat.code,
      name: cat.name,
      base_price: cat.base_price || 0,
      max_adults: cat.max_adults || 2,
      max_children: cat.max_children || 2,
      description: cat.description || '',
    });
    setIsEditingCat(true);
  };

  const handleEditRoom = (room: any) => {
    setRoomForm({
      id: room.id,
      number: room.number,
      floor: room.floor || 1,
      category_id: room.category_id,
    });
    setIsEditingRoom(true);
  };

  const handleDeleteCategory = async (cat: any) => {
    const { count } = await supabase
      .from('rooms')
      .select('*', { count: 'exact', head: true })
      .eq('category_id', cat.id);

    if (count && count > 0) {
      setError(`Impossible de supprimer : ${count} chambre(s) utilisent cette catégorie.`);
      return;
    }

    if (!confirm(`Supprimer la catégorie "${cat.code} - ${cat.name}" ?`)) return;
    await supabase.from('room_categories').delete().eq('id', cat.id);
    loadData();
  };

  const handleDeleteRoom = async (room: any) => {
    const { count: resCount } = await supabase
      .from('reservations')
      .select('*', { count: 'exact', head: true })
      .eq('room_id', room.id);
    const { count: stayCount } = await supabase
      .from('stays')
      .select('*', { count: 'exact', head: true })
      .eq('room_id', room.id);

    if ((resCount && resCount > 0) || (stayCount && stayCount > 0)) {
      setError('Impossible de supprimer : cette chambre a des réservations ou séjours.');
      return;
    }

    if (!confirm(`Supprimer la chambre "${room.number}" ?`)) return;
    await supabase.from('rooms').delete().eq('id', room.id);
    loadData();
  };

  const toggleCategoryActive = async (id: string, currentStatus: boolean) => {
    await supabase.from('room_categories').update({ is_active: !currentStatus }).eq('id', id);
    loadData();
  };

  if (profileLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
      </div>
    );
  }

  if (!siteId) return null;

  return (
    <div className="p-4 lg:p-5 space-y-4">
      {/* Header */}
          {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <button 
            onClick={() => router.back()} 
            className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
            title="Retour"
          >
            <ArrowLeft className="w-4 h-4 text-slate-600" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <Settings className="w-5 h-5 text-indigo-600" />
              Paramètres de l'hôtel
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">Gérez les catégories de chambres, les chambres et les taxes.</p>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 p-3 rounded-lg border border-red-200 text-sm flex items-start gap-2">
          <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError('')} className="ml-auto hover:text-red-900 font-bold">✕</button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200">
        <button
          onClick={() => { setActiveTab('category'); resetForms(); }}
          className={`flex items-center gap-2 px-4 py-3 font-medium text-sm transition-colors ${
            activeTab === 'category' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Tag className="w-4 h-4" />
          Catégories ({categories.length})
        </button>
        <button
          onClick={() => { setActiveTab('room'); resetForms(); }}
          className={`flex items-center gap-2 px-4 py-3 font-medium text-sm transition-colors ${
            activeTab === 'room' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Bed className="w-4 h-4" />
          Chambres ({rooms.length})
        </button>
        <button
          onClick={() => { setActiveTab('tax'); resetForms(); }}
          className={`flex items-center gap-2 px-4 py-3 font-medium text-sm transition-colors ${
            activeTab === 'tax' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Percent className="w-4 h-4" />
          TVA & Taxes
        </button>
      </div>

      {/* Content: Categories */}
      {activeTab === 'category' && (
        <div className="space-y-6">
          <form onSubmit={handleSaveCategory} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2 text-lg">
              {isEditingCat ? <Edit className="w-5 h-5 text-indigo-600" /> : <Plus className="w-5 h-5 text-indigo-600" />}
              {isEditingCat ? 'Modifier la catégorie' : 'Nouvelle catégorie'}
              {isEditingCat && (
                <button type="button" onClick={resetForms} className="ml-auto text-sm text-slate-500 hover:text-slate-900 font-normal">
                  ✕ Annuler la modification
                </button>
              )}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Code *</label>
                <input
                  type="text"
                  value={catForm.code}
                  onChange={(e) => setCatForm({ ...catForm, code: e.target.value.toUpperCase() })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="STD, SUP, DEL..."
                  maxLength={5}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nom *</label>
                <input
                  type="text"
                  value={catForm.name}
                  onChange={(e) => setCatForm({ ...catForm, name: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Prix de base (FCFA)</label>
                <input
                  type="number"
                  min="0"
                  value={catForm.base_price}
                  onChange={(e) => setCatForm({ ...catForm, base_price: Number(e.target.value) })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Max adultes</label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={catForm.max_adults}
                  onChange={(e) => setCatForm({ ...catForm, max_adults: Number(e.target.value) })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Max enfants</label>
                <input
                  type="number"
                  min="0"
                  max="10"
                  value={catForm.max_children}
                  onChange={(e) => setCatForm({ ...catForm, max_children: Number(e.target.value) })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
              <input
                type="text"
                value={catForm.description}
                onChange={(e) => setCatForm({ ...catForm, description: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder="Climatisée, WiFi, TV..."
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full md:w-auto bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 px-6 rounded-lg disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
            >
              <Save className="w-4 h-4" />
              {loading ? 'Enregistrement...' : isEditingCat ? 'Enregistrer les modifications' : 'Créer la catégorie'}
            </button>
          </form>

          <div className="space-y-3">
            <h4 className="font-semibold text-slate-800 text-sm uppercase tracking-wider">Catégories existantes</h4>
            {categories.length === 0 ? (
              <div className="text-center py-8 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                <Tag className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                <p className="text-slate-500 text-sm">Aucune catégorie créée pour le moment.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {categories.map(cat => (
                  <div key={cat.id} className="flex items-center justify-between bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold text-sm bg-indigo-100 text-indigo-900 px-2 py-0.5 rounded">{cat.code}</span>
                        <span className="text-sm font-medium text-slate-900">{cat.name}</span>
                        {!cat.is_active && (
                          <span className="text-xs bg-red-100 text-red-900 px-2 py-0.5 rounded-full">Inactive</span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500">
                         {Number(cat.base_price).toLocaleString('fr-FR')} F • 👥 {cat.max_adults} ad. + {cat.max_children} enf.
                        {cat.description && ` • ${cat.description}`}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 ml-2">
                      <button
                        onClick={() => toggleCategoryActive(cat.id, cat.is_active)}
                        className={`text-xs px-2 py-1 rounded font-medium transition-colors ${cat.is_active ? 'bg-emerald-100 text-emerald-900 hover:bg-emerald-200' : 'bg-red-100 text-red-900 hover:bg-red-200'}`}
                        title={cat.is_active ? 'Désactiver' : 'Activer'}
                      >
                        {cat.is_active ? '✓ Actif' : '✗ Inactif'}
                      </button>
                      <button
                        onClick={() => handleEditCategory(cat)}
                        className="text-blue-600 hover:bg-blue-50 p-1.5 rounded-lg transition-colors"
                        title="Modifier"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteCategory(cat)}
                        className="text-red-600 hover:bg-red-50 p-1.5 rounded-lg transition-colors"
                        title="Supprimer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Content: Tax */}
      {activeTab === 'tax' && (
        <div className="space-y-6">
          <form onSubmit={async (e) => {
            e.preventDefault();
            setLoading(true);
            const { error } = taxSettings
              ? await supabase.from('tax_settings').update(taxForm).eq('id', taxSettings.id)
              : await supabase.from('tax_settings').insert({ site_id: siteId, ...taxForm });
            if (!error) {
              loadData();
              setError('');
            } else {
              setError(error.message);
            }
            setLoading(false);
          }} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4 max-w-2xl">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2 text-lg">
              <Percent className="w-5 h-5 text-indigo-600" />
              Paramètres de TVA
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nom de la taxe</label>
                <input 
                  type="text" 
                  value={taxForm.tax_name} 
                  onChange={(e) => setTaxForm({ ...taxForm, tax_name: e.target.value })} 
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" 
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Numéro de taxe</label>
                <input 
                  type="text" 
                  value={taxForm.tax_number} 
                  onChange={(e) => setTaxForm({ ...taxForm, tax_number: e.target.value })} 
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" 
                  placeholder="TVA-001" 
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Taux de TVA (%)</label>
              <input 
                type="number" 
                min="0" 
                max="100" 
                step="0.01" 
                value={taxForm.tax_rate} 
                onChange={(e) => setTaxForm({ ...taxForm, tax_rate: Number(e.target.value) })} 
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" 
              />
              <p className="text-xs text-slate-500 mt-1">💡 Actuellement utilisé : {taxForm.tax_rate}% sur toutes les factures</p>
            </div>
            <button 
              type="submit" 
              disabled={loading} 
              className="w-full md:w-auto bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 px-6 rounded-lg disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
            >
              <Save className="w-4 h-4" />
              {loading ? 'Enregistrement...' : 'Enregistrer les paramètres'}
            </button>
          </form>
        </div>
      )}

      {/* Content: Rooms */}
      {activeTab === 'room' && (
        <div className="space-y-6">
          <form onSubmit={handleSaveRoom} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2 text-lg">
              {isEditingRoom ? <Edit className="w-5 h-5 text-indigo-600" /> : <Plus className="w-5 h-5 text-indigo-600" />}
              {isEditingRoom ? 'Modifier la chambre' : 'Nouvelle chambre'}
              {isEditingRoom && (
                <button type="button" onClick={resetForms} className="ml-auto text-sm text-slate-500 hover:text-slate-900 font-normal">
                  ✕ Annuler la modification
                </button>
              )}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Numéro *</label>
                <input
                  type="text"
                  value={roomForm.number}
                  onChange={(e) => setRoomForm({ ...roomForm, number: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Étage</label>
                <input
                  type="number"
                  min="0"
                  max="20"
                  value={roomForm.floor}
                  onChange={(e) => setRoomForm({ ...roomForm, floor: Number(e.target.value) })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Catégorie *</label>
                <select
                  value={roomForm.category_id}
                  onChange={(e) => setRoomForm({ ...roomForm, category_id: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                  required
                >
                  <option value="">-- Sélectionner une catégorie --</option>
                  {categories.filter(c => c.is_active).map(c => (
                    <option key={c.id} value={c.id}>{c.code} - {c.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full md:w-auto bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 px-6 rounded-lg disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
            >
              <Save className="w-4 h-4" />
              {loading ? 'Enregistrement...' : isEditingRoom ? 'Enregistrer les modifications' : 'Créer la chambre'}
            </button>
          </form>

          <div className="space-y-3">
            <h4 className="font-semibold text-slate-800 text-sm uppercase tracking-wider">Chambres existantes ({rooms.length})</h4>
            {rooms.length === 0 ? (
              <div className="text-center py-8 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                <Bed className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                <p className="text-slate-500 text-sm">Aucune chambre créée pour le moment.</p>
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold text-slate-600">N°</th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-600">Étage</th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-600">Catégorie</th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-600">Statut</th>
                        <th className="px-4 py-3 text-right font-semibold text-slate-600">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {rooms.map(room => (
                        <tr key={room.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 font-bold text-slate-900">{room.number}</td>
                          <td className="px-4 py-3 text-slate-600">Étage {room.floor}</td>
                          <td className="px-4 py-3">
                            <span className="text-xs bg-indigo-100 text-indigo-900 px-2 py-1 rounded-full font-medium">
                              {room.room_categories?.code} - {room.room_categories?.name}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                              room.status === 'VACANT' ? 'bg-emerald-100 text-emerald-900' :
                              room.status === 'OCCUPIED' ? 'bg-blue-100 text-blue-900' :
                              room.status === 'RESERVED' ? 'bg-amber-100 text-amber-900' :
                              room.status === 'OUT_OF_ORDER' ? 'bg-red-100 text-red-900' :
                              'bg-orange-100 text-orange-900'
                            }`}>
                              {room.status === 'VACANT' ? 'Libre' :
                               room.status === 'OCCUPIED' ? 'Occupée' :
                               room.status === 'RESERVED' ? 'Réservée' :
                               room.status === 'OUT_OF_ORDER' ? 'Hors service' :
                               'À nettoyer'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => handleEditRoom(room)}
                                className="text-blue-600 hover:bg-blue-50 p-1.5 rounded-lg transition-colors"
                                title="Modifier"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteRoom(room)}
                                className="text-red-600 hover:bg-red-50 p-1.5 rounded-lg transition-colors"
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
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
