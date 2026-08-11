-- Create movies table
CREATE TABLE IF NOT EXISTS public.movies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tmdb_id INTEGER NOT NULL UNIQUE,
    title TEXT NOT NULL,
    poster_path TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on movies
ALTER TABLE public.movies ENABLE ROW LEVEL SECURITY;

-- Allow read access to all authenticated users for movies
CREATE POLICY "Authenticated users can read movies"
    ON public.movies FOR SELECT
    TO authenticated
    USING (true);

-- Allow insert/update to movies for all authenticated users (since it's a shared catalog)
CREATE POLICY "Authenticated users can insert movies"
    ON public.movies FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- Create user_movies table for tracking
CREATE TABLE IF NOT EXISTS public.user_movies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    movie_id UUID NOT NULL REFERENCES public.movies(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('plan_to_watch', 'watched', 'dropped')),
    rating SMALLINT CHECK (rating >= 1 AND rating <= 10),
    personal_note TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, movie_id)
);

-- Enable RLS on user_movies
ALTER TABLE public.user_movies ENABLE ROW LEVEL SECURITY;

-- RLS for user_movies
CREATE POLICY "Users can manage their own movie list"
    ON public.user_movies FOR ALL
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Add movies to publications for realtime if needed
ALTER PUBLICATION supabase_realtime ADD TABLE user_movies;
