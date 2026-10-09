/**
 * layout.js — Racik Media Nusantara
 * ─────────────────────────────────────────────────────────────────────────────
 * Script global yang menangani semua interaksi layout lintas halaman:
 *   1. Mobile hamburger menu toggle
 *   2. Re-init language switcher setelah navbar di-fetch (async ready)
 *   3. Active nav link highlighting berdasarkan URL saat ini
 *   4. Scroll-aware sticky navbar (tambah shadow saat scroll)
 *   5. Anti-overflow guard: deteksi elemen yang melebihi lebar viewport
 *
 * Dipanggil oleh base.html setelah lang.js sudah di-load.
 * ─────────────────────────────────────────────────────────────────────────────
 */

(function () {
  'use strict';

  /* ════════════════════════════════════════════════════════
     1. TUNGGU NAVBAR SELESAI DI-FETCH
     Navbar dimuat async. Kita tunggu elemen #mobile-menu-toggle
     ada di DOM sebelum memasang event listener.
     ════════════════════════════════════════════════════════ */
  function waitForNavbar(callback, attempts) {
    attempts = attempts || 0;
    if (attempts > 50) return; // maksimal 2.5 detik (50 × 50ms)
    var toggle = document.getElementById('mobile-menu-toggle');
    if (toggle) {
      callback();
    } else {
      setTimeout(function () { waitForNavbar(callback, attempts + 1); }, 50);
    }
  }

  /* ════════════════════════════════════════════════════════
     2. MOBILE MENU TOGGLE
     ════════════════════════════════════════════════════════ */
  function initMobileMenu() {
    var toggle  = document.getElementById('mobile-menu-toggle');
    var menu    = document.getElementById('mobile-menu');
    var iconHam = document.getElementById('icon-hamburger');
    var iconX   = document.getElementById('icon-close-menu');
    var header  = toggle && toggle.closest('.rm-public-header');
    if (!toggle || !menu) return;
    var closeMenuTimer = null;
    var ignoreHoverClick = false;

    function setMenuOpen(expanded) {
      menu.classList.toggle('hidden', !expanded);
      toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      if (iconHam) iconHam.classList.toggle('hidden', expanded);
      if (iconX)   iconX.classList.toggle('hidden', !expanded);
    }

    function cancelScheduledClose() {
      if (closeMenuTimer) {
        clearTimeout(closeMenuTimer);
        closeMenuTimer = null;
      }
    }

    function scheduleClose() {
      cancelScheduledClose();
      closeMenuTimer = setTimeout(function () {
        setMenuOpen(false);
        ignoreHoverClick = false;
        closeMenuTimer = null;
      }, 250);
    }

    toggle.addEventListener('click', function () {
      if (ignoreHoverClick) {
        ignoreHoverClick = false;
        return;
      }
      setMenuOpen(toggle.getAttribute('aria-expanded') !== 'true');
    });

    toggle.addEventListener('pointerenter', function (event) {
      if (event.pointerType === 'mouse' && window.matchMedia('(max-width: 767px)').matches) {
        cancelScheduledClose();
        if (toggle.getAttribute('aria-expanded') !== 'true') {
          ignoreHoverClick = true;
        }
        setMenuOpen(true);
      }
    });

    toggle.addEventListener('pointerleave', function (event) {
      if (event.pointerType !== 'mouse' || !window.matchMedia('(max-width: 767px)').matches) return;
      if (menu.contains(event.relatedTarget) || (header && header.contains(event.relatedTarget))) return;
      scheduleClose();
    });

    menu.addEventListener('pointerenter', cancelScheduledClose);
    menu.addEventListener('pointerleave', function (event) {
      if (event.pointerType !== 'mouse' || !window.matchMedia('(max-width: 767px)').matches) return;
      if (toggle.contains(event.relatedTarget)) return;
      scheduleClose();
    });

    if (header) {
      header.addEventListener('pointerleave', function (event) {
        if (event.pointerType !== 'mouse' || !window.matchMedia('(max-width: 767px)').matches) return;
        if (menu.contains(event.relatedTarget)) return;
        scheduleClose();
      });
    }

    ['lang-switcher', 'back-button', 'btn-login'].forEach(function (id) {
      var control = document.getElementById(id);
      if (!control) return;
      control.addEventListener('pointerenter', function (event) {
        if (event.pointerType === 'mouse' && window.matchMedia('(max-width: 767px)').matches) {
          scheduleClose();
        }
      });
    });

    menu.addEventListener('focusout', function (event) {
      if (!menu.contains(event.relatedTarget) && !toggle.contains(event.relatedTarget)) {
        setMenuOpen(false);
      }
    });

    /* Tutup menu saat link diklik */
    menu.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        setMenuOpen(false);
      });
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
        setMenuOpen(false);
        toggle.focus();
      }
    });
  }

  function initBackButton() {
    var backButton = document.getElementById('back-button');
    if (!backButton) return;

    backButton.addEventListener('click', function () {
      if (window.history.length > 1) {
        window.history.back();
      } else {
        window.location.href = '/index.html';
      }
    });
  }

  /* ════════════════════════════════════════════════════════
     3. ACTIVE NAV LINK
     Bandingkan pathname saat ini dengan href tiap nav link.
     Tambahkan class visual "aktif" tanpa mengganggu hover.
     ════════════════════════════════════════════════════════ */
  function highlightActiveNav() {
    var current = window.location.pathname;
    document.querySelectorAll('header nav a, #mobile-menu a').forEach(function (link) {
      var href = link.getAttribute('href');
      if (!href || href === '#' || href === '/') return;
      var target;
      try {
        target = new URL(href, window.location.href).pathname.replace(/\/$/, '');
      } catch (error) {
        return;
      }
      var normalized = current.replace(/\/$/, '');
      if (normalized === target || normalized.indexOf(target + '/') === 0) {
        link.classList.add('text-emerald-800', 'font-semibold');
        link.classList.remove('text-gray-600', 'text-gray-700');
      }
    });
  }

  /* ════════════════════════════════════════════════════════
     4. SCROLL-AWARE NAVBAR SHADOW
     Tambahkan shadow lembut ke header saat user scroll > 10px.
     ════════════════════════════════════════════════════════ */
  function initNavbarShadow() {
    var header = document.querySelector('header[role="banner"]');
    if (!header) return;
    function onScroll() {
      if (window.scrollY > 10) {
        header.style.boxShadow = '0 2px 12px rgba(0,0,0,0.08)';
      } else {
        header.style.boxShadow = '';
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* ════════════════════════════════════════════════════════
     5. RE-TRIGGER LANG APPLY SETELAH NAVBAR ASYNC
     lang.js sudah jalan, tapi navbar mungkin belum ada saat
     applyLang() pertama dipanggil. Trigger sekali lagi setelah
     navbar selesai di-fetch.
     ════════════════════════════════════════════════════════ */
  function syncLangToNavbar() {
    if (window.RMlang && typeof window.RMlang.get === 'function') {
      var lang = window.RMlang.get();
      // Terapkan ulang agar elemen navbar (data-id/data-en) terisi
      if (typeof window.RMlang.set === 'function') {
        window.RMlang.set(lang, false);
      }
    }
  }

  /* ════════════════════════════════════════════════════════
     6. ANTI-OVERFLOW GUARD (development helper)
     Deteksi elemen yang melebihi lebar viewport di dev mode.
     Otomatis nonaktif di production (domain bukan localhost).
     ════════════════════════════════════════════════════════ */
  function runOverflowGuard() {
    if (document.getElementById('rm-navbar-root')) return;

    var isLocal = location.hostname === 'localhost'
               || location.hostname === '127.0.0.1'
               || location.hostname === '';
    if (!isLocal) return;

    var docW = document.documentElement.offsetWidth;
    document.querySelectorAll('*').forEach(function (el) {
      if (el.offsetLeft + el.offsetWidth > docW) {
        console.warn('[OverflowGuard] Elemen melebihi lebar viewport:', el);
        el.style.outline = '2px solid red';
      }
    });
  }

  /* ════════════════════════════════════════════════════════
     INIT — jalankan setelah DOM siap, navbar di-poll
     ════════════════════════════════════════════════════════ */
     function onReady() {
       waitForNavbar(function () {
         initNavbarShadow();
         initMobileMenu();
         initBackButton();
         highlightActiveNav();
      syncLangToNavbar();
      runOverflowGuard();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onReady);
  } else {
    onReady();
  }

})();
