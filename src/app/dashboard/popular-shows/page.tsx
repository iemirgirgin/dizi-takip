"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getPopularShows, type TVmazeShowMapped } from "@/lib/tvmaze";

export default function PopularShowsPage() {
  const router = useRouter();
  const [shows, setShows] = useState<TVmazeShowMapped[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const observerTarget = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.replace("/");
    });
  }, [router]);

  const loadMore = useCallback(async () => {
    if (loading && page > 0) return;
    setLoading(true);
    try {
      const newShows = await getPopularShows(page);
      if (newShows.length === 0) {
        setHasMore(false);
      } else {
        setShows((prev) => {
          // Avoid duplicates
          const existingIds = new Set(prev.map(s => s.tvmaze_id));
          const uniqueNew = newShows.filter(s => !existingIds.has(s.tvmaze_id));
          return [...prev, ...uniqueNew];
        });
        setPage((p) => p + 1);
      }
    } catch (err) {
      console.error("Error loading popular shows:", err);
    }
    setLoading(false);
  }, [page, loading]);

  useEffect(() => {
    if (page === 0) {
      loadMore();
    }
  }, [page, loadMore]);

  // Infinite scroll observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading) {
          loadMore();
        }
      },
      { threshold: 1.0 }
    );

    if (observerTarget.current) {
      observer.observe(observerTarget.current);
    }

    return () => observer.disconnect();
  }, [hasMore, loading, loadMore]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans pb-16 selection:bg-amber-500/30 selection:text-white">
      <header className="border-b border-zinc-900 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <div className="w-8 h-8 rounded bg-amber-500 flex items-center justify-center text-zinc-950 font-black text-lg">D</div>
            <h1 className="text-xl font-black tracking-tighter text-zinc-100">DiziTakip</h1>
          </Link>
        </div>
      </header>

      <main className="p-4 sm:p-6 md:p-10 max-w-5xl mx-auto mt-4">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-3xl font-black tracking-tighter text-zinc-100 uppercase">En Popüler 250 Dizi</h2>
          <button onClick={() => router.back()} className="text-sm font-bold text-zinc-500 hover:text-amber-500 transition-colors">
            Geri Dön
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {shows.map((show) => (
            <Link key={show.tvmaze_id} href={`/dashboard/show/${show.tvmaze_id}`} className="group flex flex-col">
              <div className="w-full aspect-[2/3] bg-zinc-900 rounded overflow-hidden relative border border-zinc-800 group-hover:border-amber-500/50 transition-colors shadow-lg">
                {show.image_url ? (
                  <img src={show.image_url} alt={show.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs text-zinc-600">YOK</div>
                )}
              </div>
              <p className="mt-2 text-sm font-bold text-zinc-300 truncate group-hover:text-amber-500 transition-colors">{show.name}</p>
            </Link>
          ))}
        </div>

        {hasMore && (
          <div ref={observerTarget} className="py-12 flex justify-center">
            <div className="w-8 h-8 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
          </div>
        )}
      </main>
    </div>
  );
}
