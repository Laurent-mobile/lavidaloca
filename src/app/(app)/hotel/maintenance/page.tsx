'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useProfile } from '@/hooks/useHotel';
import {
  Wrench, Plus, Trash2, FileText, AlertTriangle, CheckCircle, History, X, Save,
  Settings, Calendar, Clock, TrendingUp, Loader2, Filter, Search, Edit,
  Shield, AlertCircle, Truck, Receipt, ArrowUpCircle
} from 'lucide-react';

// ✅ Catégories d'équipements
const equipmentCategories = [
  { id: 'HVAC', label: 'Climatisation', icon: '❄️', color: 'bg-blue-100 text-blue-900 border-blue-200' },
  { id: 'GENERATOR', label: 'Groupes électrogènes', icon: '⚡', color: 'bg-yellow-100 text-yellow-900 border-yellow-200' },
  { id: 'PLUMBING', label: 'Plomberie', icon: '🚿', color: 'bg-cyan-100 text-cyan-900 border-cyan-200' },
  { id: 'ELECTRICAL', label: 'Électricité', icon: '💡', color: 'bg-amber-100 text-amber-900 border-amber-200' },
  { id: 'APPLIANCE', label: 'Appareillages', icon: '📺', color: 'bg-purple-100 text-purple-900 border-purple-200' },
  { id: 'VEHICLE', label: 'Véhicules', icon: '🚗', color: 'bg-red-100 text-red-900 border-red-200' },
  { id: 'FURNITURE', label: 'Mobilier', icon: '🛏️', color: 'bg-orange-100 text-orange-900 border-orange-200' },
  { id: 'KITCHEN', label: 'Cuisine', icon: '🍳', color: 'bg-pink-100 text-pink-900 border-pink-200' },
  { id: 'SAFETY', label: 'Sécurité', icon: '🔒', color: 'bg-slate-100 text-slate-900 border-slate-200' },
  { id: 'OTHER', label: 'Autre', icon: '🔧', color: 'bg-gray-100 text-gray-900 border-gray-200' },
];

// ✅ Types de maintenance
const maintenanceTypes = [
  { id: 'CURATIVE', label: 'Curative', icon: '🔧', color: 'bg-red-100 text-red-900', description: 'Réparation d\'une panne' },
  { id: 'PREVENTIVE', label: 'Préventive', icon: '🛡️', color: 'bg-blue-100 text-blue-900', description: 'Entretien régulier' },
];

// ✅ Priorités
const priorities = [
  { id: 'LOW', label: 'Basse', color: 'bg-slate-200 text-slate-700' },
  { id: 'MEDIUM', label: 'Moyenne', color: 'bg-blue-200 text-blue-900' },
  { id: 'HIGH', label: 'Haute', color: 'bg-orange-200 text-orange-900' },
  { id: 'URGENT', label: 'Urgente', color: 'bg-red-200 text-red-900' },
];

// ✅ Statuts
const statusConfig = {
  PENDING: { label: 'En attente', color: 'bg-amber-100 text-amber-900', icon: '⏳' },
  IN_PROGRESS: { label: 'En cours', color: 'bg-blue-100 text-blue-900', icon: '🔧' },
  COMPLETED: { label: 'Terminée', color: 'bg-emerald-100 text-emerald-900', icon: '✅' },
  CANCELLED: { label: 'Annulée', color: 'bg-slate-100 text-slate-700', icon: '❌' },
};

