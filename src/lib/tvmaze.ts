import type { TVmazeSearchResult } from "@/types/database";

const BASE_URL = "https://api.tvmaze.com";

export interface TVmazeShowMapped {
  tvmaze_id: number;
  name: string;
  image_url: string | null;
  summary: string | null;
  genres: string[];
  premiered: string | null;
  status: string;
  rating: number | null;
}

export interface TVmazeEpisode {
  id: number;
  name: string;
  season: number;
  number: number;
  airdate: string | null;
  runtime: number | null;
  rating: { average: number | null };
  image: { medium: string; original: string } | null;
  summary: string | null;
}

/**
 * Search shows on TVmaze and map results to our app's format.
 */
export async function searchShows(query: string): Promise<TVmazeShowMapped[]> {
  if (!query.trim()) return [];

  const res = await fetch(
    `${BASE_URL}/search/shows?q=${encodeURIComponent(query)}`
  );

  if (!res.ok) {
    throw new Error(`TVmaze API error: ${res.status}`);
  }

  const data: TVmazeSearchResult[] = await res.json();

  return data.map((item) => ({
    tvmaze_id: item.show.id,
    name: item.show.name,
    image_url: item.show.image?.medium ?? null,
    summary: item.show.summary,
    genres: item.show.genres,
    premiered: item.show.premiered,
    status: item.show.status,
    rating: item.show.rating.average,
  }));
}

/**
 * Get all episodes for a show, grouped by season.
 */
export async function getShowEpisodes(
  tvmazeId: number
): Promise<Map<number, TVmazeEpisode[]>> {
  const res = await fetch(`${BASE_URL}/shows/${tvmazeId}/episodes`);

  if (!res.ok) {
    throw new Error(`TVmaze API error: ${res.status}`);
  }

  const episodes: TVmazeEpisode[] = await res.json();

  const grouped = new Map<number, TVmazeEpisode[]>();
  for (const ep of episodes) {
    const season = ep.season;
    if (!grouped.has(season)) {
      grouped.set(season, []);
    }
    grouped.get(season)!.push(ep);
  }

  return grouped;
}

/**
 * Get all episodes for a show as a flat array.
 */
export async function getShowEpisodesFlat(
  tvmazeId: number
): Promise<TVmazeEpisode[]> {
  const res = await fetch(`${BASE_URL}/shows/${tvmazeId}/episodes`);

  if (!res.ok) {
    throw new Error(`TVmaze API error: ${res.status}`);
  }

  return await res.json();
}

/**
 * Get show details from TVmaze.
 */
export async function getShowDetails(
  tvmazeId: number
): Promise<TVmazeShowMapped> {
  const res = await fetch(`${BASE_URL}/shows/${tvmazeId}`);

  if (!res.ok) {
    throw new Error(`TVmaze API error: ${res.status}`);
  }

  const show = await res.json();

  return {
    tvmaze_id: show.id,
    name: show.name,
    image_url: show.image?.medium ?? null,
    summary: show.summary,
    genres: show.genres ?? [],
    premiered: show.premiered,
    status: show.status,
    rating: show.rating?.average ?? null,
  };
}

/**
 * Get popular shows (paginated) from TVmaze.
 * TVmaze /shows endpoint returns all shows sorted by ID. To get "popular",
 * we typically fetch a page and sort by rating/weight, or just use the default.
 */
export async function getPopularShows(page: number = 0): Promise<TVmazeShowMapped[]> {
  const res = await fetch(`${BASE_URL}/shows?page=${page}`);
  if (!res.ok) {
    if (res.status === 404) return []; // End of pages
    throw new Error(`TVmaze API error: ${res.status}`);
  }
  const shows: any[] = await res.json();
  
  // Sort by rating or weight to simulate "popular" (since /shows returns sequentially)
  shows.sort((a, b) => {
    const scoreA = (a.weight || 0) + (a.rating?.average || 0) * 10;
    const scoreB = (b.weight || 0) + (b.rating?.average || 0) * 10;
    return scoreB - scoreA;
  });

  return shows.map(show => ({
    tvmaze_id: show.id,
    name: show.name,
    image_url: show.image?.medium ?? null,
    summary: show.summary,
    genres: show.genres ?? [],
    premiered: show.premiered,
    status: show.status,
    rating: show.rating?.average ?? null,
  }));
}
