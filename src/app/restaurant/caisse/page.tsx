export default function CaissePage() {
  return (
    <div className="p-4 lg:p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Caisse Restaurant</h1>
        <span className="text-sm text-slate-500">Vue pleine page (intégration en cours)</span>
      </div>
      
      <div className="flex-1 bg-white rounded-xl border border-slate-200 border-dashed flex items-center justify-center">
        <div className="text-center p-8">
          <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
          </div>
          <h3 className="text-lg font-semibold text-slate-900 mb-2">Interface de Caisse</h3>
          <p className="text-slate-600 max-w-md">
            Le module de caisse sera intégré ici en tant que vue dédiée, permettant une meilleure gestion des encaissements et des rapports.
          </p>
        </div>
      </div>
    </div>
  );
}