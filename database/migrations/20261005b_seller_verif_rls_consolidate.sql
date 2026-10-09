-- =============================================================
-- BOB · Racik Media Nusantara
-- Migration: Konsolidasi RLS seller_verifications + GRANT fix
-- Tanggal  : 2026-10-05b
-- Deskripsi:
--   Fix #5 — Inkonsistensi RLS antara migration awal (app_metadata)
--   dan migration 20261004b (profiles.role). Migration ini memastikan
--   satu sumber kebenaran: profiles.role digunakan di semua policy.
--
--   Fix #12 — Tabel seller_verifications tidak mendapat GRANT INSERT
--   ke role 'authenticated', menyebabkan INSERT ditolak di level
--   privilege sebelum RLS sempat dievaluasi.
--
--   Urutan eksekusi yang benar:
--     1. 20261004_seller_verifications.sql   (tabel + policy awal)
--     2. 20261004b_seller_verifications_rls_fix.sql (policy fix)
--     3. 20261004c_storage_policies.sql      (storage policies)
--     4. 20261005_admin_approve_seller_rpc.sql (RPC + profiles RLS)
--     5. Ini (konsolidasi final)
-- =============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. Hapus SEMUA policy lama untuk seller_verifications
--    (termasuk yang memakai app_metadata dari migration awal)
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS rls_seller_verif_owner_select ON public.seller_verifications;
DROP POLICY IF EXISTS rls_seller_verif_owner_insert ON public.seller_verifications;
DROP POLICY IF EXISTS rls_seller_verif_owner_update ON public.seller_verifications;
DROP POLICY IF EXISTS rls_seller_verif_admin_all    ON public.seller_verifications;

-- ─────────────────────────────────────────────────────────────
-- 2. Buat ulang semua policy — konsisten menggunakan profiles.role
-- ─────────────────────────────────────────────────────────────

-- User melihat pengajuan miliknya sendiri
CREATE POLICY rls_seller_verif_owner_select
  ON public.seller_verifications
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- User membuat pengajuan baru (user_id harus miliknya)
CREATE POLICY rls_seller_verif_owner_insert
  ON public.seller_verifications
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- User mengupdate pengajuan miliknya — hanya saat masih pending
-- Tidak boleh mengubah kolom status, reviewed_by, reviewed_at sendiri
CREATE POLICY rls_seller_verif_owner_update
  ON public.seller_verifications
  FOR UPDATE
  TO authenticated
  USING  (user_id = auth.uid() AND status = 'pending')
  WITH CHECK (user_id = auth.uid());

-- Admin & Master Admin bisa akses SEMUA data
-- Menggunakan profiles.role (bukan app_metadata — Fix #5)
CREATE POLICY rls_seller_verif_admin_all
  ON public.seller_verifications
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE public.profiles.id = auth.uid()
        AND public.profiles.role IN ('admin', 'master_admin')
    )
  );

-- ─────────────────────────────────────────────────────────────
-- 3. Pastikan RLS aktif
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.seller_verifications ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────
-- 4. Fix #12 — GRANT privilege ke authenticated
--    Tanpa ini INSERT ditolak di level privilege sebelum RLS
--    sempat dievaluasi, meskipun policy sudah benar.
-- ─────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE ON public.seller_verifications TO authenticated;

COMMENT ON TABLE public.seller_verifications IS
  'Pengajuan verifikasi seller dari pengguna. '
  'RLS: user hanya bisa akses miliknya, admin/master_admin bisa akses semua. '
  'Role diubah ke seller via RPC admin_approve_seller_verification (SECURITY DEFINER).';
