"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function Home() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        router.push("/dashboard");
      }
    });
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) setError(error.message);
    else router.push("/dashboard");
    setLoading(false);
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signUp({
      email,
      password,
    });
    if (error) setError(error.message);
    else setError("Kayıt başarılı! Giriş yapabilirsiniz.");
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-zinc-100 p-4 font-sans selection:bg-amber-500/30 selection:text-white">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <div className="w-16 h-16 rounded-xl bg-amber-500 mx-auto flex items-center justify-center text-zinc-950 font-black text-3xl mb-6 shadow-xl shadow-amber-500/20">
            D
          </div>
          <h1 className="text-4xl sm:text-5xl font-black tracking-tighter text-zinc-100 uppercase">
            DiziTakip
          </h1>
          <p className="mt-3 text-sm font-bold tracking-widest text-zinc-500 uppercase">
            İZLEDİĞİN DİZİLERİN KAYDINI TUT
          </p>
        </div>

        <div className="bg-zinc-900/50 border border-zinc-800/80 rounded-2xl p-6 sm:p-8">
          <form className="space-y-5">
            <div>
              <label className="block text-xs font-bold tracking-wider text-zinc-400 uppercase mb-2">
                E-posta Adresi
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-zinc-950/50 border border-zinc-800 rounded-lg px-4 py-3 text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50 transition-all text-sm font-medium"
                placeholder="ornek@email.com"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold tracking-wider text-zinc-400 uppercase mb-2">
                Şifre
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-zinc-950/50 border border-zinc-800 rounded-lg px-4 py-3 text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50 transition-all text-sm font-medium"
                placeholder="••••••••"
                required
              />
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 text-sm font-medium text-center">
                <span className={error.includes("başarılı") ? "text-amber-500" : "text-rose-500"}>
                  {error}
                </span>
              </div>
            )}

            <div className="pt-2 flex flex-col gap-3">
              <button
                onClick={handleLogin}
                disabled={loading}
                className="w-full py-3 px-4 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black tracking-wider uppercase text-sm rounded-lg transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "..." : "GİRİŞ YAP"}
              </button>
              <button
                onClick={handleSignUp}
                disabled={loading}
                className="w-full py-3 px-4 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-zinc-100 font-bold tracking-wider uppercase text-sm rounded-lg transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "..." : "KAYIT OL"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
