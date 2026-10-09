-- =============================================================
-- BOB · Racik Media Nusantara
-- Database Schema — Internationalization (i18n) Module
-- Engine : PostgreSQL 15+  (MySQL 8+ compatible — lihat catatan)
-- Encoding: UTF-8
-- Bergantung pada: schema.sql (tabel articles & users harus sudah ada)
--
-- DOKUMEN INI MENCAKUP:
--   Skenario A — Manual Multi-Language: kolom terpisah per bahasa
--   Skenario B — AI Translation Cache: simpan hasil terjemahan AI
-- =============================================================


-- ──────────────────────────────────────────────────────────────
-- SKENARIO A — MANUAL MULTI-LANGUAGE
-- Desain: Tabel terpisah article_translations menyimpan konten
--         per bahasa. Artikel asli (bahasa penulis) tetap di
--         tabel articles. Terjemahan manual disimpan di sini.
--
-- KEPUTUSAN DESAIN:
--   ✅ Dipilih: Tabel terpisah (bukan kolom tambahan di articles)
--      Alasan:
--        1. Mudah menambah bahasa baru (tambah baris, bukan kolom)
--        2. articles tetap bersih — tidak membengkak
--        3. Query bahasa spesifik lebih cepat (index per lang_code)
--        4. Bisa dibuat partial: boleh ada bahasa ID tanpa EN dulu
-- ──────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────
-- A1. TABEL ARTICLE_TRANSLATIONS
--     Menyimpan versi terjemahan konten artikel per bahasa.
--     Setiap artikel bisa punya 0..N baris di tabel ini.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS article_translations (

  -- ── Identitas ──────────────────────────────────────────────
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),

  -- ── Relasi ke artikel asli ─────────────────────────────────
  article_id      UUID          NOT NULL
                                REFERENCES articles(id) ON DELETE CASCADE,
  -- Hapus semua terjemahan jika artikel dihapus

  -- ── Bahasa ─────────────────────────────────────────────────
  lang_code       VARCHAR(5)    NOT NULL,
  -- Kode bahasa standar BCP-47: 'id', 'en', 'zh', 'ar', 'ja', dst.
  -- Referensi: https://www.iana.org/assignments/language-subtag-registry

  -- ── Konten Terjemahan ──────────────────────────────────────
  title           VARCHAR(200)  NOT NULL
                                CHECK (char_length(trim(title)) >= 3),
  content         TEXT          NOT NULL
                                CHECK (trim(content) <> ''),
  excerpt         VARCHAR(500),                   -- Ringkasan dalam bahasa ini
  content_text    TEXT,                           -- Plain-text untuk FTS bahasa ini

  -- ── Sumber Terjemahan ──────────────────────────────────────
  -- 'manual'   → ditulis/diperiksa manusia (tertinggi kualitasnya)
  -- 'ai_cache' → hasil API AI (otomatis, mungkin butuh review)
  -- 'machine'  → terjemahan mesin lain (Google Translate, dst.)
  source          VARCHAR(20)   NOT NULL DEFAULT 'manual'
                                CHECK (source IN ('manual', 'ai_cache', 'machine')),

  -- ── Status Review ──────────────────────────────────────────
  -- 'pending'  → baru dibuat, belum divalidasi
  -- 'approved' → sudah divalidasi manusia, siap tayang
  -- 'rejected' → ada masalah, perlu diperbaiki
  review_status   VARCHAR(10)   NOT NULL DEFAULT 'pending'
                                CHECK (review_status IN ('pending', 'approved', 'rejected')),

  -- ── Siapa yang membuat / memvalidasi ───────────────────────
  created_by      UUID          REFERENCES users(id) ON DELETE SET NULL,
  reviewed_by     UUID          REFERENCES users(id) ON DELETE SET NULL,

  -- ── Metadata ───────────────────────────────────────────────
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  -- ── Constraints ────────────────────────────────────────────
  -- Satu artikel hanya boleh punya SATU terjemahan per bahasa
  CONSTRAINT uq_translation_article_lang
    UNIQUE (article_id, lang_code)

  -- Catatan MySQL:
  -- Ganti gen_random_uuid() dengan UUID()
  -- Ganti TIMESTAMPTZ dengan DATETIME DEFAULT CURRENT_TIMESTAMP
  -- Hapus bagian REFERENCES jika menggunakan MyISAM (tidak support FK)
);

