"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Palmtree, Lock, Mail, ChefHat } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    // 1. Authenticate user
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    if (authData.user) {
      // 2. Fetch user profile to determine their role
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role, sites(id)")
        .eq("id", authData.user.id)
        .single();

      if (profileError || !profile) {
        setError("Profil utilisateur introuvable. Contactez l'administrateur.");
        setLoading(false);
        return;
      }

      const role = profile.role?.toUpperCase();

      // 3. Role-based redirection
      if (
        role === "RESTAURANT_CASHIER" ||
        role === "SERVER" ||
        role === "CHEF" ||
        role === "RESTAURANT_MANAGER"
      ) {
        // Restaurant staff goes directly to the restaurant module
        router.push("/restaurant");
      } else {
        // Hotel staff (Director, Reception, Maintenance) goes to the main hotel dashboard
        router.push("/");
      }
      
      router.refresh();
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-900 via-purple-900 to-indigo-900 p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
        <div className="flex flex-col items-center mb-6">
          <Palmtree className="w-12 h-12 text-yellow-500 mb-2" />
          <h1 className="text-2xl font-bold text-slate-900">LA VIDA-LOCA</h1>
          <p className="text-sm text-slate-500 text-center">
            Connexion à l'espace de gestion<br/>Hôtel & Restaurant
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Email
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                placeholder="votre@email.com"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Mot de passe
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          {error && (
            <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg border border-red-200 flex items-start gap-2">
              <span className="mt-0.5">⚠️</span>
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Connexion en cours...
              </>
            ) : (
              "Se connecter"
            )}
          </button>
        </form>

        <div className="mt-6 p-4 bg-slate-50 rounded-lg text-xs text-slate-600 border border-slate-200">
          <p className="font-semibold mb-2 flex items-center gap-2">
            <Lock className="w-3 h-3" /> Comptes de test :
          </p>
          <div className="space-y-1.5">
            <p className="flex items-center gap-2">
              <span>👔</span> 
              <span className="font-medium">Directeur :</span> 
              <span className="text-slate-800">directeur@vidaloca.bf / Admin1234!</span>
            </p>
            <p className="flex items-center gap-2">
              <span>🛎️</span> 
              <span className="font-medium">Réception :</span> 
              <span className="text-slate-800">reception@vidaloca.bf / Recep1234!</span>
            </p>
            <p className="flex items-center gap-2 pt-1 border-t border-slate-200 mt-1">
              <ChefHat className="w-3 h-3 text-amber-600" /> 
              <span className="font-medium text-amber-700">Restaurant :</span> 
              <span className="text-slate-800">cashier@vidaloca.bf / Resto1234!</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
