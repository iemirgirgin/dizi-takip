export interface TMDBMovie {
  id: number | string;
  title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  release_date: string;
  overview: string;
  genre_ids?: number[];
  genres?: { id: number; name: string }[];
  runtime?: number;
  credits?: {
    cast: {
      id: number;
      name: string;
      character: string;
      profile_path: string | null;
    }[];
  };
}

const OMDB_API_KEY = "12df1022";
const BASE_URL = "https://www.omdbapi.com/";

// Parse IMDb ID (tt1234567) into a number (1234567) for database compatibility
function parseImdbId(imdbID: string): number {
  return parseInt(imdbID.replace("tt", ""), 10) || 0;
}

export async function getPopularMovies(page: number = 1): Promise<TMDBMovie[]> {
  // OMDb doesn't have a "popular" endpoint. We'll search for "movie" and return results.
  // To avoid pagination limits and give variety, we could search different generic terms,
  // but for simplicity we'll just search "movie" or "batman" etc.
  const query = "star"; // Gives a good mix of popular movies
  const res = await fetch(`${BASE_URL}?apikey=${OMDB_API_KEY}&s=${query}&type=movie&page=${page}`);
  if (!res.ok) throw new Error(`OMDB API error: ${res.status}`);
  const data = await res.json();
  if (data.Response === "False") return [];
  
  return data.Search.map((m: any) => ({
    id: parseImdbId(m.imdbID),
    title: m.Title,
    poster_path: m.Poster === "N/A" ? null : m.Poster,
    release_date: m.Year,
    vote_average: 0,
    overview: "",
  }));
}

export async function getMovieDetails(id: number): Promise<TMDBMovie | null> {
  const imdbId = `tt${id.toString().padStart(7, '0')}`;
  const res = await fetch(`${BASE_URL}?apikey=${OMDB_API_KEY}&i=${imdbId}&plot=full`);
  if (!res.ok) throw new Error(`OMDB API error: ${res.status}`);
  const data = await res.json();
  if (data.Response === "False") return null;

  return {
    id: id,
    title: data.Title,
    poster_path: data.Poster === "N/A" ? null : data.Poster,
    backdrop_path: data.Poster === "N/A" ? null : data.Poster,
    vote_average: parseFloat(data.imdbRating) || 0,
    release_date: data.Year,
    overview: data.Plot === "N/A" ? "Özet bulunamadı." : data.Plot,
    runtime: parseInt(data.Runtime) || 0,
    genres: data.Genre ? data.Genre.split(", ").map((g: string, i: number) => ({ id: i, name: g })) : [],
    credits: {
      cast: data.Actors && data.Actors !== "N/A" 
        ? data.Actors.split(", ").map((actor: string, index: number) => ({
            id: index,
            name: actor,
            character: "",
            profile_path: null
          }))
        : []
    }
  };
}

export async function searchMovies(query: string): Promise<TMDBMovie[]> {
  if (!query.trim()) return [];
  const res = await fetch(`${BASE_URL}?apikey=${OMDB_API_KEY}&s=${encodeURIComponent(query)}&type=movie`);
  if (!res.ok) throw new Error(`OMDB API error: ${res.status}`);
  const data = await res.json();
  if (data.Response === "False") return [];

  return data.Search.map((m: any) => ({
    id: parseImdbId(m.imdbID),
    title: m.Title,
    poster_path: m.Poster === "N/A" ? null : m.Poster,
    release_date: m.Year,
    vote_average: 0,
    overview: "",
  }));
}