COMMENT ON TABLE  article_translations               IS 'Terjemahan artikel per bahasa. Satu baris per artikel-bahasa.';
COMMENT ON COLUMN article_translations.lang_code     IS 'Kode bahasa BCP-47: id=Indonesia, en=English, zh=Mandarin, dst.';
COMMENT ON COLUMN article_translations.source        IS 'manual=ditulis manusia | ai_cache=hasil AI | machine=mesin lain';
COMMENT ON COLUMN article_translations.review_status IS 'pending=belum divalidasi | approved=siap tayang | rejected=ada masalah';


-- ─────────────────────────────────────────────────────────────
-- A2. INDEXES — optimasi query bahasa
-- ─────────────────────────────────────────────────────────────

-- Query utama: ambil terjemahan spesifik untuk halaman artikel
-- WHERE article_id = $1 AND lang_code = $2
CREATE INDEX idx_translations_article_lang
  ON article_translations (article_id, lang_code);

-- Query "daftar terjemahan yang sudah approved" untuk listing
-- WHERE review_status = 'approved' AND lang_code = $1
CREATE INDEX idx_translations_approved_lang
  ON article_translations (lang_code, review_status, article_id)
  WHERE review_status = 'approved';

-- Query admin: cari terjemahan yang masih pending review
CREATE INDEX idx_translations_pending
  ON article_translations (review_status, created_at)
  WHERE review_status = 'pending';


-- ─────────────────────────────────────────────────────────────
-- A3. TRIGGER — updated_at otomatis
-- ─────────────────────────────────────────────────────────────
-- Reuse fungsi fn_set_updated_at() dari schema.sql
CREATE TRIGGER trg_translations_updated_at
  BEFORE UPDATE ON article_translations
  FOR EACH ROW
  EXECUTE FUNCTION fn_set_updated_at();


-- ─────────────────────────────────────────────────────────────
-- A4. TRIGGER — isi content_text otomatis (strip HTML)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_translations_derive_fields()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  plain TEXT;
BEGIN
  -- Strip HTML tags sederhana (sama dengan artikel asli)
  plain := regexp_replace(NEW.content, '<[^>]+>', ' ', 'g');
  plain := regexp_replace(plain, '\s+', ' ', 'g');
  NEW.content_text := trim(plain);

  -- Buat excerpt otomatis jika tidak diisi
  IF NEW.excerpt IS NULL OR trim(NEW.excerpt) = '' THEN
    NEW.excerpt := left(trim(plain), 300);
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_translations_derive_fields
  BEFORE INSERT OR UPDATE OF content ON article_translations
  FOR EACH ROW
  EXECUTE FUNCTION fn_translations_derive_fields();


-- ─────────────────────────────────────────────────────────────
-- A5. VIEW — artikel dengan fallback bahasa
--     Jika terjemahan bahasa diminta belum ada,
--     VIEW ini mengembalikan konten bahasa asli (Bahasa Indonesia).
--
-- Gunakan fungsi ini di backend untuk "graceful degradation":
--   SELECT * FROM fn_article_with_lang('art-001', 'en');
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_article_with_lang(
  p_article_id  UUID,
  p_lang_code   VARCHAR(5) DEFAULT 'id'
)
RETURNS TABLE (
  id            UUID,
  title         TEXT,
  content       TEXT,
  excerpt       TEXT,
  category      TEXT,
  tags          TEXT[],
  cover_url     TEXT,
  word_count    INTEGER,
  published_at  TIMESTAMPTZ,
  author_name   TEXT,
  author_avatar TEXT,
  lang_served   VARCHAR(5),   -- bahasa yang BENAR-BENAR dikembalikan
  is_fallback   BOOLEAN       -- TRUE jika bahasa diminta tidak tersedia
)
LANGUAGE plpgsql AS $$
DECLARE
  v_trans article_translations%ROWTYPE;
