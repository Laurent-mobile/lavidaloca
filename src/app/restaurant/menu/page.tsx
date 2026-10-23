'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { 
  Plus, Search, Edit, Trash2, ToggleLeft, ToggleRight, 
  X, Save, Utensils, Wine, LayoutGrid, BookOpen 
} from 'lucide-react';

interface Category {
  id: string;
  name: string;
  icon?: string;
}

interface MenuItem {
  id: string;
  name: string;
  category_id: string;
  category_name?: string;
  price: number;
  description: string;
  destination: string;
  is_available: boolean;
}

interface RecipeIngredient {
  id: string;
  stock_item_id: string;
  stock_name?: string;
  stock_unit?: string;
  quantity: number;
  unit: string;
}

export default function MenuManagementPage() {
  const supabase = createClient();
  const [siteId, setSiteId] = useState<string>('');
  const [items, setItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [stockItems, setStockItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('ALL');
  
  // États pour le modal Article (Ajout/Modif)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [formData, setFormData] = useState({
    name: '', category_id: '', price: '', description: '', destination: 'KITCHEN', is_available: true
  });

  // États pour le modal Fiche Technique (Recettes)
  const [isRecipeModalOpen, setIsRecipeModalOpen] = useState(false);
  const [selectedMenuItem, setSelectedMenuItem] = useState<MenuItem | null>(null);
  const [recipeIngredients, setRecipeIngredients] = useState<RecipeIngredient[]>([]);
  const [selectedStockItem, setSelectedStockItem] = useState('');
  const [recipeQuantity, setRecipeQuantity] = useState('');
  const [recipeUnit, setRecipeUnit] = useState('unité');

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase.from('profiles').select('site_id').eq('id', user.id).maybeSingle();
        if (profile) setSiteId(profile.site_id || '');
      }
    };
    init();
  }, []);

  useEffect(() => {
    if (siteId) {
      loadData();
    }
  }, [siteId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data: catData } = await supabase.from('restaurant_categories').select('id, name, icon').eq('site_id', siteId).eq('is_active', true).order('display_order', { ascending: true });
      setCategories(catData || []);

      const { data: itemData } = await supabase.from('restaurant_items').select(`id, name, category_id, price, description, destination, is_available, restaurant_categories(name)`).eq('site_id', siteId).order('name', { ascending: true });
      
      const formattedItems = itemData?.map(item => ({
        id: item.id, name: item.name, category_id: item.category_id,
        category_name: (item as any).restaurant_categories?.name || 'Non catégorisé',
        price: item.price, description: item.description || '',
        destination: item.destination || 'KITCHEN', is_available: item.is_available
      })) || [];
      setItems(formattedItems);
    } catch (error) {
      console.error('Erreur chargement menu:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadStockItems = async () => {
    try {
      const { data } = await supabase.from('stock_items').select('id, name, unit').eq('site_id', siteId).order('name');
      setStockItems(data || []);
    } catch (error) {
      console.error('Erreur chargement stock:', error);
    }
  };

  // --- Gestion des Articles du Menu ---
  const openModal = (item: MenuItem | null = null) => {
    if (item) {
      setEditingItem(item);
      setFormData({ name: item.name, category_id: item.category_id, price: item.price.toString(), description: item.description, destination: item.destination, is_available: item.is_available });
    } else {
      setEditingItem(null);
      setFormData({ name: '', category_id: categories[0]?.id || '', price: '', description: '', destination: 'KITCHEN', is_available: true });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => { setIsModalOpen(false); setEditingItem(null); };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.category_id || !formData.price) { alert('Veuillez remplir tous les champs obligatoires.'); return; }
    const payload = { site_id: siteId, name: formData.name, category_id: formData.category_id, price: parseFloat(formData.price), description: formData.description, destination: formData.destination, is_available: formData.is_available };
    try {
      if (editingItem) { await supabase.from('restaurant_items').update(payload).eq('id', editingItem.id); } 
      else { await supabase.from('restaurant_items').insert(payload); }
      closeModal(); loadData();
    } catch (error: any) { alert('Erreur : ' + error.message); }
  };

  const toggleAvailability = async (item: MenuItem) => {
    try { await supabase.from('restaurant_items').update({ is_available: !item.is_available }).eq('id', item.id); loadData(); } 
    catch (error: any) { alert('Erreur : ' + error.message); }
  };

  const deleteItem = async (id: string) => {
    if (!confirm('Supprimer cet article ?')) return;
    try { await supabase.from('restaurant_items').delete().eq('id', id); loadData(); } 
    catch (error: any) { alert('Erreur : ' + error.message); }
  };

  // --- Gestion des Fiches Techniques (Recettes) ---
  const openRecipeModal = async (item: MenuItem) => {
    setSelectedMenuItem(item);
    await loadStockItems();
    
    const { data: recipes } = await supabase.from('item_recipes').select('*').eq('menu_item_id', item.id).eq('site_id', siteId);
    
    // On enrichit les données avec le nom du stock localement pour éviter les erreurs de jointure
    const enriched = recipes?.map(r => ({
      ...r,
      stock_name: stockItems.find(s => s.id === r.stock_item_id)?.name || 'Chargement...',
      stock_unit: stockItems.find(s => s.id === r.stock_item_id)?.unit || ''
    })) || [];
    
    setRecipeIngredients(enriched);
    setIsRecipeModalOpen(true);
  };

  const addIngredientToRecipe = async () => {
    if (!selectedStockItem || !recipeQuantity) { alert('Sélectionnez un article et une quantité.'); return; }
    const payload = { site_id: siteId, menu_item_id: selectedMenuItem!.id, stock_item_id: selectedStockItem, quantity: parseFloat(recipeQuantity), unit: recipeUnit };
    try {
      const { error } = await supabase.from('item_recipes').insert(payload);
      if (error) throw error;
      await openRecipeModal(selectedMenuItem!); // Recharger
      setSelectedStockItem(''); setRecipeQuantity('');
    } catch (error: any) { alert('Erreur : ' + error.message); }
  };

  const removeIngredientFromRecipe = async (recipeId: string) => {
    if (!confirm('Supprimer cet ingrédient ?')) return;
    try {
      await supabase.from('item_recipes').delete().eq('id', recipeId);
      await openRecipeModal(selectedMenuItem!); // Recharger
    } catch (error: any) { alert('Erreur : ' + error.message); }
  };

  const filteredItems = items.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = filterCategory === 'ALL' || item.category_id === filterCategory;
    return matchesSearch && matchesCategory;
  });

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div></div>;

  return (
    <div className="p-4 lg:p-6 h-full space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2"><LayoutGrid className="w-7 h-7 text-indigo-600" />Gestion du Menu</h1>
          <p className="text-sm text-slate-500 mt-1">Gérez vos articles, prix et fiches techniques (ingrédients).</p>
        </div>
        <button onClick={() => openModal()} className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-lg font-medium transition-colors shadow-sm"><Plus className="w-5 h-5" /> Ajouter un article</button>
      </div>

      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input type="text" placeholder="Rechercher un article..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" />
        </div>
        <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="px-4 py-2 border border-slate-300 rounded-lg bg-white text-sm cursor-pointer min-w-[200px]">
          <option value="ALL">Toutes les catégories</option>
          {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
        </select>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500 font-semibold">
                <th className="px-6 py-4">Article</th>
                <th className="px-6 py-4">Catégorie</th>
                <th className="px-6 py-4">Destination</th>
                <th className="px-6 py-4 text-right">Prix</th>
                <th className="px-6 py-4 text-center">Statut</th>
                <th className="px-6 py-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredItems.length === 0 ? (<tr><td colSpan={6} className="px-6 py-12 text-center text-slate-500">Aucun article trouvé.</td></tr>) : (
                filteredItems.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="font-medium text-slate-900">{item.name}</div>
                      {item.description && <div className="text-xs text-slate-500 mt-1 truncate max-w-xs">{item.description}</div>}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-700">{item.category_name}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${item.destination === 'KITCHEN' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                        {item.destination === 'KITCHEN' ? <Utensils className="w-3.5 h-3.5" /> : <Wine className="w-3.5 h-3.5" />}
                        {item.destination === 'KITCHEN' ? 'Cuisine' : 'Bar'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right font-bold text-slate-900">{Number(item.price).toLocaleString('fr-FR')} F</td>
                    <td className="px-6 py-4 text-center">
                      <button onClick={() => toggleAvailability(item)} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${item.is_available ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                        {item.is_available ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}{item.is_available ? 'Disponible' : 'Indisponible'}
                      </button>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => openRecipeModal(item)} className="p-1.5 text-purple-600 hover:text-purple-700 hover:bg-purple-50 rounded-lg" title="Fiche technique (Ingrédients)"><BookOpen className="w-4 h-4" /></button>
                        <button onClick={() => openModal(item)} className="p-1.5 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg" title="Modifier"><Edit className="w-4 h-4" /></button>
                        <button onClick={() => deleteItem(item.id)} className="p-1.5 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg" title="Supprimer"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Ajout/Modif Article */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="bg-indigo-600 text-white px-6 py-4 flex items-center justify-between sticky top-0 z-10">
              <h3 className="text-lg font-bold flex items-center gap-2">{editingItem ? <Edit className="w-5 h-5" /> : <Plus className="w-5 h-5" />}{editingItem ? 'Modifier l\'article' : 'Nouvel article'}</h3>
              <button onClick={closeModal} className="hover:bg-indigo-700 p-1 rounded"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div><label className="block text-sm font-medium text-slate-700 mb-1">Nom *</label><input type="text" required value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 outline-none" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Catégorie *</label><select required value={formData.category_id} onChange={(e) => setFormData({...formData, category_id: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white"><option value="">-- Choisir --</option>{categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}</select></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Prix (F) *</label><input type="number" required min="0" value={formData.price} onChange={(e) => setFormData({...formData, price: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2" /></div>
              </div>
              <div><label className="block text-sm font-medium text-slate-700 mb-1">Destination *</label><div className="grid grid-cols-2 gap-3"><button type="button" onClick={() => setFormData({...formData, destination: 'KITCHEN'})} className={`flex items-center justify-center gap-2 p-3 rounded-lg border-2 ${formData.destination === 'KITCHEN' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200'}`}><Utensils className="w-5 h-5" /> Cuisine</button><button type="button" onClick={() => setFormData({...formData, destination: 'BAR'})} className={`flex items-center justify-center gap-2 p-3 rounded-lg border-2 ${formData.destination === 'BAR' ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-slate-200'}`}><Wine className="w-5 h-5" /> Bar</button></div></div>
              <div><label className="block text-sm font-medium text-slate-700 mb-1">Description</label><textarea value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} rows={2} className="w-full border border-slate-300 rounded-lg px-3 py-2" /></div>
              <div className="flex gap-3 pt-4 border-t border-slate-200"><button type="button" onClick={closeModal} className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold py-2.5 rounded-lg">Annuler</button><button type="submit" className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-lg flex items-center justify-center gap-2"><Save className="w-4 h-4" />{editingItem ? 'Mettre à jour' : 'Ajouter'}</button></div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Fiche Technique (Recettes) */}
      {isRecipeModalOpen && selectedMenuItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="bg-purple-600 text-white px-6 py-4 flex items-center justify-between sticky top-0 z-10">
              <div>
                <h3 className="text-lg font-bold flex items-center gap-2">📋 Fiche Technique : {selectedMenuItem.name}</h3>
                <p className="text-sm opacity-90 mt-1">Définissez les ingrédients consommés du stock</p>
              </div>
              <button onClick={() => setIsRecipeModalOpen(false)} className="hover:bg-purple-700 p-1 rounded"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <h4 className="font-semibold text-slate-900 mb-3">Ingrédients actuels ({recipeIngredients.length})</h4>
                {recipeIngredients.length === 0 ? (<p className="text-slate-500 text-sm italic">Aucun ingrédient défini. Le stock ne sera pas déduit pour cet article.</p>) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {recipeIngredients.map((recipe) => (
                      <div key={recipe.id} className="flex items-center justify-between bg-purple-50 p-3 rounded-lg border border-purple-200">
                        <div className="flex-1">
                          <div className="font-medium text-slate-900">{recipe.stock_name || 'Inconnu'}</div>
                          <div className="text-sm text-purple-700">{recipe.quantity} {recipe.unit || recipe.stock_unit}</div>
                        </div>
                        <button onClick={() => removeIngredientFromRecipe(recipe.id)} className="text-red-600 hover:text-red-700 p-2"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="border-t border-slate-200 pt-4">
                <h4 className="font-semibold text-slate-900 mb-3">➕ Ajouter un ingrédient</h4>
                <div className="space-y-3">
                  <div><label className="block text-sm font-medium text-slate-700 mb-1">Article en stock *</label><select value={selectedStockItem} onChange={(e) => setSelectedStockItem(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white"><option value="">-- Choisir un article --</option>{stockItems.map(item => <option key={item.id} value={item.id}>{item.name} ({item.unit})</option>)}</select></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="block text-sm font-medium text-slate-700 mb-1">Quantité consommée *</label><input type="number" step="0.01" min="0" value={recipeQuantity} onChange={(e) => setRecipeQuantity(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2" placeholder="Ex: 0.2" /></div>
                    <div><label className="block text-sm font-medium text-slate-700 mb-1">Unité</label><select value={recipeUnit} onChange={(e) => setRecipeUnit(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-white"><option value="unité">Unité</option><option value="kg">Kilogramme (kg)</option><option value="g">Gramme (g)</option><option value="L">Litre (L)</option><option value="cl">Centilitre (cl)</option><option value="ml">Millilitre (ml)</option></select></div>
                  </div>
                  <button onClick={addIngredientToRecipe} className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2.5 rounded-lg flex items-center justify-center gap-2"><Plus className="w-4 h-4" />Ajouter l'ingrédient</button>
                </div>
              </div>
              <div className="flex gap-3 pt-4 border-t border-slate-200"><button onClick={() => setIsRecipeModalOpen(false)} className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold py-2.5 rounded-lg">Fermer</button></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
