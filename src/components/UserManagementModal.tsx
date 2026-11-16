'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { X, Users, Shield, Edit, Save, Trash2, Plus, AlertCircle } from 'lucide-react';
import { MODULES, type UserRole } from '@/lib/permissions';

interface Props {
  siteId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const AVAILABLE_ROLES: UserRole[] = [
  'DIRECTOR',
  'RECEPTIONIST',
  'RESTAURANT_MANAGER',
  'SERVER',
  'CHEF',
  'BARTENDER',
  'CASHIER',
  'HOUSEKEEPING'
];

const ROLE_LABELS: Record<UserRole, string> = {
  DIRECTOR: 'Directeur',
  RECEPTIONIST: 'Réceptionniste',
  RESTAURANT_MANAGER: 'Manager Restaurant',
  SERVER: 'Serveur',
  CHEF: 'Chef',
  BARTENDER: 'Barman',
  CASHIER: 'Caissier',
  HOUSEKEEPING: 'Femme de chambre'
};

const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  DIRECTOR: 'Accès total à toutes les fonctionnalités',
  RECEPTIONIST: 'Gestion des chambres, réservations et caisse hôtel',
  RESTAURANT_MANAGER: 'Gestion complète du restaurant',
  SERVER: 'Prise de commandes et service',
  CHEF: 'Gestion de la cuisine',
  BARTENDER: 'Gestion du bar',
  CASHIER: 'Gestion de la caisse',
  HOUSEKEEPING: 'Gestion du nettoyage des chambres'
};

