/**
 * articles-i18n.js — BOB · Racik Media Nusantara
 * ─────────────────────────────────────────────────────────────────────────────
 * SKENARIO A: REST API Endpoint dengan Dynamic Language Detection
 *
 * File ini adalah contoh implementasi Node.js (Express/Fastify) yang
 * menangani query artikel multi-bahasa. Ditulis dalam gaya yang bisa
 * dipahami junior developer sekalipun.
 *
 * PRASYARAT:
 *   npm install express pg              (untuk production)
 *   npm install express-rate-limit      (opsional, untuk keamanan)
 *
 * CARA PAKAI:
 *   const articlesI18n = require('./api/articles-i18n');
 *   app.use('/api/v1', articlesI18n);
 *
 * ENDPOINT YANG DISEDIAKAN:
 *   GET /api/v1/articles?lang=en                  → daftar artikel
 *   GET /api/v1/articles/:id?lang=en              → detail artikel
 *   POST /api/v1/articles/:id/translations        → simpan terjemahan manual
 *   POST /api/v1/articles/:id/translations/promote → promote cache ke published
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const express = require('express');
const { Pool } = require('pg');   // Driver PostgreSQL

const router = express.Router();

// ─────────────────────────────────────────────────────────────
// KONFIGURASI DATABASE
// Gunakan environment variable — JANGAN tulis credentials di sini
// ─────────────────────────────────────────────────────────────
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Contoh isi .env:
  // DATABASE_URL=postgresql://user:password@host:5432/racik_media_db
  ssl: process.env.NODE_ENV === 'production'
    ? {
        rejectUnauthorized: true,
        ...(process.env.DATABASE_SSL_CA ? { ca: process.env.DATABASE_SSL_CA } : {}),
      }
    : false,
});


// ─────────────────────────────────────────────────────────────
// HELPER: VALIDASI KODE BAHASA
// ─────────────────────────────────────────────────────────────

/**
 * Daftar bahasa yang didukung platform.
 * Tambahkan bahasa baru di sini saja — tidak perlu ubah logika lain.
 */
const SUPPORTED_LANGS = ['id', 'en', 'zh', 'ar', 'ja'];
const DEFAULT_LANG    = 'id';

/**
 * Deteksi bahasa dari berbagai sumber request.
 * Urutan prioritas (dari tertinggi ke terendah):
 *   1. Query param: ?lang=en          → pilihan eksplisit user
 *   2. Header Accept-Language         → setting browser user
 *   3. Header X-App-Language          → header custom dari frontend
 *   4. Default: 'id'                  → fallback final
 *
 * @param {import('express').Request} req
 * @returns {string} kode bahasa yang valid ('id', 'en', dst.)
 */
function detectLanguage(req) {
  // 1. Query param (paling eksplisit — selalu prioritas utama)
  const fromQuery = req.query.lang;
  if (fromQuery && SUPPORTED_LANGS.includes(fromQuery.toLowerCase())) {
    return fromQuery.toLowerCase();
  }

  // 2. Header custom dari frontend (dikirim oleh lang.js)
  const fromHeader = req.headers['x-app-language'];
  if (fromHeader && SUPPORTED_LANGS.includes(fromHeader.toLowerCase())) {
    return fromHeader.toLowerCase();
  }

  // 3. Accept-Language header dari browser
  // Format: "id,en-US;q=0.9,en;q=0.8" → ambil kode pertama
  const acceptLang = req.headers['accept-language'];
  if (acceptLang) {
    // Ambil kode 2 huruf pertama (sebelum koma atau dash)
    const primary = acceptLang.split(',')[0].split('-')[0].trim().toLowerCase();
    if (SUPPORTED_LANGS.includes(primary)) {
      return primary;
    }
  }

  // 4. Default fallback
  return DEFAULT_LANG;
}

/**
 * Format respons sukses yang konsisten.
 * Junior dev: SELALU pakai fungsi ini, bukan res.json({...}) langsung.
 */
function successResponse(res, data, meta = {}) {
  return res.json({ data, meta, error: null });
}

/**
 * Format respons error yang konsisten.
 * code: kode error mesin (untuk frontend handle)
 * message: pesan human-readable
 */
