"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { getMovieDetails, type TMDBMovie } from "@/lib/tmdb";
import type { UserMovie, MovieStatus } from "@/types/database";

export default function MovieDetailPage() {
  const params = useParams();
  const router = useRouter();
  const tmdbId = Number(params.tmdbId);

  const [loading, setLoading] = useState(true);
  const [movie, setMovie] = useState<TMDBMovie | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [userMovie, setUserMovie] = useState<UserMovie | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

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

  // Fetch movie data and tracking status
  useEffect(() => {
    if (!tmdbId) return;
    async function fetchData() {
      try {
        const data = await getMovieDetails(tmdbId);
        setMovie(data);
        
        if (user && data) {
          // Check if movie is in our DB
          const { data: dbMovie } = await supabase
            .from("movies")
            .select("id")
            .eq("tmdb_id", tmdbId)
            .single();
            
          if (dbMovie) {
            // Check if user tracks this movie
            const { data: uMovie } = await supabase
              .from("user_movies")
              .select("*")
              .eq("user_id", user.id)
              .eq("movie_id", dbMovie.id)
              .single();
            if (uMovie) setUserMovie(uMovie as UserMovie);
          }
        }
      } catch (err) {
        console.error("Film detay/takip hatası:", err);
      }
      setLoading(false);
    }
    fetchData();
  }, [tmdbId, user]);

  const handleAddMovie = async () => {
    if (!user || !movie) return;
    setActionLoading(true);
    try {
      // 1. Ensure movie exists in our DB
      let movieId: string;
      const { data: existingMovie } = await supabase
        .from("movies")
        .select("id")
        .eq("tmdb_id", movie.id)
        .single();

      if (existingMovie) {
        movieId = existingMovie.id;
      } else {
        const { data: insertedMovie, error: insertError } = await supabase
          .from("movies")
          .insert({
            tmdb_id: movie.id,
            title: movie.title,
            poster_path: movie.poster_path,
          })
          .select("id")
          .single();
        if (insertError) throw insertError;
        movieId = insertedMovie.id;
      }

      // 2. Add to user_movies
      const { data: newUserMovie, error } = await supabase
        .from("user_movies")
        .insert({
          user_id: user.id,
          movie_id: movieId,
          status: "plan_to_watch",
        })
        .select("*")
        .single();

      if (error) throw error;
      setUserMovie(newUserMovie as UserMovie);
    } catch (err) {
      console.error("Film eklenemedi:", err);
      alert("Film eklenemedi.");
    }
    setActionLoading(false);
  };

  const handleUpdateStatus = async (status: MovieStatus) => {
    if (!userMovie) return;
    setActionLoading(true);
    try {
      const { error } = await supabase
        .from("user_movies")
        .update({ status })
        .eq("id", userMovie.id);
      if (error) throw error;
      setUserMovie({ ...userMovie, status });
    } catch (err) {
      console.error("Durum güncellenemedi:", err);
    }
    setActionLoading(false);
  };

  const handleRemoveMovie = async () => {
    if (!userMovie) return;
    const confirm = window.confirm("Bu filmi listenizden çıkarmak istediğinize emin misiniz?");
    if (!confirm) return;
    setActionLoading(true);
    try {
      const { error } = await supabase
        .from("user_movies")
        .delete()
        .eq("id", userMovie.id);
      if (error) throw error;
      setUserMovie(null);
    } catch (err) {
      console.error("Film silinemedi:", err);
    }
    setActionLoading(false);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-950 text-zinc-100">
        <div className="w-8 h-8 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin mb-4" />
      </div>
    );
  }

  if (!movie) {
    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-100 p-6 flex flex-col items-center justify-center">
        <div className="bg-zinc-900 border border-zinc-800 p-8 rounded-xl text-center max-w-md">
          <p className="text-lg font-bold text-zinc-300 mb-4">Film bulunamadı.</p>
          <button onClick={() => router.push("/dashboard")} className="inline-flex items-center gap-2 px-4 py-2 rounded text-zinc-950 bg-amber-500 hover:bg-amber-400 font-bold text-sm transition-all">
            Dashboard'a Dön
          </button>
        </div>
      </main>
    );
  }

  const genres = movie.genres?.map(g => g.name) || [];
  const cast = movie.credits?.cast?.slice(0, 6) || [];

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 p-4 sm:p-6 md:p-10 selection:bg-amber-500/30 selection:text-white font-sans">
      <div className="max-w-5xl mx-auto">
        {/* Back button */}
        <button onClick={() => router.back()} className="inline-flex items-center gap-2 text-zinc-500 hover:text-amber-500 text-sm font-bold tracking-wider uppercase mb-8 transition-colors group">
          <svg className="w-4 h-4 transition-transform duration-200 group-hover:-translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Geri Dön
        </button>

        {/* Movie header (Cinematic Style) */}
        <div className="bg-zinc-900/50 border border-zinc-800/80 rounded-xl p-5 sm:p-8 mb-10 relative overflow-hidden">
          {movie.backdrop_path && (
            <div className="absolute inset-0 opacity-10 pointer-events-none">
              <img src={`https://image.tmdb.org/t/p/w1280${movie.backdrop_path}`} alt="backdrop" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-zinc-900/50 to-transparent" />
            </div>
          )}

          <div className="flex flex-col md:flex-row gap-6 md:gap-10 relative z-10">
            {/* Movie image */}
            {movie.poster_path ? (
              <div className="relative group flex-shrink-0 self-center md:self-start w-40 h-60 sm:w-56 sm:h-84 overflow-hidden rounded bg-zinc-800 border border-zinc-700/50 shadow-xl">
                <img src={movie.poster_path?.startsWith("http") ? movie.poster_path : `https://image.tmdb.org/t/p/w500${movie.poster_path}`} alt={movie.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
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
                  {movie.title}
                </h1>

                {/* Meta info tags */}
                <div className="flex flex-wrap items-center gap-3 text-xs font-bold tracking-wide text-zinc-500 mb-6 uppercase">
                  <span>{movie.release_date?.slice(0, 4) || "Bilinmiyor"}</span>
                  {genres.length > 0 && (
                    <>
                      <span>·</span>
                      <span className="text-amber-500/80">{genres.join(", ")}</span>
                    </>
                  )}
                  {movie.runtime && (
                    <>
                      <span>·</span>
                      <span>{movie.runtime} dk</span>
                    </>
                  )}
                  {movie.vote_average > 0 && (
                    <>
                      <span>·</span>
                      <span className="flex items-center gap-1 text-amber-500">
                        ★ {movie.vote_average.toFixed(1)}
                      </span>
                    </>
                  )}
                </div>

                {/* Summary */}
                {movie.overview && (
                  <p className="text-sm text-zinc-400 leading-relaxed mb-8 border-l-2 border-amber-500/50 pl-4">
                    {movie.overview}
                  </p>
                )}
              </div>
              
              {/* Tracking Actions */}
              <div className="mt-6 flex flex-wrap gap-3 items-center">
                {!userMovie ? (
                  <button
                    onClick={handleAddMovie}
                    disabled={actionLoading}
                    className="px-6 py-2.5 rounded-lg bg-amber-500 text-zinc-950 font-black hover:bg-amber-400 transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {actionLoading ? "Ekleniyor..." : "+ LİSTEYE EKLE"}
                  </button>
                ) : (
                  <>
                    <div className="flex bg-zinc-950/80 p-1 rounded-lg border border-zinc-800">
                      {(["plan_to_watch", "watched", "dropped"] as MovieStatus[]).map((status) => (
                        <button
                          key={status}
                          onClick={() => handleUpdateStatus(status)}
                          disabled={actionLoading}
                          className={`px-4 py-2 text-xs sm:text-sm font-bold rounded-md transition-colors ${
                            userMovie.status === status
                              ? "bg-zinc-800 text-zinc-100"
                              : "text-zinc-500 hover:text-zinc-300"
                          }`}
                        >
                          {status === "plan_to_watch" && "İzlenecek"}
                          {status === "watched" && "İzlendi"}
                          {status === "dropped" && "Bırakıldı"}
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={handleRemoveMovie}
                      disabled={actionLoading}
                      className="px-4 py-2.5 rounded-lg text-rose-500 text-sm font-bold hover:bg-rose-500/10 transition-colors disabled:opacity-50"
                    >
                      Kaldır
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Cast Section */}
        {cast.length > 0 && (
          <section className="mb-10">
            <h2 className="text-xl font-black tracking-tight text-zinc-100 uppercase mb-4">Oyuncular</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
              {cast.map((actor) => (
                <div key={actor.id} className="bg-zinc-900 border border-zinc-800 rounded overflow-hidden">
                  <div className="aspect-[2/3] bg-zinc-800 relative">
                    {actor.profile_path ? (
                      <img src={actor.profile_path?.startsWith("http") ? actor.profile_path : `https://image.tmdb.org/t/p/w185${actor.profile_path}`} alt={actor.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-zinc-600">YOK</div>
                    )}
                  </div>
                  <div className="p-2">
                    <p className="text-xs font-bold text-zinc-200 truncate">{actor.name}</p>
                    <p className="text-[10px] text-zinc-500 truncate">{actor.character}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
