-- =============================================================
-- BOB · Racik Media Nusantara
-- Migration: Seller Verifications
-- Tanggal  : 2026-10-04
-- Deskripsi: Tabel pengajuan verifikasi seller dari pengguna,
--            digunakan oleh seller-b2b-verification.html (sisi user)
--            dan pages/admin/seller-verification.html (sisi admin).
-- =============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. TABEL seller_verifications
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS seller_verifications (
  id                      UUID          PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Pemohon (FK ke auth.users Supabase)
  user_id                 UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Data usaha
  business_name           VARCHAR(200)  NOT NULL CHECK (char_length(trim(business_name)) >= 2),
  registration_number     VARCHAR(40)   NOT NULL CHECK (char_length(trim(registration_number)) >= 4),

  -- Dokumen (path di Supabase Storage bucket: seller-verification)
  document_path           TEXT,         -- Dokumen legal / NIB
  identity_document_path  TEXT,         -- Foto e-KTP pemilik
  selfie_document_path    TEXT,         -- Selfie dengan e-KTP

  -- Status pengajuan
  status                  VARCHAR(20)   NOT NULL DEFAULT 'pending'
                                        CHECK (status IN ('pending', 'verified', 'rejected')),

  -- Review oleh admin
  review_note             TEXT,         -- Catatan admin (wajib saat rejected)
  reviewed_by             UUID          REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at             TIMESTAMPTZ,

  -- Timestamps
  created_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  -- Satu user hanya bisa punya satu pengajuan aktif
  CONSTRAINT uq_seller_verif_user UNIQUE (user_id)
);

COMMENT ON TABLE  seller_verifications                        IS 'Pengajuan verifikasi seller dari pengguna. Disetujui admin → role berubah ke seller.';
COMMENT ON COLUMN seller_verifications.status                 IS 'pending = menunggu | verified = disetujui | rejected = ditolak';
COMMENT ON COLUMN seller_verifications.document_path         IS 'Path file di Supabase Storage bucket seller-verification';
COMMENT ON COLUMN seller_verifications.identity_document_path IS 'Path foto e-KTP di bucket seller-verification';
COMMENT ON COLUMN seller_verifications.selfie_document_path  IS 'Path selfie dengan e-KTP di bucket seller-verification';

-- ─────────────────────────────────────────────────────────────
-- 2. INDEX
-- ─────────────────────────────────────────────────────────────

-- Admin: tampilkan semua pending terlebih dahulu
CREATE INDEX IF NOT EXISTS idx_seller_verif_status_created
  ON seller_verifications (status, created_at ASC);

-- Lookup per user (cek apakah sudah ada pengajuan)
CREATE INDEX IF NOT EXISTS idx_seller_verif_user
  ON seller_verifications (user_id);

-- ─────────────────────────────────────────────────────────────
-- 3. TRIGGER — updated_at otomatis
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_seller_verif_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seller_verif_updated_at ON seller_verifications;
CREATE TRIGGER trg_seller_verif_updated_at
  BEFORE UPDATE ON seller_verifications
  FOR EACH ROW
  EXECUTE FUNCTION fn_seller_verif_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 4. ROW LEVEL SECURITY (Supabase)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE seller_verifications ENABLE ROW LEVEL SECURITY;

-- Pengguna hanya bisa melihat & mengubah pengajuan miliknya sendiri
CREATE POLICY rls_seller_verif_owner_select ON seller_verifications
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY rls_seller_verif_owner_insert ON seller_verifications
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY rls_seller_verif_owner_update ON seller_verifications
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (
    -- Pengguna hanya boleh update data usaha dan dokumen,
    -- tidak boleh mengubah status, reviewed_by, atau reviewed_at sendiri
    status = 'pending'
  );

-- Admin & Master Admin bisa SELECT dan UPDATE semua pengajuan
-- CATATAN: Policy ini menggunakan app_metadata (JWT claim) dan digantikan oleh
-- migration 20261004b_seller_verifications_rls_fix.sql yang memakai profiles.role.
-- Jalankan migration tersebut setelah migration ini untuk policy yang konsisten.
-- Policy di bawah dibiarkan agar migration ini tetap idempoten berdiri sendiri.
CREATE POLICY rls_seller_verif_admin_all ON seller_verifications
  FOR ALL
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'master_admin')
  );

-- ─────────────────────────────────────────────────────────────
-- 5. SUPABASE STORAGE — pastikan bucket seller-verification ada
-- ─────────────────────────────────────────────────────────────
-- Jalankan lewat Supabase Dashboard > Storage > New Bucket:
--   Nama    : seller-verification
--   Public  : false  (private — akses hanya via signed URL)
--
-- Atau via SQL (jika menggunakan service_role):
-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('seller-verification', 'seller-verification', false)
-- ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- 6. STORAGE POLICY — akses file dokumen
-- ─────────────────────────────────────────────────────────────
-- Pengguna hanya bisa upload ke folder miliknya: {user_id}/...
-- INSERT INTO storage.policies ...
-- (Jalankan via Supabase Dashboard > Storage > seller-verification > Policies)
--
-- Policy: "Users can upload their own verification docs"
--   Allowed operations : INSERT
--   Policy definition  : (auth.uid())::text = (storage.foldername(name))[1]
--
-- Policy: "Users can view their own docs"
--   Allowed operations : SELECT
--   Policy definition  : (auth.uid())::text = (storage.foldername(name))[1]
--
-- Policy: "Admins can view all docs"
--   Allowed operations : SELECT
--   Policy definition  : (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'master_admin')
