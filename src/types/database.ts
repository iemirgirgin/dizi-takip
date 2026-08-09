export type ShowStatus = "watching" | "completed" | "dropped";

export interface Profile {
  id: string;
  display_name: string | null;
  created_at: string;
}


export interface Show {
  id: string;
  tvmaze_id: number;
  name: string;
  image_url: string | null;
  created_at: string;
}

export interface UserShow {
  id: string;
  user_id: string;
  show_id: string;
  status: ShowStatus;
  rating: number | null;
  personal_note: string | null;
  created_at: string;
  // joined from shows table
  show?: Show;
}

export interface WatchedEpisode {
  id: string;
  user_id: string;
  show_id: string;
  season_number: number;
  episode_number: number;
  watched_at: string;
}

/** TVmaze API raw search result shape */
export interface TVmazeSearchResult {
  score: number;
  show: {
    id: number;
    name: string;
    image: { medium: string; original: string } | null;
    summary: string | null;
    genres: string[];
    premiered: string | null;
    status: string;
    rating: { average: number | null };
  };
}
