-- Duhok Guide Admin Panel - Final permissions
-- Run once in Supabase SQL Editor.

-- Shared admin-only progress tracking.
-- This is intentionally separate from public.places so it does not become
-- part of the tourism/place data consumed by the app.
CREATE TABLE IF NOT EXISTS public.admin_place_progress (
  place_id uuid PRIMARY KEY REFERENCES public.places(id) ON DELETE CASCADE,
  is_complete boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_place_progress ENABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.governorates,
  public.districts,
  public.subdistricts,
  public.places,
  public.place_images,
  public.place_ratings,
  public.user_favorites,
  public.admin_place_progress
TO service_role;

-- The progress table is admin-backend-only. Ordinary app/browser roles do not
-- receive direct access; the existing protected Edge Function is the only path.
REVOKE ALL ON TABLE public.admin_place_progress FROM anon, authenticated;

-- Keep ordinary visitors locked down; this script does NOT grant CRUD to anon.
NOTIFY pgrst, 'reload schema';
