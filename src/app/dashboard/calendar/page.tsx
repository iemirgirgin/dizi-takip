"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getShowEpisodesFlat, type TVmazeEpisode } from "@/lib/tvmaze";
import type { User } from "@supabase/supabase-js";
import type { Show, UserShow } from "@/types/database";

interface UpcomingEpisode {
  show: Show;
  episode: TVmazeEpisode;
  dateLabel: string;
  dateObj: Date;
  isToday: boolean;
  isTomorrow: boolean;
}

function formatDateLabel(airdate: string): {
  label: string;
  isToday: boolean;
  isTomorrow: boolean;
} {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Parse airdate as local date to avoid timezone shifts
  const [year, month, day] = airdate.split("-").map(Number);
  const epDate = new Date(year, month - 1, day);

  if (epDate.getTime() === today.getTime()) {
    return { label: "Bugün", isToday: true, isTomorrow: false };
  }
  if (epDate.getTime() === tomorrow.getTime()) {
    return { label: "Yarın", isToday: false, isTomorrow: true };
  }

  const days = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
  const months = [
    "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
    "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
  ];
  const label = `${days[epDate.getDay()]}, ${epDate.getDate()} ${months[epDate.getMonth()]} ${epDate.getFullYear()}`;
  return { label, isToday: false, isTomorrow: false };
}