function errorResponse(res, statusCode, code, message) {
  return res.status(statusCode).json({
    data: null,
    error: { code, message },
    meta: {},
  });
}


// ─────────────────────────────────────────────────────────────
// ENDPOINT 1: GET /api/v1/articles
// Daftar artikel published dengan dukungan multi-bahasa.
//
// Query params:
//   lang     : string  = 'id'  → kode bahasa ('id', 'en', 'zh', ...)
//   page     : integer = 1     → nomor halaman
//   limit    : integer = 12    → artikel per halaman (max 50)
//   category : string          → filter kategori
//   q        : string          → full-text search
//
// Logika:
//   1. Deteksi bahasa dari request
//   2. Query artikel published
//   3. Untuk setiap artikel, JOIN ke article_translations jika bahasa ≠ 'id'
//   4. Jika terjemahan tidak ada → kembalikan konten asli (fallback)
// ─────────────────────────────────────────────────────────────
router.get('/articles', async (req, res) => {
  // --- 1. Deteksi bahasa ---
  const lang = detectLanguage(req);

  // --- 2. Validasi & sanitasi parameter pagination ---
  const page  = Math.max(1, parseInt(req.query.page)  || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 12));
  const offset = (page - 1) * limit;

  // Kategori yang valid (sinkron dengan ENUM di schema.sql)
  const VALID_CATEGORIES = [
    'agrikultur','kuliner','kerajinan','budaya','sosial',
    'lingkungan','wisata','catatan-buku','jurnal','ulasan','ekonomi-lokal',
  ];
  const category = req.query.category && VALID_CATEGORIES.includes(req.query.category)
    ? req.query.category
    : null;

  // Search query — sanitasi panjang maksimum
  const q = req.query.q ? req.query.q.substring(0, 200).trim() : null;

  try {
    // --- 3. Query utama ---
    // Penjelasan SQL di bawah:
    //   COALESCE(t.title, a.title) → pakai terjemahan jika ada, fallback ke asli
    //   LEFT JOIN ke article_translations → tidak error meski terjemahan belum ada
    //   is_fallback → frontend bisa menampilkan badge "Terjemahan belum tersedia"
    const queryText = `
      SELECT
        a.id,
        a.cover_url,
        a.category,
        a.tags,
        a.word_count,
        a.published_at,
        -- Judul: pakai terjemahan jika ada, fallback ke asli
        COALESCE(t.title,   a.title)   AS title,
        -- Excerpt: pakai terjemahan jika ada, fallback ke asli
        COALESCE(t.excerpt, a.excerpt) AS excerpt,
        -- Apakah ini fallback? (terjemahan tidak tersedia)
        CASE WHEN t.id IS NULL THEN TRUE ELSE FALSE END AS is_fallback,
        -- Bahasa yang BENAR-BENAR dikembalikan
        CASE WHEN t.id IS NULL THEN 'id' ELSE $1 END    AS lang_served,
        -- Author
        u.id         AS author_id,
        u.name       AS author_name,
        u.avatar_url AS author_avatar,
        -- Total untuk pagination
        COUNT(*) OVER() AS total_count
      FROM articles a
      JOIN users u ON u.id = a.user_id
      -- LEFT JOIN: tidak wajib ada terjemahan
      LEFT JOIN article_translations t
        ON  t.article_id    = a.id
        AND t.lang_code     = $1
        AND t.review_status = 'approved'
      WHERE
        a.status = 'published'
        -- Filter kategori (opsional)
        AND ($2::TEXT IS NULL OR a.category::TEXT = $2)
        -- Full-text search (opsional) — cari di konten asli & terjemahan
        AND ($3::TEXT IS NULL OR (
          to_tsvector('indonesian', COALESCE(a.title,'') || ' ' || COALESCE(a.content_text,''))
            @@ plainto_tsquery('indonesian', $3)
          OR to_tsvector('english', COALESCE(t.title,'') || ' ' || COALESCE(t.content_text,''))
            @@ plainto_tsquery('english', $3)
        ))
      ORDER BY a.published_at DESC
      LIMIT  $4
      OFFSET $5
    `;

    const result = await db.query(queryText, [lang, category, q, limit, offset]);

    // --- 4. Format respons ---
    const total      = result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0;
    const totalPages = Math.ceil(total / limit);

    // Hapus total_count dari tiap baris (itu helper pagination, bukan data)
    const articles = result.rows.map(({ total_count, ...row }) => row);

    return successResponse(res, articles, {
      lang,           // bahasa yang diminta
      total,
      page,
      limit,
      total_pages: totalPages,
    });

  } catch (err) {
    console.error('[GET /articles] Database error:', err.message);
    return errorResponse(res, 500, 'DB_ERROR', 'Terjadi kesalahan server.');
  }
});