export default function UserManagementModal({ siteId, isOpen, onClose, onSuccess }: Props) {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [users, setUsers] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [formData, setFormData] = useState({
    email: '',
    first_name: '',
    last_name: '',
    role: 'RECEPTIONIST' as UserRole,
    phone: '',
    is_active: true
  });

  useEffect(() => {
    if (isOpen) {
      loadUsers();
      setShowForm(false);
      setEditingUser(null);
    }
  }, [isOpen]);

  const loadUsers = async (forceRefresh = false) => {
    setLoading(true);
    try {
      console.log('🔄 Chargement utilisateurs...');

      // ✅ CORRECTION : On retire la jointure ", sites(id, name)" qui cause l'erreur 500
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('site_id', siteId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('❌ Erreur Supabase:', error);
        throw error;
      }

      console.log(`✅ ${data?.length || 0} utilisateur(s) chargé(s)`);
      setUsers(data || []);
    } catch (err: any) {
      console.error('❌ Erreur loadUsers:', err);
      setError(err.message);
    }
    setLoading(false);
  };

  const handleEdit = (user: any) => {
    setEditingUser(user);
    setFormData({
      email: user.email || '',
      first_name: user.first_name || '',
      last_name: user.last_name || '',
      role: user.role || 'RECEPTIONIST',
      phone: user.phone || '',
      is_active: user.is_active !== false
    });
    setShowForm(true);
  };

  const handleCreate = () => {
    setEditingUser(null);
    setFormData({
      email: '',
      first_name: '',
      last_name: '',
      role: 'RECEPTIONIST',
      phone: '',
      is_active: true
    });
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (editingUser) {
        // ✅ AJOUTEZ CE LOG pour voir ce qui est vraiment envoyé
        console.log('📤 Données envoyées pour mise à jour:', {
          id: editingUser.id,
          first_name: formData.first_name,
          last_name: formData.last_name,
          role: formData.role, // <-- Vérifiez que ce n'est plus l'ancien rôle ici
          phone: formData.phone,
          is_active: formData.is_active
        });
        const { error } = await supabase
          .from('profiles')
          .update({
            first_name: formData.first_name,
            last_name: formData.last_name,
            role: formData.role,
            phone: formData.phone,
            is_active: formData.is_active
          })
          .eq('id', editingUser.id);

        if (error) {
          console.error('❌ Erreur update:', error);
          throw error;
        }

        console.log('✅ Utilisateur modifié dans Supabase (ID:', editingUser.id, ')');

        // Recharger IMMÉDIATEMENT après succès
        await loadUsers(true);

        alert('✅ Utilisateur modifié avec succès !');
      } else {
        // Créer un nouvel utilisateur
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: formData.email,
          password: 'TempPass123!',
          options: {
            data: {
              first_name: formData.first_name,
              last_name: formData.last_name,
              role: formData.role,
              phone: formData.phone,
              site_id: siteId
            }
          }
        });

        if (authError) throw authError;

        if (authData.user) {
          const { error: profileError } = await supabase
            .from('profiles')
            .update({
              first_name: formData.first_name,
              last_name: formData.last_name,
              role: formData.role,
              phone: formData.phone,
              is_active: formData.is_active,
              site_id: siteId
            })
            .eq('id', authData.user.id);

          if (profileError) throw profileError;

          console.log('✅ Nouvel utilisateur créé:', authData.user.id);

          await loadUsers(true);

          alert(`✅ Utilisateur créé !\n\nEmail: ${formData.email}\nMot de passe temporaire: TempPass123!`);
        }
      }

      setShowForm(false);
      onSuccess();
    } catch (err: any) {
      console.error('❌ Erreur handleSubmit:', err);
      setError(err.message);
    }
    setLoading(false);
  };

  const handleDelete = async (userId: string) => {
    if (!confirm('⚠️ Désactiver cet utilisateur ?')) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ is_active: false })
        .eq('id', userId);

      if (error) throw error;

      console.log('✅ Utilisateur désactivé:', userId);

      // ✅ Recharger après suppression
      await loadUsers(true);

      alert('✅ Utilisateur désactivé');
      onSuccess();
    } catch (err: any) {
      console.error('❌ Erreur handleDelete:', err);
      setError(err.message);
    }
    setLoading(false);
  };

  const getRoleBadgeColor = (role: string) => {
    const colors: Record<string, string> = {
      DIRECTOR: 'bg-purple-200 text-purple-900',
      RECEPTIONIST: 'bg-blue-200 text-blue-900',
      RESTAURANT_MANAGER: 'bg-amber-200 text-amber-900',
      SERVER: 'bg-emerald-200 text-emerald-900',
      CHEF: 'bg-orange-200 text-orange-900',
      BARTENDER: 'bg-pink-200 text-pink-900',
      CASHIER: 'bg-indigo-200 text-indigo-900',
      HOUSEKEEPING: 'bg-slate-200 text-slate-900'
    };
    return colors[role] || 'bg-slate-200 text-slate-900';
  };

  const getModuleAccess = (role: UserRole) => {
    const modules = MODULES.filter(m => m.roles.includes(role));
    return {
      hotel: modules.filter(m => m.section === 'HOTEL').length,
      restaurant: modules.filter(m => m.section === 'RESTAURANT').length,
      admin: modules.filter(m => m.section === 'ADMIN').length
    };
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-y-auto">
        <div className="bg-gradient-to-r from-purple-600 to-indigo-700 text-white px-6 py-4 flex items-center justify-between rounded-t-xl sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <Shield className="w-6 h-6" />
            <div>
              <h2 className="text-xl font-bold">Gestion des Utilisateurs</h2>
              <p className="text-xs text-purple-200">{users.length} utilisateur(s) • {users.filter(u => u.is_active !== false).length} actif(s)</p>
            </div>
          </div>
          <button onClick={onClose} className="hover:bg-white/20 p-2 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 text-red-700 p-3 rounded-lg border border-red-200 text-sm flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!showForm ? (
            <>
              <div className="flex justify-between items-center">
                <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  Liste des utilisateurs
                </h3>
                <button
                  onClick={handleCreate}
                  className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
                >
                  <Plus className="w-4 h-4" />
                  Nouvel utilisateur
                </button>
              </div>

              {loading ? (
                <div className="text-center py-8 text-slate-500">Chargement...</div>
              ) : users.length === 0 ? (
                <div className="text-center py-8 bg-slate-50 rounded-lg">
                  <Users className="w-12 h-12 mx-auto mb-2 text-slate-300" />
                  <p className="text-sm text-slate-500">Aucun utilisateur trouvé</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {users.map(user => {
                    const access = getModuleAccess(user.role as UserRole);
                    const isActive = user.is_active !== false;
                    return (
                      <div key={user.id} className={`border rounded-lg p-4 ${isActive ? 'bg-white border-slate-200' : 'bg-slate-50 border-slate-300 opacity-60'}`}>
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 flex-wrap">
                              <div className="flex items-center gap-2">
                                <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold">
                                  {(user.first_name?.[0] || user.email?.[0] || '?').toUpperCase()}
                                </div>
                                <div>
                                  <div className="font-semibold text-slate-900">
                                    {user.first_name} {user.last_name}
                                  </div>
                                  <div className="text-xs text-slate-500">{user.email}</div>
                                </div>
                              </div>
                              <span className={`text-xs px-2 py-1 rounded font-medium ${getRoleBadgeColor(user.role as UserRole)}`}>
                                {ROLE_LABELS[user.role as UserRole] || user.role}
                              </span>
                              {!isActive && (
                                <span className="text-xs px-2 py-1 rounded bg-red-100 text-red-900 font-medium">
                                  Inactif
                                </span>
                              )}
                            </div>

                            <div className="mt-2 flex items-center gap-4 text-xs text-slate-600">
                              {user.phone && <span>📞 {user.phone}</span>}
                              <span>🏨 {access.hotel} modules</span>
                              <span>🍽️ {access.restaurant} modules</span>
                              {access.admin > 0 && <span>⚙️ {access.admin} admin</span>}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleEdit(user)}
                              className="text-blue-600 hover:text-blue-800 p-2 rounded-lg hover:bg-blue-50"
                              title="Modifier"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            {isActive && (
                              <button
                                onClick={() => handleDelete(user.id)}
                                className="text-red-600 hover:text-red-800 p-2 rounded-lg hover:bg-red-50"
                                title="Désactiver"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                  {editingUser ? <Edit className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                  {editingUser ? 'Modifier l\'utilisateur' : 'Créer un nouvel utilisateur'}
                </h3>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="text-sm text-slate-600 hover:text-slate-900"
                >
                  ✕ Annuler
                </button>
              </div>

              {!editingUser && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Email *</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                    required
                  />
                  <p className="text-xs text-slate-500 mt-1">💡 Mot de passe temporaire: TempPass123!</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Prénom *</label>
                  <input
                    type="text"
                    value={formData.first_name}
                    onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nom *</label>
                  <input
                    type="text"
                    value={formData.last_name}
                    onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Téléphone</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="+226 ..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Rôle *</label>
                <div className="grid grid-cols-2 gap-2">
                  {AVAILABLE_ROLES.map(role => {
                    const access = getModuleAccess(role);
                    const isSelected = formData.role === role;
                    return (
                      <button
                        key={role}
                        type="button"
                        onClick={() => setFormData({ ...formData, role })}
                        className={`text-left p-3 rounded-lg border-2 transition ${isSelected
                            ? 'border-indigo-500 bg-indigo-50'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                          }`}
                      >
                        <div className="font-semibold text-sm text-slate-900">{ROLE_LABELS[role]}</div>
                        <div className="text-xs text-slate-500 mt-1">{ROLE_DESCRIPTIONS[role]}</div>
                        <div className="flex items-center gap-2 mt-2 text-[10px] text-slate-600">
                          <span>🏨 {access.hotel}</span>
                          <span>🍽️ {access.restaurant}</span>
                          {access.admin > 0 && <span>⚙️ {access.admin}</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {editingUser && (
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="is_active"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <label htmlFor="is_active" className="text-sm text-slate-700">
                    Utilisateur actif
                  </label>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold py-2.5 rounded-lg"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-lg disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  {loading ? 'Enregistrement...' : editingUser ? 'Modifier' : 'Créer'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
