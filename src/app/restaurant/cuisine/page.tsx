export default function CuisinePage() {
  return (
    <div className="p-4 lg:p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Écran Cuisine / Bar</h1>
        <span className="text-sm text-slate-500">Vue pleine page (intégration en cours)</span>
      </div>
      
      <div className="flex-1 bg-white rounded-xl border border-slate-200 border-dashed flex items-center justify-center">
        <div className="text-center p-8">
          <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>
          </div>
          <h3 className="text-lg font-semibold text-slate-900 mb-2">Kitchen Display System (KDS)</h3>
          <p className="text-slate-600 max-w-md">
            L'écran de préparation des commandes sera intégré ici pour une gestion en temps réel par le personnel de cuisine.
          </p>
        </div>
      </div>
    </div>
  );
}