BEGIN
  -- 1. Cari terjemahan dengan bahasa yang diminta (hanya approved)
  SELECT t.*
    INTO v_trans
    FROM article_translations t
   WHERE t.article_id  = p_article_id
     AND t.lang_code   = p_lang_code
     AND t.review_status = 'approved'
   LIMIT 1;

  -- 2. Jika ada → kembalikan konten terjemahan
  IF FOUND THEN
    RETURN QUERY
      SELECT
        a.id,
        v_trans.title::TEXT,
        v_trans.content::TEXT,
        v_trans.excerpt::TEXT,
        a.category::TEXT,
        a.tags,
        a.cover_url,
        a.word_count,
        a.published_at,
        u.name::TEXT,
        u.avatar_url::TEXT,
        p_lang_code,
        FALSE
      FROM articles a
      JOIN users    u ON u.id = a.user_id
     WHERE a.id = p_article_id
       AND a.status = 'published';

  -- 3. Jika tidak ada → fallback ke artikel asli bahasa 'id'
  ELSE
    RETURN QUERY
      SELECT
        a.id,
        a.title::TEXT,
        a.content::TEXT,
        a.excerpt::TEXT,
        a.category::TEXT,
        a.tags,
        a.cover_url,
        a.word_count,
        a.published_at,
        u.name::TEXT,
        u.avatar_url::TEXT,
        'id'::VARCHAR(5),
        TRUE
      FROM articles a
      JOIN users    u ON u.id = a.user_id
     WHERE a.id = p_article_id
       AND a.status = 'published';
  END IF;
END;
$$;

COMMENT ON FUNCTION fn_article_with_lang IS
  'Ambil artikel dalam bahasa diminta. Jika terjemahan tidak ada, '
  'fallback ke konten asli (Bahasa Indonesia). '
  'Kolom is_fallback=TRUE jika sedang menggunakan fallback.';


-- ──────────────────────────────────────────────────────────────
-- SKENARIO B — AI TRANSLATION CACHE
-- Desain: Tabel translation_cache menyimpan hasil terjemahan
--         dari AI API (Gemini, OpenAI, dst.) agar tidak perlu
--         memanggil API yang sama dua kali.
--
-- KEPUTUSAN DESAIN:
--   Tabel terpisah dari article_translations:
--     1. Cache AI bersifat sementara — boleh dihapus/regenerate
--     2. Cache AI perlu metadata khusus: model, token, biaya
--     3. Cache AI belum tentu approved — perlu review dulu
--     4. Setelah approved, dipromote ke article_translations
-- ──────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────
-- B1. TABEL TRANSLATION_CACHE
--     Cache hasil terjemahan AI sebelum diapprove manusia.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS translation_cache (

  -- ── Identitas ──────────────────────────────────────────────
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),

  -- ── Target ─────────────────────────────────────────────────
  article_id      UUID          NOT NULL
                                REFERENCES articles(id) ON DELETE CASCADE,
  lang_code       VARCHAR(5)    NOT NULL,

  -- ── Konten hasil terjemahan ────────────────────────────────
  title_translated    TEXT      NOT NULL,
  content_translated  TEXT      NOT NULL,
  excerpt_translated  TEXT,

  -- ── Metadata AI ────────────────────────────────────────────
  -- Catat model yang digunakan agar bisa dibandingkan kualitasnya
  ai_model        VARCHAR(80)   NOT NULL,
  -- Contoh: 'gemini-2.0-flash-lite', 'gpt-4o-mini', dst.

  -- Jumlah token yang dikonsumsi (untuk monitoring biaya)
  tokens_input    INTEGER,
  tokens_output   INTEGER,

  -- Hash konten asli saat terjemahan dibuat.
  -- Digunakan untuk deteksi "artikel asli sudah diupdate, cache kedaluwarsa".
  source_hash     VARCHAR(64)   NOT NULL,
  -- SHA-256 dari (title + excerpt + content) artikel asli saat terjemahan dibuat

  -- ── Status Cache ───────────────────────────────────────────
  -- 'fresh'    → baru dibuat, konten asli belum berubah
  -- 'stale'    → konten asli sudah diupdate, cache perlu diregenerasi
  -- 'promoted' → sudah dipromote ke article_translations (approved)
  -- 'failed'   → terjemahan gagal, simpan error message
  cache_status    VARCHAR(10)   NOT NULL DEFAULT 'fresh'
                                CHECK (cache_status IN ('fresh','stale','promoted','failed')),

  -- Error message jika terjemahan gagal
  error_message   TEXT,

  -- ── Metadata ───────────────────────────────────────────────
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  -- ── Constraint: satu cache per artikel-bahasa ──────────────
  CONSTRAINT uq_cache_article_lang
    UNIQUE (article_id, lang_code)
);

