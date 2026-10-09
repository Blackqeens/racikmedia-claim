/**
 * rbac.js — BOB · Racik Media Nusantara
 * ─────────────────────────────────────────────────────────────────────────────
 * Route Guard & Permission Helper khusus area Admin.
 *
 * File ini dipakai oleh SEMUA halaman di /pages/admin/ dan /pages/master-admin/.
 * Letakkan di <head> SEBELUM Tailwind dan konten lainnya:
 *
 *   <!-- Urutan WAJIB: auth.js dulu, baru rbac.js -->
 *   <script src="../../api/auth.js"></script>
 *   <script src="../../assets/js/rbac.js"></script>
 *   <script>AdminGuard.protect('admin');</script>
 *
 * FUNGSI UTAMA:
 *   AdminGuard.protect(role)        → guard + hide body sampai siap
 *   AdminGuard.renderUserInfo()     → isi nama/avatar di topbar
 *   AdminGuard.hideIfCannot(perm)   → sembunyikan elemen berdasarkan izin
 *   AdminGuard.showIfCan(perm)      → tampilkan elemen berdasarkan izin
 *   AdminGuard.applyPermissions()   → terapkan semua attr data-can-* sekaligus
 * ─────────────────────────────────────────────────────────────────────────────
 */

(function (global) {
  'use strict';

  // ─────────────────────────────────────────────────────────────
  // GUARD UTAMA
  // ─────────────────────────────────────────────────────────────

  var AdminGuard = {

    /**
     * Lindungi halaman admin dari akses tidak sah.
     *
     * Cara kerja (berlapis):
     *   1. Sembunyikan <body> sementara (anti-flash konten terlarang)
     *   2. Cek sesi via BobAuth.requireRole()
     *   3. Jika lolos, tampilkan <body> kembali dan isi UI
     *   4. Jika gagal, BobAuth.requireRole() otomatis redirect
     *
     * @param {'admin'|'master_admin'|string[]} requiredRole
     *   'admin'        → hanya admin biasa
     *   'master_admin' → hanya master admin
     *   ['admin','master_admin'] → keduanya boleh masuk
     */
    protect: function (requiredRole) {
      // Step 1 — Sembunyikan body SEGERA agar konten tidak terflash
      // sebelum guard selesai memeriksa. Ini berjalan SEBELUM DOMContentLoaded.
      var style = document.createElement('style');
      style.id  = 'rbac-shield';
      style.textContent = 'body{visibility:hidden!important}';
      document.head.appendChild(style);

      // Failsafe: jika JS error sebelum shield dilepas, body tetap terlihat
      // setelah 600ms (waktu cukup untuk guard + render awal selesai)
      var failsafeTimer = setTimeout(function () {
        AdminGuard._removeShield();
      }, 600);

      // Step 2 — Jalankan guard setelah DOM siap
      // Kita tidak bisa akses sessionStorage sebelum document.readyState
      // melakukan write, tapi BobAuth sudah aman karena hanya baca
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
          AdminGuard._runGuard(requiredRole, failsafeTimer);
        });
      } else {
        AdminGuard._runGuard(requiredRole, failsafeTimer);
      }
    },

    /** Internal: jalankan pemeriksaan sesi dan izin */
    _runGuard: function (requiredRole, failsafeTimer) {
      clearTimeout(failsafeTimer);

      try {
        // BobAuth.requireRole() akan redirect + throw jika tidak diizinkan
        BobAuth.requireRole(requiredRole);
      } catch (e) {
        // Redirect sudah dilakukan oleh BobAuth.requireRole()
        // Biarkan shield tetap aktif agar user tidak melihat konten
        return;
      }

      // Step 3 — Lolos guard: isi UI dan tampilkan konten
      AdminGuard.renderUserInfo();
      AdminGuard.applyPermissions();
      AdminGuard._removeShield();
    },

    /** Lepas perisai visibility */
    _removeShield: function () {
      var shield = document.getElementById('rbac-shield');
      if (shield) shield.parentNode.removeChild(shield);
    },

    // ─────────────────────────────────────────────────────────────
    // RENDER UI
    // ─────────────────────────────────────────────────────────────

    /**
     * Isi elemen UI dengan data sesi (nama, role, avatar).
     * Dipanggil otomatis oleh protect(), tapi bisa dipanggil ulang
     * setelah navbar di-fetch secara async.
     *
     * Elemen yang dicari (opsional, tidak error jika tidak ada):
     *   #admin-user-name    → teks nama pengguna
     *   #admin-user-role    → teks label role
     *   #admin-user-avatar  → inisial atau gambar avatar
     *   #admin-role-badge   → badge warna role di topbar
     */
    renderUserInfo: function () {
      var session = BobAuth.getSession();
      if (!session) return;

      var nameEl   = document.getElementById('admin-user-name');
      var roleEl   = document.getElementById('admin-user-role');
      var avatarEl = document.getElementById('admin-user-avatar');
      var badgeEl  = document.getElementById('admin-role-badge');

      if (nameEl)   nameEl.textContent   = session.name;
      if (avatarEl) avatarEl.textContent = AdminGuard._initials(session.name);

      if (roleEl) {
        var roleLabels = {
          master_admin: 'Master Admin',
          admin:        'Admin',
        };
        roleEl.textContent = roleLabels[session.role] || session.role;
      }

      if (badgeEl) {
        badgeEl.textContent = session.role === 'master_admin' ? 'MASTER' : 'ADMIN';
        // Warna berbeda untuk membedakan secara visual
        if (session.role === 'master_admin') {
          badgeEl.className = badgeEl.className
            .replace(/bg-\S+/g, '')
            .replace(/text-\S+/g, '')
            + ' bg-violet-600 text-white';
        } else {
          badgeEl.className = badgeEl.className
            .replace(/bg-\S+/g, '')
            .replace(/text-\S+/g, '')
            + ' bg-emerald-700 text-white';
        }
      }
    },

    // ─────────────────────────────────────────────────────────────
    // KONTROL VISIBILITAS ELEMEN BERDASARKAN IZIN
    // ─────────────────────────────────────────────────────────────

    /**
     * Terapkan semua atribut data-can-* di halaman secara sekaligus.
     * Ini adalah cara yang direkomendasikan — tambahkan atribut di HTML,
     * tidak perlu tulis JS manual di setiap halaman.
     *
     * HTML:
     *   <button data-can="create_admin">Tambah Admin</button>
     *   <section data-can="view_financial_reports">...</section>
     *   <tr data-cannot="delete_admin" class="...">...</tr>
     *
     * data-can="izin"    → tampilkan jika PUNYA izin, sembunyikan jika tidak
     * data-cannot="izin" → sembunyikan jika PUNYA izin, tampilkan jika tidak
     */
    applyPermissions: function () {
      // Elemen yang hanya tampil jika PUNYA izin
      document.querySelectorAll('[data-can]').forEach(function (el) {
        var perm = el.getAttribute('data-can');
        el.style.display = BobAuth.can(perm) ? '' : 'none';
      });

      // Elemen yang disembunyikan jika PUNYA izin (kebalikannya)
      document.querySelectorAll('[data-cannot]').forEach(function (el) {
        var perm = el.getAttribute('data-cannot');
        el.style.display = BobAuth.can(perm) ? 'none' : '';
      });
    },

    /**
     * Sembunyikan elemen dengan ID tertentu jika user TIDAK punya izin.
     * Alternatif dari data-can jika perlu kontrol manual.
     *
     * @param {string} permission  — nama izin dari PERMISSIONS
     * @param {string} elementId   — ID elemen yang dikontrol
     */
    hideIfCannot: function (permission, elementId) {
      if (!BobAuth.can(permission)) {
        var el = document.getElementById(elementId);
        if (el) el.style.display = 'none';
      }
    },

    /**
     * Tampilkan elemen dengan ID tertentu hanya jika user PUNYA izin.
     */
    showIfCan: function (permission, elementId) {
      var el = document.getElementById(elementId);
      if (!el) return;
      el.style.display = BobAuth.can(permission) ? '' : 'none';
    },

    // ─────────────────────────────────────────────────────────────
    // HELPERS
    // ─────────────────────────────────────────────────────────────

    /** Ambil inisial 1-2 huruf dari nama lengkap */
    _initials: function (name) {
      if (!name) return '?';
      var parts = name.trim().split(/\s+/);
      if (parts.length === 1) return parts[0][0].toUpperCase();
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    },

    /**
     * Helper untuk mobile sidebar toggle.
     * Dipanggil oleh tombol hamburger di topbar.
     */
    toggleSidebar: function () {
      var sidebar  = document.getElementById('admin-sidebar');
      var overlay  = document.getElementById('sidebar-overlay');
      if (!sidebar) return;
      var isOpen = sidebar.classList.toggle('translate-x-0');
      sidebar.classList.toggle('-translate-x-full', !isOpen);
      if (overlay) overlay.classList.toggle('hidden', !isOpen);
    },

    closeSidebar: function () {
      var sidebar = document.getElementById('admin-sidebar');
      var overlay = document.getElementById('sidebar-overlay');
      if (sidebar) {
        sidebar.classList.remove('translate-x-0');
        sidebar.classList.add('-translate-x-full');
      }
      if (overlay) overlay.classList.add('hidden');
    },

  };

  global.AdminGuard = AdminGuard;

}(window));

