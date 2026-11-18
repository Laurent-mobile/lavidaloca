'use client';
import { createClient } from '@/lib/supabase/client';

// Modes de paiement qui touchent la banque (pas les espèces)
const BANK_METHODS = ['Chèque', 'cheque', 'Virement', 'Mobile Money', 'Carte bancaire'];

export const isBankMethod = (method: string): boolean => {
  if (!method) return false;
  return BANK_METHODS.some(m => method.toLowerCase().includes(m.toLowerCase()));
};

/**
 * Enregistre une transaction bancaire depuis n'importe quel module.
 * - Espèces => ignoré (géré par la caisse)
 * - Chèque/Virement/Mobile Money => crée une bank_transactions + met à jour le solde
 */
export async function registerBankTransaction(options: {
  supabase: ReturnType<typeof createClient>;
  siteId: string;
  amount: number;
  reference: string;
  direction: 'INCOME' | 'EXPENSE';
  paymentMethod: string;
  counterparty?: string;
  description: string;
  transactionDate?: string;
  sourceTable: string;
  sourceId?: string;
  autoReconcile?: boolean; // true = déduit direct du solde
}): Promise<{ ok: boolean; error?: string }> {
  const {
    supabase, siteId, amount, reference, direction, paymentMethod,
    counterparty, description, transactionDate, sourceTable, sourceId, autoReconcile = false
  } = options;

  // 1. Ignorer les paiements en espèces (gérés par la caisse)
  if (!isBankMethod(paymentMethod)) {
    return { ok: true };
  }

  // 2. Valider la référence (obligatoire pour le rapprochement)
  if (!reference?.trim()) {
    return { ok: false, error: 'Référence bancaire manquante' };
  }

  // 3. Récupérer le compte bancaire actif
  const { data: account } = await supabase
    .from('bank_accounts')
    .select('id, current_balance')
    .eq('site_id', siteId)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!account) {
    return { ok: false, error: 'Aucun compte bancaire configuré' };
  }

  // 4. Mapper le mode de paiement vers le type bancaire
  const typeMap: Record<string, string> = {
    'Chèque': 'CHECK',
    'cheque': 'CHECK',
    'Virement': 'TRANSFER',
    'Mobile Money': 'MOBILE_MONEY',
    'Carte bancaire': 'CARD',
  };

  const status = autoReconcile ? 'RECONCILED' : 'PENDING';

  // 5. Insérer la transaction
  const { error: transError } = await supabase.from('bank_transactions').insert({
    site_id: siteId,
    bank_account_id: account.id,
    reference: reference.trim(),
    transaction_type: typeMap[paymentMethod] || 'TRANSFER',
    direction,
    amount: Number(amount),
    counterparty: counterparty || null,
    description,
    transaction_date: transactionDate || new Date().toISOString().split('T')[0],
    status,
    reconciled_at: autoReconcile ? new Date().toISOString() : null,
    source_table: sourceTable,
    source_id: sourceId || null,
  });

  if (transError) {
    return { ok: false, error: transError.message };
  }

  // 6. Mettre à jour le solde UNIQUEMENT si rapprochement automatique
  if (autoReconcile) {
    const newBalance = direction === 'EXPENSE'
      ? Number(account.current_balance) - Number(amount)
      : Number(account.current_balance) + Number(amount);

    await supabase
      .from('bank_accounts')
      .update({ current_balance: newBalance, updated_at: new Date().toISOString() })
      .eq('id', account.id);
  }

  return { ok: true };
}
