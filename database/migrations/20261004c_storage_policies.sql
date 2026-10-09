-- =============================================================
-- BOB · Racik Media Nusantara
-- Migration: Storage Policies untuk bucket seller-verification
-- Tanggal  : 2026-10-04c
-- =============================================================

-- Hapus policy lama jika ada
DROP POLICY IF EXISTS "Users upload own docs"   ON storage.objects;
DROP POLICY IF EXISTS "Users view own docs"     ON storage.objects;
DROP POLICY IF EXISTS "Users delete own docs"   ON storage.objects;
DROP POLICY IF EXISTS "Admins view all docs"    ON storage.objects;

-- 1. User bisa UPLOAD file ke folder miliknya: {user_id}/...
CREATE POLICY "Users upload own docs"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'seller-verification' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- 2. User bisa LIHAT file miliknya sendiri
CREATE POLICY "Users view own docs"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'seller-verification' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- 3. User bisa HAPUS file miliknya (untuk cleanup jika upload gagal)
CREATE POLICY "Users delete own docs"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'seller-verification' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- 4. Admin & Master Admin bisa lihat SEMUA file dokumen
CREATE POLICY "Admins view all docs"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'seller-verification' AND
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'master_admin')
  )
);
