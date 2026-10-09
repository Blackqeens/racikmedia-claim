-- =============================================================
-- BOB · Racik Media Nusantara
-- Database Schema — Commerce B2C/B2B/Hybrid Module
-- Engine : PostgreSQL 15+  (MySQL 8+ compatible — see notes)
-- Encoding: UTF-8
-- Bergantung pada: schema.sql (tabel users harus sudah ada)
-- =============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. ENUM TYPES — Model Penjualan & Status
-- ─────────────────────────────────────────────────────────────

-- Model penjualan produk/jasa
CREATE TYPE target_model AS ENUM (
  'B2C',      -- Business-to-Consumer: jual langsung ke konsumen akhir
  'B2B',      -- Business-to-Business: jual ke perusahaan/korporat
  'Hybrid'    -- Keduanya: mendukung transaksi ritel sekaligus korporat
);

-- Status siklus hidup order
CREATE TYPE order_status AS ENUM (
  'cart',             -- Di keranjang, belum checkout
  'pending_payment',  -- Menunggu pembayaran (ritel otomatis)
  'invoice_issued',   -- Invoice diterbitkan (khusus B2B/tempo)
  'invoice_paid',     -- Invoice sudah dilunasi (khusus B2B)
  'confirmed',        -- Pesanan dikonfirmasi penjual
  'in_progress',      -- Jasa sedang dikerjakan
  'completed',        -- Selesai
  'cancelled',        -- Dibatalkan
  'refunded'          -- Dikembalikan
);

-- Tipe order
CREATE TYPE order_type AS ENUM (
  'retail',    -- Transaksi ritel B2C (pembayaran otomatis)
  'corporate'  -- Transaksi korporat B2B (invoice/tempo)
);

-- Peran anggota tim dalam order jasa B2B
CREATE TYPE assignment_role AS ENUM (
  'lead_mechanic',  -- Penanggung jawab utama / koordinator
  'staff'           -- Anggota pelaksana di bawah lead mechanic
);

-- Status penugasan individu
CREATE TYPE assignment_status AS ENUM (
  'assigned',    -- Ditugaskan, belum mulai
  'accepted',    -- Mekanik menerima penugasan
  'in_progress', -- Sedang mengerjakan
  'completed',   -- Selesai bagian ini
  'reassigned'   -- Diganti ke mekanik lain
);

-- ─────────────────────────────────────────────────────────────
-- 2. TABEL MECHANICS — Staf Mekanik milik Penyedia Jasa
--    Mekanik adalah users dengan role = 'mekanik' yang diikat
--    ke satu penyedia jasa (sellers.user_id = penyedia_jasa).
-- ─────────────────────────────────────────────────────────────
CREATE TYPE mechanic_level AS ENUM (
  'junior',    -- 0–1 tahun pengalaman
  'menengah',  -- 1–3 tahun
  'senior',    -- 3–5 tahun
  'expert'     -- 5+ tahun
);

CREATE TABLE IF NOT EXISTS mechanics (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- FK ke seller (penyedia_jasa) yang mendaftarkan mekanik ini
  seller_id       UUID          NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,

  -- Profil & keahlian
  phone           VARCHAR(30),
  level           mechanic_level NOT NULL DEFAULT 'junior',
  specializations TEXT[],       -- Array keahlian, mis: '{Servis Motor, Tune Up}'
  internal_notes  TEXT,

  -- Performa (diperbarui oleh job scheduler / trigger)
  total_orders    INTEGER       NOT NULL DEFAULT 0,
  avg_rating      NUMERIC(3,2)  CHECK (avg_rating BETWEEN 0 AND 5),

  -- Status
  is_active       BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  UNIQUE (user_id, seller_id)   -- Satu mekanik hanya terdaftar satu kali per toko
);

COMMENT ON TABLE  mechanics                IS 'Staf mekanik yang terdaftar di bawah penyedia jasa.';
COMMENT ON COLUMN mechanics.seller_id      IS 'Penyedia jasa (toko) yang mendaftarkan mekanik ini.';
COMMENT ON COLUMN mechanics.specializations IS 'Array teks keahlian; diisi saat pendaftaran.';
COMMENT ON COLUMN mechanics.avg_rating     IS 'Rata-rata rating dari ulasan klien; diperbarui oleh trigger.';

CREATE INDEX idx_mechanics_seller   ON mechanics (seller_id);
CREATE INDEX idx_mechanics_active   ON mechanics (is_active) WHERE is_active = TRUE;

