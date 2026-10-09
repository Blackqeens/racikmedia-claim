/**
 * BOB · Racik Media Nusantara
 * Mock API Layer — Articles Module
 * ─────────────────────────────────────────────────────────────────────────────
 * File ini mensimulasikan seluruh endpoint backend menggunakan localStorage
 * sebagai "database" sementara.
 *
 * Cara pakai di halaman HTML:
 *   <script src="../../api/articles.js"></script>
 *   ArticlesAPI.getPublished().then(data => console.log(data));
 *
 * Saat backend nyata sudah siap, cukup ganti implementasi fungsi di bawah
 * dari localStorage menjadi fetch('/api/v1/...') — antarmuka (nama fungsi &
 * return value) tetap sama sehingga TIDAK ADA perubahan di halaman HTML.
 * ─────────────────────────────────────────────────────────────────────────────
 */

(function (global) {
  'use strict';

  /* ═══════════════════════════════════════════════════════════
     STORAGE KEY
  ═══════════════════════════════════════════════════════════ */
  var STORE_KEY = 'bob_articles_db';

  /* ═══════════════════════════════════════════════════════════
     SEED DATA — data awal jika localStorage kosong
     (Mencerminkan isi mock data di articles.html & moderation.html)
  ═══════════════════════════════════════════════════════════ */
  var SEED = [
    {
      id: 'art-001',
      user_id: 'user-002', author: 'Sinta Maharani', email: 'sinta@email.com',
      title:    'Kopi Gayo dan Warisan Rasa yang Tak Tergantikan',
      content:  '<p>Di balik setiap cangkir kopi Gayo tersimpan cerita panjang tentang perjuangan petani di dataran tinggi Aceh yang mempertahankan cara pengolahan tradisional mereka selama berabad-abad. Aromanya yang khas — sedikit floral, sedikit earthy — bukan sekadar kebetulan alam, melainkan hasil dari proses <em>wet-hulling</em> yang unik dan hanya ditemukan di Aceh.</p><h2>Sejarah yang Tersimpan di Tiap Biji</h2><p>Kopi pertama kali masuk ke dataran tinggi Gayo pada abad ke-17, dibawa oleh pedagang dari Yaman melalui jalur rempah-rempah Nusantara.</p>',
      excerpt:  'Di balik setiap cangkir kopi Gayo tersimpan cerita panjang tentang perjuangan petani di dataran tinggi Aceh yang mempertahankan cara pengolahan tradisional.',
      category: 'kuliner',
      tags:     ['kopi', 'aceh', 'tradisional'],
      status:   'published',
      cover_url: 'https://images.unsplash.com/photo-1610889556528-9a770e32642f?w=900&q=80',
      word_count: 842, featured: true,
      admin_notes: null, reviewed_by: 'user-001', reviewed_at: '2025-09-21T09:00:00Z',
      published_at: '2025-09-21T09:00:00Z',
      created_at: '2025-09-21T08:14:00Z', updated_at: '2025-09-21T09:00:00Z',
    },
    {
      id: 'art-002',
      user_id: 'user-003', author: 'Budi Santoso', email: 'budi@email.com',
      title:    'Anyaman Rotan Cirebon: Jalan Panjang ke Pasar Global',
      content:  '<p>Desa Tegalwangi di Cirebon telah melahirkan ribuan pengrajin rotan selama berabad-abad. Dengan tekad dan inovasi, mereka kini menembus pasar Eropa dan Amerika.</p>',
      excerpt:  'Desa Tegalwangi di Cirebon telah melahirkan ribuan pengrajin rotan selama berabad-abad. Dengan tekad dan inovasi, mereka kini menembus pasar Eropa dan Amerika.',
      category: 'kerajinan',
      tags:     ['rotan', 'cirebon', 'kerajinan'],
      status:   'published',
      cover_url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=900&q=80',
      word_count: 1120, featured: true,
      admin_notes: null, reviewed_by: 'user-001', reviewed_at: '2025-09-20T16:00:00Z',
      published_at: '2025-09-20T16:00:00Z',
      created_at: '2025-09-20T15:30:00Z', updated_at: '2025-09-20T16:00:00Z',
    },
    {
      id: 'art-003',
      user_id: 'user-004', author: 'Ayu Lestari', email: 'ayu@email.com',
      title:    'Madu Hutan Kalimantan: Kekayaan Alam yang Mulai Langka',
      content:  '<p>Para pemburu madu tradisional di Kalimantan Tengah mewariskan teknik pendakian pohon sialang secara turun-temurun.</p>',
      excerpt:  'Para pemburu madu tradisional di Kalimantan Tengah mewariskan teknik pendakian pohon sialang secara turun-temurun.',
      category: 'agrikultur',
      tags:     ['madu', 'kalimantan', 'hutan'],
      status:   'pending_review',
      cover_url: 'https://images.unsplash.com/photo-1571115177098-24ec42ed204d?w=900&q=80',
      word_count: 760, featured: false,
      admin_notes: null, reviewed_by: null, reviewed_at: null, published_at: null,
      created_at: '2025-09-19T11:00:00Z', updated_at: '2025-09-19T11:00:00Z',
    },
    {
      id: 'art-004',
      user_id: 'user-005', author: 'Reza Pratama', email: 'reza@email.com',
      title:    'Ekowisata Mangrove Berau: Peluang yang Terabaikan',
      content:  '<p>Hutan mangrove seluas 350 hektare di Berau, Kalimantan Timur, menyimpan potensi ekowisata luar biasa.</p>',
      excerpt:  'Hutan mangrove seluas 350 hektare di Berau, Kalimantan Timur, menyimpan potensi ekowisata luar biasa.',
      category: 'wisata',
      tags:     ['mangrove', 'berau', 'ekowisata'],
      status:   'pending_review',
      cover_url: 'https://images.unsplash.com/photo-1508193638397-1c4234db14d8?w=900&q=80',
      word_count: 978, featured: false,
      admin_notes: null, reviewed_by: null, reviewed_at: null, published_at: null,
      created_at: '2025-09-18T09:45:00Z', updated_at: '2025-09-18T09:45:00Z',
    },
    {
      id: 'art-005',
      user_id: 'user-006', author: 'Dewi Rahayu', email: 'dewi@email.com',
      title:    'Tenun Ikat NTT: Motif Leluhur di Panggung Dunia',
      content:  '<p>Desainer muda lokal berkolaborasi dengan penenun lansia di Flores untuk menjaga motif adat tetap hidup.</p>',
      excerpt:  'Desainer muda lokal berkolaborasi dengan penenun lansia di Flores untuk menjaga motif adat tetap hidup dan relevan.',
      category: 'budaya',
      tags:     ['tenun', 'ntt', 'budaya'],
      status:   'published',
      cover_url: 'https://images.unsplash.com/photo-1444858291040-58f756a3bdd6?w=900&q=80',
      word_count: 650, featured: false,
      admin_notes: null, reviewed_by: 'user-001', reviewed_at: '2025-09-15T12:00:00Z',
      published_at: '2025-09-15T12:00:00Z',
      created_at: '2025-09-15T11:00:00Z', updated_at: '2025-09-15T12:00:00Z',
    },
  ];

  /* ═══════════════════════════════════════════════════════════
     INTERNAL STORAGE HELPERS
  ═══════════════════════════════════════════════════════════ */

  function _load() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    // First run: seed and persist
    _save(SEED.map(function (a) { return Object.assign({}, a); }));
    return _load();
  }

  function _save(articles) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(articles));
    } catch (e) {
      console.warn('[ArticlesAPI] localStorage write failed:', e);
    }
  }

  function _uuid() {
    return 'art-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
  }

  function _now() { return new Date().toISOString(); }

  /** Simulate async network delay (50–150ms) */
  function _async(fn) {
    return new Promise(function (resolve, reject) {
      setTimeout(function () {
        try { resolve(fn()); }
        catch (e) { reject(e); }
      }, 50 + Math.random() * 100);
    });
  }

  /* ═══════════════════════════════════════════════════════════
     VALIDATION
  ═══════════════════════════════════════════════════════════ */
  var VALID_CATEGORIES = [
    'agrikultur','kuliner','kerajinan','budaya','sosial',
    'lingkungan','wisata','catatan-buku','jurnal','ulasan','ekonomi-lokal'
  ];

  function _validate(data) {
    var errs = {};
    if (!data.title || data.title.trim().length < 5)
      errs.title = 'Judul wajib diisi dan minimal 5 karakter.';
    if (!data.content || data.content.trim() === '')
      errs.content = 'Isi konten tidak boleh kosong.';
    if (!data.category || VALID_CATEGORIES.indexOf(data.category) === -1)
      errs.category = 'Pilih kategori yang valid.';
    return Object.keys(errs).length ? errs : null;
  }

  /* ═══════════════════════════════════════════════════════════
     AUTH HELPERS
   ═══════════════════════════════════════════════════════════ */

  /**
   * Kembalikan role pengguna yang sedang login dari sessionStorage.
   * Nilai disimpan saat login di pages/login.html → 'admin' | 'member' | null
   */
  function _currentRole() {
    return sessionStorage.getItem('bob_user_role') || null;
  }

  /**
   * Guard: lempar error 401/403 jika bukan admin.
   * Dipanggil di awal setiap fungsi yang hanya boleh diakses admin.
   */
  function _requireAdmin() {
    var role = _currentRole();
    if (!role)           throw { status: 401, error: 'Unauthorized. Silakan login terlebih dahulu.', code: 'AUTH_REQUIRED' };
    if (role !== 'admin') throw { status: 403, error: 'Forbidden. Hanya Admin yang dapat mengakses endpoint ini.', code: 'ADMIN_ONLY' };
  }

  /* ═══════════════════════════════════════════════════════════
     MOCK EMAIL NOTIFICATIONS (log ke console)
   ═══════════════════════════════════════════════════════════ */
  function _sendEmail(type, article) {
    var templates = {
      article_approved: {
        subject: '[BOB] Selamat! Artikel Anda Diterbitkan',
        body: 'Halo ' + article.author + ', artikel "' + article.title + '" telah disetujui dan kini tampil di halaman utama BOB.'
      },
      article_rejected: {
        subject: '[BOB] Artikel Anda Perlu Perbaikan',
        body: 'Halo ' + article.author + ', artikel "' + article.title + '" belum dapat diterbitkan.\nCatatan admin: ' + (article.admin_notes || '-')
      },
      article_draft_returned: {
        subject: '[BOB] Artikel Dikembalikan ke Draft',
        body: 'Halo ' + article.author + ', artikel "' + article.title + '" dikembalikan ke draft Anda.\nCatatan: ' + (article.admin_notes || '-')
      },
      admin_new_submission: {
        subject: '[BOB Admin] Pengajuan Artikel Baru',
        body: 'Artikel baru dari ' + article.author + ': "' + article.title + '" menunggu review di dasbor moderasi.'
      },
    };
    var tpl = templates[type] || { subject: type, body: JSON.stringify(article) };
    console.group('[ArticlesAPI] 📧 Email Notification — ' + type);
    console.log('To     :', article.email || 'admin@bob.id');
    console.log('Subject:', tpl.subject);
    console.log('Body   :', tpl.body);
    console.groupEnd();

    // Persist to email log in localStorage
    try {
      var log = JSON.parse(localStorage.getItem('bob_email_log') || '[]');
      log.push({ type: type, to: article.email, subject: tpl.subject, sent_at: _now() });
      localStorage.setItem('bob_email_log', JSON.stringify(log.slice(-50)));
    } catch (e) {}
  }

  /* ═══════════════════════════════════════════════════════════
     PUBLIC API
  ═══════════════════════════════════════════════════════════ */
  var ArticlesAPI = {

    /* ──────────────────────────────────────────────────────────
       1. GET PUBLISHED ARTICLES
          → articles.html, dashboard.html
          Backend: GET /api/v1/articles?status=published
          Rule: HANYA status='published' yang dikembalikan
    ─────────────────────────────────────────────────────────── */
    getPublished: function (opts) {
      opts = opts || {};
      return _async(function () {
        var all = _load();

        /* ▸ SECURITY: Filter ketat — HANYA 'published' yang lolos.
             Draft & pending_review tidak pernah dikembalikan ke halaman publik,
             bahkan jika ada bug di pemanggil. Double-check eksplisit di sini. */
        var list = all.filter(function (a) {
          return a.status === 'published' &&      // harus published
                 a.published_at !== null &&        // harus punya tanggal terbit
                 a.published_at !== undefined;
        });

        /* ▸ Filter kategori */
        if (opts.category) {
          list = list.filter(function (a) { return a.category === opts.category; });
        }

        /* ▸ Full-text search (judul + excerpt) */
        if (opts.q) {
          var q = opts.q.toLowerCase();
          list = list.filter(function (a) {
            return a.title.toLowerCase().indexOf(q) !== -1 ||
                   (a.excerpt || '').toLowerCase().indexOf(q) !== -1 ||
                   a.author.toLowerCase().indexOf(q) !== -1;
          });
        }

        /* ▸ Sort */
        var sort = opts.sort || 'newest';
        list.sort(function (x, y) {
          if (sort === 'newest')  return new Date(y.published_at) - new Date(x.published_at);
          if (sort === 'oldest')  return new Date(x.published_at) - new Date(y.published_at);
          if (sort === 'longest') return (y.word_count || 0) - (x.word_count || 0);
          return 0;
        });

        /* ▸ Pagination */
        var page  = opts.page  || 1;
        var limit = Math.min(opts.limit || 12, 50); // max 50 per halaman
        var total = list.length;
        var slice = list.slice((page - 1) * limit, page * limit);

        /* ▸ SECURITY: Proyeksi — hanya field publik yang dikembalikan.
             Field sensitif (email, content HTML, admin_notes, reviewed_by)
             tidak pernah masuk ke respons halaman publik. */
        var sanitized = slice.map(function (a) {
          return {
            id:           a.id,
            title:        a.title,
            excerpt:      a.excerpt,
            cover_url:    a.cover_url,
            category:     a.category,
            tags:         a.tags         || [],
            word_count:   a.word_count   || 0,
            featured:     a.featured     || false,
            published_at: a.published_at,
            author: { id: a.user_id, name: a.author, avatar_url: null },
            // status TIDAK disertakan — tidak perlu diekspos ke publik
          };
        });

        return {
          data: sanitized,
          meta: { total: total, page: page, limit: limit, total_pages: Math.ceil(total / limit) },
        };
      });
    },

    /* ──────────────────────────────────────────────────────────
       2. GET SINGLE ARTICLE (full content)
          Backend: GET /api/v1/articles/:id
    ─────────────────────────────────────────────────────────── */
    getById: function (id) {
      return _async(function () {
        var all = _load();
        var art = all.find(function (a) { return a.id === id; });
        if (!art) throw { status: 404, error: 'Artikel tidak ditemukan.', code: 'NOT_FOUND' };

        /* ▸ SECURITY: Blokir akses publik ke artikel non-published.
             Pesan error sengaja dibedakan agar penulis tahu status artikelnya,
             tapi tanpa membocorkan konten ke pengguna lain. */
        if (art.status === 'draft') {
          throw { status: 403, error: 'Artikel ini adalah draft pribadi penulis.', code: 'DRAFT_PRIVATE' };
        }
        if (art.status === 'pending_review') {
          throw { status: 403, error: 'Artikel sedang dalam proses review admin dan belum tersedia.', code: 'PENDING_REVIEW' };
        }
        if (art.status === 'rejected') {
          throw { status: 403, error: 'Artikel tidak dapat diakses.', code: 'NOT_AVAILABLE' };
        }
        if (art.status !== 'published') {
          throw { status: 403, error: 'Artikel belum diterbitkan.', code: 'NOT_PUBLISHED' };
        }

        /* Kembalikan artikel lengkap (termasuk content HTML) — tanpa email penulis */
        return {
          id:           art.id,
          title:        art.title,
          content:      art.content,
          excerpt:      art.excerpt,
          cover_url:    art.cover_url,
          category:     art.category,
          tags:         art.tags         || [],
          word_count:   art.word_count   || 0,
          status:       art.status,
          published_at: art.published_at,
          admin_notes:  null,            // tidak dibocorkan ke publik
          author: { id: art.user_id, name: art.author, avatar_url: null },
        };
      });
    },

    /* ──────────────────────────────────────────────────────────
       3. SAVE DRAFT
          → tombol "Simpan ke Catatan Buku" di write.html
          Backend: POST /api/v1/articles/draft
          Menyimpan dengan status = 'draft'
    ─────────────────────────────────────────────────────────── */
    saveDraft: function (payload) {
      return _async(function () {
        var errs = _validate(payload);
        if (errs) throw { status: 422, error: 'Validation failed', fields: errs };

        var all     = _load();
        var author  = sessionStorage.getItem('bob_user_name')  || 'Pengguna';
        var email   = sessionStorage.getItem('bob_user_email') || '';
        var now     = _now();

        /* Update existing draft if draft_id provided */
        if (payload.draft_id) {
          var idx = all.findIndex(function (a) { return a.id === payload.draft_id; });
          if (idx !== -1 && (all[idx].status === 'draft' || all[idx].status === 'rejected')) {
            all[idx] = Object.assign(all[idx], {
              title: payload.title.trim(),
              content: payload.content,
              category: payload.category,
              tags: payload.tags || [],
              cover_url: payload.cover_url || null,
              status: 'draft',
              updated_at: now,
            });
            _save(all);
            return { id: all[idx].id, status: 'draft', message: 'Draft berhasil diperbarui.' };
          }
        }

        /* Create new draft */
        var article = {
          id: _uuid(), user_id: 'user-current',
          author: author, email: email,
          title: payload.title.trim(),
          content: payload.content,
          excerpt: payload.excerpt || payload.content.replace(/<[^>]+>/g, '').slice(0, 200),
          category: payload.category,
          tags: payload.tags || [],
          cover_url: payload.cover_url || null,
          status: 'draft',
          word_count: payload.word_count || 0,
          featured: false,
          admin_notes: null, reviewed_by: null, reviewed_at: null, published_at: null,
          created_at: now, updated_at: now,
        };
        all.push(article);
        _save(all);

        console.log('[ArticlesAPI] Draft saved:', article.id, article.title);
        return { id: article.id, status: 'draft', message: 'Artikel berhasil disimpan ke Catatan Buku.' };
      });
    },

    /* ──────────────────────────────────────────────────────────
       4. SUBMIT FOR REVIEW
          → tombol "Ajukan ke Halaman Utama" di write.html
          Backend: POST /api/v1/articles/submit
          Menyimpan dengan status = 'pending_review'
          Memicu notifikasi email ke admin
    ─────────────────────────────────────────────────────────── */
    submitForReview: function (payload) {
      return _async(function () {
        var errs = _validate(payload);
        if (errs) throw { status: 422, error: 'Validation failed', fields: errs };

        var all    = _load();
        var author = sessionStorage.getItem('bob_user_name')  || 'Pengguna';
        var email  = sessionStorage.getItem('bob_user_email') || '';
        var now    = _now();

        /* Update existing draft → pending */
        if (payload.draft_id) {
          var idx = all.findIndex(function (a) { return a.id === payload.draft_id; });
          if (idx !== -1) {
            all[idx] = Object.assign(all[idx], {
              title: payload.title.trim(),
              content: payload.content,
              category: payload.category,
              tags: payload.tags || [],
              cover_url: payload.cover_url || null,
              status: 'pending_review',
              updated_at: now,
            });
            _save(all);
            _sendEmail('admin_new_submission', all[idx]);
            console.log('[ArticlesAPI] Submitted for review:', all[idx].id);
            return { id: all[idx].id, status: 'pending_review', message: 'Artikel berhasil diajukan ke halaman utama.' };
          }
        }

        /* Create new submission */
        var article = {
          id: _uuid(), user_id: 'user-current',
          author: author, email: email,
          title: payload.title.trim(),
          content: payload.content,
          excerpt: payload.excerpt || payload.content.replace(/<[^>]+>/g, '').slice(0, 200),
          category: payload.category,
          tags: payload.tags || [],
          cover_url: payload.cover_url || null,
          status: 'pending_review',
          word_count: payload.word_count || 0,
          featured: false,
          admin_notes: null, reviewed_by: null, reviewed_at: null, published_at: null,
          created_at: now, updated_at: now,
        };
        all.push(article);
        _save(all);
        _sendEmail('admin_new_submission', article);
        console.log('[ArticlesAPI] New submission:', article.id, article.title);
        return { id: article.id, status: 'pending_review', message: 'Artikel berhasil diajukan dan sedang menunggu review admin.' };
      });
    },

    /* ──────────────────────────────────────────────────────────
       5. GET PENDING ARTICLES (ADMIN)
          → moderation.html
          Backend: GET /api/v1/admin/articles/pending
          Rule: HANYA status='pending_review'
    ─────────────────────────────────────────────────────────── */
    adminGetPending: function (opts) {
      opts = opts || {};
      return _async(function () {
        /* ▸ AUTH GUARD: hanya admin yang boleh mengakses antrian moderasi */
        _requireAdmin();

        var all = _load();

        /* ▸ HANYA 'pending_review' untuk antrian moderasi */
        var list = all.filter(function (a) { return a.status === 'pending_review'; });

        if (opts.category) list = list.filter(function (a) { return a.category === opts.category; });

        if (opts.q) {
          var q = opts.q.toLowerCase();
          list = list.filter(function (a) {
            return a.title.toLowerCase().indexOf(q) !== -1 ||
                   a.author.toLowerCase().indexOf(q) !== -1;
          });
        }

        /* FIFO — yang paling lama menunggu tampil duluan */
        var sort = opts.sort || 'oldest';
        list.sort(function (x, y) {
          return sort === 'oldest'
            ? new Date(x.created_at) - new Date(y.created_at)
            : new Date(y.created_at) - new Date(x.created_at);
        });

        var page  = opts.page  || 1;
        var limit = opts.limit || 20;
        var slice = list.slice((page - 1) * limit, page * limit);

        return {
          data: slice.map(function (a) {
            return {
              id: a.id, title: a.title, excerpt: a.excerpt,
              cover_url: a.cover_url, category: a.category,
              word_count: a.word_count, submitted_at: a.created_at,
              author: { id: a.user_id, name: a.author, email: a.email },
            };
          }),
          meta: { total_pending: list.length, page: page, limit: limit },
        };
      });
    },

    /* ──────────────────────────────────────────────────────────
       6. ADMIN REVIEW — APPROVE / REJECT / RETURN TO DRAFT
          → article-preview.html
          Backend: POST /api/v1/admin/articles/:id/review
    ─────────────────────────────────────────────────────────── */
    adminReview: function (id, action, note) {
      return _async(function () {
        /* ▸ AUTH GUARD: hanya admin yang boleh melakukan review */
        _requireAdmin();

        var all = _load();
        var idx = all.findIndex(function (a) { return a.id === id; });
        if (idx === -1) throw { status: 404, error: 'Artikel tidak ditemukan.', code: 'NOT_FOUND' };

        var art = all[idx];
        var now = _now();
        var emailType;

        if (action === 'approved') {
          /* ── Setujui & Terbitkan ── */
          art.status       = 'published';
          art.published_at = now;
          art.admin_notes  = note || null;
          art.reviewed_by  = 'admin-current';
          art.reviewed_at  = now;
          art.updated_at   = now;
          emailType        = 'article_approved';

        } else if (action === 'rejected') {
          /* ── Tolak — tetap rejected, tidak tampil publik ── */
          art.status       = 'rejected';
          art.admin_notes  = note || null;
          art.reviewed_by  = 'admin-current';
          art.reviewed_at  = now;
          art.updated_at   = now;
          emailType        = 'article_rejected';

        } else if (action === 'draft') {
          /* ── Kembalikan ke Draft ── */
          art.status       = 'draft';
          art.admin_notes  = note || null;
          art.reviewed_by  = 'admin-current';
          art.reviewed_at  = now;
          art.updated_at   = now;
          art.published_at = null;
          emailType        = 'article_draft_returned';

        } else {
          throw { status: 400, error: 'Action tidak valid. Gunakan: approved | rejected | draft' };
        }

        all[idx] = art;
        _save(all);
        _sendEmail(emailType, art);

        console.log('[ArticlesAPI] Review:', id, '→', art.status);
        return {
          id: art.id,
          status: art.status,
          published_at: art.published_at,
          message: {
            approved: 'Artikel diterbitkan dan email sukses dikirim ke ' + art.email,
            rejected: 'Artikel ditolak dan email penolakan dikirim ke ' + art.email,
            draft:    'Artikel dikembalikan ke draft dan email revisi dikirim ke ' + art.email,
          }[action],
        };
      });
    },

    /* ──────────────────────────────────────────────────────────
       7. GET SINGLE ARTICLE FOR ADMIN (include non-published)
          → article-preview.html
    ─────────────────────────────────────────────────────────── */
    adminGetById: function (id) {
      return _async(function () {
        /* ▸ AUTH GUARD: hanya admin yang boleh melihat artikel non-published */
        _requireAdmin();

        var all = _load();
        var art = all.find(function (a) { return a.id === id; });
        if (!art) throw { status: 404, error: 'Artikel tidak ditemukan.', code: 'NOT_FOUND' };

        /* Admin mendapatkan data lengkap termasuk content & admin_notes */
        return Object.assign({}, art);
      });
    },

    /* ──────────────────────────────────────────────────────────
       8. GET STATS (untuk stats strip di moderation.html)
    ─────────────────────────────────────────────────────────── */
    getStats: function () {
      return _async(function () {
        var all = _load();
        return {
          pending:   all.filter(function (a) { return a.status === 'pending_review'; }).length,
          published: all.filter(function (a) { return a.status === 'published'; }).length,
          draft:     all.filter(function (a) { return a.status === 'draft'; }).length,
          rejected:  all.filter(function (a) { return a.status === 'rejected'; }).length,
          total:     all.length,
          authors:   new Set(all.map(function (a) { return a.user_id; })).size,
        };
      });
    },

    /* ──────────────────────────────────────────────────────────
       DEV HELPER — reset ke seed data
    ─────────────────────────────────────────────────────────── */
    _reset: function () {
      localStorage.removeItem(STORE_KEY);
      console.log('[ArticlesAPI] Database reset to seed data.');
    },
  };

  /* Expose globally */
  global.ArticlesAPI = ArticlesAPI;

}(window));
