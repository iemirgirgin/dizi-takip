"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  getShowDetails,
  getShowEpisodes,
  type TVmazeShowMapped,
  type TVmazeEpisode,
} from "@/lib/tvmaze";
import type { User } from "@supabase/supabase-js";

export default function ShowDetailPage() {
  const params = useParams();
  const router = useRouter();
  const tvmazeId = Number(params.tvmazeId);

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [show, setShow] = useState<TVmazeShowMapped | null>(null);
  const [seasons, setSeasons] = useState<Map<number, TVmazeEpisode[]>>(new Map());
  const [watchedEpisodes, setWatchedEpisodes] = useState<Set<string>>(new Set());
  const [openSeason, setOpenSeason] = useState<number | null>(null);
  const [togglingEp, setTogglingEp] = useState<string | null>(null);
  const [showDbId, setShowDbId] = useState<string | null>(null);

  // Helper: create a key for an episode
  const epKey = (season: number, episode: number) => `${season}-${episode}`;

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

  // Fetch show data + episodes
  useEffect(() => {
    if (!tvmazeId) return;

    async function fetchData() {
      try {
        const [details, episodes] = await Promise.all([
          getShowDetails(tvmazeId),
          getShowEpisodes(tvmazeId),
        ]);
        setShow(details);
        setSeasons(episodes);

        // Auto-open first season
        const firstSeason = Math.min(...episodes.keys());
        setOpenSeason(firstSeason);
      } catch (err) {
        console.error("Dizi verisi alınamadı:", err);
      }
      setLoading(false);
    }

    fetchData();
  }, [tvmazeId]);

  // Fetch show's DB id and watched episodes
  const fetchWatchedEpisodes = useCallback(async () => {
    if (!user) return;

    const { data: showRow } = await supabase
      .from("shows")
      .select("id")
      .eq("tvmaze_id", tvmazeId)
      .single();

    if (!showRow) return;
    setShowDbId(showRow.id);

    const { data: watched } = await supabase
      .from("watched_episodes")
      .select("season_number, episode_number")
      .eq("user_id", user.id)
      .eq("show_id", showRow.id);

    if (watched) {
      const set = new Set<string>();
      for (const w of watched) {
        set.add(epKey(w.season_number, w.episode_number));
      }
      setWatchedEpisodes(set);
    }
  }, [user, tvmazeId]);

  useEffect(() => {
    if (user) fetchWatchedEpisodes();
  }, [user, fetchWatchedEpisodes]);

  // Get total episodes
  const totalEpisodes = Array.from(seasons.values()).reduce(
    (sum, eps) => sum + eps.length,
    0
  );
  const watchedCount = watchedEpisodes.size;

  // Sync completion status
  const checkAndUpdateShowStatus = async (newWatchedCount: number) => {
    if (!user || !showDbId) return;
    const newStatus = newWatchedCount >= totalEpisodes ? 'completed' : 'watching';

    // We only update if it might have changed (to save DB writes if it's already watching, 
    // but without full local state, we'll just fire the update, it's fast enough)
    await supabase
      .from("user_shows")
      .update({ status: newStatus })
      .eq("user_id", user.id)
      .eq("show_id", showDbId);
  };

  // Get runtime for an episode: episode runtime > 45 min default
  const getEpRuntime = (seasonNum: number, episodeNum: number): number => {
    const eps = seasons.get(seasonNum);
    const ep = eps?.find((e) => e.number === episodeNum);
    return ep?.runtime ?? 45;
  };

  // Toggle episode watched status
  const toggleEpisode = async (seasonNum: number, episodeNum: number) => {
    if (!user || !showDbId) return;
    const key = epKey(seasonNum, episodeNum);
    setTogglingEp(key);

    const isWatched = watchedEpisodes.has(key);
    let newCount = watchedEpisodes.size;

    if (isWatched) {
      // Remove
      await supabase
        .from("watched_episodes")
        .delete()
        .eq("user_id", user.id)
        .eq("show_id", showDbId)
        .eq("season_number", seasonNum)
        .eq("episode_number", episodeNum);

      newCount -= 1;
      setWatchedEpisodes((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    } else {
      // Add with runtime
      await supabase.from("watched_episodes").insert({
        user_id: user.id,
        show_id: showDbId,
        season_number: seasonNum,
        episode_number: episodeNum,
        runtime_minutes: getEpRuntime(seasonNum, episodeNum),
      });

      newCount += 1;
      setWatchedEpisodes((prev) => {
        const next = new Set(prev);
        next.add(key);
        return next;
      });
    }

    await checkAndUpdateShowStatus(newCount);
    setTogglingEp(null);
  };

  // Mark all episodes in a season as watched
  const markSeasonWatched = async (seasonNum: number) => {
    if (!user || !showDbId) return;
    const episodes = seasons.get(seasonNum);
    if (!episodes) return;

    const unwatched = episodes.filter(
      (ep) => !watchedEpisodes.has(epKey(ep.season, ep.number))
    );

    if (unwatched.length === 0) return;

    const rows = unwatched.map((ep) => ({
      user_id: user.id,
      show_id: showDbId,
      season_number: ep.season,
      episode_number: ep.number,
      runtime_minutes: ep.runtime ?? 45,
    }));

    await supabase.from("watched_episodes").insert(rows);

    const newCount = watchedEpisodes.size + unwatched.length;

    setWatchedEpisodes((prev) => {
      const next = new Set(prev);
      for (const ep of unwatched) {
        next.add(epKey(ep.season, ep.number));
      }
      return next;
    });

    await checkAndUpdateShowStatus(newCount);
  };

  // Strip HTML from summary
  const stripHtml = (html: string | null) => {
    if (!html) return "";
    return html.replace(/<[^>]*>/g, "");
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-950 text-zinc-100">
        <div className="w-8 h-8 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin mb-4" />
      </div>
    );
  }

  if (!show) {
    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-100 p-6 flex flex-col items-center justify-center">
        <div className="bg-zinc-900 border border-zinc-800 p-8 rounded-xl text-center max-w-md">
          <p className="text-lg font-bold text-zinc-300 mb-4">Dizi bulunamadı.</p>
          <button
            onClick={() => router.push("/dashboard")}
            className="inline-flex items-center gap-2 px-4 py-2 rounded text-zinc-950 bg-amber-500 hover:bg-amber-400 font-bold text-sm transition-all"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Dashboard'a Dön
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 p-4 sm:p-6 md:p-10 selection:bg-amber-500/30 selection:text-white font-sans">
      <div className="max-w-5xl mx-auto">
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

        {/* Show header (Cinematic Style) */}
        <div className="bg-zinc-900/50 border border-zinc-800/80 rounded-xl p-5 sm:p-8 mb-10 relative overflow-hidden">
          <div className="flex flex-col md:flex-row gap-6 md:gap-10 relative z-10">
            {/* Show image */}
            {show.image_url ? (
              <div className="relative group flex-shrink-0 self-center md:self-start w-40 h-60 sm:w-56 sm:h-84 overflow-hidden rounded bg-zinc-800 border border-zinc-700/50 shadow-xl">
                <img
                  src={show.image_url}
                  alt={show.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
              </div>
            ) : (
              <div className="w-40 h-60 sm:w-56 sm:h-84 bg-zinc-800 border border-zinc-700/50 rounded flex flex-col items-center justify-center text-zinc-600 text-xs flex-shrink-0 self-center md:self-start">
                YOK
              </div>
            )}

            {/* Details */}
            <div className="flex-1 flex flex-col justify-between py-2">
              <div>
                <h1 className="text-3xl sm:text-5xl font-black tracking-tighter text-zinc-100 mb-4 uppercase leading-none">
                  {show.name}
                </h1>

                {/* Meta info tags */}
                <div className="flex flex-wrap items-center gap-3 text-xs font-bold tracking-wide text-zinc-500 mb-6 uppercase">
                  <span>{show.premiered?.slice(0, 4) ?? "?"}</span>
                  {show.genres.length > 0 && (
                    <>
                      <span>·</span>
                      <span className="text-amber-500/80">{show.genres.join(", ")}</span>
                    </>
                  )}
                  {show.rating != null && (
                    <>
                      <span>·</span>
                      <span className="flex items-center gap-1 text-amber-500">
                        ★ {show.rating}
                      </span>
                    </>
                  )}
                </div>

                {/* Summary */}
                {show.summary && (
                  <p className="text-sm text-zinc-400 leading-relaxed line-clamp-4 hover:line-clamp-none transition-all duration-300 mb-8 border-l-2 border-amber-500/50 pl-4">
                    {stripHtml(show.summary)}
                  </p>
                )}
              </div>

              {/* Progress */}
              <div className="mt-auto">
                <div className="flex items-center justify-between text-xs font-bold tracking-wider uppercase text-zinc-500 mb-3">
                  <span>İlerleme ({watchedCount}/{totalEpisodes})</span>
                  <span className="text-amber-500">
                    {totalEpisodes > 0 ? Math.round((watchedCount / totalEpisodes) * 100) : 0}%
                  </span>
                </div>
                <div className="w-full bg-zinc-800 rounded-sm h-1.5 overflow-hidden">
                  <div
                    className="bg-amber-500 h-full transition-all duration-500"
                    style={{ width: totalEpisodes > 0 ? `${(watchedCount / totalEpisodes) * 100}%` : "0%" }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Seasons Section */}
        <div className="mb-6 border-b border-zinc-800 pb-2">
          <h2 className="text-lg font-black tracking-widest text-zinc-100 uppercase">
            SEZONLAR <span className="text-zinc-500 ml-2">({seasons.size})</span>
          </h2>
        </div>

        <div className="space-y-4">
          {Array.from(seasons.entries())
            .sort(([a], [b]) => a - b)
            .map(([seasonNum, episodes]) => {
              const seasonWatched = episodes.filter((ep) =>
                watchedEpisodes.has(epKey(ep.season, ep.number))
              ).length;
              const isOpen = openSeason === seasonNum;
              const isAllWatched = seasonWatched === episodes.length && episodes.length > 0;

              return (
                <div
                  key={seasonNum}
                  className="bg-zinc-900/40 border border-zinc-800/80 rounded-lg overflow-hidden transition-all duration-200"
                >
                  {/* Season header */}
                  <button
                    onClick={() => setOpenSeason(isOpen ? null : seasonNum)}
                    className="w-full flex items-center justify-between p-4 sm:p-5 hover:bg-zinc-800/50 transition-colors text-left group cursor-pointer"
                  >
                    <div className="flex items-center gap-4">
                      <span className="font-bold text-zinc-100 text-lg group-hover:text-amber-500 transition-colors">
                        SEZON {seasonNum}
                      </span>
                      <span
                        className={`text-xs px-2.5 py-1 rounded font-bold tracking-wider border transition-colors ${
                          isAllWatched
                            ? "bg-rose-500/10 text-rose-500 border-rose-500/20"
                            : "bg-zinc-800 text-zinc-500 border-zinc-700/50"
                        }`}
                      >
                        {seasonWatched} / {episodes.length}
                      </span>
                    </div>
                    <div className={`transition-transform duration-300 ${isOpen ? "rotate-180 text-amber-500" : "text-zinc-600 group-hover:text-zinc-400"}`}>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </button>

                  {/* Episode list */}
                  {isOpen && (
                    <div className="border-t border-zinc-800/80 bg-zinc-950/50">
                      {/* Mark all button */}
                      {seasonWatched < episodes.length && (
                        <div className="p-3 px-4 sm:px-5 border-b border-zinc-800/60 flex items-center justify-between bg-zinc-900/30">
                          <span className="text-xs font-bold tracking-wider text-zinc-500 uppercase hidden sm:inline">
                            Kalan: {episodes.length - seasonWatched} bölüm
                          </span>
                          <button
                            onClick={() => markSeasonWatched(seasonNum)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold tracking-wide text-amber-500 hover:bg-amber-500/10 transition-colors cursor-pointer ml-auto"
                          >
                            TÜM SEZONU İŞARETLE
                          </button>
                        </div>
                      )}
                      <div className="divide-y divide-zinc-800/50">
                        {episodes
                          .sort((a, b) => a.number - b.number)
                          .map((ep) => {
                            const key = epKey(ep.season, ep.number);
                            const isWatched = watchedEpisodes.has(key);
                            const isToggling = togglingEp === key;

                            return (
                              <div
                                key={key}
                                className={`flex items-center gap-4 p-3.5 sm:px-5 transition-colors duration-150 ${
                                  isWatched ? "bg-rose-500/5" : "hover:bg-zinc-800/30"
                                }`}
                              >
                                <button
                                  onClick={() => toggleEpisode(ep.season, ep.number)}
                                  disabled={isToggling}
                                  className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs transition-all duration-300 flex-shrink-0 cursor-pointer ${
                                    isWatched
                                      ? "bg-amber-500 border-amber-500 text-zinc-950"
                                      : "border-zinc-600 text-transparent hover:border-amber-500"
                                  } disabled:opacity-50`}
                                >
                                  {isWatched ? (
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={4} viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                  ) : null}
                                </button>
                                <div className="flex-1 min-w-0">
                                  <p
                                    className={`text-sm font-semibold truncate transition-colors ${
                                      isWatched ? "text-zinc-500 line-through decoration-zinc-700" : "text-zinc-200"
                                    }`}
                                  >
                                    {ep.number}. {ep.name}
                                  </p>
                                  <p className="text-xs text-zinc-600 mt-0.5 font-medium">
                                    {ep.airdate ?? "Tarih bilinmiyor"} {ep.runtime ? `· ${ep.runtime} dk` : ""}
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      </div>
    </main>
  );
}