export default function CalendarPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [upcoming, setUpcoming] = useState<UpcomingEpisode[]>([]);
  const [loading, setLoading] = useState(true);

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

  // Fetch upcoming episodes
  useEffect(() => {
    if (!user) return;

    const fetchUpcoming = async () => {
      setLoading(true);

      // 1. Get all watching shows
      const { data: userShowsData } = await supabase
        .from("user_shows")
        .select("*, show:shows(*)")
        .eq("user_id", user.id)
        .eq("status", "watching");

      if (!userShowsData || userShowsData.length === 0) {
        setLoading(false);
        return;
      }

      const userShows = userShowsData as (UserShow & { show: Show })[];

      // Today's date string for comparison (YYYY-MM-DD)
      const todayStr = new Date().toISOString().split("T")[0];

      // 2. Fetch episodes for all shows in parallel
      const results = await Promise.allSettled(
        userShows.map((us) =>
          getShowEpisodesFlat(us.show.tvmaze_id).then((episodes) => ({
            show: us.show,
            episodes,
          }))
        )
      );

      // 3. Find next upcoming episode for each show
      const upcomingList: UpcomingEpisode[] = [];

      for (const result of results) {
        if (result.status !== "fulfilled") continue;
        const { show, episodes } = result.value;

        // Find first episode with airdate > today
        const nextEp = episodes.find(
          (ep) => ep.airdate && ep.airdate > todayStr
        );

        if (!nextEp || !nextEp.airdate) continue;

        const { label, isToday, isTomorrow } = formatDateLabel(nextEp.airdate);
        const [y, m, d] = nextEp.airdate.split("-").map(Number);

        upcomingList.push({
          show,
          episode: nextEp,
          dateLabel: label,
          dateObj: new Date(y, m - 1, d),
          isToday,
          isTomorrow,
        });
      }

      // 4. Sort by date ascending
      upcomingList.sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime());

      setUpcoming(upcomingList);
      setLoading(false);
    };

    fetchUpcoming();
  }, [user]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-zinc-950 text-zinc-300">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
          <span className="text-sm text-zinc-500 font-medium">Bölümler yükleniyor...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans pb-16">
      {/* Navbar */}
      <header className="border-b border-zinc-900 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-amber-500 flex items-center justify-center text-zinc-950 font-black text-lg">
              D
            </div>
            <Link href="/dashboard" className="text-xl font-black tracking-tighter text-zinc-100 hover:text-amber-500 transition-colors">
              DiziTakip
            </Link>
          </div>

          <div className="flex items-center gap-4">
            <Link
              href="/dashboard/stats"
              className="text-sm font-medium text-zinc-400 hover:text-amber-500 transition-colors hidden sm:block"
            >
              İstatistikler
            </Link>
            <Link
              href="/dashboard/calendar"
              className="text-sm font-medium text-amber-500 transition-colors"
            >
              Takvim
            </Link>
            <div className="w-px h-4 bg-zinc-800 hidden sm:block"></div>
            <span className="text-xs font-medium text-zinc-500 hidden sm:block">{user?.email}</span>
            <button
              type="button"
              onClick={handleLogout}
              className="text-sm font-medium text-zinc-400 hover:text-rose-500 transition-colors ml-2"
            >
              Çıkış
            </button>
          </div>
        </div>
      </header>

      <main className="p-4 sm:p-6 md:p-8 max-w-5xl mx-auto mt-4">
        {/* Page title */}
        <div className="mb-8">
          <h2 className="text-3xl font-black tracking-tighter text-zinc-100">
            Yaklaşan Bölümler
          </h2>
          <p className="text-sm text-zinc-500 mt-1 font-medium">
            İzlediğin dizilerin henüz yayınlanmamış bölümleri
          </p>
        </div>

        {upcoming.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <span className="text-5xl mb-4">📭</span>
            <p className="text-zinc-400 font-semibold text-lg">Yaklaşan bölüm yok</p>
            <p className="text-zinc-600 text-sm mt-2 max-w-xs">
              İzlediğin dizilerin yakında yayınlanacak bölümü bulunmuyor ya da
              henüz hiç dizi eklemedin.
            </p>
            <Link
              href="/dashboard"
              className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded bg-amber-500/10 text-amber-500 hover:bg-amber-500 hover:text-zinc-950 text-sm font-bold transition-all"
            >
              Dizilere Git
            </Link>
          </div>
        ) : (
          <div className="space-y-px border border-zinc-900 rounded-xl overflow-hidden">
            {upcoming.map((item, idx) => {
              const ep = item.episode;
              const prevItem = idx > 0 ? upcoming[idx - 1] : null;
              const showDateHeader =
                !prevItem ||
                prevItem.dateObj.getTime() !== item.dateObj.getTime();

              return (
                <div key={`${item.show.id}-${ep.season}-${ep.number}`}>
                  {/* Date group header */}
                  {showDateHeader && (
                    <div
                      className={`px-4 sm:px-6 py-2 text-xs font-black tracking-widest uppercase ${
                        item.isToday
                          ? "bg-amber-500/10 text-amber-500"
                          : item.isTomorrow
                          ? "bg-zinc-900/80 text-yellow-400"
                          : "bg-zinc-900/60 text-zinc-500"
                      }`}
                    >
                      {item.dateLabel}
                    </div>
                  )}

                  {/* Episode row */}
                  <Link
                    href={`/dashboard/show/${item.show.tvmaze_id}`}
                    className={`flex items-center gap-3 sm:gap-5 px-4 sm:px-6 py-3 sm:py-4 transition-colors group ${
                      item.isToday
                        ? "bg-amber-500/5 hover:bg-amber-500/10"
                        : "bg-zinc-950 hover:bg-zinc-900/60"
                    } border-t border-zinc-900/50`}
                  >
                    {/* Poster */}
                    {item.show.image_url ? (
                      <img
                        src={item.show.image_url}
                        alt={item.show.name}
                        className="w-11 h-16 sm:w-14 sm:h-20 object-cover rounded shadow-md border border-zinc-800 shrink-0"
                      />
                    ) : (
                      <div className="w-11 h-16 sm:w-14 sm:h-20 bg-zinc-800 rounded flex items-center justify-center shrink-0">
                        <span className="text-[10px] text-zinc-600 font-bold">N/A</span>
                      </div>
                    )}

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="font-black tracking-tight text-zinc-100 group-hover:text-amber-500 transition-colors truncate text-sm sm:text-base">
                        {item.show.name}
                      </p>
                      <p className="text-zinc-400 font-semibold text-sm mt-0.5">
                        S{ep.season}B{ep.number}
                        {ep.name && (
                          <span className="text-zinc-600 font-normal">
                            {" "}· {ep.name}
                          </span>
                        )}
                      </p>
                      {ep.runtime && (
                        <p className="text-xs text-zinc-600 mt-1">{ep.runtime} dk</p>
                      )}
                    </div>

                    {/* Date badge (right side, only if NOT in header) */}
                    <div className="shrink-0 text-right">
                      {item.isToday ? (
                        <span className="inline-block px-2.5 py-1 rounded-full bg-amber-500 text-zinc-950 text-xs font-black">
                          BUGÜN
                        </span>
                      ) : item.isTomorrow ? (
                        <span className="inline-block px-2.5 py-1 rounded-full bg-yellow-400/20 text-yellow-400 text-xs font-black">
                          YARIN
                        </span>
                      ) : (
                        <span className="text-xs text-zinc-600 font-medium hidden sm:block">
                          {ep.airdate}
                        </span>
                      )}
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-4 w-4 text-zinc-700 group-hover:text-amber-500 transition-colors mt-1 ml-auto"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
