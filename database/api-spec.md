# API Specification — Articles Module

# BOB · Racik Media Nusantara

# Version: 1.0

# Base URL: /api/v1

# Auth: Bearer JWT token (header: Authorization: Bearer <token>)

---

## Authentication & Roles

| Role     | Akses                                                    |
| -------- | -------------------------------------------------------- |
| `public` | GET published articles only                              |
| `member` | + POST draft, PUT own articles, POST submit for review   |
| `admin`  | + GET pending_review, POST review (approve/reject/draft) |

---

## Endpoints

---

### 1. GET /api/v1/articles

**Halaman publik artikel — `articles.html`, `dashboard.html`**

Hanya mengembalikan artikel berstatus `published`.
`draft` dan `pending_review` **tidak pernah** dikembalikan oleh endpoint ini.

**Auth:** Tidak diperlukan (public)

**Query Parameters:**
| Parameter | Type | Default | Keterangan |
|------------|---------|------------|------------------------------------------|
| `page` | integer | 1 | Nomor halaman |
| `limit` | integer | 12 | Jumlah artikel per halaman (max 50) |
| `category` | string | — | Filter kategori (kuliner, agrikultur…) |
| `sort` | string | `newest` | `newest` \| `oldest` \| `longest` |
| `q` | string | — | Full-text search pada judul & isi |

**Response 200:**

```json
{
  "data": [
    {
      "id": "art-001",
      "title": "Kopi Gayo dan Warisan Rasa yang Tak Tergantikan",
      "excerpt": "Di balik setiap cangkir kopi Gayo...",
      "cover_url": "https://...",
      "category": "kuliner",
      "tags": ["kopi", "aceh", "tradisional"],
      "word_count": 842,
      "published_at": "2025-09-21T08:14:00Z",
      "author": {
        "id": "user-002",
        "name": "Sinta Maharani",
        "avatar_url": null
      }
    }
  ],
  "meta": {
    "total": 24,
    "page": 1,
    "limit": 12,
    "total_pages": 2
  }
}
```

**Backend query (SQL):**

```sql
SELECT * FROM v_published_articles
WHERE  ($category IS NULL OR category = $category)
  AND  ($q IS NULL OR to_tsvector('indonesian', title || ' ' || content_text)
        @@ plainto_tsquery('indonesian', $q))
ORDER  BY published_at DESC
LIMIT  $limit OFFSET (($page - 1) * $limit);
```

---

### 2. GET /api/v1/articles/:id

**Detail artikel tunggal — halaman pembaca**

- Jika `status = published` → dapat diakses publik
- Jika `status = draft` → hanya pemilik artikel
- Jika `status = pending_review` → pemilik artikel + admin

**Auth:** Opsional (JWT jika perlu akses draft/pending)

**Response 200:**

```json
{
  "id": "art-001",
  "title": "Kopi Gayo dan Warisan Rasa yang Tak Tergantikan",
  "content": "<p>Di balik setiap cangkir...</p>",
  "excerpt": "Di balik setiap cangkir...",
  "cover_url": "https://...",
  "category": "kuliner",
  "tags": ["kopi", "aceh"],
  "word_count": 842,
  "status": "published",
  "published_at": "2025-09-21T08:14:00Z",
  "admin_notes": null,
  "author": {
    "id": "user-002",
    "name": "Sinta Maharani",
    "avatar_url": null
  }
}
```

**Response 403:** Artikel draft milik orang lain → `{"error": "Forbidden"}`
**Response 404:** Artikel tidak ditemukan

---

### 3. POST /api/v1/articles/draft

**Simpan tulisan sebagai draft — tombol "Simpan ke Catatan Buku" di `write.html`**

**Auth:** Bearer JWT (role: member)

**Request Body:**

```json
{
  "title": "Judul Artikel",
  "content": "<p>Isi HTML...</p>",
  "category": "kuliner",
  "tags": ["kopi", "tradisional"],
  "cover_url": null
}
```

**Logic:**

1. Validasi token JWT → dapatkan `user_id`
2. Validasi body: `title` (min 5 char), `content` (tidak kosong), `category` (harus valid)
3. INSERT ke tabel `articles` dengan `status = 'draft'`
4. Trigger otomatis mengisi `content_text`, `word_count`, `excerpt`
5. Return artikel yang dibuat

**Response 201:**

```json
{
  "id": "art-xyz",
  "status": "draft",
  "message": "Artikel berhasil disimpan ke Catatan Buku."
}
```

**Response 422:** Validasi gagal

```json
{
  "error": "Validation failed",
  "fields": { "title": "Judul wajib diisi dan minimal 5 karakter." }
}
```

---

### 4. PUT /api/v1/articles/:id

**Perbarui draft yang sudah ada**

**Auth:** Bearer JWT (role: member, hanya pemilik)

**Request Body:** Sama dengan POST draft (field yang diubah saja)

**Logic:**

1. Validasi token → pastikan `user_id = articles.user_id`
2. Hanya artikel berstatus `draft` atau `rejected` yang bisa diedit
3. UPDATE, trigger update `updated_at`, `content_text`, `word_count`

**Response 200:** Artikel yang diperbarui
**Response 403:** Bukan pemilik atau status bukan draft/rejected

---

### 5. POST /api/v1/articles/submit

**Ajukan artikel ke halaman utama — tombol "Ajukan ke Halaman Utama" di `write.html`**

**Auth:** Bearer JWT (role: member)

**Request Body:** Sama dengan POST draft

**Logic:**