COMMENT ON TABLE  translation_cache                     IS 'Cache hasil terjemahan AI — sementara, belum divalidasi manusia.';
COMMENT ON COLUMN translation_cache.source_hash         IS 'SHA-256 konten asli saat terjemahan dibuat. Untuk deteksi cache kedaluwarsa.';
COMMENT ON COLUMN translation_cache.cache_status        IS 'fresh=valid | stale=konten asli berubah | promoted=sudah di article_translations | failed=error';
COMMENT ON COLUMN translation_cache.ai_model            IS 'Model AI yang digunakan. Contoh: gemini-2.0-flash-lite';


-- ─────────────────────────────────────────────────────────────
-- B2. INDEXES
-- ─────────────────────────────────────────────────────────────

-- Query utama: cek cache sebelum panggil API
-- WHERE article_id = $1 AND lang_code = $2 AND cache_status = 'fresh'
CREATE INDEX idx_cache_article_lang_status
  ON translation_cache (article_id, lang_code, cache_status);

-- Monitor biaya: berapa token yang sudah dipakai per model per bulan
CREATE INDEX idx_cache_model_created
  ON translation_cache (ai_model, created_at);


-- ─────────────────────────────────────────────────────────────
-- B3. TRIGGER — tandai cache sebagai 'stale' secara otomatis
--     ketika konten artikel asli diupdate.
--
-- Cara kerja: setiap kali articles.content, articles.title, atau excerpt
-- diupdate, semua cache untuk artikel itu menjadi 'stale'.
-- Backend harus regenerasi terjemahan saat diminta berikutnya.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_invalidate_translation_cache()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Excerpt ikut diinvalidasi karena terjemahannya juga disimpan di cache.
  IF NEW.title    IS DISTINCT FROM OLD.title
  OR NEW.content  IS DISTINCT FROM OLD.content
  OR NEW.excerpt  IS DISTINCT FROM OLD.excerpt
  THEN
    UPDATE translation_cache
       SET cache_status = 'stale',
           updated_at   = NOW()
     WHERE article_id   = NEW.id
       AND cache_status  = 'fresh';
    -- Hanya cache 'fresh' yang di-stale-kan; 'promoted' tidak disentuh
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_invalidate_cache_on_article_update
  AFTER UPDATE OF title, content, excerpt ON articles
  FOR EACH ROW
  EXECUTE FUNCTION fn_invalidate_translation_cache();

COMMENT ON FUNCTION fn_invalidate_translation_cache IS
  'Otomatis menandai translation_cache sebagai stale ketika konten '
  'artikel asli (title/excerpt/content) diupdate. Dipanggil oleh trigger.';


-- ─────────────────────────────────────────────────────────────
-- B4. TRIGGER — updated_at otomatis untuk translation_cache
-- ─────────────────────────────────────────────────────────────
CREATE TRIGGER trg_cache_updated_at
  BEFORE UPDATE ON translation_cache
  FOR EACH ROW
  EXECUTE FUNCTION fn_set_updated_at();