// ─────────────────────────────────────────────────────────────
// ENDPOINT 2: GET /api/v1/articles/:id
// Detail satu artikel dengan fallback bahasa.
//
// Logika: pakai fungsi fn_article_with_lang() dari schema-i18n.sql
//   yang sudah menangani fallback secara database-level.
// ─────────────────────────────────────────────────────────────
router.get('/articles/:id', async (req, res) => {
  const { id }  = req.params;
  const lang    = detectLanguage(req);

  // Validasi format UUID sederhana
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_REGEX.test(id)) {
    return errorResponse(res, 400, 'INVALID_ID', 'ID artikel tidak valid.');
  }

  try {
    // Panggil fungsi PostgreSQL yang sudah dibuat di schema-i18n.sql
    // Fungsi ini menangani fallback secara otomatis di level database
    const result = await db.query(
      'SELECT * FROM fn_article_with_lang($1, $2)',
      [id, lang]
    );

    if (result.rows.length === 0) {
      return errorResponse(res, 404, 'NOT_FOUND', 'Artikel tidak ditemukan.');
    }

    const article = result.rows[0];

    // Set header informatif untuk frontend
    // Frontend bisa menampilkan banner "Belum ada terjemahan bahasa ini"
    res.setHeader('X-Lang-Served',    article.lang_served);
    res.setHeader('X-Lang-Fallback',  article.is_fallback ? 'true' : 'false');
    res.setHeader('X-Lang-Requested', lang);

    return successResponse(res, article, { lang_requested: lang });

  } catch (err) {
    console.error('[GET /articles/:id] Database error:', err.message);
    return errorResponse(res, 500, 'DB_ERROR', 'Terjadi kesalahan server.');
  }
});


// ─────────────────────────────────────────────────────────────
// ENDPOINT 3: POST /api/v1/articles/:id/translations
// Simpan terjemahan MANUAL oleh penulis atau editor.
//
// Request body:
//   lang_code : string — 'en', 'zh', dst.
//   title     : string — judul dalam bahasa target
//   content   : string — isi HTML dalam bahasa target
//   excerpt   : string — (opsional) ringkasan
//
// Auth: perlu JWT dengan role 'member' atau 'admin'
// ─────────────────────────────────────────────────────────────
router.post('/articles/:id/translations', async (req, res) => {
  const { id } = req.params;
  const { lang_code, title, content, excerpt } = req.body;

  // --- Validasi ---
  if (!SUPPORTED_LANGS.includes(lang_code)) {
    return errorResponse(res, 400, 'INVALID_LANG',
      `Bahasa '${lang_code}' tidak didukung. Pilihan: ${SUPPORTED_LANGS.join(', ')}`);
  }
  if (lang_code === 'id') {
    return errorResponse(res, 400, 'INVALID_LANG',
      "Bahasa 'id' adalah konten asli. Edit langsung di artikel.");
  }
  if (!title || title.trim().length < 3) {
    return errorResponse(res, 422, 'VALIDATION_FAILED', 'Judul minimal 3 karakter.');
  }
  if (!content || content.trim().length === 0) {
    return errorResponse(res, 422, 'VALIDATION_FAILED', 'Konten tidak boleh kosong.');
  }

  // Ambil user_id dari JWT (diasumsikan middleware auth sudah parse token)
  // Contoh: const userId = req.user.id;
  // Untuk demo, hardcode — GANTI dengan middleware auth nyata
  const userId = req.user?.id || null;

  try {
    // UPSERT: jika terjemahan sudah ada untuk bahasa ini, update
    const result = await db.query(`
      INSERT INTO article_translations
        (article_id, lang_code, title, content, excerpt, source, review_status, created_by)
      VALUES
        ($1, $2, $3, $4, $5, 'manual', 'pending', $6)
      ON CONFLICT (article_id, lang_code) DO UPDATE
        SET title         = EXCLUDED.title,
            content       = EXCLUDED.content,
            excerpt       = EXCLUDED.excerpt,
            source        = 'manual',
            review_status = 'pending',  -- reset ke pending setelah edit
            updated_at    = NOW()
      RETURNING id, lang_code, review_status, created_at
    `, [id, lang_code, title.trim(), content.trim(), excerpt?.trim() || null, userId]);

    return res.status(201).json({
      data:    result.rows[0],
      message: 'Terjemahan berhasil disimpan dan menunggu review admin.',
      error:   null,
    });

  } catch (err) {
    console.error('[POST /articles/:id/translations] Error:', err.message);
    return errorResponse(res, 500, 'DB_ERROR', 'Terjadi kesalahan server.');
  }
});


