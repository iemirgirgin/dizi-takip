-- ============================================
-- Dizi Takip Uygulaması — Veritabanı Migration
-- Supabase SQL Editor'e yapıştırıp çalıştırın
-- ============================================

-- 1. shows tablosu
create table if not exists public.shows (
  id uuid primary key default gen_random_uuid(),
  tmdb_id integer unique not null,
  name text not null,
  poster_path text,
  created_at timestamptz default now()
);

-- 2. user_shows tablosu
create table if not exists public.user_shows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  show_id uuid not null references public.shows(id) on delete cascade,
  status text not null check (status in ('watching', 'completed', 'dropped')),
  created_at timestamptz default now(),
  unique (user_id, show_id)
);

-- 3. watched_episodes tablosu
create table if not exists public.watched_episodes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  show_id uuid not null references public.shows(id) on delete cascade,
  season_number integer not null,
  episode_number integer not null,
  watched_at timestamptz default now()
);

-- ============================================
-- Row Level Security (RLS)
-- ============================================

-- shows: herkes okuyabilir, insert serbestçe yapılabilir
alter table public.shows enable row level security;

create policy "Shows herkes tarafından okunabilir"
  on public.shows for select
  using (true);

create policy "Shows herkes tarafından eklenebilir"
  on public.shows for insert
  with check (true);

-- user_shows: kullanıcı sadece kendi kayıtlarını yönetir
alter table public.user_shows enable row level security;

create policy "Kullanıcı kendi user_shows kayıtlarını okur"
  on public.user_shows for select
  using (auth.uid() = user_id);

create policy "Kullanıcı kendi user_shows kaydı ekler"
  on public.user_shows for insert
  with check (auth.uid() = user_id);

create policy "Kullanıcı kendi user_shows kaydını günceller"
  on public.user_shows for update
  using (auth.uid() = user_id);

create policy "Kullanıcı kendi user_shows kaydını siler"
  on public.user_shows for delete
  using (auth.uid() = user_id);

-- watched_episodes: kullanıcı sadece kendi kayıtlarını yönetir
alter table public.watched_episodes enable row level security;

create policy "Kullanıcı kendi watched_episodes kayıtlarını okur"
  on public.watched_episodes for select
  using (auth.uid() = user_id);

create policy "Kullanıcı kendi watched_episodes kaydı ekler"
  on public.watched_episodes for insert
  with check (auth.uid() = user_id);

create policy "Kullanıcı kendi watched_episodes kaydını siler"
  on public.watched_episodes for delete
  using (auth.uid() = user_id);

-- ============================================
-- İndeksler
-- ============================================

create index if not exists idx_user_shows_user_id on public.user_shows(user_id);
create index if not exists idx_user_shows_show_id on public.user_shows(show_id);
create index if not exists idx_watched_episodes_user_id on public.watched_episodes(user_id);
create index if not exists idx_watched_episodes_show_id on public.watched_episodes(show_id);
