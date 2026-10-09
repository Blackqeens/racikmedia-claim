-- =============================================================
-- BOB · Racik Media Nusantara
-- Database Schema — Articles Module
-- Engine : PostgreSQL 15+  (MySQL 8+ compatible — see notes)
-- Encoding: UTF-8
-- =============================================================

-- ─────────────────────────────────────────────────────────────
-- 0. EXTENSIONS (PostgreSQL only — remove for MySQL)
-- ─────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "unaccent";   -- full-text search tanpa aksen

-- ─────────────────────────────────────────────────────────────
-- 1. ENUM TYPES
--    PostgreSQL: gunakan CREATE TYPE
--    MySQL     : ganti dengan ENUM(...) langsung di kolom
-- ─────────────────────────────────────────────────────────────

-- Status siklus hidup artikel
CREATE TYPE article_status AS ENUM (
  'draft',          -- Hanya terlihat oleh penulis. Belum dikirim ke admin.
  'pending_review', -- Sudah diajukan penulis, menunggu persetujuan admin.
  'published',      -- Disetujui admin, tampil di halaman publik.
  'rejected'        -- Dikembalikan admin ke penulis dengan catatan.
);

-- Kategori konten
CREATE TYPE article_category AS ENUM (
  'agrikultur',
  'kuliner',
  'kerajinan',
  'budaya',
  'sosial',
  'lingkungan',
  'wisata',
  'catatan-buku',
  'jurnal',
  'ulasan',
  'ekonomi-lokal'
);

-- ─────────────────────────────────────────────────────────────
-- 2. TABEL USERS (referensi — buat jika belum ada)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(120)  NOT NULL,
  email         VARCHAR(255)  NOT NULL UNIQUE,
  avatar_url    TEXT,
  role          VARCHAR(20)   NOT NULL DEFAULT 'member'
                              CHECK (role IN ('member', 'editor', 'admin')),
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  users          IS 'Akun pengguna terdaftar BOB.';
COMMENT ON COLUMN users.role     IS 'member = penulis biasa | editor = penulis terpilih | admin = moderator';

-- ─────────────────────────────────────────────────────────────
-- 3. TABEL ARTICLES  ← TABEL UTAMA
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS articles (

  -- ── Identitas ──────────────────────────────────────────────
  id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
                                  -- MySQL: id CHAR(36) PRIMARY KEY DEFAULT (UUID())

  -- ── Penulis ────────────────────────────────────────────────
  user_id         UUID            NOT NULL
                                  REFERENCES users(id) ON DELETE CASCADE,
                                  -- Hapus semua artikel jika akun penulis dihapus

  -- ── Konten ─────────────────────────────────────────────────
  title           VARCHAR(160)    NOT NULL
                                  CHECK (char_length(title) >= 5),
  content         TEXT            NOT NULL,     -- Isi lengkap (HTML dari rich text editor)
  content_text    TEXT,                         -- Plain-text untuk full-text search (diisi trigger)
  excerpt         VARCHAR(400),                 -- Ringkasan otomatis (diisi trigger / API)
  cover_url       TEXT,                         -- URL foto utama/sampul artikel
  word_count      INTEGER         NOT NULL DEFAULT 0,  -- Diisi oleh trigger

  -- ── Klasifikasi ────────────────────────────────────────────
  category        article_category NOT NULL,
  tags            TEXT[],                       -- Array tag bebas. MySQL: JSON kolom
                                                -- Contoh: '{kopi,aceh,tradisional}'

  -- ── Status & Siklus Hidup ──────────────────────────────────
  status          article_status  NOT NULL DEFAULT 'draft',
                  -- draft          → hanya penulis yang bisa melihat
                  -- pending_review → masuk antrian moderasi admin
                  -- published      → tampil di halaman publik
                  -- rejected       → dikembalikan ke penulis

  -- ── Moderasi ───────────────────────────────────────────────
  admin_notes     TEXT,           -- Catatan/alasan dari admin (untuk rejected)
  reviewed_by     UUID            REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at     TIMESTAMPTZ,    -- Waktu admin membuat keputusan
  published_at    TIMESTAMPTZ,    -- NULL sampai status = published

  -- ── Metadata ───────────────────────────────────────────────
  created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

  -- ── Constraints ────────────────────────────────────────────
  CONSTRAINT articles_title_not_empty  CHECK (trim(title) <> ''),
  CONSTRAINT articles_content_not_empty CHECK (trim(content) <> '')
);

