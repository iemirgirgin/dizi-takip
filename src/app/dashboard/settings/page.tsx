"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { supabase } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

export default function SettingsPage() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Display name
  const [displayName, setDisplayName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [nameMsg, setNameMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // Password change
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // Delete account modal
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  // Auth check + load profile
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        router.replace("/");
        return;
      }
      setUser(session.user);

      // Load profile
      const { data } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", session.user.id)
        .single();

      if (data?.display_name) setDisplayName(data.display_name);
      setLoading(false);
    });
  }, [router]);

  // Save display name
  const handleSaveName = async () => {
    if (!user) return;
    setSavingName(true);
    setNameMsg(null);
    const { error } = await supabase
      .from("profiles")
      .upsert({ id: user.id, display_name: displayName.trim() || null });
    setSavingName(false);
    if (error) {
      setNameMsg({ type: "err", text: "Kaydedilemedi: " + error.message });
    } else {
      setNameMsg({ type: "ok", text: "İsim güncellendi ✓" });
      setTimeout(() => setNameMsg(null), 3000);
    }
  };

  // Change password
  const handleChangePassword = async () => {
    setPasswordMsg(null);
    if (newPassword.length < 6) {
      setPasswordMsg({ type: "err", text: "Şifre en az 6 karakter olmalı." });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ type: "err", text: "Şifreler eşleşmiyor." });
      return;
    }
    setSavingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSavingPassword(false);
    if (error) {
      setPasswordMsg({ type: "err", text: "Hata: " + error.message });
    } else {
      setPasswordMsg({ type: "ok", text: "Şifre başarıyla güncellendi ✓" });
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => setPasswordMsg(null), 4000);
    }
  };

  // Delete account
  const handleDeleteAccount = async () => {
    if (!user) return;
    setDeletingAccount(true);

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;

    if (!accessToken) {
      setDeletingAccount(false);
      return;
    }

    const res = await fetch("/api/delete-account", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (res.ok) {
      await supabase.auth.signOut();
      router.push("/");
    } else {
      const data = await res.json();
      alert("Hesap silinemedi: " + (data.error ?? "Bilinmeyen hata"));
      setDeletingAccount(false);
      setShowDeleteModal(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-zinc-950">
        <div className="w-8 h-8 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans pb-16">
      {/* Navbar */}
      <header className="border-b border-zinc-900 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-amber-500 flex items-center justify-center text-zinc-950 font-black text-lg">
              D
            </div>
            <Link href="/dashboard" className="text-xl font-black tracking-tighter text-zinc-100 hover:text-amber-500 transition-colors">
              DiziTakip
            </Link>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="text-sm font-medium text-zinc-400 hover:text-amber-500 transition-colors">
              ← Dashboard
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              className="text-sm font-medium text-zinc-400 hover:text-rose-500 transition-colors"
            >
              Çıkış
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10 space-y-8">
        <div>
          <h1 className="text-3xl font-black tracking-tighter text-zinc-100">Ayarlar</h1>
          <p className="text-sm text-zinc-500 mt-1">Hesap bilgilerini buradan yönetebilirsin.</p>
        </div>

        {/* Account Info */}
        <section className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-6 space-y-4">
          <h2 className="text-xs font-black tracking-widest uppercase text-zinc-500">Hesap Bilgisi</h2>
          <div>
            <label className="block text-xs font-bold text-zinc-500 mb-1.5 uppercase tracking-wider">E-posta</label>
            <input
              type="email"
              value={user?.email ?? ""}
              disabled
              className="w-full bg-zinc-950 border border-zinc-800 text-zinc-500 rounded-lg px-4 py-2.5 text-sm cursor-not-allowed"
            />
          </div>
        </section>

        {/* Theme Settings */}
        <section className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-6 space-y-4">
          <h2 className="text-xs font-black tracking-widest uppercase text-zinc-500">Görünüm</h2>
          <div className="flex bg-zinc-950 p-1 rounded-lg border border-zinc-800 w-fit">
            <button
              onClick={() => setTheme("system")}
              className={`px-4 py-2 text-sm font-bold rounded-md transition-colors ${
                theme === "system" ? "bg-zinc-800 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              Sistem
            </button>
            <button
              onClick={() => setTheme("light")}
              className={`px-4 py-2 text-sm font-bold rounded-md transition-colors ${
                theme === "light" ? "bg-zinc-800 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              Açık
            </button>
            <button
              onClick={() => setTheme("dark")}
              className={`px-4 py-2 text-sm font-bold rounded-md transition-colors ${
                theme === "dark" ? "bg-zinc-800 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              Koyu
            </button>
          </div>
        </section>

        {/* Display Name */}
        <section className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-6 space-y-4">
          <h2 className="text-xs font-black tracking-widest uppercase text-zinc-500">Görünen İsim</h2>
          <p className="text-xs text-zinc-600">Nav bar'da e-posta yerine bu isim gösterilir.</p>
          <div className="flex gap-3">
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Kullanıcı adın..."
              maxLength={40}
              className="flex-1 bg-zinc-950 border border-zinc-800 text-zinc-100 placeholder:text-zinc-700 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-all"
            />
            <button
              type="button"
              onClick={handleSaveName}
              disabled={savingName}
              className="px-5 py-2.5 rounded-lg bg-amber-500 text-zinc-950 text-sm font-black hover:bg-amber-400 transition-colors disabled:opacity-50"
            >
              {savingName ? "..." : "Kaydet"}
            </button>
          </div>
          {nameMsg && (
            <p className={`text-xs font-semibold ${nameMsg.type === "ok" ? "text-green-400" : "text-rose-400"}`}>
              {nameMsg.text}
            </p>
          )}
        </section>

        {/* Password Change */}
        <section className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-6 space-y-4">
          <h2 className="text-xs font-black tracking-widest uppercase text-zinc-500">Şifre Değiştir</h2>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-zinc-500 mb-1.5 uppercase tracking-wider">Yeni Şifre</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="En az 6 karakter"
                className="w-full bg-zinc-950 border border-zinc-800 text-zinc-100 placeholder:text-zinc-700 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-zinc-500 mb-1.5 uppercase tracking-wider">Şifre Tekrar</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Şifreyi tekrar gir"
                className="w-full bg-zinc-950 border border-zinc-800 text-zinc-100 placeholder:text-zinc-700 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-all"
              />
            </div>
          </div>
          {passwordMsg && (
            <p className={`text-xs font-semibold ${passwordMsg.type === "ok" ? "text-green-400" : "text-rose-400"}`}>
              {passwordMsg.text}
            </p>
          )}
          <button
            type="button"
            onClick={handleChangePassword}
            disabled={savingPassword || !newPassword}
            className="px-5 py-2.5 rounded-lg border border-zinc-700 text-zinc-300 text-sm font-bold hover:border-amber-500 hover:text-amber-500 transition-colors disabled:opacity-40"
          >
            {savingPassword ? "Güncelleniyor..." : "Şifreyi Güncelle"}
          </button>
        </section>

        {/* Danger Zone */}
        <section className="bg-rose-950/20 border border-rose-900/50 rounded-xl p-6 space-y-4">
          <h2 className="text-xs font-black tracking-widest uppercase text-rose-500">Tehlikeli Bölge</h2>
          <p className="text-sm text-zinc-400">
            Hesabını kalıcı olarak silebilirsin. Bu işlem <span className="text-rose-400 font-semibold">geri alınamaz</span>.
          </p>
          <button
            type="button"
            onClick={() => setShowDeleteModal(true)}
            className="px-5 py-2.5 rounded-lg border border-rose-700 text-rose-400 text-sm font-black hover:bg-rose-500 hover:text-white hover:border-rose-500 transition-all"
          >
            Hesabımı Sil
          </button>
        </section>
      </main>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm"
            onClick={() => !deletingAccount && setShowDeleteModal(false)}
          />
          <div className="relative bg-zinc-900 border border-zinc-700 rounded-2xl p-8 max-w-sm w-full shadow-2xl">
            <div className="w-12 h-12 rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center mb-4 mx-auto">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h3 className="text-lg font-black tracking-tight text-zinc-100 text-center mb-2">
              Hesabı Sil
            </h3>
            <p className="text-sm text-zinc-400 text-center mb-6 leading-relaxed">
              Bu işlem <span className="text-rose-400 font-semibold">geri alınamaz</span>. Tüm dizi ve bölüm verilerin, profilin ve hesabın kalıcı olarak silinecek. Devam etmek istiyor musun?
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                disabled={deletingAccount}
                className="flex-1 py-2.5 rounded-lg border border-zinc-700 text-zinc-300 text-sm font-bold hover:border-zinc-500 transition-colors disabled:opacity-40"
              >
                İptal
              </button>
              <button
                type="button"
                onClick={handleDeleteAccount}
                disabled={deletingAccount}
                className="flex-1 py-2.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-sm font-black transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {deletingAccount ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Siliniyor...
                  </>
                ) : (
                  "Evet, Sil"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
