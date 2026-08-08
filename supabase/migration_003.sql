-- ============================================
-- Migration 003: watched_episodes'a runtime ekle
-- Supabase SQL Editor'e yapıştırıp çalıştırın
-- ============================================

alter table public.watched_episodes
  add column if not exists runtime_minutes integer;