1. Validasi token → dapatkan `user_id`
2. Validasi konten: judul, kategori, dan isi harus terisi
3. INSERT (atau UPDATE jika ada draft_id) dengan `status = 'pending_review'`
4. Kirim notifikasi in-app ke semua admin (insert ke `email_notifications` dengan type `admin_new_submission`)
5. Return artikel dengan status pending

**Response 201:**

```json
{
  "id": "art-xyz",
  "status": "pending_review",
  "message": "Artikel berhasil diajukan dan sedang menunggu review admin."
}
```

---

### 6. GET /api/v1/admin/articles/pending ← MODERASI ADMIN

**Antrian artikel pending_review — `moderation.html`**

**Auth:** Bearer JWT (role: admin)

**Query Parameters:**
| Parameter | Type | Default | Keterangan |
|------------|---------|------------|-------------------------------------|
| `page` | integer | 1 | |
| `limit` | integer | 20 | |
| `category` | string | — | Filter kategori |
| `sort` | string | `oldest` | `oldest` (FIFO) \| `newest` |
| `q` | string | — | Cari judul atau nama penulis |

**Backend query (SQL):**

```sql
SELECT * FROM v_pending_articles
WHERE  ($category IS NULL OR category = $category)
  AND  ($q IS NULL OR lower(title) LIKE '%' || lower($q) || '%'
        OR lower(author_name) LIKE '%' || lower($q) || '%')
ORDER  BY submitted_at ASC   -- FIFO: yang paling lama menunggu tampil duluan
LIMIT  $limit OFFSET (($page - 1) * $limit);
```

**Response 200:**

```json
{
  "data": [
    {
      "id": "art-003",
      "title": "Madu Hutan Kalimantan",
      "excerpt": "Para pemburu madu...",
      "cover_url": "https://...",
      "category": "agrikultur",
      "word_count": 760,
      "submitted_at": "2025-09-19T11:00:00Z",
      "author": {
        "id": "user-004",
        "name": "Ayu Lestari",
        "email": "ayu@email.com"
      }
    }
  ],
  "meta": { "total_pending": 5, "page": 1, "limit": 20 }
}
```

---

### 7. POST /api/v1/admin/articles/:id/review ← KEPUTUSAN ADMIN

**Setujui atau tolak artikel — `article-preview.html`**

**Auth:** Bearer JWT (role: admin)

**Request Body:**

```json
{
  "action": "approved",
  "note": "Artikel sangat informatif, siap diterbitkan."
}
```

| `action` nilai | Status DB baru | Efek                                                |
| -------------- | -------------- | --------------------------------------------------- |
| `"approved"`   | `published`    | `published_at` diisi, email sukses ke penulis       |
| `"rejected"`   | `rejected`     | `admin_notes` diisi, email penolakan ke penulis     |
| `"draft"`      | `draft`        | Dikembalikan sebagai draft, email revisi ke penulis |

**Logic:**

1. Validasi token → pastikan role = admin
2. Pastikan artikel saat ini berstatus `pending_review`
3. UPDATE `articles` SET `status = $action_status`, `admin_notes = $note`, `reviewed_by = $admin_id`, `reviewed_at = NOW()`
4. INSERT ke `article_reviews` (audit log)
5. INSERT ke `email_notifications` dengan payload template email
6. Email worker (cron/queue) memproses antrian dan mengirim email

**Response 200:**

```json
{
  "id": "art-003",
  "status": "published",
  "published_at": "2025-09-22T10:30:00Z",
  "message": "Artikel diterbitkan dan email sukses dikirim ke ayu@email.com"
}
```

**Response 403:** Bukan admin
**Response 409:** Artikel sudah tidak dalam status pending_review

---

### 8. GET /api/v1/users/me/articles

**Daftar artikel milik penulis yang login (draft + rejected)**

**Auth:** Bearer JWT (role: member)

**Logic:**

```sql
SELECT * FROM v_user_drafts
WHERE  user_id = $current_user_id;
-- RLS juga menjamin hanya data milik sendiri yang dikembalikan
```

---

## Error Response Format (Standar)

```json
{
  "error": "Human-readable error message",
  "code": "ERROR_CODE",
  "details": {}
}
```

| HTTP Code | Keterangan                                      |
| --------- | ----------------------------------------------- |
| 400       | Bad Request — body tidak valid                  |
| 401       | Unauthorized — token tidak ada atau expired     |
| 403       | Forbidden — role tidak cukup atau bukan pemilik |
| 404       | Not Found                                       |
| 409       | Conflict — status artikel tidak sesuai          |
| 422       | Unprocessable Entity — validasi field gagal     |
| 500       | Internal Server Error                           |

---

## Catatan Implementasi

### Email Templates (diperlukan)

| Type                     | Dikirim ke | Trigger                         |
| ------------------------ | ---------- | ------------------------------- |
| `article_approved`       | Penulis    | Admin menyetujui                |
| `article_rejected`       | Penulis    | Admin menolak                   |
| `article_draft_returned` | Penulis    | Admin mengembalikan ke draft    |
| `admin_new_submission`   | Admin      | Penulis mengajukan artikel baru |

### Stack Rekomendasi

- **Node.js + Express / Fastify** — ringan, cocok untuk REST API
- **PostgreSQL 15** — rekomendasi utama (mendukung RLS, GIN index, JSONB)
- **Prisma ORM** — schema-first, type-safe, migration otomatis
- **Nodemailer + SMTP / Resend** — pengiriman email
- **JWT (jsonwebtoken)** — autentikasi stateless
- **BullMQ / pg-boss** — queue untuk email worker
