-- Migration: 20261011_create_products_and_seller_products.sql
-- Mendukung atribut dinamis berbasis kategori (JSONB) dan susunan visual toko (drag-and-drop sortable)

-- 1. Pastikan ekstensi UUID terpasang
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Tabel products utama (dengan kolom attributes JSONB)
CREATE TABLE IF NOT EXISTS public.products (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  seller_id TEXT,
  name TEXT NOT NULL,
  slug TEXT,
  category TEXT NOT NULL DEFAULT 'kopi', -- 'kopi', 'baju', 'pangan', 'kerajinan', 'herbal'
  price NUMERIC(14,2) NOT NULL DEFAULT 0,
  original_price NUMERIC(14,2),
  stock INTEGER NOT NULL DEFAULT 0,
  weight INTEGER DEFAULT 0, -- berat dalam gram
  description TEXT DEFAULT '',
  image_url TEXT,
  image_paths TEXT[] DEFAULT '{}',
  rating NUMERIC(3,2) DEFAULT 5.0,
  sold_count TEXT DEFAULT '0 terjual',
  badge TEXT DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  -- Kolom JSONB dinamis untuk varian pakaian (colors, sizes) atau kopi (weights, grind_sizes)
  attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Tabel seller_products untuk relasi produk toko dan susunan urutan visual (position)
CREATE TABLE IF NOT EXISTS public.seller_products (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  product_id TEXT REFERENCES public.products(id) ON DELETE CASCADE,
  seller_id TEXT NOT NULL DEFAULT 'default_seller',
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'kopi',
  price NUMERIC(14,2) NOT NULL DEFAULT 0,
  stock INTEGER NOT NULL DEFAULT 0,
  image_url TEXT,
  position INTEGER NOT NULL DEFAULT 0, -- Urutan drag-and-drop SortableJS
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indeks untuk performa query urutan etalase
CREATE INDEX IF NOT EXISTS idx_seller_products_position ON public.seller_products(seller_id, position);
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(category);
CREATE INDEX IF NOT EXISTS idx_products_attributes_gin ON public.products USING GIN (attributes);

-- Aktifkan Realtime Replication untuk tabel seller_products dan products
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.seller_products;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.products;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Data awal (Seeding) untuk pengujian langsung
INSERT INTO public.products (id, name, slug, category, price, original_price, stock, weight, description, image_url, rating, sold_count, badge, attributes)
VALUES
(
  'prd-kopi-gayo',
  'Kopi Gayo Premium 100g',
  'kopi-gayo-premium',
  'kopi',
  22000,
  28000,
  120,
  100,
  'Kopi Gayo Premium dipetik dari perkebunan dataran tinggi Bener Meriah, Aceh (1.400–1.600 mdpl). Proses wet-hulled khas Aceh menghasilkan cita rasa karamel pekat dan acidity lembut.',
  'https://images.unsplash.com/photo-1610889556528-9a770e32642f?w=900&q=80',
  4.9,
  '520+ terjual',
  'Specialty Grade',
  '{
    "weights": ["100g", "200g", "500g", "1kg"],
    "grind_sizes": ["Biji Utuh (Whole Bean)", "Giling Kasar (Coarse)", "Giling Sedang (Medium)", "Giling Halus (Fine)"],
    "roast_level": "Medium Dark",
    "origin": "Takengon, Aceh Tengah"
  }'::jsonb
),
(
  'prd-baju-tenun',
  'Kemeja Tenun Ikat Wastra Nusantara',
  'kemeja-tenun-ikat-wastra',
  'baju',
  285000,
  350000,
  45,
  350,
  'Kemeja pria kasual modern dengan motif tenun ikat tradisional Flores NTT berbahan katun tenun tangan adem dengan furing halus.',
  'https://images.unsplash.com/photo-1596461404969-9ae70f2830c1?w=900&q=80',
  5.0,
  '85+ terjual',
  'Handmade Artisan',
  '{
    "colors": ["Indigo Blue", "Terracotta Red", "Natural Black", "Forest Green"],
    "sizes": ["S", "M", "L", "XL", "XXL"],
    "material": "Katun Tenun Tradisional Tangan Asli",
    "size_guide": "Regular Fit (Pria)"
  }'::jsonb
),
(
  'prd-madu-hutan',
  'Madu Hutan Asli Kalimantan 250ml',
  'madu-hutan-kalimantan',
  'herbal',
  65000,
  78000,
  80,
  350,
  'Madu murni hasil panen lebah liar Apis dorsata pada pohon sialang hutan tropis Kapuas Hulu tanpa pemanasan buatan.',
  'https://images.unsplash.com/photo-1571115177098-24ec42ed204d?w=900&q=80',
  4.9,
  '310+ terjual',
  'Organik Alami',
  '{
    "volume": "250ml",
    "origin": "Kapuas Hulu, Kalimantan Barat",
    "cert": "Organik Alami Bebas Gula Tambahan"
  }'::jsonb
),
(
  'prd-beras-organik',
  'Beras Organik Merah 1kg',
  'beras-organik-merah',
  'pangan',
  32000,
  38000,
  200,
  1000,
  'Beras merah organik kaya serat ditanam di Cianjur dengan pupuk alami tanpa pestisida sintetis.',
  'https://images.unsplash.com/photo-1574943320219-553eb213f72d?w=900&q=80',
  4.9,
  '530+ terjual',
  'Sertifikasi Organik',
  '{
    "pack_size": "1kg",
    "origin": "Cianjur, Jawa Barat",
    "shelf_life": "12 Bulan"
  }'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  attributes = EXCLUDED.attributes,
  updated_at = NOW();

-- Sinkronisasi ke tabel seller_products
INSERT INTO public.seller_products (id, product_id, seller_id, name, category, price, stock, image_url, position, attributes)
VALUES
  ('sp-01', 'prd-kopi-gayo', 'default_seller', 'Kopi Gayo Premium 100g', 'kopi', 22000, 120, 'https://images.unsplash.com/photo-1610889556528-9a770e32642f?w=400&q=75', 1, '{"weights": ["100g", "200g", "500g", "1kg"], "grind_sizes": ["Biji Utuh", "Giling Kasar", "Giling Sedang", "Giling Halus"]}'::jsonb),
  ('sp-02', 'prd-baju-tenun', 'default_seller', 'Kemeja Tenun Ikat Wastra Nusantara', 'baju', 285000, 45, 'https://images.unsplash.com/photo-1596461404969-9ae70f2830c1?w=400&q=75', 2, '{"colors": ["Indigo Blue", "Terracotta Red", "Natural Black"], "sizes": ["S", "M", "L", "XL"]}'::jsonb),
  ('sp-03', 'prd-madu-hutan', 'default_seller', 'Madu Hutan Asli Kalimantan 250ml', 'herbal', 65000, 80, 'https://images.unsplash.com/photo-1571115177098-24ec42ed204d?w=400&q=75', 3, '{}'::jsonb),
  ('sp-04', 'prd-beras-organik', 'default_seller', 'Beras Organik Merah 1kg', 'pangan', 32000, 200, 'https://images.unsplash.com/photo-1574943320219-553eb213f72d?w=400&q=75', 4, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET
  position = EXCLUDED.position,
  attributes = EXCLUDED.attributes,
  updated_at = NOW();
