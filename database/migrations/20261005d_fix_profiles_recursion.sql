-- =============================================================
-- BOB · Racik Media Nusantara
-- FIX KRITIS — infinite recursion on profiles RLS
-- Tanggal  : 2026-10-05d
--
-- Error: "infinite recursion detected in policy for relation profiles"
--
-- Penyebab:
--   Policy profiles_admin_read_all memakai subquery
--   EXISTS (SELECT 1 FROM public.profiles WHERE ...)
--   Ketika Postgres mengevaluasi policy ini untuk tabel profiles,
--   dia memanggil policy yang sama lagi → infinite loop.
--
-- Solusi:
--   Gunakan auth.jwt() ->> 'role' atau subquery ke tabel LAIN
--   untuk cek role admin — BUKAN dari tabel profiles itu sendiri.
--   Cara paling aman di Supabase: pakai security definer function
--   yang mengecek role tanpa terkena RLS.
-- =============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. Buat helper function — cek role tanpa kena RLS
--    SECURITY DEFINER + search_path kosong = berjalan sebagai
--    postgres, tidak dievaluasi oleh RLS profiles
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- 2. Hapus semua policy profiles yang menyebabkan rekursi
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS profiles_admin_read_all   ON public.profiles;
DROP POLICY IF EXISTS profiles_admin_update_role ON public.profiles;
DROP POLICY IF EXISTS profiles_read_self        ON public.profiles;
DROP POLICY IF EXISTS profiles_update_self      ON public.profiles;

-- ─────────────────────────────────────────────────────────────
-- 3. Buat ulang semua policy — pakai get_my_role() bukan
--    subquery ke profiles
-- ─────────────────────────────────────────────────────────────

-- User biasa baca profil sendiri
CREATE POLICY profiles_read_self
  ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

-- User biasa update profil sendiri
CREATE POLICY profiles_update_self
  ON public.profiles
  FOR UPDATE TO authenticated
  USING  (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Admin bisa baca SEMUA profil (pakai get_my_role() — tidak rekursi)
CREATE POLICY profiles_admin_read_all
  ON public.profiles
  FOR SELECT TO authenticated
  USING (
    public.get_my_role() IN ('admin', 'master_admin')
  );

-- Admin bisa update profil siapapun (untuk ubah role ke seller)
CREATE POLICY profiles_admin_update_role
  ON public.profiles
  FOR UPDATE TO authenticated
  USING (
    public.get_my_role() IN ('admin', 'master_admin')
  )
  WITH CHECK (
    public.get_my_role() IN ('admin', 'master_admin')
  );

-- ─────────────────────────────────────────────────────────────
-- 4. Perbaiki juga policy seller_verifications yang sama kasusnya
--    (EXISTS subquery ke profiles → juga bisa rekursi)
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS rls_seller_verif_admin_all ON public.seller_verifications;

CREATE POLICY rls_seller_verif_admin_all
  ON public.seller_verifications
  FOR ALL TO authenticated
  USING (
    public.get_my_role() IN ('admin', 'master_admin')
  );

-- ─────────────────────────────────────────────────────────────
-- 5. Verifikasi — jalankan ini untuk cek hasilnya
-- ─────────────────────────────────────────────────────────────
-- SELECT tablename, policyname, cmd
-- FROM pg_policies
-- WHERE tablename IN ('profiles', 'seller_verifications')
-- ORDER BY tablename, policyname;
