'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { X, Settings, Plus, Bed, Tag, Edit, Trash2, Save, XCircle } from 'lucide-react';

interface Props {
  siteId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function AdminModal({ siteId, isOpen, onClose, onSuccess }: Props) {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // ✅ CORRECTION : Ajout de 'tax' au type
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
    if (isOpen) {
      loadData();
      resetForms();
    }
  }, [isOpen]);

  const loadData = async () => {
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
      onSuccess();
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
      onSuccess();
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
    onSuccess();
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
    onSuccess();
    loadData();
  };

  const toggleCategoryActive = async (id: string, currentStatus: boolean) => {
    await supabase.from('room_categories').update({ is_active: !currentStatus }).eq('id', id);
    loadData();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="bg-gradient-to-r from-slate-700 to-slate-900 text-white px-6 py-4 flex items-center justify-between rounded-t-xl sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <Settings className="w-6 h-6" />
            <h2 className="text-xl font-bold">Administration</h2>
          </div>
          <button onClick={onClose} className="hover:bg-white/20 p-2 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 text-red-700 p-3 rounded-lg border border-red-200 text-sm flex items-start gap-2">
              <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex gap-2 border-b border-slate-200">
            <button
              onClick={() => { setActiveTab('category'); resetForms(); }}
              className={`flex items-center gap-2 px-4 py-2 font-medium text-sm transition-colors ${
                activeTab === 'category' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Tag className="w-4 h-4" />
              Catégories ({categories.length})
            </button>
            <button
              onClick={() => { setActiveTab('room'); resetForms(); }}
              className={`flex items-center gap-2 px-4 py-2 font-medium text-sm transition-colors ${
                activeTab === 'room' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Bed className="w-4 h-4" />
              Chambres ({rooms.length})
            </button>
            <button
              onClick={() => { setActiveTab('tax'); resetForms(); }}
              className={`flex items-center gap-2 px-4 py-2 font-medium text-sm transition-colors ${
                activeTab === 'tax' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              ⚙️ TVA & Taxes
            </button>
          </div>

          {activeTab === 'category' && (
            <div className="space-y-4">
              <form onSubmit={handleSaveCategory} className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-3">
                <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                  {isEditingCat ? <Edit className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                  {isEditingCat ? 'Modifier la catégorie' : 'Nouvelle catégorie'}
                  {isEditingCat && (
                    <button type="button" onClick={resetForms} className="ml-auto text-xs text-slate-600 hover:text-slate-900">
                      ✕ Annuler
                    </button>
                  )}
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Code *</label>
                    <input
                      type="text"
                      value={catForm.code}
                      onChange={(e) => setCatForm({ ...catForm, code: e.target.value.toUpperCase() })}
                      className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
                      placeholder="STD, SUP, DEL..."
                      maxLength={5}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Nom *</label>
                    <input
                      type="text"
                      value={catForm.name}
                      onChange={(e) => setCatForm({ ...catForm, name: e.target.value })}
                      className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
                      required
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Prix de base (FCFA)</label>
                    <input
                      type="number"
                      min="0"
                      value={catForm.base_price}
                      onChange={(e) => setCatForm({ ...catForm, base_price: Number(e.target.value) })}
                      className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Max adultes</label>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={catForm.max_adults}
                      onChange={(e) => setCatForm({ ...catForm, max_adults: Number(e.target.value) })}
                      className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Max enfants</label>
                    <input
                      type="number"
                      min="0"
                      max="10"
                      value={catForm.max_children}
                      onChange={(e) => setCatForm({ ...catForm, max_children: Number(e.target.value) })}
                      className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Description</label>
                  <input
                    type="text"
                    value={catForm.description}
                    onChange={(e) => setCatForm({ ...catForm, description: e.target.value })}
                    className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
                    placeholder="Climatisée, WiFi, TV..."
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 rounded-lg disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  {loading ? 'Enregistrement...' : isEditingCat ? '💾 Enregistrer les modifications' : '➕ Créer la catégorie'}
                </button>
              </form>

              <div className="space-y-2">
                <h4 className="font-semibold text-slate-800 text-sm">Catégories existantes</h4>
                {categories.map(cat => (
                  <div key={cat.id} className="flex items-center justify-between bg-white border border-slate-200 rounded p-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm">{cat.code}</span>
                        <span className="text-sm text-slate-600">- {cat.name}</span>
                        {!cat.is_active && (
                          <span className="text-xs bg-red-100 text-red-900 px-2 py-0.5 rounded">Inactive</span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                         {Number(cat.base_price).toLocaleString('fr-FR')} F • 👥 {cat.max_adults} ad. + {cat.max_children} enf.
                        {cat.description && ` • ${cat.description}`}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => toggleCategoryActive(cat.id, cat.is_active)}
                        className={`text-xs px-2 py-1 rounded font-medium ${cat.is_active ? 'bg-emerald-100 text-emerald-900' : 'bg-red-100 text-red-900'}`}
                      >
                        {cat.is_active ? '✓' : '✗'}
                      </button>
                      <button
                        onClick={() => handleEditCategory(cat)}
                        className="text-blue-600 hover:text-blue-800 p-1"
                        title="Modifier"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteCategory(cat)}
                        className="text-red-600 hover:text-red-800 p-1"
                        title="Supprimer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'tax' && (
            <div className="space-y-4">
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
              }} className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-3">
                <h3 className="font-semibold text-slate-900">⚙️ Paramètres de TVA</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Nom de la taxe</label>
                    <input type="text" value={taxForm.tax_name} onChange={(e) => setTaxForm({ ...taxForm, tax_name: e.target.value })} className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Numéro de taxe</label>
                    <input type="text" value={taxForm.tax_number} onChange={(e) => setTaxForm({ ...taxForm, tax_number: e.target.value })} className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm" placeholder="TVA-001" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Taux de TVA (%)</label>
                  <input type="number" min="0" max="100" step="0.01" value={taxForm.tax_rate} onChange={(e) => setTaxForm({ ...taxForm, tax_rate: Number(e.target.value) })} className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm" />
                  <p className="text-xs text-slate-500 mt-1">💡 Actuellement utilisé : {taxForm.tax_rate}% sur toutes les factures</p>
                </div>
                <button type="submit" disabled={loading} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 rounded-lg disabled:opacity-50">
                  {loading ? 'Enregistrement...' : '💾 Enregistrer les paramètres'}
                </button>
              </form>
            </div>
          )}

          {activeTab === 'room' && (
            <div className="space-y-4">
              <form onSubmit={handleSaveRoom} className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-3">
                <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                  {isEditingRoom ? <Edit className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                  {isEditingRoom ? 'Modifier la chambre' : 'Nouvelle chambre'}
                  {isEditingRoom && (
                    <button type="button" onClick={resetForms} className="ml-auto text-xs text-slate-600 hover:text-slate-900">
                      ✕ Annuler
                    </button>
                  )}
                </h3>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Numéro *</label>
                    <input
                      type="text"
                      value={roomForm.number}
                      onChange={(e) => setRoomForm({ ...roomForm, number: e.target.value })}
                      className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Étage</label>
                    <input
                      type="number"
                      min="0"
                      max="20"
                      value={roomForm.floor}
                      onChange={(e) => setRoomForm({ ...roomForm, floor: Number(e.target.value) })}
                      className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Catégorie *</label>
                    <select
                      value={roomForm.category_id}
                      onChange={(e) => setRoomForm({ ...roomForm, category_id: e.target.value })}
                      className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
                      required
                    >
                      <option value="">-- Catégorie --</option>
                      {categories.filter(c => c.is_active).map(c => (
                        <option key={c.id} value={c.id}>{c.code} - {c.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 rounded-lg disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  {loading ? 'Enregistrement...' : isEditingRoom ? '💾 Enregistrer les modifications' : '➕ Créer la chambre'}
                </button>
              </form>

              <div className="space-y-2 max-h-64 overflow-y-auto">
                <h4 className="font-semibold text-slate-800 text-sm">Chambres existantes ({rooms.length})</h4>
                {rooms.map(room => (
                  <div key={room.id} className="flex items-center justify-between bg-white border border-slate-200 rounded p-2">
                    <div className="flex items-center gap-3 flex-1">
                      <span className="font-bold text-sm w-12">{room.number}</span>
                      <span className="text-xs text-slate-600">Étage {room.floor}</span>
                      <span className="text-xs bg-indigo-100 text-indigo-900 px-2 py-0.5 rounded">
                        {room.room_categories?.code}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        room.status === 'VACANT' ? 'bg-emerald-100 text-emerald-900' :
                        room.status === 'OCCUPIED' ? 'bg-blue-100 text-blue-900' :
                        room.status === 'RESERVED' ? 'bg-amber-100 text-amber-900' :
                        room.status === 'OUT_OF_ORDER' ? 'bg-red-100 text-red-900' :
                        'bg-orange-100 text-orange-900'
                      }`}>
                        {room.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleEditRoom(room)}
                        className="text-blue-600 hover:text-blue-800 p-1"
                        title="Modifier"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteRoom(room)}
                        className="text-red-600 hover:text-red-800 p-1"
                        title="Supprimer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
