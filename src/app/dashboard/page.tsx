"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  searchShows,
  getShowEpisodesFlat,
  type TVmazeShowMapped,
  type TVmazeEpisode,
} from "@/lib/tvmaze";
import type { User } from "@supabase/supabase-js";
import type { Show, UserShow, ShowStatus, WatchedEpisode } from "@/types/database";

// Extended interface for the dashboard list
interface DashboardShowItem extends UserShow {
  show: Show;
  nextEpisode: TVmazeEpisode | null;
  isCompleted: boolean;
  lastInteractionDate: number;
  episodes: TVmazeEpisode[]; // cache array
}

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<TVmazeShowMapped[]>([]);
  const [searching, setSearching] = useState(false);

  // User's shows list
  const [myShows, setMyShows] = useState<DashboardShowItem[]>([]);
  const [activeTab, setActiveTab] = useState<ShowStatus>("watching");
  const [addingId, setAddingId] = useState<number | null>(null);
  const [markingEpisode, setMarkingEpisode] = useState<string | null>(null);
  const [pendingNotes, setPendingNotes] = useState<Record<string, string>>({});
  const [savingNote, setSavingNote] = useState<string | null>(null);

  // List search & sort
  const [listSearch, setListSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [listSort, setListSort] = useState<"recent" | "alpha" | "progress">("recent");

  // Debounce list search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(listSearch), 250);
    return () => clearTimeout(t);
  }, [listSearch]);

  // Reset search when tab changes
  useEffect(() => {
    setListSearch("");
    setDebouncedSearch("");
  }, [activeTab]);

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

  // Fetch user's shows and calculate next episodes
  const fetchMyShows = useCallback(async () => {
    if (!user) return;
    
    // 1. Fetch user shows and watched episodes concurrently
    const [showsRes, watchedRes] = await Promise.all([
      supabase.from("user_shows").select("*, show:shows(*)").eq("user_id", user.id),
      supabase.from("watched_episodes").select("*").eq("user_id", user.id),
    ]);

    if (!showsRes.data) return;

    const rawShows = showsRes.data as (UserShow & { show: Show })[];
    const watchedEps = (watchedRes.data as WatchedEpisode[]) || [];

    // Group watched episodes by show_id for quick lookup
    const watchedMap = new Map<string, Set<string>>();
    const lastWatchedMap = new Map<string, number>();

    for (const w of watchedEps) {
      if (!watchedMap.has(w.show_id)) watchedMap.set(w.show_id, new Set());
      watchedMap.get(w.show_id)!.add(`${w.season_number}-${w.episode_number}`);

      const watchedTime = new Date(w.watched_at).getTime();
      const currentMax = lastWatchedMap.get(w.show_id) || 0;
      if (watchedTime > currentMax) lastWatchedMap.set(w.show_id, watchedTime);
    }

    // 2. Fetch episodes from TVmaze and build the final items
    const processedShows = await Promise.all(
      rawShows.map(async (item) => {
        let episodes: TVmazeEpisode[] = [];
        try {
          episodes = await getShowEpisodesFlat(item.show.tvmaze_id);
        } catch (e) {
          console.error(`Failed to fetch episodes for ${item.show.name}`);
        }

        const showWatchedSet = watchedMap.get(item.show_id) || new Set();
        
        // Find next episode: the first one not in watched set
        const nextEpisode = episodes.find(
          (ep) => !showWatchedSet.has(`${ep.season}-${ep.number}`)
        ) || null;

        const isCompleted = episodes.length > 0 && nextEpisode === null;
        
        // Auto-correct DB and local status if there's a mismatch
        let currentStatus = item.status;
        if (isCompleted && currentStatus !== "completed" && currentStatus !== "dropped") {
          currentStatus = "completed";
          supabase.from("user_shows").update({ status: "completed" }).eq("id", item.id).then();
        } else if (!isCompleted && currentStatus === "completed") {
          currentStatus = "watching";
          supabase.from("user_shows").update({ status: "watching" }).eq("id", item.id).then();
        }
        
        // Sort order: last watched time, fallback to added time
        const lastInteractionDate = lastWatchedMap.get(item.show_id) || new Date(item.created_at).getTime();

        return {
          ...item,
          status: currentStatus,
          episodes,
          nextEpisode,
          isCompleted,
          lastInteractionDate,
        } as DashboardShowItem;
      })
    );

    // Sort by recent interaction DESC
    processedShows.sort((a, b) => b.lastInteractionDate - a.lastInteractionDate);
    
    setMyShows(processedShows);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (user) fetchMyShows();
  }, [user, fetchMyShows]);

  // Search handler
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const results = await searchShows(searchQuery);
      setSearchResults(results);
    } catch (err) {
      console.error("Arama hatası:", err);
    }
    setSearching(false);
  };

  // Add show to list
  const handleAddShow = async (show: TVmazeShowMapped) => {
    if (!user) return;
    setAddingId(show.tvmaze_id);

    try {
      const { data: showRow, error: showError } = await supabase
        .from("shows")
        .upsert(
          { tvmaze_id: show.tvmaze_id, name: show.name, image_url: show.image_url },
          { onConflict: "tvmaze_id" }
        )
        .select()
        .single();
      if (showError) throw showError;

      const { error: userShowError } = await supabase
        .from("user_shows")
        .upsert(
          { user_id: user.id, show_id: showRow.id, status: "watching" as ShowStatus },
          { onConflict: "user_id,show_id" }
        );
      if (userShowError) throw userShowError;

      // Reset loading and fetch to reflect newly added show properly with TVmaze eps
      setLoading(true);
      await fetchMyShows();
    } catch (err) {
      console.error("Ekleme hatası:", err);
    }
    setAddingId(null);
  };

  // Mark next episode as watched
  const handleMarkNextEpisode = async (showId: string, episode: TVmazeEpisode) => {
    if (!user) return;
    
    const epKey = `${showId}-${episode.season}-${episode.number}`;
    setMarkingEpisode(epKey);

    const runtimeMinutes = episode.runtime ?? 45;

    // 1. Supabase insert
    const { error } = await supabase.from("watched_episodes").insert({
      user_id: user.id,
      show_id: showId,
      season_number: episode.season,
      episode_number: episode.number,
      runtime_minutes: runtimeMinutes,
    });

    if (error) {
      alert("Bölüm işaretlenirken hata oluştu: " + error.message);
    } else {
      // 2. Determine if show is now completed
      let isNowCompleted = false;

      // Optimistic UI update
      setMyShows((prev) => {
        const nextState = [...prev];
        const showIndex = nextState.findIndex((s) => s.show.id === showId);
        if (showIndex === -1) return prev;

        const show = { ...nextState[showIndex] };
        
        // Find index of current nextEpisode
        const currentEpIndex = show.episodes.findIndex(
          (ep) => ep.season === episode.season && ep.number === episode.number
        );

        // Next unwatched episode in array
        const nextNextEpisode = show.episodes[currentEpIndex + 1] || null;
        
        show.nextEpisode = nextNextEpisode;
        show.isCompleted = nextNextEpisode === null;
        isNowCompleted = show.isCompleted;
        show.lastInteractionDate = Date.now(); // bump to top

        if (isNowCompleted) {
          show.status = "completed"; // update status locally
        }

        nextState[showIndex] = show;
        nextState.sort((a, b) => b.lastInteractionDate - a.lastInteractionDate);

        return nextState;
      });

      // 3. Auto-complete bug fix: if it's completed, update the user_shows table
      if (isNowCompleted) {
        // Find the user_shows ID for this show
        const userShow = myShows.find(s => s.show.id === showId);
        if (userShow) {
          await supabase
            .from("user_shows")
            .update({ status: 'completed' })
            .eq("id", userShow.id);
        }
      }
    }

    setMarkingEpisode(null);
  };

  // Remove show from list
  const handleRemoveShow = async (userShowId: string) => {
    await supabase.from("user_shows").delete().eq("id", userShowId);
    setMyShows((prev) => prev.filter((s) => s.id !== userShowId));
  };

  // Rate a show (1-10)
  const handleRating = async (userShowId: string, rating: number) => {
    await supabase.from("user_shows").update({ rating }).eq("id", userShowId);
    setMyShows((prev) =>
      prev.map((s) => (s.id === userShowId ? { ...s, rating } : s))
    );
  };

  // Save personal note
  const handleSaveNote = async (userShowId: string) => {
    const note = pendingNotes[userShowId] ?? "";
    setSavingNote(userShowId);
    await supabase
      .from("user_shows")
      .update({ personal_note: note || null })
      .eq("id", userShowId);
    setMyShows((prev) =>
      prev.map((s) =>
        s.id === userShowId ? { ...s, personal_note: note || null } : s
      )
    );
    setSavingNote(null);
  };

  const isInMyList = (tvmazeId: number) =>
    myShows.some((s) => s.show.tvmaze_id === tvmazeId);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-zinc-950 text-zinc-300">
        <div className="w-8 h-8 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 selection:bg-amber-500/30 selection:text-white font-sans pb-16">
      {/* Navbar / Header */}
      <header className="border-b border-zinc-900 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-amber-500 flex items-center justify-center text-zinc-950 font-black text-lg">
              D
            </div>
            <h1 className="text-xl font-black tracking-tighter text-zinc-100">
              DiziTakip
            </h1>
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
              className="text-sm font-medium text-zinc-400 hover:text-amber-500 transition-colors"
            >
              Takvim
            </Link>
            <div className="w-px h-4 bg-zinc-800 hidden sm:block"></div>
            <span className="text-xs font-medium text-zinc-500 hidden sm:block">{user?.email}</span>
            <button
              onClick={handleLogout}
              className="text-sm font-medium text-zinc-400 hover:text-rose-500 transition-colors ml-2"
            >
              Çıkış
            </button>
          </div>
        </div>
      </header>

      <main className="p-4 sm:p-6 md:p-8 max-w-5xl mx-auto mt-4">
        {/* Search Section */}
        <section className="mb-12">
          <form onSubmit={handleSearch} className="flex gap-2 max-w-xl">
            <div className="relative flex-1">
              <input
                id="search-input"
                type="text"
                placeholder="Dizi ara..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 text-zinc-100 placeholder:text-zinc-500 rounded-lg px-4 py-3 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50 transition-all text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={searching}
              className="bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-semibold rounded-lg px-6 py-3 transition-all text-sm disabled:opacity-50"
            >
              {searching ? "..." : "Ara"}
            </button>
          </form>

          {/* Search Results */}
          {searchResults.length > 0 && (
            <div className="mt-4 border border-zinc-800 rounded-lg bg-zinc-900 overflow-hidden divide-y divide-zinc-800 max-w-xl">
              {searchResults.map((show) => (
                <div
                  key={show.tvmaze_id}
                  className="flex items-center gap-4 p-3 hover:bg-zinc-800/50 transition-colors group"
                >
                  {show.image_url ? (
                    <img
                      src={show.image_url}
                      alt={show.name}
                      className="w-12 h-16 object-cover rounded shadow-sm border border-zinc-800"
                    />
                  ) : (
                    <div className="w-12 h-16 bg-zinc-800 rounded flex items-center justify-center text-[10px] text-zinc-500">
                      Yok
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/dashboard/show/${show.tvmaze_id}`}
                      className="font-black tracking-tight text-zinc-100 hover:text-amber-500 transition-colors line-clamp-1 text-base"
                    >
                      {show.name}
                    </Link>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      {show.premiered?.slice(0, 4) ?? "?"} · {show.genres[0] || "Dizi"}
                    </p>
                  </div>

                  {isInMyList(show.tvmaze_id) ? (
                    <span className="text-xs font-semibold text-zinc-500 px-3">
                      LİSTEDE
                    </span>
                  ) : (
                    <button
                      onClick={() => handleAddShow(show)}
                      disabled={addingId === show.tvmaze_id}
                      className="px-3 py-1.5 rounded bg-amber-500/10 text-amber-500 hover:bg-amber-500 hover:text-zinc-950 text-xs font-bold transition-all disabled:opacity-50"
                    >
                      {addingId === show.tvmaze_id ? "+" : "+ EKLE"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* My Shows Section (Cinematic Editorial Redesign) */}
        <section>
          {/* Tabs */}
          <div className="border-b border-zinc-800 mb-4 flex gap-6">
            <button
              onClick={() => setActiveTab("watching")}
              className={`pb-3 text-sm font-bold tracking-wide transition-colors ${
                activeTab === "watching"
                  ? "border-b-2 border-amber-500 text-zinc-100"
                  : "border-b-2 border-transparent text-zinc-500 hover:text-zinc-300"
              }`}
            >
              İZLENİYOR <span className="ml-1 opacity-60">({myShows.filter(s => s.status === "watching").length})</span>
            </button>
            <button
              onClick={() => setActiveTab("completed")}
              className={`pb-3 text-sm font-bold tracking-wide transition-colors ${
                activeTab === "completed"
                  ? "border-b-2 border-amber-500 text-zinc-100"
                  : "border-b-2 border-transparent text-zinc-500 hover:text-zinc-300"
              }`}
            >
              TAMAMLANDI <span className="ml-1 opacity-60">({myShows.filter(s => s.status === "completed").length})</span>
            </button>
            <button
              onClick={() => setActiveTab("dropped")}
              className={`pb-3 text-sm font-bold tracking-wide transition-colors ${
                activeTab === "dropped"
                  ? "border-b-2 border-amber-500 text-zinc-100"
                  : "border-b-2 border-transparent text-zinc-500 hover:text-zinc-300"
              }`}
            >
              BIRAKILDI <span className="ml-1 opacity-60">({myShows.filter(s => s.status === "dropped").length})</span>
            </button>
          </div>

          {/* Search & Sort bar */}
          {myShows.filter(s => s.status === activeTab).length > 0 && (
            <div className="flex gap-2 mb-6">
              {/* Search */}
              <div className="relative flex-1 max-w-xs">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500 pointer-events-none"
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 111 11a6 6 0 0116 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Listende ara..."
                  value={listSearch}
                  onChange={(e) => setListSearch(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 text-zinc-100 placeholder:text-zinc-600 rounded-lg pl-8 pr-3 py-2 text-xs focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-all"
                />
                {listSearch && (
                  <button
                    type="button"
                    onClick={() => setListSearch("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>

              {/* Sort */}
              <div className="relative">
                <select
                  value={listSort}
                  onChange={(e) => setListSort(e.target.value as "recent" | "alpha" | "progress")}
                  className="appearance-none bg-zinc-900 border border-zinc-800 text-zinc-400 rounded-lg pl-3 pr-7 py-2 text-xs focus:outline-none focus:border-amber-500/50 transition-all cursor-pointer hover:border-zinc-700"
                >
                  <option value="recent">Son eklenen</option>
                  <option value="alpha">İsme göre (A-Z)</option>
                  <option value="progress">İlerlemeye göre</option>
                </select>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-zinc-500 pointer-events-none"
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          )}

          {/* Compute filtered + sorted list */}
          {(() => {
            const tabShows = myShows.filter(s => s.status === activeTab);
            const filteredShows = tabShows
              .filter(s => s.show.name.toLowerCase().includes(debouncedSearch.toLowerCase()))
              .sort((a, b) => {
                if (listSort === "alpha") return a.show.name.localeCompare(b.show.name, "tr");
                if (listSort === "progress") {
                  const aTotal = a.episodes.length || 1;
                  const bTotal = b.episodes.length || 1;
                  // Count watched for a and b from their episodes (approximate via nextEpisode index)
                  const aWatched = a.nextEpisode
                    ? a.episodes.findIndex(e => e.season === a.nextEpisode!.season && e.number === a.nextEpisode!.number)
                    : a.isCompleted ? aTotal : 0;
                  const bWatched = b.nextEpisode
                    ? b.episodes.findIndex(e => e.season === b.nextEpisode!.season && e.number === b.nextEpisode!.number)
                    : b.isCompleted ? bTotal : 0;
                  return (bWatched / bTotal) - (aWatched / aTotal);
                }
                return b.lastInteractionDate - a.lastInteractionDate;
              });

            if (tabShows.length === 0) {
              return (
                <div className="py-12 text-zinc-500 text-sm">
                  Bu sekmede henüz dizi bulunmuyor.
                </div>
              );
            }

            if (filteredShows.length === 0) {
              return (
                <div className="py-12">
                  <p className="text-zinc-500 text-sm">
                    <span className="text-zinc-300 font-semibold">&ldquo;{debouncedSearch}&rdquo;</span> ile eşleşen dizi bulunamadı.
                  </p>
                  <button
                    type="button"
                    onClick={() => setListSearch("")}
                    className="mt-3 text-xs text-amber-500 hover:text-amber-400 transition-colors"
                  >
                    Aramayı temizle
                  </button>
                </div>
              );
            }

            return (
            <div className="grid gap-6">
              {filteredShows.map((item) => (
                <div
                  key={item.id}
                  className="group flex gap-4 sm:gap-6 items-center bg-zinc-900/40 border border-zinc-800/80 p-3 sm:p-4 rounded-xl hover:border-zinc-700 transition-colors relative"
                >
                  {/* Poster (Larger 2:3 ratio) */}
                  <Link
                    href={`/dashboard/show/${item.show.tvmaze_id}`}
                    className="w-24 h-36 sm:w-32 sm:h-48 flex-shrink-0 relative overflow-hidden rounded-md bg-zinc-800 border border-zinc-700/50 block"
                  >
                    {item.show.image_url ? (
                      <img
                        src={item.show.image_url}
                        alt={item.show.name}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[10px] text-zinc-500">
                        YOK
                      </div>
                    )}
                  </Link>
                  
                  {/* Info */}
                  <div className="flex-1 min-w-0 py-2 flex flex-col justify-center">
                    {/* Show name with optional rating badge */}
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <Link
                        href={`/dashboard/show/${item.show.tvmaze_id}`}
                        className="font-black text-2xl sm:text-3xl tracking-tighter text-zinc-100 hover:text-amber-500 transition-colors truncate"
                      >
                        {item.show.name}
                      </Link>
                      {item.rating && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-500 text-xs font-black shrink-0">
                          ★ {item.rating}/10
                        </span>
                      )}
                    </div>
                    
                    {(item.status === "completed" || item.status === "dropped") && (
                      <div className="mt-3 space-y-3">
                        {/* Rating 1-10 */}
                        <div>
                          <p className="text-xs font-bold tracking-wider text-zinc-600 uppercase mb-1.5">Puan</p>
                          <div className="flex flex-wrap gap-1">
                            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                              <button
                                key={n}
                                type="button"
                                onClick={() => handleRating(item.id, n)}
                                className={`w-7 h-7 rounded text-xs font-bold transition-all ${
                                  item.rating === n
                                    ? "bg-amber-500 text-zinc-950"
                                    : "border border-zinc-700 text-zinc-500 hover:border-amber-500 hover:text-amber-500"
                                }`}
                              >
                                {n}
                              </button>
                            ))}
                            {item.rating && (
                              <button
                                type="button"
                                onClick={() => handleRating(item.id, 0)}
                                title="Puanı kaldır"
                                className="w-7 h-7 rounded text-xs border border-zinc-800 text-zinc-700 hover:border-rose-500 hover:text-rose-500 transition-all"
                              >
                                ×
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Personal note */}
                        <div>
                          <p className="text-xs font-bold tracking-wider text-zinc-600 uppercase mb-1.5">Not</p>
                          <textarea
                            rows={2}
                            placeholder="Kişisel notun..."
                            value={pendingNotes[item.id] ?? (item.personal_note || "")}
                            onChange={(e) =>
                              setPendingNotes((prev) => ({ ...prev, [item.id]: e.target.value }))
                            }
                            className="w-full bg-zinc-900 border border-zinc-800 text-zinc-300 placeholder:text-zinc-700 rounded px-3 py-2 text-xs resize-none focus:outline-none focus:border-amber-500/50 transition-all"
                          />
                          {(pendingNotes[item.id] !== undefined
                            ? pendingNotes[item.id] !== (item.personal_note || "")
                            : false) && (
                            <button
                              type="button"
                              onClick={() => handleSaveNote(item.id)}
                              disabled={savingNote === item.id}
                              className="mt-1.5 text-xs font-bold text-amber-500 hover:text-amber-400 transition-colors disabled:opacity-50"
                            >
                              {savingNote === item.id ? "Kaydediliyor..." : "Kaydet"}
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Watching tab: next episode info */}
                    {item.status === "watching" && (
                      item.nextEpisode ? (
                        <div className="mt-2 min-w-0">
                          <p className="text-zinc-300 font-medium text-sm sm:text-base truncate">
                            <span className="text-zinc-500 font-bold text-xs uppercase tracking-wider mr-2">Sıradaki</span>
                            S{item.nextEpisode.season} E{item.nextEpisode.number} - {item.nextEpisode.name}
                          </p>
                          {item.nextEpisode.airdate && (
                            <p className="text-xs text-zinc-500 mt-1 font-medium truncate">
                              {new Date(item.nextEpisode.airdate).toLocaleDateString('tr-TR')}
                            </p>
                          )}
                        </div>
                      ) : (
                        <p className="text-zinc-600 text-sm mt-2">Bölüm verisi yok</p>
                      )
                    )}
                  </div>

                  {/* Checkmark Action */}
                  <div className="flex flex-col items-center gap-2 pr-1 sm:pr-2 relative z-20 shrink-0">
                    {!item.isCompleted && item.nextEpisode && (
                      <button
                        type="button"
                        onClick={() => handleMarkNextEpisode(item.show.id, item.nextEpisode!)}
                        disabled={markingEpisode === `${item.show.id}-${item.nextEpisode.season}-${item.nextEpisode.number}`}
                        className="w-12 h-12 sm:w-14 sm:h-14 rounded-full border-2 border-zinc-700 text-zinc-700 flex items-center justify-center hover:border-amber-500 hover:text-amber-500 hover:bg-amber-500/10 transition-all duration-200 active:scale-95 disabled:opacity-50 cursor-pointer shrink-0"
                        title="İzlendi olarak işaretle"
                      >
                        {markingEpisode === `${item.show.id}-${item.nextEpisode.season}-${item.nextEpisode.number}` ? (
                           <div className="w-5 h-5 sm:w-6 sm:h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin pointer-events-none" />
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 sm:h-6 sm:w-6 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </button>
                    )}

                    {/* Settings Menu */}
                    <div className="relative group/menu">
                      <button 
                        onClick={(e) => e.preventDefault()} 
                        className="w-12 h-12 flex items-center justify-center text-zinc-600 hover:text-zinc-300 transition-colors rounded-full cursor-pointer"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                        </svg>
                      </button>
                      <div className="absolute right-0 top-full mt-1 w-40 bg-zinc-900 border border-zinc-800 rounded shadow-xl opacity-0 invisible group-hover/menu:opacity-100 group-hover/menu:visible transition-all z-20">
                        <button
                          onClick={(e) => { e.preventDefault(); handleRemoveShow(item.id); }}
                          className="w-full text-left px-4 py-3 sm:py-2 text-xs font-bold tracking-wide text-rose-500 hover:bg-zinc-800 transition-colors cursor-pointer"
                        >
                          LİSTEDEN KALDIR
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            );
          })()}
        </section>
      </main>
    </div>
  );
}