COMMENT ON TABLE  articles                  IS 'Semua tulisan dari penulis komunitas BOB.';
COMMENT ON COLUMN articles.user_id          IS 'FK ke users.id — pemilik/penulis artikel.';
COMMENT ON COLUMN articles.title            IS 'Judul artikel, max 160 karakter.';
COMMENT ON COLUMN articles.content          IS 'Isi HTML lengkap dari rich text editor.';
COMMENT ON COLUMN articles.content_text     IS 'Versi plain-text untuk indexing full-text search.';
COMMENT ON COLUMN articles.status           IS 'draft | pending_review | published | rejected';
COMMENT ON COLUMN articles.admin_notes      IS 'Catatan admin saat menolak artikel (dikirim ke penulis via email).';
COMMENT ON COLUMN articles.reviewed_by      IS 'FK ke users.id — admin yang mereview.';
COMMENT ON COLUMN articles.published_at     IS 'Diisi otomatis saat status berubah ke published.';

-- ─────────────────────────────────────────────────────────────
-- 4. INDEXES — optimasi query yang sering digunakan
-- ─────────────────────────────────────────────────────────────

-- Query halaman publik: WHERE status = 'published' ORDER BY published_at DESC
CREATE INDEX idx_articles_published
  ON articles (status, published_at DESC)
  WHERE status = 'published';

-- Query moderasi admin: WHERE status = 'pending_review' ORDER BY created_at ASC
CREATE INDEX idx_articles_pending
  ON articles (status, created_at ASC)
  WHERE status = 'pending_review';

-- Query draft penulis: WHERE user_id = $1 AND status = 'draft'
CREATE INDEX idx_articles_user_status
  ON articles (user_id, status, updated_at DESC);

-- Filter kategori
CREATE INDEX idx_articles_category
  ON articles (category, status, published_at DESC);

-- Full-text search pada judul + konten
CREATE INDEX idx_articles_fts
  ON articles
  USING GIN (to_tsvector('indonesian', coalesce(title,'') || ' ' || coalesce(content_text,'')));
  -- MySQL: buat FULLTEXT INDEX pada kolom title, content_text

-- ─────────────────────────────────────────────────────────────
-- 5. TRIGGER — updated_at otomatis + content_text + word_count
-- ─────────────────────────────────────────────────────────────

-- 5a. Update updated_at setiap kali baris diubah
CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_articles_updated_at
  BEFORE UPDATE ON articles
  FOR EACH ROW
  EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION fn_set_updated_at();

-- 5b. Isi content_text (strip HTML tags) dan hitung word_count
CREATE OR REPLACE FUNCTION fn_articles_derive_fields()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  plain TEXT;
BEGIN
  -- Strip HTML tags sederhana
  plain := regexp_replace(NEW.content, '<[^>]+>', ' ', 'g');
  plain := regexp_replace(plain, '\s+', ' ', 'g');
  NEW.content_text := trim(plain);

  -- Hitung kata
  NEW.word_count := array_length(string_to_array(trim(plain), ' '), 1);

  -- Buat excerpt otomatis (200 karakter pertama) jika tidak diisi
  IF NEW.excerpt IS NULL OR NEW.excerpt = '' THEN
    NEW.excerpt := left(trim(plain), 200);
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_articles_derive_fields
  BEFORE INSERT OR UPDATE OF content ON articles
  FOR EACH ROW
  EXECUTE FUNCTION fn_articles_derive_fields();

