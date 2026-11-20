'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Wrench, X, CheckCircle, AlertTriangle, DollarSign, Truck } from 'lucide-react';

interface Props {
  siteId: string;
  rooms: any[];
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  preselectRoomId?: string;
}

export default function MaintenanceModal({ siteId, rooms, isOpen, onClose, onSuccess, preselectRoomId }: Props) {
  const supabase = createClient();
  
  const [roomId, setRoomId] = useState(preselectRoomId || '');
  const [description, setDescription] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [estimatedCost, setEstimatedCost] = useState('');
  const [actualCost, setActualCost] = useState('');
  const [status, setStatus] = useState<'EN_COURS' | 'TERMINEE'>('EN_COURS');
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setRoomId(preselectRoomId || '');
      setDescription('');
      setSupplierId('');
      setEstimatedCost('');
      setActualCost('');
      setStatus('EN_COURS');
      loadSuppliers();
    }
  }, [isOpen, preselectRoomId]);

  const loadSuppliers = async () => {
    const { data } = await supabase
      .from('suppliers')
      .select('id, name')
      .eq('site_id', siteId)
      .eq('is_active', true)
      .order('name');
    setSuppliers(data || []);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomId || !description) {
      alert('Veuillez sélectionner une chambre et décrire le problème.');
      return;
    }

    setIsSubmitting(true);
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const selectedRoom = rooms.find(r => r.id === roomId);
      const selectedSupplier = suppliers.find(s => s.id === supplierId);

      // 1. Gérer la demande de maintenance
      const maintenanceData: any = {
        site_id: siteId,
        room_id: roomId,
        description,
        supplier_id: supplierId || null,
        estimated_cost: parseFloat(estimatedCost) || 0,
        actual_cost: parseFloat(actualCost) || parseFloat(estimatedCost) || 0,
        status,
        reported_by: user?.id,
        reported_at: new Date().toISOString()
      };

      // Si on passe à "Terminée", on enregistre la date de fin
      if (status === 'TERMINEE') {
        maintenanceData.completed_at = new Date().toISOString();
      }

      const { error: maintError } = await supabase
        .from('maintenance_requests')
        .insert(maintenanceData);

      if (maintError) throw maintError;

      // 2. Mettre à jour le statut de la chambre
      const newRoomStatus = status === 'TERMINEE' ? 'VACANT' : 'OUT_OF_ORDER';
      const { error: roomError } = await supabase
        .from('rooms')
        .update({ 
          status: newRoomStatus,
          out_of_order_reason: status === 'TERMINEE' ? null : description
        })
        .eq('id', roomId);

      if (roomError) throw roomError;

      // 3. ✅ CRÉATION AUTOMATIQUE DE LA DÉPENSE SI TERMINÉE
      if (status === 'TERMINEE') {
        const finalCost = parseFloat(actualCost) || parseFloat(estimatedCost) || 0;
        if (finalCost > 0) {
          const expenseDescription = `Maintenance Chambre ${selectedRoom?.number || 'N/A'} : ${description}`;
          const reference = selectedSupplier?.name || 'Prestataire non spécifié';

          const { error: expenseError } = await supabase.from('expenses').insert({
            site_id: siteId,
            date: new Date().toISOString().split('T')[0],
            category: 'Maintenance',
            description: expenseDescription,
            type: 'COURANTE',
            subtype: 'HOTEL', // ✅ Départements Hôtel
            amount: finalCost,
            payment_method: 'Espèces', // Par défaut, modifiable dans le menu Dépenses si besoin
            reference: reference,
            notes: `Réparation terminée. Prestataire: ${reference}`,
            created_by: user?.id
          });

          if (expenseError) {
            console.error('Erreur création dépense auto:', expenseError);
            alert('⚠️ Maintenance enregistrée, mais la création de la dépense a échoué. Veuillez l\'ajouter manuellement.');
          }
        }
      }

      alert(status === 'TERMINEE' 
        ? '✅ Maintenance terminée ! La chambre est de nouveau disponible et la dépense a été enregistrée.' 
        : '✅ Demande de maintenance enregistrée. La chambre est marquée comme indisponible.');
      
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Erreur maintenance:', error);
      alert(`Erreur: ${error.message}`);
    } finally {
      setIsSubmitting(false);
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="bg-amber-600 text-white px-6 py-4 flex items-center justify-between">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <Wrench className="w-5 h-5" /> 
            {status === 'TERMINEE' ? 'Clôturer la Maintenance' : 'Nouvelle Maintenance'}
          </h3>
          <button onClick={onClose} className="hover:bg-amber-700 p-1 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Chambre */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Chambre concernée *</label>
            <select 
              value={roomId} 
              onChange={(e) => setRoomId(e.target.value)} 
              className="w-full border border-slate-300 rounded-lg px-3 py-2.5 bg-white"
              required
            >
              <option value="">-- Sélectionner une chambre --</option>
              {rooms.map((room) => (
                <option key={room.id} value={room.id}>
                  Chambre {room.number} {room.status === 'OUT_OF_ORDER' ? '(Déjà en maintenance)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Prestataire / Fournisseur */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Prestataire (Fournisseur)</label>
            <div className="relative">
              <Truck className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <select 
                value={supplierId} 
                onChange={(e) => setSupplierId(e.target.value)} 
                className="w-full border border-slate-300 rounded-lg pl-9 pr-3 py-2.5 bg-white"
              >
                <option value="">-- Sélectionner un prestataire --</option>
                {suppliers.map((sup) => (
                  <option key={sup.id} value={sup.id}>{sup.name}</option>
                ))}
              </select>
            </div>
            <p className="text-xs text-slate-500 mt-1">Les prestataires sont gérés dans le menu "Fournisseurs".</p>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Description des travaux *</label>
            <textarea 
              value={description} 
              onChange={(e) => setDescription(e.target.value)} 
              className="w-full border border-slate-300 rounded-lg px-3 py-2.5 resize-y" 
              rows={3} 
              placeholder="Ex: Fuite d'eau dans la salle de bain, climatisation en panne..."
              required 
            />
          </div>

          {/* Coûts */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Coût estimé (f CFA)</label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input 
                  type="number" 
                  min="0" 
                  value={estimatedCost} 
                  onChange={(e) => setEstimatedCost(e.target.value)} 
                  className="w-full border border-slate-300 rounded-lg pl-9 pr-3 py-2.5" 
                  placeholder="0" 
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Coût réel (f CFA)</label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input 
                  type="number" 
                  min="0" 
                  value={actualCost} 
                  onChange={(e) => setActualCost(e.target.value)} 
                  className="w-full border border-slate-300 rounded-lg pl-9 pr-3 py-2.5" 
                  placeholder="0" 
                />
              </div>
            </div>
          </div>

          {/* Statut */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Statut de l'intervention</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setStatus('EN_COURS')}
                className={`flex items-center justify-center gap-2 p-3 rounded-lg border-2 transition-colors ${
                  status === 'EN_COURS' 
                    ? 'border-amber-500 bg-amber-50 text-amber-700' 
                    : 'border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                <AlertTriangle className="w-4 h-4" /> En cours
              </button>
              <button
                type="button"
                onClick={() => setStatus('TERMINEE')}
                className={`flex items-center justify-center gap-2 p-3 rounded-lg border-2 transition-colors ${
                  status === 'TERMINEE' 
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-700' 
                    : 'border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                <CheckCircle className="w-4 h-4" /> Terminée
              </button>
            </div>
            {status === 'TERMINEE' && (
              <p className="text-xs text-emerald-700 mt-2 flex items-center gap-1">
                <CheckCircle className="w-3 h-3" />
                La chambre sera libérée (VACANT) et une dépense sera automatiquement créée.
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t border-slate-200">
            <button 
              type="button" 
              onClick={onClose} 
              className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold py-2.5 rounded-lg"
            >
              Annuler
            </button>
            <button 
              type="submit" 
              disabled={isSubmitting || !roomId || !description} 
              className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-semibold py-2.5 rounded-lg disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <><Wrench className="w-4 h-4" /> {status === 'TERMINEE' ? 'Clôturer et Dépenser' : 'Démarrer la maintenance'}</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}