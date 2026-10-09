# Draft Panduan Update Website Racik Media dengan Aman

## Kondisi saat ini

Pemeriksaan website live menunjukkan halaman utama dapat dibuka, tetapi sejumlah
berkas yang diperlukan tidak tersedia (HTTP 404), termasuk navbar, stylesheet,
halaman isi, dan konfigurasi Supabase. Akibatnya, website live belum sama dengan
versi proyek terbaru dan beberapa fitur tidak dapat diuji di sana.

Di proyek lokal sudah disiapkan konfigurasi Netlify untuk menyusun paket situs
lengkap ke folder `dist/`. Paket hanya berisi berkas publik yang diperlukan;
folder pengembangan, dokumentasi, migrasi database, dan konfigurasi lokal tidak
ikut dipublikasikan. Berkas `assets/js/google-maps-config.js` yang diabaikan Git
juga sengaja tidak disalin.

Build lokal menghasilkan seluruh jalur statis wajib dengan HTTP 200 pada preview.
Uji ulang menemukan HTTP 502 bahkan pada satu teks. Log Supabase mengonfirmasi
Gemini HTTP 429 diikuti `OPENROUTER_RESPONSE_INVALID`. Implementasi lokal kini
menghapus provider Google/Gemini sepenuhnya dan hanya menggunakan OpenRouter,
dengan format JSON yang lebih kompatibel, retry terbatas untuk HTTP 502/503/504,
serta batch browser yang lebih kecil. Edge Function perlu dideploy dan diuji dari
origin production; hapus juga secret `GEMINI_API_KEY` dan
`GEMINI_TRANSLATION_MODEL` dari Supabase setelah deploy.

## Berkas penting dalam paket publik

- `index.html`, `style.css`, `script.js`
- `assets/` — CSS, JavaScript, gambar, dan konfigurasi publik Supabase
- `layouts/` — partial navbar/footer yang dimuat secara dinamis
- `pages/` — semua halaman yang dituju tautan situs
- `api/` — modul browser yang dipakai autentikasi/konten

Folder `supabase/`, `database/`, `docs/`, `.agents/`, `.git/`, dan file `.env`
tidak menjadi bagian dari paket website statis. Jangan mengunggah API key privat,
service-role key, password database, atau file konfigurasi lokal ke folder publik.

## Sebelum menerbitkan

1. Pastikan perubahan yang ingin diterbitkan sudah disimpan dan ditinjau.
2. Jalankan build `node scripts/build-netlify.js` dari root proyek.
3. Pastikan proses build menyatakan bahwa semua berkas wajib tersedia di `dist/`.
4. Lakukan deploy preview/staging dahulu; jangan langsung mengganti production.
5. Siapkan deploy sebelumnya di Netlify agar dapat dipulihkan lewat Deploys →
   pilih deploy terakhir yang berfungsi → Publish deploy.
6. Jangan mengunggah seluruh folder kerja secara manual. Gunakan hasil build
   `dist/` atau deploy Netlify yang memakai `netlify.toml`.

## Pemeriksaan setelah deploy preview

Pastikan setiap URL berikut menghasilkan HTTP 200, bukan 404:

- `/`
- `/assets/js/lang.js`
- `/assets/js/public-layout.js`
- `/assets/js/layout.js`
- `/assets/css/public-layout.css`
- `/assets/js/supabase-config.js`
- `/assets/js/newsletter.js`
- `/assets/brand/1.png`
- `/layouts/_public-navbar.html`
- `/layouts/_footer.html`
- `/api/auth.js`
- `/pages/main/events.html`

Lanjutkan uji fungsi melalui browser:

- Navbar, logo, menu desktop/mobile, dan Language/Bahasa muncul.
- Bahasa Indonesia dan English dapat dipilih; tidak ada error 404/502 di console.
- Halaman Events, artikel, produk, login, dan dashboard yang relevan terbuka.
- Newsletter memvalidasi email/persetujuan dan tersambung ke Supabase.
- Tampilan mobile tidak overflow dan gambar utama/logo tampil benar.
- Login/auth Supabase berfungsi; konfigurasi domain OAuth dan redirect tidak berubah.

Jika pengecekan gagal, hentikan promosi ke production dan pulihkan deploy Netlify
sebelumnya. Catat URL yang gagal dan status HTTP untuk perbaikan.

## Rahasia dan konfigurasi layanan

- `SUPABASE_URL` dan publishable key boleh dipakai oleh browser sesuai kebijakan
  RLS; pastikan akses data tetap dilindungi.
- `OPENROUTER_API_KEY` hanya berada di Supabase Edge Function Secrets, tidak di
  HTML, JavaScript browser, atau paket `dist/`. Secret lama
  `GEMINI_API_KEY`/`GEMINI_TRANSLATION_MODEL` perlu dihapus dari Supabase.
- Newsletter memerlukan migrasi Supabase yang telah diterapkan; migrasi ini sudah
  diterapkan pada proyek Supabase yang digunakan.
- Terjemahan otomatis memakai fungsi `translate-page` di Supabase. Perbaikan
  terbaru pada source Edge Function masih lokal; deploy dan uji ulang fungsi
  dari origin production diperlukan sebelum menyatakan Language/Bahasa pulih.
- `assets/js/google-maps-config.js` dikecualikan dari paket karena diabaikan Git.
  Jika peta checkout digunakan, konfigurasi harus disediakan kembali dengan API
  key yang dibatasi berdasarkan HTTP referrer/domain produksi.

## Status dan persetujuan

Konfigurasi build aman dan draft checklist ini sudah disiapkan, tetapi belum
menjalankan deploy production. Perubahan lokal yang belum di-commit tidak otomatis
masuk ke situs live. Sebelum menerbitkan, tinjau daftar perubahan Git, siapkan
preview dari paket `dist/`, lalu minta persetujuan untuk mempromosikannya ke
production.
