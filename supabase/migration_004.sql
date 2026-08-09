-- Migration 004: Add rating and personal_note to user_shows
-- Run this in Supabase SQL Editor

ALTER TABLE user_shows
  ADD COLUMN IF NOT EXISTS rating INTEGER
    CHECK (rating >= 1 AND rating <= 10),
  ADD COLUMN IF NOT EXISTS personal_note TEXT;