export default function MaintenancePage() {
  const supabase = createClient();
  const { siteId, loading: profileLoading } = useProfile();
  
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'requests' | 'equipment' | 'preventive' | 'history'>('requests');
  
  // Demandes de maintenance
  const [requests, setRequests] = useState<any[]>([]);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [editingRequest, setEditingRequest] = useState<any>(null);
  const [requestForm, setRequestForm] = useState({
    room_id: '',
    supplier_id: '',
    equipment_id: '',
    category: 'HVAC',
    type: 'CURATIVE',
    title: '',
    description: '',
    priority: 'MEDIUM',
    estimated_cost: 0,
    actual_cost: 0,
    payment_method: 'Espèces',
    payment_reference: '',
    assigned_to: '',
    notes: '',
  });

    // Données annexes
  const [equipment, setEquipment] = useState<any[]>([]);
  const [showEquipmentForm, setShowEquipmentForm] = useState(false);
  const [editingEquipment, setEditingEquipment] = useState<any>(null); // ✅ AJOUTÉ
  const [equipmentForm, setEquipmentForm] = useState({ // ✅ AJOUTÉ
    name: '', category: 'HVAC', location: '', brand: '', model: '',
    serial_number: '', installation_date: '', warranty_expiry: '', notes: ''
  });
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);

  // Maintenance préventive
  const [preventiveTasks, setPreventiveTasks] = useState<any[]>([]);
  const [showPreventiveForm, setShowPreventiveForm] = useState(false);
  const [preventiveForm, setPreventiveForm] = useState({
    equipment_id: '', title: '', description: '', frequency: 'MONTHLY', next_date: '', assigned_to: ''
  });

  // Filtres
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [filterType, setFilterType] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (siteId) {
      loadRequests();
      loadEquipment();
      loadPreventiveTasks();
      loadSuppliers();
      loadRooms();
      loadBankAccounts();
    }
  }, [siteId]);

  const loadSuppliers = async () => {
    const { data } = await supabase.from('suppliers').select('id, name').eq('site_id', siteId).eq('is_active', true).order('name');
    setSuppliers(data || []);
  };

  const loadBankAccounts = async () => {
    const { data } = await supabase.from('bank_accounts').select('id, bank_name, account_name').eq('site_id', siteId).eq('is_active', true).limit(1);
    setBankAccounts(data || []);
  };

  const loadRooms = async () => {
    const { data } = await supabase.from('rooms').select('id, number, status').eq('site_id', siteId).order('number');
    setRooms(data || []);
  };

  const loadRequests = async () => {
    if (!siteId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('maintenance_requests')
        .select(`
          id, equipment_id, room_id, supplier_id, category, type, title, description, priority, status,
          estimated_cost, actual_cost, assigned_to, notes, created_at, completed_at, expense_id,
          item_description, issue_description, payment_method, payment_reference,
          equipment:equipment_id (name, category, location)
        `)
        .eq('site_id', siteId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      const normalized = (data || []).map(r => ({
        ...r,
        title: r.title || r.item_description || 'Sans titre',
        description: r.description || r.issue_description || '',
        equipment: Array.isArray(r.equipment) ? r.equipment[0] : r.equipment,
      }));
      setRequests(normalized);
    } catch (err: any) {
      console.error('Erreur chargement demandes:', err);
      setRequests([]);
    }
    setLoading(false);
  };

  const loadEquipment = async () => {
    if (!siteId) return;
    try {
      const { data, error } = await supabase.from('maintenance_equipment').select('*').eq('site_id', siteId).order('name');
      if (error) throw error;
      setEquipment(data || []);
    } catch (err: any) {
      setEquipment([]);
    }
  };

  const loadPreventiveTasks = async () => {
    if (!siteId) return;
    try {
      const { data, error } = await supabase
        .from('maintenance_preventive')
        .select(`id, equipment_id, title, description, frequency, next_date, assigned_to, equipment:equipment_id (name, category, location)`)
        .eq('site_id', siteId)
        .order('next_date', { ascending: true });
      
      if (error) throw error;
      const normalized = (data || []).map(t => ({ ...t, equipment: Array.isArray(t.equipment) ? t.equipment[0] : t.equipment }));
      setPreventiveTasks(normalized);
    } catch (err: any) {
      setPreventiveTasks([]);
    }
  };

  const handleSaveRequest = async () => {
    if (!requestForm.title.trim() || !requestForm.description.trim()) {
      alert('Le titre et la description sont obligatoires.');
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const requestData: any = {
        site_id: siteId,
        room_id: requestForm.room_id || null,
        supplier_id: requestForm.supplier_id || null,
        category: requestForm.category,
        type: requestForm.type,
        title: requestForm.title,
        description: requestForm.description,
        item_description: requestForm.title,
        issue_description: requestForm.description,
        priority: requestForm.priority,
        estimated_cost: requestForm.estimated_cost,
        actual_cost: requestForm.actual_cost || requestForm.estimated_cost,
        payment_method: requestForm.payment_method,
        payment_reference: requestForm.payment_reference?.trim() || null,
        assigned_to: requestForm.assigned_to,
        notes: requestForm.notes,
        status: editingRequest ? editingRequest.status : 'PENDING',
        created_by: user?.id,
      };

      if (requestForm.equipment_id) requestData.equipment_id = requestForm.equipment_id;

      // ✅ SÉCURITÉ : Empêcher la modification d'une demande déjà clôturée
      if (editingRequest && (editingRequest.status === 'COMPLETED' || editingRequest.status === 'CANCELLED')) {
        alert('⚠️ Une maintenance terminée ou annulée ne peut plus être modifiée.');
        setLoading(false);
        return;
      }

      let finalMaintenanceId = editingRequest?.id || null;

      if (editingRequest) {
        const { error } = await supabase.from('maintenance_requests').update(requestData).eq('id', editingRequest.id);
        if (error) throw error;
        finalMaintenanceId = editingRequest.id;
      } else {
        const { data: created, error } = await supabase.from('maintenance_requests').insert(requestData).select('id').single();
        if (error) throw error;
        finalMaintenanceId = created?.id || null;
      }

      // ✅ 1. GESTION DU STATUT DE LA CHAMBRE (Indisponible si en cours, Libre si terminée)
      if (requestForm.room_id) {
        if (requestData.status === 'COMPLETED') {
          await supabase.from('rooms').update({ status: 'VACANT', out_of_order_reason: null }).eq('id', requestForm.room_id);
        } else {
          await supabase.from('rooms').update({ status: 'OUT_OF_ORDER', out_of_order_reason: requestForm.title }).eq('id', requestForm.room_id);
        }
      }

      // ✅ 2. CRÉATION DÉPENSE + TRANSACTION BANCAIRE (si terminée)
      if (requestData.status === 'COMPLETED') {
        const finalCost = Number(requestData.actual_cost) || Number(requestData.estimated_cost) || 0;
        if (finalCost > 0) {
          const selectedSupplier = suppliers.find(s => s.id === requestForm.supplier_id);
          const selectedRoom = rooms.find(r => r.id === requestForm.room_id);
          const expenseDescription = `Maintenance ${selectedRoom ? `Ch. ${selectedRoom.number}` : 'Équipement'} : ${requestForm.title}`;
          const counterparty = selectedSupplier?.name || 'Prestataire non spécifié';
          const expenseDate = new Date().toISOString().split('T')[0];

          // a. Créer ou mettre à jour la dépense dans le menu unifié
          let expenseId = editingRequest?.expense_id || null;
          if (expenseId) {
            await supabase.from('expenses').update({
              amount: finalCost,
              payment_method: requestForm.payment_method,
              reference: requestForm.payment_reference?.trim() || null,
            }).eq('id', expenseId);
          } else {
            const { data: createdExpense } = await supabase.from('expenses').insert({
              site_id: siteId,
              date: expenseDate,
              category: 'Maintenance',
              description: expenseDescription,
              type: 'COURANTE',
              subtype: 'HOTEL', // ✅ Apparaîtra dans le filtre "Hôtel" du menu Dépenses
              amount: finalCost,
              payment_method: requestForm.payment_method,
              reference: requestForm.payment_reference?.trim() || null,
              notes: `Réparation terminée. Prestataire: ${counterparty}`,
              created_by: user?.id
            }).select('id').single();
            
            expenseId = createdExpense?.id || null;
            if (expenseId && finalMaintenanceId) {
              await supabase.from('maintenance_requests').update({ expense_id: expenseId }).eq('id', finalMaintenanceId);
            }
          }

          // b. Gérer la transaction bancaire pour le rapprochement
          if (expenseId) {
            // Supprimer l'ancienne transaction liée à cette dépense pour éviter les doublons
            await supabase.from('bank_transactions').delete().eq('source_id', expenseId).eq('source_table', 'expenses');
            
            const bankMethods: Record<string, string> = { 'Virement': 'TRANSFER', 'Chèque': 'CHECK', 'Mobile Money': 'MOBILE_MONEY' };
            const tType = bankMethods[requestForm.payment_method];
            
            // Créer la transaction uniquement si c'est un mode bancaire ET qu'il y a une référence
            if (tType && requestForm.payment_reference?.trim()) {
              const bankAccount = bankAccounts[0]; // Prendre le premier compte bancaire actif par défaut
              await supabase.from('bank_transactions').insert({
                site_id: siteId,
                bank_account_id: bankAccount?.id || null,
                reference: requestForm.payment_reference.trim(),
                transaction_type: tType,
                direction: 'EXPENSE',
                amount: finalCost,
                counterparty: counterparty,
                description: `Dépense Maintenance: ${expenseDescription}`,
                transaction_date: expenseDate,
                status: 'PENDING', // ✅ En attente de rapprochement dans le menu Banque
                source_table: 'expenses',
                source_id: expenseId,
              });
            }
          }
        }
      }

      alert(requestData.status === 'COMPLETED' 
        ? '✅ Maintenance terminée ! La chambre est de nouveau disponible et la dépense a été enregistrée.' 
        : '✅ Demande de maintenance enregistrée.');
      
      setShowRequestForm(false);
      setEditingRequest(null);
      setRequestForm({
        room_id: '', supplier_id: '', equipment_id: '', category: 'HVAC',
        type: 'CURATIVE', title: '', description: '', priority: 'MEDIUM',
        estimated_cost: 0, actual_cost: 0, payment_method: 'Espèces',
        payment_reference: '', assigned_to: '', notes: ''
      });
      await loadRequests();
      await loadRooms();
    } catch (err: any) {
      alert(`Erreur: ${err.message}`);
    }
    setLoading(false);
  };
  
  const handleStatusChange = async (requestId: string, newStatus: string) => {
    setLoading(true);
    try {
      const req = requests.find(r => r.id === requestId);
      if (!req) return;

      // Sécurité
      if (req.status === 'COMPLETED' || req.status === 'CANCELLED') {
        alert('⚠️ Cette maintenance est déjà clôturée et ne peut plus être modifiée.');
        setLoading(false);
        return;
      }

      const updates: any = { status: newStatus };
      if (newStatus === 'COMPLETED') {
        updates.completed_at = new Date().toISOString();
        if (!req.actual_cost && req.estimated_cost) updates.actual_cost = req.estimated_cost;
      }
      
      const { error } = await supabase.from('maintenance_requests').update(updates).eq('id', requestId);
      if (error) throw error;

      // ✅ GESTION DU STATUT DE LA CHAMBRE
      if (req.room_id) {
        if (newStatus === 'COMPLETED') {
          await supabase.from('rooms').update({ status: 'VACANT', out_of_order_reason: null }).eq('id', req.room_id);
        } else if (newStatus === 'IN_PROGRESS') {
          await supabase.from('rooms').update({ status: 'OUT_OF_ORDER', out_of_order_reason: req.title }).eq('id', req.room_id);
        }
      }

      // ✅ CRÉATION DÉPENSE + BANQUE (si passage à Terminée)
      if (newStatus === 'COMPLETED') {
        const finalCost = Number(req.actual_cost) || Number(req.estimated_cost) || 0;
        if (finalCost > 0) {
          const { data: { user } } = await supabase.auth.getUser();
          const selectedSupplier = suppliers.find(s => s.id === req.supplier_id);
          const selectedRoom = rooms.find(r => r.id === req.room_id);
          const expenseDescription = `Maintenance ${selectedRoom ? `Ch. ${selectedRoom.number}` : 'Équipement'} : ${req.title}`;
          const counterparty = selectedSupplier?.name || 'Prestataire non spécifié';
          const expenseDate = new Date().toISOString().split('T')[0];
          const payMethod = req.payment_method || 'Espèces';
          const payRef = req.payment_reference || '';

          // a. Dépense
          const { data: createdExpense } = await supabase.from('expenses').insert({
            site_id: siteId,
            date: expenseDate,
            category: 'Maintenance',
            description: expenseDescription,
            type: 'COURANTE',
            subtype: 'HOTEL',
            amount: finalCost,
            payment_method: payMethod,
            reference: payRef || null,
            notes: `Réparation terminée. Prestataire: ${counterparty}`,
            created_by: user?.id
          }).select('id').single();

          // b. Transaction Banque
          if (createdExpense?.id) {
            await supabase.from('maintenance_requests').update({ expense_id: createdExpense.id }).eq('id', requestId);
            
            const bankMethods: Record<string, string> = { 'Virement': 'TRANSFER', 'Chèque': 'CHECK', 'Mobile Money': 'MOBILE_MONEY' };
            const tType = bankMethods[payMethod];
            if (tType && payRef?.trim()) {
              const bankAccount = bankAccounts[0];
              await supabase.from('bank_transactions').insert({
                site_id: siteId,
                bank_account_id: bankAccount?.id || null,
                reference: payRef.trim(),
                transaction_type: tType,
                direction: 'EXPENSE',
                amount: finalCost,
                counterparty: counterparty,
                description: `Dépense Maintenance: ${expenseDescription}`,
                transaction_date: expenseDate,
                status: 'PENDING',
                source_table: 'expenses',
                source_id: createdExpense.id,
              });
            }
          }
        }
      }

      await loadRequests();
      await loadRooms();
    } catch (err: any) {
      alert(`Erreur: ${err.message}`);
    }
    setLoading(false);
  };

  const handleDeleteRequest = async (id: string) => {
    if (!confirm('Supprimer cette demande ?')) return;
    setLoading(true);
    try {
      const { error } = await supabase.from('maintenance_requests').delete().eq('id', id);
      if (error) throw error;
      await loadRequests();
    } catch (err: any) {
      alert(`Erreur: ${err.message}`);
    }
    setLoading(false);
  };
    const handleSaveEquipment = async () => {
    if (!equipmentForm.name.trim()) { alert('Le nom est obligatoire.'); return; }
    setLoading(true);
    try {
      const equipmentData = {
        site_id: siteId, name: equipmentForm.name, category: equipmentForm.category,
        location: equipmentForm.location, brand: equipmentForm.brand, model: equipmentForm.model,
        serial_number: equipmentForm.serial_number, installation_date: equipmentForm.installation_date || null,
        warranty_expiry: equipmentForm.warranty_expiry || null, notes: equipmentForm.notes,
      };
      if (editingEquipment) {
        const { error } = await supabase.from('maintenance_equipment').update(equipmentData).eq('id', editingEquipment.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('maintenance_equipment').insert(equipmentData);
        if (error) throw error;
      }
      setShowEquipmentForm(false); setEditingEquipment(null);
      setEquipmentForm({ name: '', category: 'HVAC', location: '', brand: '', model: '', serial_number: '', installation_date: '', warranty_expiry: '', notes: '' });
      await loadEquipment();
    } catch (err: any) { alert(`Erreur: ${err.message}`); }
    setLoading(false);
  };

  const handleSavePreventive = async () => {
    if (!preventiveForm.title.trim() || !preventiveForm.next_date) { alert('Le titre et la prochaine date sont obligatoires.'); return; }
    setLoading(true);
    try {
      const { error } = await supabase.from('maintenance_preventive').insert({
        site_id: siteId, equipment_id: preventiveForm.equipment_id || null, title: preventiveForm.title,
        description: preventiveForm.description, frequency: preventiveForm.frequency,
        next_date: preventiveForm.next_date, assigned_to: preventiveForm.assigned_to,
      });
      if (error) throw error;
      setShowPreventiveForm(false);
      setPreventiveForm({ equipment_id: '', title: '', description: '', frequency: 'MONTHLY', next_date: '', assigned_to: '' });
      await loadPreventiveTasks();
    } catch (err: any) { alert(`Erreur: ${err.message}`); }
    setLoading(false);
  };

  if (profileLoading) return <div className="flex items-center justify-center py-12"><Loader2 className="w-8 h-8 text-indigo-600 animate-spin" /></div>;
  if (!siteId) return null;

  const filteredRequests = requests.filter(r => {
    if (filterStatus !== 'ALL' && r.status !== filterStatus) return false;
    if (filterType !== 'ALL' && r.type !== filterType) return false;
    if (searchTerm && !r.title.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  const stats = {
    pending: requests.filter(r => r.status === 'PENDING').length,
    inProgress: requests.filter(r => r.status === 'IN_PROGRESS').length,
    completed: requests.filter(r => r.status === 'COMPLETED').length,
    urgent: requests.filter(r => r.priority === 'URGENT' && r.status !== 'COMPLETED').length,
  };

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Wrench className="w-7 h-7 text-slate-700" /> Maintenance
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {stats.pending} en attente • {stats.inProgress} en cours • {stats.urgent} urgentes
          </p>
        </div>
              <div className="flex gap-2">
          <button onClick={() => { setEditingEquipment(null); setEquipmentForm({ name: '', category: 'HVAC', location: '', brand: '', model: '', serial_number: '', installation_date: '', warranty_expiry: '', notes: '' }); setShowEquipmentForm(true); }} className="flex items-center gap-2 bg-slate-600 hover:bg-slate-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
            <Settings className="w-4 h-4" /> Équipement
          </button>
          <button onClick={() => setShowPreventiveForm(true)} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
            <Shield className="w-4 h-4" /> Préventive
          </button>
          <button onClick={() => setShowRequestForm(true)} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
            <Plus className="w-4 h-4" /> Nouvelle demande
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-amber-50 border-2 border-amber-200 rounded-lg p-4">
          <div className="text-xs font-medium text-amber-700 mb-1">⏳ En attente</div>
          <div className="text-2xl font-bold text-amber-900">{stats.pending}</div>
        </div>
        <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4">
          <div className="text-xs font-medium text-blue-700 mb-1">🔧 En cours</div>
          <div className="text-2xl font-bold text-blue-900">{stats.inProgress}</div>
        </div>
        <div className="bg-emerald-50 border-2 border-emerald-200 rounded-lg p-4">
          <div className="text-xs font-medium text-emerald-700 mb-1">✅ Terminées</div>
          <div className="text-2xl font-bold text-emerald-900">{stats.completed}</div>
        </div>
        <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4">
          <div className="text-xs font-medium text-red-700 mb-1">🚨 Urgentes</div>
          <div className="text-2xl font-bold text-red-900">{stats.urgent}</div>
        </div>
      </div>

      {/* Onglets */}
      <div className="flex gap-2 border-b border-slate-200">
        <button onClick={() => setActiveTab('requests')} className={`flex items-center gap-2 px-4 py-2 font-medium text-sm transition-colors ${activeTab === 'requests' ? 'border-b-2 border-emerald-600 text-emerald-600' : 'text-slate-600 hover:text-slate-900'}`}>
          <Wrench className="w-4 h-4" /> Demandes ({requests.length})
        </button>
        <button onClick={() => setActiveTab('equipment')} className={`flex items-center gap-2 px-4 py-2 font-medium text-sm transition-colors ${activeTab === 'equipment' ? 'border-b-2 border-slate-600 text-slate-600' : 'text-slate-600 hover:text-slate-900'}`}>
          <Settings className="w-4 h-4" /> Équipements
        </button>
        <button onClick={() => setActiveTab('preventive')} className={`flex items-center gap-2 px-4 py-2 font-medium text-sm transition-colors ${activeTab === 'preventive' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-slate-600 hover:text-slate-900'}`}>
          <Shield className="w-4 h-4" /> Préventive
        </button>
        <button onClick={() => setActiveTab('history')} className={`flex items-center gap-2 px-4 py-2 font-medium text-sm transition-colors ${activeTab === 'history' ? 'border-b-2 border-slate-600 text-slate-600' : 'text-slate-600 hover:text-slate-900'}`}>
          <History className="w-4 h-4" /> Historique
        </button>
      </div>

      {/* Filtres */}
      {activeTab === 'requests' && (
        <div className="flex gap-2 items-center flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Rechercher..." className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm" />
          </div>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 text-sm">
            <option value="ALL">Tous statuts</option>
            <option value="PENDING">En attente</option>
            <option value="IN_PROGRESS">En cours</option>
            <option value="COMPLETED">Terminée</option>
          </select>
        </div>
      )}

      {/* Liste des demandes */}
      {activeTab === 'requests' && (
        <div>
          {filteredRequests.length === 0 ? (
            <div className="text-center py-12 bg-slate-50 rounded-lg">
              <Wrench className="w-12 h-12 mx-auto mb-2 text-slate-300" />
              <p className="text-sm text-slate-500">Aucune demande de maintenance</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredRequests.map(req => {
                const status = statusConfig[req.status as keyof typeof statusConfig];
                const priority = priorities.find(p => p.id === req.priority);
                const type = maintenanceTypes.find(t => t.id === req.type);
                const category = equipmentCategories.find(c => c.id === req.category);
                const selectedRoom = rooms.find(r => r.id === req.room_id);
                const selectedSupplier = suppliers.find(s => s.id === req.supplier_id);
                
                return (
                  <div key={req.id} className="bg-white border border-slate-200 rounded-lg p-4 hover:shadow-md transition">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-2">
                          <span className="font-bold text-slate-900 text-lg">{req.title}</span>
                          <span className={`text-xs px-2 py-0.5 rounded font-medium ${type?.color}`}>{type?.icon} {type?.label}</span>
                          <span className={`text-xs px-2 py-0.5 rounded font-medium ${priority?.color}`}>{priority?.label}</span>
                          <span className={`text-xs px-2 py-0.5 rounded font-medium ${status?.color}`}>{status?.icon} {status?.label}</span>
                        </div>
                        <p className="text-sm text-slate-600 mb-2">{req.description}</p>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                          <span className="flex items-center gap-1">{category?.icon} {category?.label}</span>
                          {selectedRoom && <span className="flex items-center gap-1 text-indigo-600 font-medium">🚪 Ch. {selectedRoom.number}</span>}
                          {selectedSupplier && <span className="flex items-center gap-1 text-slate-700 font-medium">🏢 {selectedSupplier.name}</span>}
                          {req.assigned_to && <span>👷 {req.assigned_to}</span>}
                          {req.estimated_cost > 0 && <span>💰 Est: {req.estimated_cost.toLocaleString('fr-FR')} FCFA</span>}
                          <span>📅 {new Date(req.created_at).toLocaleDateString('fr-FR')}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {req.status === 'PENDING' && (
                          <button onClick={() => handleStatusChange(req.id, 'IN_PROGRESS')} className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg font-medium">▶️ Démarrer</button>
                        )}
                        {req.status === 'IN_PROGRESS' && (
                          <button onClick={() => handleStatusChange(req.id, 'COMPLETED')} className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg font-medium">✅ Terminer</button>
                        )}
                        
                        {/* ✅ VERROUILLAGE : On n'affiche le bouton modifier que si ce n'est pas terminé ou annulé */}
                        {req.status !== 'COMPLETED' && req.status !== 'CANCELLED' ? (
                          <button
                            onClick={() => {
                              setEditingRequest(req);
                              setRequestForm({
                                room_id: req.room_id || '',
                                supplier_id: req.supplier_id || '',
                                equipment_id: req.equipment_id || '',
                                category: req.category || 'HVAC',
                                type: req.type || 'CURATIVE',
                                title: req.title || '',
                                description: req.description || '',
                                priority: req.priority || 'MEDIUM',
                                estimated_cost: Number(req.estimated_cost) || 0,
                                actual_cost: Number(req.actual_cost) || 0,
                                payment_method: req.payment_method || 'Espèces',
                                payment_reference: req.payment_reference || '',
                                assigned_to: req.assigned_to || '',
                                notes: req.notes || '',
                              });
                              setShowRequestForm(true);
                            }}
                            className="text-xs bg-slate-200 hover:bg-slate-300 text-slate-700 px-3 py-1.5 rounded-lg font-medium"
                            title="Modifier"
                          >
                            <Edit className="w-3 h-3" />
                          </button>
                        ) : (
                          <span className="text-xs text-emerald-600 px-3 py-1.5 rounded-lg font-medium flex items-center gap-1 bg-emerald-50 border border-emerald-200" title="Cette maintenance est clôturée et ne peut plus être modifiée">
                            <CheckCircle className="w-3 h-3" /> Verrouillé
                          </span>
                        )}

                        <button onClick={() => handleDeleteRequest(req.id)} className="text-xs bg-red-100 hover:bg-red-200 text-red-700 px-3 py-1.5 rounded-lg font-medium">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ================= MODALE NOUVELLE / MODIFICATION DEMANDE ================= */}
      {showRequestForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="bg-gradient-to-r from-emerald-600 to-teal-700 text-white px-6 py-4 rounded-t-xl flex items-center justify-between sticky top-0">
              <h3 className="text-lg font-bold">{editingRequest ? 'Modifier la demande' : 'Nouvelle demande de maintenance'}</h3>
              <button onClick={() => { setShowRequestForm(false); setEditingRequest(null); }} className="hover:bg-white/20 p-2 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Chambre concernée</label>
                  <select value={requestForm.room_id} onChange={(e) => setRequestForm({ ...requestForm, room_id: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm">
                    <option value="">-- Aucune (Équipement commun) --</option>
                    {rooms.map(r => <option key={r.id} value={r.id}>Chambre {r.number} {r.status === 'OUT_OF_ORDER' ? '(Hors service)' : ''}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Prestataire (Fournisseur)</label>
                  <select value={requestForm.supplier_id} onChange={(e) => setRequestForm({ ...requestForm, supplier_id: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm">
                    <option value="">-- Sélectionner un prestataire --</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Type *</label>
                  <select value={requestForm.type} onChange={(e) => setRequestForm({ ...requestForm, type: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm">
                    {maintenanceTypes.map(t => <option key={t.id} value={t.id}>{t.icon} {t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Catégorie *</label>
                  <select value={requestForm.category} onChange={(e) => setRequestForm({ ...requestForm, category: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm">
                    {equipmentCategories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Titre *</label>
                <input type="text" value={requestForm.title} onChange={(e) => setRequestForm({ ...requestForm, title: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" placeholder="Ex: Climatisation chambre 201 en panne" />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Description *</label>
                <textarea value={requestForm.description || ''} onChange={(e) => setRequestForm({ ...requestForm, description: e.target.value })} rows={3} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" placeholder="Décrivez le problème ou l'entretien nécessaire..." />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Priorité</label>
                  <select value={requestForm.priority} onChange={(e) => setRequestForm({ ...requestForm, priority: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm">
                    {priorities.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Coût estimé (FCFA)</label>
                  <input type="number" value={requestForm.estimated_cost} onChange={(e) => setRequestForm({ ...requestForm, estimated_cost: Number(e.target.value) })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Coût réel (FCFA) <span className="text-slate-400 font-normal">(sera utilisé pour la dépense)</span></label>
                <input type="number" value={requestForm.actual_cost} onChange={(e) => setRequestForm({ ...requestForm, actual_cost: Number(e.target.value) })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" placeholder="Laisser vide si identique à l'estimé" />
              </div>

              {/* ✅ NOUVEAU : Mode de paiement + Référence */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Mode de paiement</label>
                  <select
                    value={requestForm.payment_method}
                    onChange={(e) => setRequestForm({ ...requestForm, payment_method: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
                  >
                    <option value="Espèces">🪙 Espèces</option>
                    <option value="Carte bancaire">💳 Carte bancaire</option>
                    <option value="Virement">🏦 Virement</option>
                    <option value="Chèque">📝 Chèque</option>
                    <option value="Mobile Money">📱 Mobile Money</option>
                  </select>
                </div>
              </div>

              {/* ✅ Champ Référence conditionnel (visible si paiement bancaire) */}
              {['Virement', 'Chèque', 'Mobile Money', 'Carte bancaire'].includes(requestForm.payment_method) && (
                <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-blue-900">
                    <Receipt className="w-4 h-4" />
                    Référence du paiement
                  </div>
                  <input
                    type="text"
                    value={requestForm.payment_reference || ''}
                    onChange={(e) => setRequestForm({ ...requestForm, payment_reference: e.target.value })}
                    className="w-full border border-blue-300 rounded-lg px-3 py-2.5 bg-white text-sm"
                    placeholder={
                      requestForm.payment_method === 'Virement' ? 'N° de virement (ex: VIR-2026-1118)' :
                      requestForm.payment_method === 'Chèque' ? 'N° de chèque (ex: CHQ-0012345)' :
                      requestForm.payment_method === 'Mobile Money' ? 'ID transaction Orange/MTN' :
                      'Référence de la transaction carte'
                    }
                  />
                  <p className="text-xs text-blue-700 flex items-center gap-1">
                    <ArrowUpCircle className="w-3 h-3" />
                    ℹ️ Une transaction "En attente" sera créée dans le menu <b>Banque</b> pour le rapprochement.
                  </p>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Assigné à</label>
                <input type="text" value={requestForm.assigned_to} onChange={(e) => setRequestForm({ ...requestForm, assigned_to: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" placeholder="Nom du technicien..." />
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={() => { setShowRequestForm(false); setEditingRequest(null); }} className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold py-2.5 rounded-lg">Annuler</button>
                <button onClick={handleSaveRequest} disabled={loading} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 rounded-lg disabled:opacity-50">
                  {loading ? 'Enregistrement...' : 'Enregistrer'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Équipement */}
      {showEquipmentForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="bg-gradient-to-r from-slate-600 to-slate-800 text-white px-6 py-4 rounded-t-xl flex items-center justify-between sticky top-0">
              <h3 className="text-lg font-bold">{editingEquipment ? 'Modifier l\'équipement' : 'Nouvel équipement'}</h3>
              <button onClick={() => { setShowEquipmentForm(false); setEditingEquipment(null); }} className="hover:bg-white/20 p-2 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Nom *</label>
                  <input type="text" value={equipmentForm.name} onChange={(e) => setEquipmentForm({ ...equipmentForm, name: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" placeholder="Ex: Clim split 2CV" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Catégorie *</label>
                  <select value={equipmentForm.category} onChange={(e) => setEquipmentForm({ ...equipmentForm, category: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm">
                    {equipmentCategories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Emplacement</label>
                <input type="text" value={equipmentForm.location} onChange={(e) => setEquipmentForm({ ...equipmentForm, location: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" placeholder="Ex: Chambre 201, Cuisine, Local technique..." />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="block text-xs font-medium text-slate-700 mb-1">Marque</label><input type="text" value={equipmentForm.brand} onChange={(e) => setEquipmentForm({ ...equipmentForm, brand: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" /></div>
                <div><label className="block text-xs font-medium text-slate-700 mb-1">Modèle</label><input type="text" value={equipmentForm.model} onChange={(e) => setEquipmentForm({ ...equipmentForm, model: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" /></div>
                <div><label className="block text-xs font-medium text-slate-700 mb-1">N° Série</label><input type="text" value={equipmentForm.serial_number} onChange={(e) => setEquipmentForm({ ...equipmentForm, serial_number: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-medium text-slate-700 mb-1">Date d'installation</label><input type="date" value={equipmentForm.installation_date} onChange={(e) => setEquipmentForm({ ...equipmentForm, installation_date: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" /></div>
                <div><label className="block text-xs font-medium text-slate-700 mb-1">Fin de garantie</label><input type="date" value={equipmentForm.warranty_expiry} onChange={(e) => setEquipmentForm({ ...equipmentForm, warranty_expiry: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" /></div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Notes</label>
                <textarea value={equipmentForm.notes || ''} onChange={(e) => setEquipmentForm({ ...equipmentForm, notes: e.target.value })} rows={2} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => { setShowEquipmentForm(false); setEditingEquipment(null); }} className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold py-2.5 rounded-lg">Annuler</button>
                <button onClick={handleSaveEquipment} disabled={loading} className="flex-1 bg-slate-600 hover:bg-slate-700 text-white font-semibold py-2.5 rounded-lg disabled:opacity-50">
                  {loading ? 'Enregistrement...' : 'Enregistrer'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Préventive */}
      {showPreventiveForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
            <div className="bg-gradient-to-r from-blue-600 to-blue-800 text-white px-6 py-4 rounded-t-xl flex items-center justify-between sticky top-0">
              <h3 className="text-lg font-bold">Nouvelle tâche préventive</h3>
              <button onClick={() => setShowPreventiveForm(false)} className="hover:bg-white/20 p-2 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Équipement (optionnel)</label>
                <select value={preventiveForm.equipment_id} onChange={(e) => setPreventiveForm({ ...preventiveForm, equipment_id: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm">
                  <option value="">-- Aucun --</option>
                  {equipment.map(eq => <option key={eq.id} value={eq.id}>{eq.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Titre *</label>
                <input type="text" value={preventiveForm.title} onChange={(e) => setPreventiveForm({ ...preventiveForm, title: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" placeholder="Ex: Révision climatiseurs" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Description</label>
                <textarea value={preventiveForm.description || ''} onChange={(e) => setPreventiveForm({ ...preventiveForm, description: e.target.value })} rows={2} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" placeholder="Détails de l'entretien..." />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Fréquence</label>
                  <select value={preventiveForm.frequency} onChange={(e) => setPreventiveForm({ ...preventiveForm, frequency: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm">
                    <option value="WEEKLY">Hebdomadaire</option>
                    <option value="MONTHLY">Mensuelle</option>
                    <option value="QUARTERLY">Trimestrielle</option>
                    <option value="SEMI_ANNUAL">Semestrielle</option>
                    <option value="ANNUAL">Annuelle</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Prochaine date *</label>
                  <input type="date" value={preventiveForm.next_date} onChange={(e) => setPreventiveForm({ ...preventiveForm, next_date: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Assigné à</label>
                <input type="text" value={preventiveForm.assigned_to} onChange={(e) => setPreventiveForm({ ...preventiveForm, assigned_to: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" placeholder="Nom du technicien..." />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowPreventiveForm(false)} className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold py-2.5 rounded-lg">Annuler</button>
                <button onClick={handleSavePreventive} disabled={loading} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-lg disabled:opacity-50">
                  {loading ? 'Enregistrement...' : 'Créer'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}