-- ============================================
-- Migration 002: TMDB → TVmaze geçişi
-- Supabase SQL Editor'e yapıştırıp çalıştırın
-- ============================================

-- shows tablosundaki kolon isimlerini güncelle
alter table public.shows rename column tmdb_id to tvmaze_id;
alter table public.shows rename column poster_path to image_url;
