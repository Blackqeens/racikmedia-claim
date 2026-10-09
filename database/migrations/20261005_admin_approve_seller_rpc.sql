-- =============================================================
-- BOB · Racik Media Nusantara
-- Migration: Admin Approve Seller — RPC + RLS Fix
-- Tanggal  : 2026-10-05
-- Deskripsi:
--   Masalah #2 — Trigger protect_profile_role memblokir perubahan
--   role dari browser karena auth.role() = 'authenticated', bukan
--   'service_role'. Admin tidak bisa mengubah role via .update().
--
--   Masalah #7 — Tidak ada RLS policy yang mengizinkan admin
--   meng-UPDATE row profiles milik user lain.
--
--   Solusi:
--   1. Tambah RLS policy profiles_admin_update_role agar admin
--      boleh UPDATE profiles milik siapapun.
--   2. Buat function admin_approve_seller_verification() dengan
--      SECURITY DEFINER → berjalan sebagai postgres, sehingga
--      trigger protect_profile_role mengizinkan perubahan role.
--   3. Admin panel memanggil rpc('admin_approve_seller_verification')
--      alih-alih .update('profiles') langsung.
-- =============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. RLS POLICY — admin boleh UPDATE profiles siapapun
--    (diperlukan agar policy tidak memblokir sebelum trigger)
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS profiles_admin_update_role ON public.profiles;

CREATE POLICY profiles_admin_update_role
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles admin_p
      WHERE admin_p.id = auth.uid()
        AND admin_p.role IN ('admin', 'master_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles admin_p
      WHERE admin_p.id = auth.uid()
        AND admin_p.role IN ('admin', 'master_admin')
    )
  );

-- ─────────────────────────────────────────────────────────────
-- 2. RPC FUNCTION — admin_approve_seller_verification()
--
--    SECURITY DEFINER: berjalan sebagai role pemilik fungsi
--    (postgres), sehingga trigger protect_profile_role melihat
--    current_user = 'postgres' dan mengizinkan perubahan role.
--
--    Fungsi ini:
--    a. Memvalidasi bahwa pemanggil adalah admin/master_admin
--    b. Memvalidasi bahwa target verification_id ada & pending
--    c. Mengupdate seller_verifications (status, review_note,
--       reviewed_by, reviewed_at)
--    d. Jika decision = 'verified': mengubah profiles.role
--       menjadi 'seller'
--    e. Mengembalikan status akhir pengajuan
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_approve_seller_verification(
  p_verification_id UUID,
  p_decision        TEXT,   -- 'verified' | 'rejected'
  p_review_note     TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin_id   UUID;
  v_admin_role TEXT;
  v_verif      RECORD;
  v_new_role   TEXT;
BEGIN
  -- ── a. Ambil ID & role pemanggil ──────────────────────────
  v_admin_id := auth.uid();
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Tidak terautentikasi.';
  END IF;

  SELECT role INTO v_admin_role
  FROM public.profiles
  WHERE id = v_admin_id;

  IF v_admin_role NOT IN ('admin', 'master_admin') THEN
    RAISE EXCEPTION 'Hanya admin yang dapat memproses pengajuan verifikasi.';
  END IF;

  -- ── b. Validasi decision ──────────────────────────────────
  IF p_decision NOT IN ('verified', 'rejected') THEN
    RAISE EXCEPTION 'Decision tidak valid. Gunakan "verified" atau "rejected".';
  END IF;

  IF p_decision = 'rejected' AND (p_review_note IS NULL OR trim(p_review_note) = '') THEN
    RAISE EXCEPTION 'Catatan wajib diisi saat menolak pengajuan.';
  END IF;

  -- ── c. Ambil & validasi data pengajuan ───────────────────
  SELECT * INTO v_verif
  FROM public.seller_verifications
  WHERE id = p_verification_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pengajuan verifikasi tidak ditemukan.';
  END IF;

  IF v_verif.status <> 'pending' THEN
    RAISE EXCEPTION 'Pengajuan ini sudah diproses sebelumnya (status: %).', v_verif.status;
  END IF;

  -- ── d. Update seller_verifications ───────────────────────
  UPDATE public.seller_verifications
  SET
    status      = p_decision,
    review_note = p_review_note,
    reviewed_by = v_admin_id,
    reviewed_at = now(),
    updated_at  = now()
  WHERE id = p_verification_id;

  -- ── e. Jika disetujui → ubah role ke seller ───────────────
  --      Berjalan sebagai SECURITY DEFINER (current_user = postgres)
  --      sehingga trigger protect_profile_role mengizinkan perubahan.
  IF p_decision = 'verified' THEN
    -- Jangan overwrite role yang sudah lebih tinggi (admin, master_admin)
    SELECT role INTO v_new_role
    FROM public.profiles
    WHERE id = v_verif.user_id;

    IF v_new_role NOT IN ('admin', 'master_admin', 'seller') THEN
      UPDATE public.profiles
      SET role = 'seller'
      WHERE id = v_verif.user_id;
    END IF;
  END IF;

  -- ── f. Kembalikan hasil ───────────────────────────────────
  RETURN jsonb_build_object(
    'ok',              true,
    'verification_id', p_verification_id,
    'decision',        p_decision,
    'user_id',         v_verif.user_id
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'ok',    false,
      'error', SQLERRM
    );
END;
$$;

-- Hanya peran authenticated yang boleh memanggil fungsi ini.
-- Validasi role admin tetap dilakukan di dalam fungsi.
REVOKE ALL ON FUNCTION public.admin_approve_seller_verification(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_approve_seller_verification(UUID, TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION public.admin_approve_seller_verification IS
  'Memproses keputusan verifikasi seller (verified/rejected) oleh admin. '
  'Menggunakan SECURITY DEFINER agar perubahan role melewati trigger protect_profile_role.';
