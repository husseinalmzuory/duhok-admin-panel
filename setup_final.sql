-- Duhok Guide Admin Panel - Final permissions
-- Run once in Supabase SQL Editor.
GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.governorates,
  public.districts,
  public.subdistricts,
  public.places,
  public.place_images,
  public.place_ratings,
  public.user_favorites
TO service_role;

-- Keep ordinary visitors locked down; this script does NOT grant CRUD to anon.
NOTIFY pgrst, 'reload schema';