CREATE TRIGGER trg_mechanics_updated_at
  BEFORE UPDATE ON mechanics
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 3. TABEL SELLERS — Penyedia Produk / Jasa
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sellers (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shop_name       VARCHAR(120)  NOT NULL,
  shop_slug       VARCHAR(120)  NOT NULL UNIQUE,
  description     TEXT,
  logo_url        TEXT,
  city            VARCHAR(80),
  province        VARCHAR(80),
  is_verified     BOOLEAN       NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  sellers             IS 'Akun penjual / penyedia jasa di platform BOB.';
COMMENT ON COLUMN sellers.shop_slug   IS 'URL slug unik toko, contoh: kopi-gayo-aceh';
COMMENT ON COLUMN sellers.is_verified IS 'Toko terverifikasi oleh admin BOB.';

CREATE TRIGGER trg_sellers_updated_at
  BEFORE UPDATE ON sellers
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 3. TABEL RETAIL_PRODUCTS — Produk Fisik / Digital
--    PENAMBAHAN KOLOM: target_model, minimum_order
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS retail_products (

  -- ── Identitas ──────────────────────────────────────────────
  id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id       UUID            NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,

  -- ── Informasi Produk ───────────────────────────────────────
  name            VARCHAR(200)    NOT NULL CHECK (char_length(trim(name)) >= 3),
  slug            VARCHAR(200)    NOT NULL,
  description     TEXT,
  cover_url       TEXT,
  price           NUMERIC(14,2)   NOT NULL CHECK (price >= 0),
  stock           INTEGER         NOT NULL DEFAULT 0 CHECK (stock >= 0),
  unit            VARCHAR(30)     NOT NULL DEFAULT 'pcs',   -- pcs, kg, liter, box, dll

  -- ── Model Penjualan — KOLOM UTAMA B2B ──────────────────────
  target_model    target_model    NOT NULL DEFAULT 'B2C',
  --   B2C     → harga ritel, bisa dibeli satu per satu, checkout otomatis
  --   B2B     → minimum_order wajib, pembayaran lewat invoice
  --   Hybrid  → mendukung keduanya; jika qty >= b2b_min_qty → harga & alur B2B

  -- ── Ketentuan Minimum Order (aktif saat target_model IN ('B2B','Hybrid')) ──
  minimum_order   INTEGER         NOT NULL DEFAULT 1 CHECK (minimum_order >= 1),
  --   B2C    : minimum_order = 1 (satu unit)
  --   B2B    : minimum_order = batas minimum pembelian korporat (wajib dipenuhi)
  --   Hybrid : minimum_order = ambang batas; di bawahnya = alur B2C, di atasnya = alur B2B

  b2b_price       NUMERIC(14,2),  -- Harga khusus korporat (NULL = pakai price)
  b2b_discount_pct NUMERIC(5,2)   CHECK (b2b_discount_pct BETWEEN 0 AND 100),
                                  -- Diskon persentase untuk B2B (alternatif b2b_price)

  -- ── Metadata ───────────────────────────────────────────────
  category        VARCHAR(60),
  is_active       BOOLEAN         NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

  -- ── Constraints ────────────────────────────────────────────
  UNIQUE (seller_id, slug),
  -- Jika B2B: minimum_order harus > 1
  CONSTRAINT chk_b2b_min_order
    CHECK (target_model = 'B2C' OR minimum_order > 1)
);

COMMENT ON TABLE  retail_products              IS 'Produk fisik/digital yang dijual oleh seller.';
COMMENT ON COLUMN retail_products.target_model IS 'B2C | B2B | Hybrid — menentukan alur checkout dan pembayaran.';
COMMENT ON COLUMN retail_products.minimum_order IS 'Jumlah minimum unit. Wajib dipenuhi saat B2B/Hybrid sebelum checkout diizinkan.';
COMMENT ON COLUMN retail_products.b2b_price    IS 'Harga khusus korporat. NULL berarti menggunakan kolom price.';

CREATE INDEX idx_products_seller      ON retail_products (seller_id, is_active);
CREATE INDEX idx_products_model       ON retail_products (target_model, is_active);
CREATE INDEX idx_products_category    ON retail_products (category, target_model);

CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON retail_products
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 4. TABEL SERVICES — Jasa / Layanan
--    PENAMBAHAN KOLOM: target_model, minimum_order
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS services (

  -- ── Identitas ──────────────────────────────────────────────
  id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id       UUID            NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,

  -- ── Informasi Jasa ─────────────────────────────────────────
  name            VARCHAR(200)    NOT NULL CHECK (char_length(trim(name)) >= 3),
  slug            VARCHAR(200)    NOT NULL,
  description     TEXT,
  cover_url       TEXT,
  base_price      NUMERIC(14,2)   NOT NULL CHECK (base_price >= 0),
  unit            VARCHAR(40)     NOT NULL DEFAULT 'per-kunjungan',
                                  -- per-kunjungan, per-jam, per-unit, per-proyek

  -- ── Model Penjualan — KOLOM UTAMA B2B ──────────────────────
  target_model    target_model    NOT NULL DEFAULT 'B2C',
  --   B2C     → 1 mekanik, pembayaran otomatis saat selesai
  --   B2B     → penugasan multilevel (lead + staf), pembayaran via invoice
  --   Hybrid  → mendukung keduanya; volume korporat mengaktifkan penugasan multilevel

  -- ── Ketentuan Minimum Order ─────────────────────────────────
  minimum_order   INTEGER         NOT NULL DEFAULT 1 CHECK (minimum_order >= 1),
  --   Untuk jasa: minimum_order = jumlah minimal unit/kunjungan/jam
  --   Jika B2B: minimum_order wajib > 1

  b2b_price       NUMERIC(14,2),  -- Harga kontrak korporat (NULL = pakai base_price)

  -- ── Konfigurasi Penugasan Mekanik ──────────────────────────
  max_mechanics   INTEGER         NOT NULL DEFAULT 1 CHECK (max_mechanics >= 1),
  --   B2C    : 1 mekanik
  --   B2B    : bisa lebih dari 1 (1 lead + N staf)
  requires_lead   BOOLEAN         NOT NULL DEFAULT FALSE,
  --   FALSE  : satu mekanik cukup (B2C)
  --   TRUE   : wajib ada lead_mechanic yang ditunjuk (B2B)

  -- ── Metadata ───────────────────────────────────────────────
  category        VARCHAR(60),
  estimated_duration_hours NUMERIC(6,2),  -- Estimasi durasi pengerjaan
  is_active       BOOLEAN         NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

  UNIQUE (seller_id, slug),
  CONSTRAINT chk_service_b2b_min_order
    CHECK (target_model = 'B2C' OR minimum_order > 1),
  CONSTRAINT chk_service_b2b_lead
    CHECK (target_model = 'B2C' OR requires_lead = TRUE),
  CONSTRAINT chk_service_b2b_mechanics
    CHECK (target_model = 'B2C' OR max_mechanics > 1)
);

COMMENT ON TABLE  services                IS 'Jasa/layanan yang disediakan oleh seller (mekanik/teknisi).';
COMMENT ON COLUMN services.target_model  IS 'B2C | B2B | Hybrid — menentukan alur pembayaran & penugasan mekanik.';
COMMENT ON COLUMN services.requires_lead IS 'TRUE jika order B2B wajib memiliki lead_mechanic yang ditunjuk.';
COMMENT ON COLUMN services.max_mechanics IS 'Jumlah maksimal mekanik yang bisa ditugaskan dalam satu order B2B.';

CREATE INDEX idx_services_seller ON services (seller_id, is_active);
CREATE INDEX idx_services_model  ON services (target_model, is_active);

CREATE TRIGGER trg_services_updated_at
  BEFORE UPDATE ON services
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 5. TABEL CORPORATE_CLIENTS — Data Perusahaan Pembeli B2B
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS corporate_clients (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_name    VARCHAR(200)  NOT NULL,
  npwp            VARCHAR(30)   UNIQUE,       -- NPWP perusahaan untuk invoice resmi
  address         TEXT,
  pic_name        VARCHAR(120), -- Person in Charge
  pic_phone       VARCHAR(30),
  pic_email       VARCHAR(255),
  credit_limit    NUMERIC(16,2) DEFAULT 0,    -- Batas kredit maksimal (untuk tempo)
  payment_terms   INTEGER       DEFAULT 30,   -- Jangka tempo pembayaran (hari)
  is_verified     BOOLEAN       NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  corporate_clients              IS 'Data perusahaan klien B2B yang terdaftar.';
COMMENT ON COLUMN corporate_clients.payment_terms IS 'Jangka waktu pembayaran invoice dalam hari (default: NET 30).';
COMMENT ON COLUMN corporate_clients.credit_limit  IS 'Batas total kredit aktif yang diperbolehkan.';

CREATE TRIGGER trg_corp_clients_updated_at
  BEFORE UPDATE ON corporate_clients
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 6. TABEL ORDERS — Transaksi Utama (B2C & B2B)
--    order_type menentukan alur pembayaran & penugasan
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (

  -- ── Identitas ──────────────────────────────────────────────
  id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number        VARCHAR(30)     NOT NULL UNIQUE,
  --   Format: ORD-YYYYMMDD-XXXXX (diisi trigger)

  -- ── Pihak Terlibat ─────────────────────────────────────────
  buyer_id            UUID            NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  seller_id           UUID            NOT NULL REFERENCES sellers(id) ON DELETE RESTRICT,
  corporate_client_id UUID            REFERENCES corporate_clients(id) ON DELETE SET NULL,
  --   NULL  = transaksi ritel B2C (buyer = konsumen perorangan)
  --   Diisi = transaksi korporat B2B (buyer mewakili perusahaan)

  -- ── Tipe & Status ──────────────────────────────────────────
  order_type          order_type      NOT NULL DEFAULT 'retail',
  --   'retail'    : alur B2C — gateway pembayaran otomatis (Midtrans/Xendit)
  --   'corporate' : alur B2B — sistem invoice/tempo resmi

  status              order_status    NOT NULL DEFAULT 'cart',

  -- ── Item & Harga ───────────────────────────────────────────
  item_type           VARCHAR(10)     NOT NULL CHECK (item_type IN ('product', 'service')),
  item_id             UUID            NOT NULL,
  --   FK dinamis: jika item_type='product' → retail_products.id
  --               jika item_type='service' → services.id

  quantity            INTEGER         NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price          NUMERIC(14,2)   NOT NULL CHECK (unit_price >= 0),
  --   Diisi saat order dibuat:
  --   B2C     : pakai retail_products.price / services.base_price
  --   B2B     : pakai b2b_price jika ada, atau hitung diskon b2b_discount_pct

  subtotal            NUMERIC(14,2)   GENERATED ALWAYS AS (quantity * unit_price) STORED,
  tax_amount          NUMERIC(14,2)   NOT NULL DEFAULT 0,
  discount_amount     NUMERIC(14,2)   NOT NULL DEFAULT 0,
  total_amount        NUMERIC(14,2)   NOT NULL DEFAULT 0,
  --   total_amount = subtotal + tax_amount - discount_amount (diisi oleh aplikasi)

  -- ── Pembayaran ─────────────────────────────────────────────
  payment_method      VARCHAR(40),
  --   B2C  : 'midtrans' | 'xendit' | 'cod' | dll.
  --   B2B  : 'invoice_net30' | 'invoice_net60' | 'bank_transfer_manual'

  payment_gateway_id  VARCHAR(100),   -- ID transaksi dari gateway (B2C) atau nomor invoice (B2B)
  payment_due_date    DATE,           -- NULL untuk B2C; diisi untuk invoice B2B
  paid_at             TIMESTAMPTZ,    -- Waktu pembayaran terkonfirmasi

  -- ── Logistik / Jadwal Jasa ─────────────────────────────────
  delivery_address    TEXT,
  scheduled_at        TIMESTAMPTZ,    -- Jadwal pengerjaan jasa (untuk service orders)
  completed_at        TIMESTAMPTZ,

  -- ── Catatan ────────────────────────────────────────────────
  buyer_notes         TEXT,
  seller_notes        TEXT,
  cancellation_reason TEXT,

  -- ── Metadata ───────────────────────────────────────────────
  created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

  -- ── Constraints ────────────────────────────────────────────
  -- Order korporat wajib punya corporate_client_id
  CONSTRAINT chk_corporate_requires_client
    CHECK (order_type = 'retail' OR corporate_client_id IS NOT NULL),
  -- Invoice hanya boleh ada pada order korporat
  CONSTRAINT chk_invoice_only_corporate
    CHECK (order_type = 'corporate' OR payment_due_date IS NULL)
);

COMMENT ON TABLE  orders                     IS 'Transaksi pembelian produk atau pemesanan jasa.';
COMMENT ON COLUMN orders.order_type          IS 'retail = alur B2C gateway otomatis | corporate = alur B2B invoice/tempo.';
COMMENT ON COLUMN orders.corporate_client_id IS 'Diisi jika order_type=corporate. Menghubungkan ke data perusahaan klien.';
COMMENT ON COLUMN orders.payment_due_date    IS 'Tanggal jatuh tempo invoice B2B (diisi oleh sistem saat invoice diterbitkan).';
COMMENT ON COLUMN orders.payment_gateway_id  IS 'ID transaksi gateway (B2C) atau nomor invoice resmi (B2B).';

-- Index utama
CREATE INDEX idx_orders_buyer       ON orders (buyer_id, status, created_at DESC);
CREATE INDEX idx_orders_seller      ON orders (seller_id, status, created_at DESC);
CREATE INDEX idx_orders_type_status ON orders (order_type, status, created_at DESC);
CREATE INDEX idx_orders_corporate   ON orders (corporate_client_id, status)
  WHERE corporate_client_id IS NOT NULL;
CREATE INDEX idx_orders_pending_invoice ON orders (payment_due_date, status)
  WHERE order_type = 'corporate' AND status = 'invoice_issued';

-- ── Trigger: isi order_number otomatis ──────────────────────
CREATE OR REPLACE FUNCTION fn_orders_set_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.order_number IS NULL OR NEW.order_number = '' THEN
    NEW.order_number := 'ORD-'
      || TO_CHAR(NOW(), 'YYYYMMDD')
      || '-'
      || UPPER(SUBSTRING(gen_random_uuid()::TEXT FROM 1 FOR 6));
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_orders_set_number
  BEFORE INSERT ON orders
  FOR EACH ROW EXECUTE FUNCTION fn_orders_set_number();

CREATE TRIGGER trg_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 7. TABEL INVOICES — Dokumen Invoice Resmi B2B
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoices (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID          NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  invoice_number  VARCHAR(40)   NOT NULL UNIQUE,
  --   Format: INV-YYYYMM-XXXXX

  issued_to       UUID          NOT NULL REFERENCES corporate_clients(id),
  issued_by       UUID          NOT NULL REFERENCES sellers(id),
  issued_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  due_date        DATE          NOT NULL,
  paid_at         TIMESTAMPTZ,

  subtotal        NUMERIC(14,2) NOT NULL,
  tax_pct         NUMERIC(5,2)  NOT NULL DEFAULT 11.0,  -- PPN 11%
  tax_amount      NUMERIC(14,2) NOT NULL,
  total_amount    NUMERIC(14,2) NOT NULL,

  status          VARCHAR(20)   NOT NULL DEFAULT 'unpaid'
                                CHECK (status IN ('unpaid', 'partially_paid', 'paid', 'overdue', 'cancelled')),
  notes           TEXT,
  pdf_url         TEXT,         -- URL file PDF invoice yang digenerate

  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  invoices              IS 'Invoice resmi untuk transaksi korporat B2B.';
COMMENT ON COLUMN invoices.due_date     IS 'Tanggal jatuh tempo pembayaran (NET 30/60 sesuai payment_terms klien).';
COMMENT ON COLUMN invoices.tax_pct      IS 'Persentase PPN (default 11% sesuai regulasi Indonesia 2025).';

CREATE INDEX idx_invoices_order    ON invoices (order_id);
CREATE INDEX idx_invoices_client   ON invoices (issued_to, status, due_date);
CREATE INDEX idx_invoices_overdue  ON invoices (due_date, status)
  WHERE status IN ('unpaid', 'partially_paid');

CREATE TRIGGER trg_invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 8. TABEL ORDER_ASSIGNMENTS — Penugasan Mekanik Multilevel B2B
--    INTI FITUR B2B: satu order service → 1 lead + N staf
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_assignments (

  id              UUID              PRIMARY KEY DEFAULT gen_random_uuid(),

  -- ── Relasi ke Order ────────────────────────────────────────
  order_id        UUID              NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  --   Satu order B2B bisa punya banyak baris di tabel ini:
  --   1 baris lead_mechanic + N baris staff

  -- ── Mekanik yang Ditugaskan ────────────────────────────────
  mechanic_id     UUID              NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  --   FK ke users.id dengan role = 'mekanik'

  -- ── Peran dalam Tim ────────────────────────────────────────
  role            assignment_role   NOT NULL,
  --   'lead_mechanic' : Penanggung jawab utama, berhak menunjuk/mengganti staf
  --   'staff'         : Anggota pelaksana di bawah koordinasi lead

  -- ── Ditunjuk Oleh ─────────────────────────────────────────
  assigned_by     UUID              NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  --   Baris lead_mechanic  : assigned_by = seller/penyedia jasa
  --   Baris staff          : assigned_by = lead_mechanic atau seller
  assigned_at     TIMESTAMPTZ       NOT NULL DEFAULT NOW(),

  -- ── Status & Progress ─────────────────────────────────────
  status          assignment_status NOT NULL DEFAULT 'assigned',
  accepted_at     TIMESTAMPTZ,      -- Waktu mekanik menerima penugasan
  started_at      TIMESTAMPTZ,      -- Waktu mulai pengerjaan
  completed_at    TIMESTAMPTZ,      -- Waktu selesai bagian ini

  -- ── Tugas & Catatan ────────────────────────────────────────
  task_description TEXT,            -- Deskripsi tugas spesifik anggota staf ini
  notes           TEXT,             -- Catatan progress dari mekanik

  created_at      TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ       NOT NULL DEFAULT NOW(),

  -- ── Constraints ────────────────────────────────────────────
  -- Satu mekanik hanya bisa punya satu peran dalam satu order
  UNIQUE (order_id, mechanic_id),
  -- Staff wajib ada lead_mechanic lebih dulu di order yang sama
  -- (divalidasi di level aplikasi — lihat fn_check_lead_exists di bawah)
  CONSTRAINT chk_accepted_after_assigned
    CHECK (accepted_at IS NULL OR accepted_at >= assigned_at)
);

COMMENT ON TABLE  order_assignments          IS 'Penugasan mekanik multilevel untuk order jasa korporat B2B.';
COMMENT ON COLUMN order_assignments.role     IS 'lead_mechanic = koordinator utama | staff = anggota pelaksana.';
COMMENT ON COLUMN order_assignments.assigned_by IS 'Seller menunjuk lead; lead (atau seller) menunjuk staf.';

-- Index utama
CREATE INDEX idx_assignments_order    ON order_assignments (order_id, role);
CREATE INDEX idx_assignments_mechanic ON order_assignments (mechanic_id, status, assigned_at DESC);
CREATE INDEX idx_assignments_lead     ON order_assignments (order_id)
  WHERE role = 'lead_mechanic';

-- ── Trigger: validasi lead_mechanic harus ada sebelum staff bisa ditambahkan ──
CREATE OR REPLACE FUNCTION fn_check_lead_exists()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Hanya validasi saat menambahkan anggota dengan role 'staff'
  IF NEW.role = 'staff' THEN
    IF NOT EXISTS (
      SELECT 1 FROM order_assignments
      WHERE order_id = NEW.order_id
        AND role = 'lead_mechanic'
        AND status != 'reassigned'
    ) THEN
      RAISE EXCEPTION
        'Tidak dapat menambahkan staf: order % belum memiliki lead_mechanic yang aktif.',
        NEW.order_id
        USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_assignments_check_lead
  BEFORE INSERT ON order_assignments
  FOR EACH ROW EXECUTE FUNCTION fn_check_lead_exists();

CREATE TRIGGER trg_assignments_updated_at
  BEFORE UPDATE ON order_assignments
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 9. VIEWS — Query Siap Pakai
-- ─────────────────────────────────────────────────────────────

-- 9a. Antrian order B2B yang menunggu invoice diterbitkan
CREATE OR REPLACE VIEW v_pending_invoices AS
SELECT
  o.id            AS order_id,
  o.order_number,
  o.status        AS order_status,
  o.item_type,
  o.quantity,
  o.total_amount,
  o.created_at    AS ordered_at,
  s.shop_name     AS seller_name,
  cc.company_name AS client_company,
  cc.pic_name     AS client_pic,
  cc.payment_terms,
  u.name          AS buyer_name,
  u.email         AS buyer_email
FROM   orders          o
JOIN   sellers         s  ON s.id  = o.seller_id
JOIN   corporate_clients cc ON cc.id = o.corporate_client_id
JOIN   users           u  ON u.id  = o.buyer_id
WHERE  o.order_type = 'corporate'
  AND  o.status     = 'confirmed'
ORDER  BY o.created_at ASC;

COMMENT ON VIEW v_pending_invoices IS 'Order korporat yang sudah dikonfirmasi tapi belum diterbitkan invoice.';

-- 9b. Tim mekanik per order B2B (tampilan lengkap penugasan multilevel)
CREATE OR REPLACE VIEW v_order_team AS
SELECT
  oa.order_id,
  o.order_number,
  oa.id           AS assignment_id,
  oa.role,
  oa.status       AS assignment_status,
  oa.task_description,
  oa.assigned_at,
  oa.accepted_at,
  oa.completed_at,
  u.id            AS mechanic_id,
  u.name          AS mechanic_name,
  u.email         AS mechanic_email,
  ab.name         AS assigned_by_name
FROM   order_assignments oa
JOIN   orders            o  ON o.id  = oa.order_id
JOIN   users             u  ON u.id  = oa.mechanic_id
JOIN   users             ab ON ab.id = oa.assigned_by
ORDER  BY oa.order_id, oa.role DESC, oa.assigned_at;

COMMENT ON VIEW v_order_team IS 'Tampilan lengkap tim mekanik (lead + staf) per order jasa B2B.';

-- ─────────────────────────────────────────────────────────────
-- 10. SEED DATA — Contoh Data untuk Development
-- ─────────────────────────────────────────────────────────────

-- Seller
INSERT INTO sellers (id, user_id, shop_name, shop_slug, city, is_verified) VALUES
  ('sel-001-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'Koperasi Kopi Gayo',   'kopi-gayo-aceh',    'Aceh Tengah',   TRUE),
  ('sel-002-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003', 'Bengkel Rotan Budi',  'bengkel-rotan',     'Cirebon',       TRUE),
  ('sel-003-0000-0000-0000-000000000004', 'sel-003-0000-0000-0000-000000000000', 'Servis Mesin Ayu',    'servis-mesin-ayu',  'Yogyakarta',    FALSE)
ON CONFLICT (id) DO NOTHING;

-- Produk B2C
INSERT INTO retail_products (id, seller_id, name, slug, price, stock, unit, target_model, minimum_order, category) VALUES
  ('prd-001', 'sel-001-0000-0000-0000-000000000001', 'Kopi Gayo Premium 100g', 'kopi-gayo-100g',
   85000, 500, 'pcs', 'B2C', 1, 'kopi')
ON CONFLICT (seller_id, slug) DO NOTHING;

-- Produk B2B (grosir korporat)
INSERT INTO retail_products (id, seller_id, name, slug, price, stock, unit, target_model, minimum_order, b2b_price, b2b_discount_pct, category) VALUES
  ('prd-002', 'sel-001-0000-0000-0000-000000000001', 'Kopi Gayo Bulk 25kg', 'kopi-gayo-bulk-25kg',
   1800000, 200, 'karung', 'B2B', 10, 1600000, 11.11, 'kopi')
ON CONFLICT (seller_id, slug) DO NOTHING;

-- Produk Hybrid
INSERT INTO retail_products (id, seller_id, name, slug, price, stock, unit, target_model, minimum_order, b2b_discount_pct, category) VALUES
  ('prd-003', 'sel-001-0000-0000-0000-000000000001', 'Madu Hutan Kalimantan 500ml', 'madu-hutan-500ml',
   145000, 300, 'botol', 'Hybrid', 20, 15.00, 'madu')
ON CONFLICT (seller_id, slug) DO NOTHING;

-- Jasa B2C (satu mekanik)
INSERT INTO services (id, seller_id, name, slug, base_price, unit, target_model, minimum_order, max_mechanics, requires_lead, category) VALUES
  ('svc-001', 'sel-002-0000-0000-0000-000000000002', 'Servis Mesin Jahit', 'servis-mesin-jahit',
   150000, 'per-kunjungan', 'B2C', 1, 1, FALSE, 'servis')
ON CONFLICT (seller_id, slug) DO NOTHING;

-- Jasa B2B (penugasan multilevel)
INSERT INTO services (id, seller_id, name, slug, base_price, unit, target_model, minimum_order, max_mechanics, requires_lead, category, estimated_duration_hours) VALUES
  ('svc-002', 'sel-002-0000-0000-0000-000000000002', 'Overhaul Lini Produksi Rotan', 'overhaul-lini-produksi',
   5000000, 'per-proyek', 'B2B', 5, 8, TRUE, 'industri', 40.0)
ON CONFLICT (seller_id, slug) DO NOTHING;