// ─────────────────────────────────────────────────────────────
// ENDPOINT 4: POST /api/v1/articles/:id/translations/promote
// Admin mempromote cache AI ke article_translations (approve).
//
// Request body:
//   cache_id : UUID — ID baris di tabel translation_cache
//
// Auth: perlu JWT dengan role 'admin'
// ─────────────────────────────────────────────────────────────
router.post('/articles/:id/translations/promote', async (req, res) => {
  const { cache_id } = req.body;
  const adminId = req.user?.id || null;  // dari JWT middleware

  if (!cache_id) {
    return errorResponse(res, 400, 'MISSING_CACHE_ID', 'cache_id wajib diisi.');
  }

  try {
    // Panggil fungsi PostgreSQL dari schema-i18n.sql
    const result = await db.query(
      'SELECT fn_promote_cache_to_translation($1, $2) AS translation_id',
      [cache_id, adminId]
    );

    return res.status(200).json({
      data: { translation_id: result.rows[0].translation_id },
      message: 'Terjemahan AI berhasil dipublish.',
      error: null,
    });

  } catch (err) {
    console.error('[POST /translations/promote] Error:', err.message);
    if (err.message.includes('tidak ditemukan')) {
      return errorResponse(res, 404, 'NOT_FOUND', err.message);
    }
    return errorResponse(res, 500, 'DB_ERROR', 'Terjadi kesalahan server.');
  }
});


// ─────────────────────────────────────────────────────────────
// EKSPOR ROUTER
// ─────────────────────────────────────────────────────────────
module.exports = router;


/*
 * ──────────────────────────────────────────────────────────────
 * CARA INTEGRASI DI SERVER UTAMA (app.js / server.js)
 * ──────────────────────────────────────────────────────────────
 *
 * const express       = require('express');
 * const app           = express();
 * const articlesI18n  = require('./api/articles-i18n');
 *
 * app.use(express.json());
 * app.use('/api/v1', articlesI18n);
 *
 * app.listen(3000, () => console.log('Server jalan di port 3000'));
 *
 * ──────────────────────────────────────────────────────────────
 * CARA PAKAI DARI FRONTEND (JavaScript)
 * ──────────────────────────────────────────────────────────────
 *
 * // Ambil artikel dalam bahasa Inggris
 * const lang = localStorage.getItem('rm_lang') || 'id';
 *
 * fetch(`/api/v1/articles/art-001?lang=${lang}`, {
 *   headers: {
 *     'X-App-Language': lang,  // kirim juga sebagai header (backup)
 *   }
 * })
 * .then(r => r.json())
 * .then(json => {
 *   const { data } = json;
 *   document.querySelector('#article-title').textContent   = data.title;
 *   document.querySelector('#article-content').innerHTML   = data.content;
 *   document.querySelector('#article-excerpt').textContent = data.excerpt;
 *
 *   // Tampilkan banner jika konten belum diterjemahkan
 *   if (data.is_fallback) {
 *     document.querySelector('#lang-fallback-banner').style.display = 'block';
 *   }
 * });
 */
