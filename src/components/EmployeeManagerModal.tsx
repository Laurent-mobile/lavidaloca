'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { X, Users, Plus, UserCheck } from 'lucide-react';

interface Props {
  siteId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function EmployeeManagerModal({ siteId, isOpen, onClose, onSuccess }: Props) {
  const supabase = createClient();
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [newEmp, setNewEmp] = useState({ first_name: '', last_name: '', phone: '', role: 'SERVER', salary: 0 });

  useEffect(() => {
    if (isOpen) loadData();
  }, [isOpen]);

  const loadData = async () => {
    const { data } = await supabase.from('restaurant_employees').select('*').eq('site_id', siteId).order('created_at', { ascending: false });
    if (data) setEmployees(data);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.from('restaurant_employees').insert({
      site_id: siteId,
      first_name: newEmp.first_name,
      last_name: newEmp.last_name,
      phone: newEmp.phone,
      role: newEmp.role,
      salary: newEmp.salary,
      is_active: true
    });
    if (!error) {
      setNewEmp({ first_name: '', last_name: '', phone: '', role: 'SERVER', salary: 0 });
      loadData();
      onSuccess();
    }
    setLoading(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="bg-gradient-to-r from-purple-600 to-indigo-700 text-white px-6 py-4 flex items-center justify-between rounded-t-xl sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <UserCheck className="w-6 h-6" />
            <h2 className="text-xl font-bold">Employés du Restaurant</h2>
          </div>
          <button onClick={onClose} className="hover:bg-white/20 p-2 rounded-lg"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 space-y-6">
          <form onSubmit={handleAdd} className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-3">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2"><Plus className="w-4 h-4" /> Ajouter un employé</h3>
            <div className="grid grid-cols-2 gap-3">
              <input type="text" placeholder="Prénom" value={newEmp.first_name} onChange={e => setNewEmp({...newEmp, first_name: e.target.value})} className="border border-slate-300 rounded px-2 py-1.5 text-sm" required />
              <input type="text" placeholder="Nom" value={newEmp.last_name} onChange={e => setNewEmp({...newEmp, last_name: e.target.value})} className="border border-slate-300 rounded px-2 py-1.5 text-sm" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input type="text" placeholder="Téléphone" value={newEmp.phone} onChange={e => setNewEmp({...newEmp, phone: e.target.value})} className="border border-slate-300 rounded px-2 py-1.5 text-sm" />
              <select value={newEmp.role} onChange={e => setNewEmp({...newEmp, role: e.target.value})} className="border border-slate-300 rounded px-2 py-1.5 text-sm">
                <option value="MANAGER">Manager</option>
                <option value="CASHIER">Caissier</option>
                <option value="SERVER">Serveur</option>
                <option value="CHEF">Chef</option>
                <option value="BARTENDER">Barman</option>
              </select>
            </div>
            <div>
              <input type="number" placeholder="Salaire (FCFA)" value={newEmp.salary} onChange={e => setNewEmp({...newEmp, salary: Number(e.target.value)})} className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm" />
            </div>
            <button type="submit" disabled={loading} className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2 rounded-lg disabled:opacity-50">Ajouter l'employé</button>
          </form>

          <div>
            <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2"><Users className="w-4 h-4" /> Liste du personnel ({employees.length})</h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {employees.map(emp => (
                <div key={emp.id} className="flex items-center justify-between bg-white border border-slate-200 rounded p-3">
                  <div>
                    <div className="font-medium text-sm">{emp.first_name} {emp.last_name}</div>
                    <div className="text-xs text-slate-500">{emp.role} • {emp.phone || 'Pas de téléphone'}</div>
                  </div>
                  <div className="text-xs bg-slate-100 px-2 py-1 rounded">{emp.is_active ? '✅ Actif' : '❌ Inactif'}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