-- ─────────────────────────────────────────────────────────────
-- B5. VIEW — monitoring penggunaan & biaya AI
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_translation_cost_monitor AS
SELECT
  ai_model,
  lang_code,
  DATE_TRUNC('month', created_at)     AS month,
  COUNT(*)                            AS total_translations,
  SUM(tokens_input)                   AS total_tokens_input,
  SUM(tokens_output)                  AS total_tokens_output,
  SUM(tokens_input + tokens_output)   AS total_tokens,
  COUNT(*) FILTER (WHERE cache_status = 'fresh')    AS cache_fresh,
  COUNT(*) FILTER (WHERE cache_status = 'stale')    AS cache_stale,
  COUNT(*) FILTER (WHERE cache_status = 'promoted') AS cache_promoted,
  COUNT(*) FILTER (WHERE cache_status = 'failed')   AS cache_failed
FROM translation_cache
GROUP BY ai_model, lang_code, DATE_TRUNC('month', created_at)
ORDER BY month DESC, ai_model, lang_code;

COMMENT ON VIEW v_translation_cost_monitor IS
  'Dashboard monitoring biaya dan penggunaan AI translation per model per bulan.';


-- ─────────────────────────────────────────────────────────────
-- B6. FUNGSI HELPER — promote cache ke article_translations
--     Dipanggil setelah admin mengapprove terjemahan AI.
--     Akan membuat atau mengupdate baris di article_translations.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_promote_cache_to_translation(
  p_cache_id   UUID,
  p_admin_id   UUID
)
RETURNS UUID  -- Mengembalikan ID baris di article_translations
LANGUAGE plpgsql AS $$
DECLARE
  v_cache     translation_cache%ROWTYPE;
  v_trans_id  UUID;
BEGIN
  -- 1. Ambil data cache
  SELECT * INTO v_cache FROM translation_cache WHERE id = p_cache_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cache dengan id % tidak ditemukan', p_cache_id;
  END IF;

  -- 2. UPSERT ke article_translations
  INSERT INTO article_translations (
    article_id, lang_code, title, content, excerpt,
    source, review_status, created_by, reviewed_by
  )
  VALUES (
    v_cache.article_id,
    v_cache.lang_code,
    v_cache.title_translated,
    v_cache.content_translated,
    v_cache.excerpt_translated,
    'ai_cache',   -- tandai sebagai hasil AI
    'approved',   -- sudah diapprove admin
    NULL,         -- dibuat oleh sistem (AI)
    p_admin_id    -- diapprove oleh admin ini
  )
  ON CONFLICT (article_id, lang_code) DO UPDATE
    SET title         = EXCLUDED.title,
        content       = EXCLUDED.content,
        excerpt       = EXCLUDED.excerpt,
        source        = 'ai_cache',
        review_status = 'approved',
        reviewed_by   = p_admin_id,
        updated_at    = NOW()
  RETURNING id INTO v_trans_id;

  -- 3. Tandai cache sebagai 'promoted'
  UPDATE translation_cache
     SET cache_status = 'promoted',
         updated_at   = NOW()
   WHERE id = p_cache_id;

  RETURN v_trans_id;
END;
$$;

COMMENT ON FUNCTION fn_promote_cache_to_translation IS
  'Promote terjemahan AI dari translation_cache ke article_translations '
  'setelah diapprove admin. Mengembalikan ID baris di article_translations.';


-- ─────────────────────────────────────────────────────────────
-- RINGKASAN RELASI TABEL
-- ─────────────────────────────────────────────────────────────
--
--  articles (schema.sql)
--    │
--    ├── article_translations   [Skenario A]
--    │     article_id → articles.id (CASCADE DELETE)
--    │     lang_code: 'id' | 'en' | 'zh' | ...
--    │     source: 'manual' | 'ai_cache' | 'machine'
--    │     review_status: 'pending' | 'approved' | 'rejected'
--    │
--    └── translation_cache      [Skenario B]
--          article_id → articles.id (CASCADE DELETE)
--          lang_code: 'en' | ...
--          cache_status: 'fresh' | 'stale' | 'promoted' | 'failed'
--          Trigger: auto-stale saat articles.content diupdate
--          fn_promote_cache_to_translation() → masuk ke article_translations
--
-- ─────────────────────────────────────────────────────────────
