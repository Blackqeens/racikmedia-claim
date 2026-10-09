-- =============================================================
-- BOB · Racik Media Nusantara
-- Migration: Fix RLS seller_verifications
-- Tanggal  : 2026-10-04b
-- Deskripsi: Perbaiki RLS agar user bisa INSERT & UPDATE
--            pengajuan verifikasi seller milik sendiri,
--            dan admin bisa SELECT + UPDATE semua data.
-- =============================================================

-- Hapus semua policy lama yang mungkin konflik
DROP POLICY IF EXISTS rls_seller_verif_owner_select ON seller_verifications;
DROP POLICY IF EXISTS rls_seller_verif_owner_insert ON seller_verifications;
DROP POLICY IF EXISTS rls_seller_verif_owner_update ON seller_verifications;
DROP POLICY IF EXISTS rls_seller_verif_admin_all    ON seller_verifications;

-- ── 1. User bisa SELECT pengajuan miliknya sendiri
CREATE POLICY rls_seller_verif_owner_select ON seller_verifications
  FOR SELECT
  USING (user_id = auth.uid());

-- ── 2. User bisa INSERT pengajuan baru (user_id harus sama dengan auth.uid())
CREATE POLICY rls_seller_verif_owner_insert ON seller_verifications
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- ── 3. User bisa UPDATE pengajuan miliknya (hanya saat status masih pending)
CREATE POLICY rls_seller_verif_owner_update ON seller_verifications
  FOR UPDATE
  USING (user_id = auth.uid() AND status = 'pending')
  WITH CHECK (user_id = auth.uid());

-- ── 4. Admin & Master Admin bisa akses SEMUA data
--      Menggunakan profiles.role karena Supabase tidak set app_metadata secara otomatis
CREATE POLICY rls_seller_verif_admin_all ON seller_verifications
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'master_admin')
    )
  );

-- ── 5. Pastikan RLS aktif
ALTER TABLE seller_verifications ENABLE ROW LEVEL SECURITY;
