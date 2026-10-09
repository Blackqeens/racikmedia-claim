-- =============================================================
-- BOB · Racik Media Nusantara
-- FIX DARURAT — Jalankan ini di Supabase SQL Editor
-- Tanggal  : 2026-10-05c
--
-- Mengatasi DUA error yang terlihat di browser:
--
-- [Pengguna] "new row violates row-level security policy"
--   → seller_verifications belum mendapat GRANT INSERT
--     dan policy INSERT belum benar.
--
-- [Admin]  Tabel "Review Pengajuan Seller" kosong / memuat terus
--   → Dua sebab:
--     a. Policy admin ALL di seller_verifications belum aktif
--     b. RLS profiles hanya mengizinkan baca milik sendiri,
--        sehingga join `profiles:user_id(display_name, email)`
--        mengembalikan null untuk semua baris milik user lain.
--        Admin tidak bisa membaca profil pemohon.
--
-- Jalankan SELURUH script ini sekaligus (Ctrl+Enter di SQL Editor).
-- =============================================================


-- ═══════════════════════════════════════════════════════
-- BAGIAN 1 — seller_verifications: GRANT + RLS lengkap
-- ═══════════════════════════════════════════════════════

-- 1a. Pastikan RLS aktif
ALTER TABLE public.seller_verifications ENABLE ROW LEVEL SECURITY;

-- 1b. Hapus semua policy lama (idempoten)
DROP POLICY IF EXISTS rls_seller_verif_owner_select ON public.seller_verifications;
DROP POLICY IF EXISTS rls_seller_verif_owner_insert ON public.seller_verifications;
DROP POLICY IF EXISTS rls_seller_verif_owner_update ON public.seller_verifications;
DROP POLICY IF EXISTS rls_seller_verif_admin_all    ON public.seller_verifications;

-- 1c. User SELECT milik sendiri
CREATE POLICY rls_seller_verif_owner_select
  ON public.seller_verifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- 1d. User INSERT — ini yang menyebabkan error "violates RLS policy"
--     Sebelumnya GRANT INSERT belum diberikan ke authenticated
CREATE POLICY rls_seller_verif_owner_insert
  ON public.seller_verifications
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- 1e. User UPDATE pengajuan milik sendiri (hanya saat masih pending)
CREATE POLICY rls_seller_verif_owner_update
  ON public.seller_verifications
  FOR UPDATE TO authenticated
  USING  (user_id = auth.uid() AND status = 'pending')
  WITH CHECK (user_id = auth.uid());

-- 1f. Admin & Master Admin bisa SELECT + UPDATE semua data
--     Menggunakan profiles.role (bukan app_metadata JWT)
CREATE POLICY rls_seller_verif_admin_all
  ON public.seller_verifications
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE public.profiles.id = auth.uid()
        AND public.profiles.role IN ('admin', 'master_admin')
    )
  );

-- 1g. GRANT privilege — tanpa ini INSERT ditolak di level privilege
--     SEBELUM RLS sempat dievaluasi
GRANT SELECT, INSERT, UPDATE ON public.seller_verifications TO authenticated;


-- ═══════════════════════════════════════════════════════
-- BAGIAN 2 — profiles: izinkan admin membaca semua profil
--
-- Masalah: policy profiles_read_self hanya mengizinkan
-- SELECT baris milik sendiri (id = auth.uid()).
-- Query admin: .select('*, profiles:user_id(display_name, email)')
-- gagal membaca profil pemohon → tabel kosong / null.
-- ═══════════════════════════════════════════════════════

-- 2a. Hapus policy lama jika ada
DROP POLICY IF EXISTS profiles_admin_read_all  ON public.profiles;
DROP POLICY IF EXISTS profiles_admin_update_role ON public.profiles;

-- 2b. Admin & Master Admin bisa SELECT semua profil
--     (diperlukan untuk join di halaman review pengajuan seller)
CREATE POLICY profiles_admin_read_all
  ON public.profiles
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()   -- tetap bisa baca milik sendiri
    OR EXISTS (
      SELECT 1 FROM public.profiles admin_p
      WHERE admin_p.id = auth.uid()
        AND admin_p.role IN ('admin', 'master_admin')
    )
  );

-- 2c. Admin bisa UPDATE profiles (diperlukan untuk mengubah role ke seller)
--     Fungsi RPC admin_approve_seller_verification SECURITY DEFINER
--     butuh path ini agar RLS tidak memblokir sebelum trigger
CREATE POLICY profiles_admin_update_role
  ON public.profiles
  FOR UPDATE TO authenticated
  USING (
    id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles admin_p
      WHERE admin_p.id = auth.uid()
        AND admin_p.role IN ('admin', 'master_admin')
    )
  )
  WITH CHECK (
    id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles admin_p
      WHERE admin_p.id = auth.uid()
        AND admin_p.role IN ('admin', 'master_admin')
    )
  );

-- 2d. Hapus policy lama profiles_read_self dan profiles_update_self
--     karena sudah tercakup dalam policy baru di atas
DROP POLICY IF EXISTS profiles_read_self   ON public.profiles;
DROP POLICY IF EXISTS profiles_update_self ON public.profiles;

-- 2e. Buat ulang profiles_read_self dan profiles_update_self yang mencakup
--     akses mandiri (non-admin) agar user biasa tetap bisa baca/update miliknya
CREATE POLICY profiles_read_self
  ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

CREATE POLICY profiles_update_self
  ON public.profiles
  FOR UPDATE TO authenticated
  USING  (id = auth.uid())
  WITH CHECK (id = auth.uid());


-- ═══════════════════════════════════════════════════════
-- BAGIAN 3 — RPC admin_approve_seller_verification
--
-- Fungsi ini WAJIB ada agar tombol "Setujui" di admin
-- bisa mengubah role user menjadi seller.
-- SECURITY DEFINER = berjalan sebagai postgres, sehingga
-- trigger protect_profile_role mengizinkan perubahan role.
-- ═══════════════════════════════════════════════════════

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

  SELECT role INTO v_admin_role
  FROM public.profiles WHERE id = v_admin_id;

  IF v_admin_role NOT IN ('admin', 'master_admin') THEN
    RAISE EXCEPTION 'Hanya admin yang dapat memproses pengajuan verifikasi.';
  END IF;

  IF p_decision NOT IN ('verified', 'rejected') THEN
    RAISE EXCEPTION 'Decision tidak valid. Gunakan "verified" atau "rejected".';
  END IF;

  IF p_decision = 'rejected' AND (p_review_note IS NULL OR trim(p_review_note) = '') THEN
    RAISE EXCEPTION 'Catatan wajib diisi saat menolak pengajuan.';
  END IF;

  SELECT * INTO v_verif
  FROM public.seller_verifications WHERE id = p_verification_id;

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
    SELECT role INTO v_cur_role
    FROM public.profiles WHERE id = v_verif.user_id;

    IF v_cur_role NOT IN ('admin', 'master_admin', 'seller') THEN
      UPDATE public.profiles
      SET role = 'seller'
      WHERE id = v_verif.user_id;
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


-- ═══════════════════════════════════════════════════════
-- VERIFIKASI — jalankan query ini untuk cek hasilnya
-- ═══════════════════════════════════════════════════════
-- SELECT schemaname, tablename, policyname, cmd, qual
-- FROM pg_policies
-- WHERE tablename IN ('seller_verifications', 'profiles')
-- ORDER BY tablename, policyname;