/*
 * ──────────────────────────────────────────────────────────────
 * RINGKASAN CARA PAKAI DI HALAMAN HTML
 * ──────────────────────────────────────────────────────────────
 *
 * HALAMAN ADMIN BIASA (pages/admin/...):
 * ────────────────────────────────────────
 * <head>
 *   <script src="../../api/auth.js"></script>
 *   <script src="../../assets/js/rbac.js"></script>
 *   <script>AdminGuard.protect('admin');</script>
 *   <!-- Tailwind & konten lain dimuat SETELAH guard -->
 * </head>
 *
 * HALAMAN MASTER ADMIN (pages/master-admin/...):
 * ─────────────────────────────────────────────────
 * <head>
 *   <script src="../../api/auth.js"></script>
 *   <script src="../../assets/js/rbac.js"></script>
 *   <script>AdminGuard.protect('master_admin');</script>
 * </head>
 *
 * HALAMAN SHARED (bisa diakses admin + master_admin):
 * ─────────────────────────────────────────────────────
 * <script>AdminGuard.protect(['admin', 'master_admin']);</script>
 *
 * KONTROL VISIBILITAS ELEMEN (di HTML):
 * ────────────────────────────────────────
 * <!-- Tombol hanya muncul untuk master_admin -->
 * <button data-can="create_admin">Tambah Admin</button>
 *
 * <!-- Section hanya muncul untuk yang TIDAK bisa lihat laporan keuangan -->
 * <div data-cannot="view_financial_reports">Upgrade ke Master Admin</div>
 */
