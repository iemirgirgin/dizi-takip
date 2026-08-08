"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

interface StatsData {
  totalEpisodes: number;
  totalMinutes: number;
  statusCounts: { watching: number; completed: number; dropped: number };
  topShow: { name: string; count: number } | null;
}

export default function StatsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<StatsData>({
    totalEpisodes: 0,
    totalMinutes: 0,
    statusCounts: { watching: 0, completed: 0, dropped: 0 },
    topShow: null,
  });

  // Auth check
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.replace("/");
      } else {
        setUser(session.user);
      }
    });
  }, [router]);

  // Fetch stats
  useEffect(() => {
    if (!user) return;

    async function fetchStats() {
      // 1. Total episodes & total runtime
      const { data: episodes } = await supabase
        .from("watched_episodes")
        .select("runtime_minutes")
        .eq("user_id", user!.id);

      const totalEpisodes = episodes?.length ?? 0;
      const totalMinutes =
        episodes?.reduce((sum, ep) => sum + (ep.runtime_minutes ?? 45), 0) ?? 0;

      // 2. Status counts
      const { data: userShows } = await supabase
        .from("user_shows")
        .select("status")
        .eq("user_id", user!.id);

      const statusCounts = { watching: 0, completed: 0, dropped: 0 };
      userShows?.forEach((s) => {
        if (s.status in statusCounts) {
          statusCounts[s.status as keyof typeof statusCounts]++;
        }
      });

      // 3. Top show (most episodes watched)
      const { data: epsByShow } = await supabase
        .from("watched_episodes")
        .select("show_id, shows(name)")
        .eq("user_id", user!.id);

      let topShow: StatsData["topShow"] = null;
      if (epsByShow && epsByShow.length > 0) {
        const countMap = new Map<string, { name: string; count: number }>();
        for (const row of epsByShow) {
          const showId = row.show_id;
          const showName =
            (row.shows as unknown as { name: string })?.name ?? "Bilinmeyen";
          if (!countMap.has(showId)) {
            countMap.set(showId, { name: showName, count: 0 });
          }
          countMap.get(showId)!.count++;
        }
        topShow = Array.from(countMap.values()).sort(
          (a, b) => b.count - a.count
        )[0];
      }

      setStats({ totalEpisodes, totalMinutes, statusCounts, topShow });
      setLoading(false);
    }

    fetchStats();
  }, [user]);

  const totalHours = Math.round((stats.totalMinutes / 60) * 10) / 10;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-950 text-zinc-100">
        <div className="w-8 h-8 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin mb-4" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans pb-16 selection:bg-amber-500/30 selection:text-white">
      <main className="p-4 sm:p-6 md:p-10 max-w-5xl mx-auto">
        {/* Back button */}
        <button
          onClick={() => router.push("/dashboard")}
          className="inline-flex items-center gap-2 text-zinc-500 hover:text-amber-500 text-sm font-bold tracking-wider uppercase mb-8 transition-colors group"
        >
          <svg className="w-4 h-4 transition-transform duration-200 group-hover:-translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Dashboard'a Dön
        </button>

        <header className="mb-12 border-b border-zinc-800 pb-4">
          <h1 className="text-3xl sm:text-4xl font-black tracking-tighter text-zinc-100 uppercase">
            İstatistikler
          </h1>
        </header>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
          {/* Total Episodes */}
          <div className="bg-zinc-900/50 border border-zinc-800/80 rounded-xl p-6 sm:p-8">
            <p className="text-xs font-bold tracking-wider text-zinc-500 uppercase mb-2">Toplam İzlenen</p>
            <p className="text-5xl font-black tracking-tighter text-amber-500">
              {stats.totalEpisodes}
            </p>
            <p className="text-xs font-semibold text-zinc-600 mt-2 uppercase tracking-wide">bölüm</p>
          </div>

          {/* Total Watch Time */}
          <div className="bg-zinc-900/50 border border-zinc-800/80 rounded-xl p-6 sm:p-8">
            <p className="text-xs font-bold tracking-wider text-zinc-500 uppercase mb-2">Toplam Süre</p>
            <p className="text-5xl font-black tracking-tighter text-zinc-100">
              {totalHours}
            </p>
            <p className="text-xs font-semibold text-zinc-600 mt-2 uppercase tracking-wide">saat ({stats.totalMinutes} dk)</p>
          </div>

          {/* Top Show */}
          <div className="bg-zinc-900/50 border border-zinc-800/80 rounded-xl p-6 sm:p-8 sm:col-span-2 lg:col-span-1 flex flex-col justify-center">
            <p className="text-xs font-bold tracking-wider text-zinc-500 uppercase mb-2">En Çok İzlenen</p>
            {stats.topShow ? (
              <>
                <p className="text-2xl font-black tracking-tight text-zinc-100 truncate">
                  {stats.topShow.name}
                </p>
                <p className="text-xs font-semibold text-amber-500/80 mt-2 uppercase tracking-wide">
                  {stats.topShow.count} bölüm izlendi
                </p>
              </>
            ) : (
              <p className="text-sm font-semibold text-zinc-600 uppercase">Veri yok</p>
            )}
          </div>
        </div>

        {/* Status Breakdown */}
        <section>
          <h2 className="text-lg font-black tracking-widest text-zinc-100 uppercase mb-6 border-b border-zinc-800 pb-2">
            Durum Dağılımı
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="p-6 rounded-xl bg-zinc-900/30 border border-zinc-800/50">
              <p className="text-4xl font-black text-zinc-300">
                {stats.statusCounts.watching}
              </p>
              <p className="text-xs font-bold tracking-wider text-zinc-500 mt-2 uppercase">İzleniyor</p>
            </div>
            <div className="p-6 rounded-xl bg-zinc-900/30 border border-zinc-800/50 border-l-4 border-l-amber-500">
              <p className="text-4xl font-black text-amber-500">
                {stats.statusCounts.completed}
              </p>
              <p className="text-xs font-bold tracking-wider text-zinc-500 mt-2 uppercase">Tamamlandı</p>
            </div>
            <div className="p-6 rounded-xl bg-zinc-900/30 border border-zinc-800/50">
              <p className="text-4xl font-black text-rose-500">
                {stats.statusCounts.dropped}
              </p>
              <p className="text-xs font-bold tracking-wider text-zinc-500 mt-2 uppercase">Bırakıldı</p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