-- 5c. Isi published_at saat status berubah ke published
CREATE OR REPLACE FUNCTION fn_articles_set_published_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'published' AND (OLD.status IS DISTINCT FROM 'published') THEN
    NEW.published_at = NOW();
  END IF;
  -- Hapus published_at jika dikembalikan ke draft/rejected
  IF NEW.status IN ('draft', 'rejected') AND OLD.status = 'published' THEN
    NEW.published_at = NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_articles_published_at
  BEFORE UPDATE OF status ON articles
  FOR EACH ROW
  EXECUTE FUNCTION fn_articles_set_published_at();

-- ─────────────────────────────────────────────────────────────
-- 6. TABEL ARTICLE_REVIEWS — audit log setiap keputusan admin
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS article_reviews (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id    UUID          NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  admin_id      UUID          NOT NULL REFERENCES users(id)    ON DELETE RESTRICT,
  action        VARCHAR(20)   NOT NULL CHECK (action IN ('approved', 'rejected', 'returned_to_draft')),
  note          TEXT,         -- Catatan admin (sama dengan admin_notes di articles)
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE article_reviews IS 'Log audit setiap keputusan moderasi admin.';

CREATE INDEX idx_reviews_article ON article_reviews (article_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────
-- 7. TABEL EMAIL_NOTIFICATIONS — antrian email ke penulis
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_notifications (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id  UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  article_id    UUID          REFERENCES articles(id) ON DELETE SET NULL,
  type          VARCHAR(40)   NOT NULL,
                              -- 'article_approved' | 'article_rejected' | 'article_draft_returned'
  payload       JSONB,        -- Data dinamis untuk template email
  sent_at       TIMESTAMPTZ,  -- NULL = belum terkirim
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  email_notifications          IS 'Antrian notifikasi email ke penulis.';
COMMENT ON COLUMN email_notifications.sent_at  IS 'NULL = menunggu dikirim oleh email worker.';

CREATE INDEX idx_email_unsent ON email_notifications (sent_at, created_at)
  WHERE sent_at IS NULL;

-- ─────────────────────────────────────────────────────────────
-- 8. VIEWS — query siap pakai untuk backend
-- ─────────────────────────────────────────────────────────────

-- 8a. Artikel published untuk halaman publik (articles.html, dashboard.html)
CREATE OR REPLACE VIEW v_published_articles AS
SELECT
  a.id,
  a.title,
  a.excerpt,
  a.cover_url,
  a.category,
  a.tags,
  a.word_count,
  a.published_at,
  a.created_at,
  u.id          AS author_id,
  u.name        AS author_name,
  u.avatar_url  AS author_avatar
FROM   articles a
JOIN   users    u ON u.id = a.user_id
WHERE  a.status = 'published'
ORDER  BY a.published_at DESC;

COMMENT ON VIEW v_published_articles IS
  'Artikel published — digunakan oleh halaman publik (articles.html, dashboard.html). '
  'Hanya status = published yang terlihat.';

-- 8b. Antrian moderasi admin (moderation.html)
CREATE OR REPLACE VIEW v_pending_articles AS
SELECT
  a.id,
  a.title,
  a.excerpt,
  a.cover_url,
  a.category,
  a.word_count,
  a.created_at  AS submitted_at,
  u.id          AS author_id,
  u.name        AS author_name,
  u.email       AS author_email,
  u.avatar_url  AS author_avatar
FROM   articles a
JOIN   users    u ON u.id = a.user_id
WHERE  a.status = 'pending_review'
ORDER  BY a.created_at ASC;  -- FIFO: pengajuan paling lama tampil duluan

COMMENT ON VIEW v_pending_articles IS
  'Antrian artikel pending_review untuk dasbor moderasi admin (moderation.html).';

-- 8c. Draft penulis — hanya untuk pemilik akun
-- (Gunakan parameterisasi di query backend: WHERE user_id = $user_id)
CREATE OR REPLACE VIEW v_user_drafts AS
SELECT
  a.id,
  a.title,
  a.excerpt,
  a.category,
  a.status,
  a.word_count,
  a.admin_notes,
  a.updated_at,
  a.created_at,
  u.id    AS author_id,
  u.name  AS author_name
FROM   articles a
JOIN   users    u ON u.id = a.user_id
WHERE  a.status IN ('draft', 'rejected')
ORDER  BY a.updated_at DESC;

COMMENT ON VIEW v_user_drafts IS
  'Draft dan artikel rejected milik penulis — HANYA dikembalikan ke pemilik akun (filter WHERE user_id = $user_id di backend).';

-- ─────────────────────────────────────────────────────────────
-- 9. ROW LEVEL SECURITY (PostgreSQL — opsional tapi direkomendasikan)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE articles ENABLE ROW LEVEL SECURITY;

-- Siapa pun (termasuk anonymous) hanya bisa SELECT artikel published
CREATE POLICY rls_articles_public_read ON articles
  FOR SELECT
  USING (status = 'published');

-- Penulis hanya bisa melihat artikelnya sendiri
CREATE POLICY rls_articles_owner_read ON articles
  FOR SELECT
  USING (user_id = current_setting('app.current_user_id')::UUID);

-- Penulis hanya bisa INSERT & UPDATE artikel miliknya sendiri
CREATE POLICY rls_articles_owner_write ON articles
  FOR ALL
  USING (user_id = current_setting('app.current_user_id')::UUID);

-- Admin bisa melakukan semua operasi
CREATE POLICY rls_articles_admin_all ON articles
  FOR ALL
  USING (current_setting('app.current_user_role') = 'admin');

-- ─────────────────────────────────────────────────────────────
-- 10. SEED DATA — contoh artikel awal (untuk development)
-- ─────────────────────────────────────────────────────────────

INSERT INTO users (id, name, email, role) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Admin BOB',      'admin@bob.id',    'admin'),
  ('00000000-0000-0000-0000-000000000002', 'Sinta Maharani', 'sinta@email.com', 'member'),
  ('00000000-0000-0000-0000-000000000003', 'Budi Santoso',   'budi@email.com',  'member'),
  ('00000000-0000-0000-0000-000000000004', 'Ayu Lestari',    'ayu@email.com',   'member'),
  ('00000000-0000-0000-0000-000000000005', 'Reza Pratama',   'reza@email.com',  'member')
ON CONFLICT (id) DO NOTHING;

INSERT INTO articles (id, user_id, title, content, category, status, cover_url) VALUES
  (
    'art-00000000-0000-0000-0001', '00000000-0000-0000-0000-000000000002',
    'Kopi Gayo dan Warisan Rasa yang Tak Tergantikan',
    '<p>Di balik setiap cangkir kopi Gayo tersimpan cerita panjang...</p>',
    'kuliner', 'published',
    'https://images.unsplash.com/photo-1610889556528-9a770e32642f?w=900&q=80'
  ),
  (
    'art-00000000-0000-0000-0002', '00000000-0000-0000-0000-000000000003',
    'Anyaman Rotan Cirebon: Jalan Panjang ke Pasar Global',
    '<p>Desa Tegalwangi di Cirebon telah melahirkan ribuan pengrajin rotan...</p>',
    'kerajinan', 'published',
    'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=900&q=80'
  ),
  (
    'art-00000000-0000-0000-0003', '00000000-0000-0000-0000-000000000004',
    'Madu Hutan Kalimantan: Kekayaan Alam yang Mulai Langka',
    '<p>Para pemburu madu tradisional di Kalimantan Tengah...</p>',
    'agrikultur', 'pending_review',
    'https://images.unsplash.com/photo-1571115177098-24ec42ed204d?w=900&q=80'
  ),
  (
    'art-00000000-0000-0000-0004', '00000000-0000-0000-0000-000000000005',
    'Draft Artikel Belum Selesai',
    '<p>Ini adalah draft yang belum siap dikirim...</p>',
    'sosial', 'draft', NULL
  )
ON CONFLICT (id) DO NOTHING;
