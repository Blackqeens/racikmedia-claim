-- =============================================================
-- BOB · Racik Media Nusantara
-- FINAL FIX — Jalankan ini di Supabase SQL Editor
-- Tanggal  : 2026-10-05e
--
-- Script ini menggantikan SEMUA script sebelumnya.
-- Aman dijalankan berulang (idempoten).
--
-- Mengatasi:
--   1. "new row violates row-level security policy" → INSERT seller_verifications
--   2. "infinite recursion detected in policy for relation profiles"
--   3. Admin tidak bisa SELECT seller_verifications
-- =============================================================

-- ═══════════════════════════════════════════════════
-- STEP 1 — Helper function bebas rekursi
-- ═══════════════════════════════════════════════════
-- Fungsi ini membaca role dari profiles tanpa kena RLS
-- karena SECURITY DEFINER berjalan sebagai postgres.
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated, anon;


-- ═══════════════════════════════════════════════════
-- STEP 2 — Bersihkan SEMUA policy profiles
-- ═══════════════════════════════════════════════════
DROP POLICY IF EXISTS profiles_read_self         ON public.profiles;
DROP POLICY IF EXISTS profiles_update_self       ON public.profiles;
DROP POLICY IF EXISTS profiles_admin_read_all    ON public.profiles;
DROP POLICY IF EXISTS profiles_admin_update_role ON public.profiles;

-- User baca profil sendiri
CREATE POLICY profiles_read_self
  ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid());

-- User update profil sendiri
CREATE POLICY profiles_update_self
  ON public.profiles FOR UPDATE TO authenticated
  USING  (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Admin baca semua profil — pakai get_my_role(), BUKAN subquery ke profiles
CREATE POLICY profiles_admin_read_all
  ON public.profiles FOR SELECT TO authenticated
  USING (public.get_my_role() IN ('admin', 'master_admin'));

-- Admin update profil siapapun — untuk ubah role ke seller
CREATE POLICY profiles_admin_update_role
  ON public.profiles FOR UPDATE TO authenticated
  USING    (public.get_my_role() IN ('admin', 'master_admin'))
  WITH CHECK (public.get_my_role() IN ('admin', 'master_admin'));


-- ═══════════════════════════════════════════════════
-- STEP 3 — Bersihkan SEMUA policy seller_verifications
-- ═══════════════════════════════════════════════════
DROP POLICY IF EXISTS rls_seller_verif_owner_select ON public.seller_verifications;
DROP POLICY IF EXISTS rls_seller_verif_owner_insert ON public.seller_verifications;
DROP POLICY IF EXISTS rls_seller_verif_owner_update ON public.seller_verifications;
DROP POLICY IF EXISTS rls_seller_verif_admin_all    ON public.seller_verifications;

ALTER TABLE public.seller_verifications ENABLE ROW LEVEL SECURITY;

-- User SELECT milik sendiri
CREATE POLICY rls_seller_verif_owner_select
  ON public.seller_verifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- User INSERT — WITH CHECK memastikan user_id = dirinya sendiri
CREATE POLICY rls_seller_verif_owner_insert
  ON public.seller_verifications FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- User UPDATE hanya saat masih pending
CREATE POLICY rls_seller_verif_owner_update
  ON public.seller_verifications FOR UPDATE TO authenticated
  USING  (user_id = auth.uid() AND status = 'pending')
  WITH CHECK (user_id = auth.uid());

-- Admin SELECT + UPDATE semua — pakai get_my_role(), BUKAN subquery ke profiles
CREATE POLICY rls_seller_verif_admin_all
  ON public.seller_verifications FOR ALL TO authenticated
  USING (public.get_my_role() IN ('admin', 'master_admin'));

-- GRANT privilege — tanpa ini INSERT ditolak sebelum RLS dievaluasi
GRANT SELECT, INSERT, UPDATE ON public.seller_verifications TO authenticated;


-- ═══════════════════════════════════════════════════
-- STEP 4 — RPC approve seller (SECURITY DEFINER)
-- ═══════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.admin_approve_seller_verification(
  p_verification_id UUID,
  p_decision        TEXT,
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
  v_cur_role   TEXT;
BEGIN
  v_admin_id := auth.uid();
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Tidak terautentikasi.';
  END IF;

  SELECT role INTO v_admin_role FROM public.profiles WHERE id = v_admin_id;
  IF v_admin_role NOT IN ('admin', 'master_admin') THEN
    RAISE EXCEPTION 'Hanya admin yang dapat memproses pengajuan verifikasi.';
  END IF;

  IF p_decision NOT IN ('verified', 'rejected') THEN
    RAISE EXCEPTION 'Decision tidak valid. Gunakan "verified" atau "rejected".';
  END IF;

  IF p_decision = 'rejected' AND (p_review_note IS NULL OR trim(p_review_note) = '') THEN
    RAISE EXCEPTION 'Catatan wajib diisi saat menolak pengajuan.';
  END IF;

  SELECT * INTO v_verif FROM public.seller_verifications WHERE id = p_verification_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pengajuan verifikasi tidak ditemukan.';
  END IF;

  IF v_verif.status <> 'pending' THEN
    RAISE EXCEPTION 'Pengajuan ini sudah diproses (status: %).', v_verif.status;
  END IF;

  UPDATE public.seller_verifications
  SET status      = p_decision,
      review_note = p_review_note,
      reviewed_by = v_admin_id,
      reviewed_at = now(),
      updated_at  = now()
  WHERE id = p_verification_id;

  IF p_decision = 'verified' THEN
    SELECT role INTO v_cur_role FROM public.profiles WHERE id = v_verif.user_id;
    IF v_cur_role NOT IN ('admin', 'master_admin', 'seller') THEN
      UPDATE public.profiles SET role = 'seller' WHERE id = v_verif.user_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok',              true,
    'verification_id', p_verification_id,
    'decision',        p_decision,
    'user_id',         v_verif.user_id
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_approve_seller_verification(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_approve_seller_verification(UUID, TEXT, TEXT) TO authenticated;


-- ═══════════════════════════════════════════════════
-- STEP 5 — Verifikasi (uncomment dan jalankan terpisah)
-- ═══════════════════════════════════════════════════
-- SELECT tablename, policyname, cmd, roles
-- FROM pg_policies
-- WHERE tablename IN ('profiles', 'seller_verifications')
-- ORDER BY tablename, policyname;
