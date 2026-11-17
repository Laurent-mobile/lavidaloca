'use client';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { X, Hotel, User, Clock, DollarSign, FileText, CheckCircle, AlertCircle, Printer } from 'lucide-react';

interface Props {
  siteId: string;
  order: any;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function RoomServiceOrderDetailModal({ siteId, order, isOpen, onClose, onSuccess }: Props) {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen || !order) return null;

  const handlePayOrder = async () => {
    if (!confirm(`Confirmer le paiement de ${order.total_amount.toLocaleString('fr-FR')} F pour la chambre ${order.room_number} ?\n\nLe montant sera imputé au folio du client.`)) return;
    
    setLoading(true);
    setError('');
    try {
      const { data: { user } } = await supabase.auth.getUser();

      // 1. Marquer la commande comme payée
      const { error: orderError } = await supabase
        .from('restaurant_orders')
        .update({ status: 'PAID', paid_at: new Date().toISOString() })
        .eq('id', order.id);
      if (orderError) throw orderError;

      // 2. Créer l'imputation dans room_charges
      if (order.stay_id) {
        await supabase.from('room_charges').insert({
          site_id: siteId,
          stay_id: order.stay_id,
          room_id: order.room_id,
          order_id: order.id,
          charge_type: 'RESTAURANT',
          description: `Room Service - Commande ${order.order_number}`,
          amount: order.total_amount,
          charge_date: new Date().toISOString().split('T')[0],
          charged_by: user?.id
        });

        // 3. Mettre à jour le folio
        const { data: stay } = await supabase
          .from('stays')
          .select('folio_balance')
          .eq('id', order.stay_id)
          .single();
        if (stay) {
          await supabase.from('stays')
            .update({ folio_balance: (stay.folio_balance || 0) + order.total_amount })
            .eq('id', order.stay_id);
        }
      }

      alert(`✅ Paiement enregistré !\nImputé à la chambre ${order.room_number}\nMontant : ${order.total_amount.toLocaleString('fr-FR')} F`);
      
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  };

  const handleCancelOrder = async () => {
    if (!confirm(`Annuler la commande ${order.order_number} ?`)) return;
    
    setLoading(true);
    setError('');
    try {
      await supabase
        .from('restaurant_orders')
        .update({ status: 'CANCELLED' })
        .eq('id', order.id);

      alert(`✅ Commande annulée`);
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  };

  const handlePrintReceipt = () => {
    const printWindow = window.open('', '_blank', 'width=300,height=600');
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
      <head>
        <title>Reçu ${order.order_number}</title>
        <style>
          body { font-family: 'Courier New', monospace; font-size: 12px; margin: 0; padding: 10px; width: 80mm; }
          .center { text-align: center; }
          .row { display: flex; justify-content: space-between; margin: 4px 0; }
          .divider { border-top: 1px dashed #000; margin: 8px 0; }
          .bold { font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="center">
          <div class="bold" style="font-size: 16px;">LA VIDA-LOCA</div>
          <div>Room Service</div>
          <div class="divider"></div>
          <div class="bold">REÇU ROOM SERVICE</div>
          <div>N° ${order.order_number}</div>
          <div>${new Date(order.created_at).toLocaleString('fr-FR')}</div>
          <div>Chambre: ${order.room_number}</div>
          <div>Client: ${order.customer_name}</div>
        </div>
        <div class="divider"></div>
        ${order.items.map((item: any) => `
          <div class="row">
            <span>${item.quantity}x ${item.item_name}</span>
            <span>${Number(item.total_price).toLocaleString('fr-FR')} F</span>
          </div>
        `).join('')}
        <div class="divider"></div>
        <div class="row bold">
          <span>TOTAL</span>
          <span>${Number(order.total_amount).toLocaleString('fr-FR')} F</span>
        </div>
        <div class="divider"></div>
        <div class="center">Merci ! 🌴</div>
        <script>
          window.onload = function() { setTimeout(function() { window.print(); window.close(); }, 300); };
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="bg-gradient-to-r from-indigo-600 to-purple-700 text-white px-6 py-4 flex items-center justify-between rounded-t-xl sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <FileText className="w-6 h-6" />
            <div>
              <h2 className="text-xl font-bold">Détails commande {order.order_number}</h2>
              <p className="text-xs text-indigo-200">
                {new Date(order.created_at).toLocaleString('fr-FR')}
              </p>
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

          {/* Infos commande */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
              <h3 className="text-xs font-bold text-indigo-700 uppercase mb-1 flex items-center gap-1">
                <Hotel className="w-3 h-3" /> Chambre
              </h3>
              <div className="text-lg font-bold text-slate-900">🛏️ {order.room_number}</div>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <h3 className="text-xs font-bold text-amber-700 uppercase mb-1 flex items-center gap-1">
                <User className="w-3 h-3" /> Client
              </h3>
              <div className="text-sm font-bold text-slate-900">👤 {order.customer_name}</div>
            </div>
          </div>

          {/* Statut et serveur */}
          <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg p-3">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-600" />
              <span className="text-sm text-slate-700">Serveur:</span>
              <span className="font-semibold text-slate-900">{order.server_name}</span>
            </div>
            <span className={`text-xs px-3 py-1 rounded-full font-semibold ${
              order.status === 'ROOM_CHARGE' ? 'bg-indigo-100 text-indigo-900' :
              order.status === 'SENT' ? 'bg-amber-100 text-amber-900' :
              'bg-emerald-100 text-emerald-900'
            }`}>
              {order.status === 'ROOM_CHARGE' ? 'Imputé' : order.status === 'SENT' ? 'En cours' : 'Payé'}
            </span>
          </div>

          {/* Liste des articles */}
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <div className="bg-slate-100 px-4 py-2 border-b border-slate-200">
              <h3 className="font-semibold text-slate-900 text-sm flex items-center gap-2">
                <FileText className="w-4 h-4" /> Articles ({order.items.length})
              </h3>
            </div>
            <div className="divide-y divide-slate-100">
              {order.items.map((item: any, idx: number) => (
                <div key={idx} className="px-4 py-3 flex items-center justify-between">
                  <div className="flex-1">
                    <div className="font-medium text-slate-900 text-sm">{item.item_name}</div>
                    <div className="text-xs text-slate-500">
                      {item.quantity} × {Number(item.unit_price).toLocaleString('fr-FR')} F
                    </div>
                  </div>
                  <div className="font-bold text-slate-900 text-sm">
                    {Number(item.total_price).toLocaleString('fr-FR')} F
                  </div>
                </div>
              ))}
            </div>
            <div className="bg-indigo-50 border-t-2 border-indigo-200 px-4 py-3 flex items-center justify-between">
              <span className="font-bold text-indigo-900">TOTAL</span>
              <span className="text-2xl font-bold text-indigo-900">
                {Number(order.total_amount).toLocaleString('fr-FR')} F
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2 border-t border-slate-200">
            {order.status !== 'PAID' && order.status !== 'ROOM_CHARGE' && (
              <button
                onClick={handlePayOrder}
                disabled={loading}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 rounded-lg flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <DollarSign className="w-4 h-4" />
                {loading ? 'Traitement...' : 'Encaisser et imputer'}
              </button>
            )}
            {order.status !== 'PAID' && order.status !== 'CANCELLED' && (
              <button
                onClick={handleCancelOrder}
                disabled={loading}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-2.5 rounded-lg flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <X className="w-4 h-4" />
                Annuler
              </button>
            )}
            <button
              onClick={handlePrintReceipt}
              className="px-4 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold py-2.5 rounded-lg flex items-center gap-2"
            >
              <Printer className="w-4 h-4" />
              Reçu
            </button>
            <button
              onClick={onClose}
              className="px-4 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold py-2.5 rounded-lg"
            >
              Fermer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
