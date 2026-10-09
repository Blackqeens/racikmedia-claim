/**
 * lang.js — Racik Media Language Switcher  v2.0
 * ─────────────────────────────────────────────────────────────────────────────
 * Sistem multi-lapis untuk platform internasional BOB · Racik Media Nusantara
 *
 * LAPISAN PRIORITAS (urutan dari tertinggi ke terendah):
 *   1. localStorage  → pilihan manual pengguna, sinkron lintas halaman
 *   2. Browser lang  → navigator.language (Indonesia / English)
 *   3. DEFAULT_LANG  → fallback akhir ('id')
 *
 * FITUR v2.0:
 *   ✅ FORL Prevention (Flash of Wrong Language):
 *      Bahasa dari localStorage dipakai SEBELUM DOMContentLoaded
 *      dengan menyembunyikan body sementara, mencegah "kedipan konten".
 *   ✅ html[lang] sync: atribut <html lang="..."> diupdate otomatis
 *      untuk aksesibilitas screen reader & SEO.
 *   ✅ Placeholder input, aria-label, blok lang-show didukung.
 *   ✅ Navbar async-safe: dapat dipanggil ulang oleh layout.js setelah
 *      navbar selesai di-fetch.
 *   ✅ Public API: window.RMlang.set/get/reset
 *
 * Terjemahan manual memakai data-id / data-en / data-zh.
 * Teks lain dan konten dinamis diterjemahkan oleh OpenRouter melalui endpoint
 * translate-page.
 *
 * CARA MENAMBAH BAHASA BARU (mis. Jepang):
 *   1. Tambah tombol [data-lang-option="ja"] di _public-navbar.html
 *   2. Tambah atribut data-ja="…" ke elemen HTML
 *   3. Tidak ada perubahan di file ini yang diperlukan
 * ─────────────────────────────────────────────────────────────────────────────
 */

(function () {
  'use strict';

  /* ── Konstanta ─────────────────────────────────────── */
  var STORAGE_KEY  = 'rm_lang';
  var DEFAULT_LANG = 'id';
  var VALID_LANGS  = ['id', 'en'];
  var scriptUrl    = document.currentScript ? document.currentScript.src : '';
  var translationStates = new WeakMap();
  var attributeStates   = new WeakMap();
  var translationRun    = 0;
  var translationCache  = {};
  var CACHE_KEY         = 'rm_translation_cache_v1';
  var CACHE_LIMIT       = 1000;
  var observer          = null;

  try {
    translationCache = JSON.parse(sessionStorage.getItem(CACHE_KEY) || '{}');
    if (!translationCache || typeof translationCache !== 'object' || Array.isArray(translationCache)) {
      translationCache = {};
    }
  } catch (e) {
    translationCache = {};
  }

  /* ── State aktif ────────────────────────────────────── */
  var currentLang  = DEFAULT_LANG;
  var _initialized = false;

  /* ════════════════════════════════════════════════════════
     FORL PREVENTION — jalankan SEBELUM DOMContentLoaded
     ════════════════════════════════════════════════════════
     Jika localStorage sudah punya pilihan, sembunyikan body
     sebentar dan terapkan bahasa sebelum browser paint.
     Ini mencegah konten "berkedip" dari bahasa default ke
     bahasa yang disimpan user. */
  (function preventFORL() {
    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      if (saved && VALID_LANGS.indexOf(saved) !== -1) {
        // Sembunyikan body agar tidak terlihat saat ganti bahasa
        var style = document.createElement('style');
        style.id  = 'rm-forl-hide';
        style.textContent = 'body { visibility: hidden !important; }';
        document.head.appendChild(style);
        // Hapus setelah 300ms (failsafe) meski applyLang belum selesai
        setTimeout(function () { _removeFORLHide(); }, 300);
      }
    } catch (e) { /* private mode / Safari ITP */ }
  })();

  function _removeFORLHide() {
    var el = document.getElementById('rm-forl-hide');
    if (el) el.parentNode.removeChild(el);
  }


  /* ════════════════════════════════════════════════════════
     1. TERAPKAN BAHASA KE DOM
     ════════════════════════════════════════════════════════ */
  function applyLang(lang, persist) {
    if (VALID_LANGS.indexOf(lang) === -1) lang = DEFAULT_LANG;
    var changed = lang !== currentLang;
    var run = changed ? ++translationRun : translationRun;
    if (changed) _restoreAutoTranslations();
    currentLang = lang;

    /* ── Update atribut <html lang="…"> ── */
    document.documentElement.setAttribute('lang', lang);

    _applyStaticTranslations(document, lang);

    /* ── Update tampilan widget dropdown ── */
    _updateWidgetUI(lang);

    /* ── Tameng Notranslate: proteksi elemen legal/identitas ── */
    _applyNotranslateShield(lang);

    /* ── Simpan hanya pilihan manual, bukan deteksi otomatis ── */
    if (persist !== false) {
      try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) { /* private mode */ }
    }

    /* ── Lepas FORL hide setelah apply selesai ── */
    _removeFORLHide();

    _initialized = true;
    _setTranslationStatus('');
    if (lang !== DEFAULT_LANG) {
      _translatePage(lang, run);
    }
  }

  function _applyStaticTranslations(root, lang) {
    var selector = '[data-id], [data-en], [data-zh]';
    if (root.nodeType === 1 && root.matches && root.matches(selector)) {
      _applyStaticElement(root, lang);
    }
    if (root.querySelectorAll) {
      root.querySelectorAll(selector).forEach(function (el) { _applyStaticElement(el, lang); });
    }

    var placeholders = '[data-ph-id], [data-ph-en], [data-ph-zh]';
    if (root.nodeType === 1 && root.matches && root.matches(placeholders)) {
      _applyStaticAttribute(root, 'placeholder', 'data-ph-', lang);
    }
    if (root.querySelectorAll) {
      root.querySelectorAll(placeholders).forEach(function (el) {
        _applyStaticAttribute(el, 'placeholder', 'data-ph-', lang);
      });
    }

    var ariaLabels = '[data-aria-id], [data-aria-en], [data-aria-zh]';
    if (root.nodeType === 1 && root.matches && root.matches(ariaLabels)) {
      _applyStaticAttribute(root, 'aria-label', 'data-aria-', lang);
    }
    if (root.querySelectorAll) {
      root.querySelectorAll(ariaLabels).forEach(function (el) {
        _applyStaticAttribute(el, 'aria-label', 'data-aria-', lang);
      });
    }

    var titles = '[data-title-id], [data-title-en], [data-title-zh]';
    if (root.nodeType === 1 && root.matches && root.matches(titles)) {
      _applyStaticAttribute(root, 'title', 'data-title-', lang);
    }
    if (root.querySelectorAll) {
      root.querySelectorAll(titles).forEach(function (el) {
        _applyStaticAttribute(el, 'title', 'data-title-', lang);
      });
    }

    var altTexts = '[data-alt-id], [data-alt-en], [data-alt-zh]';
    if (root.nodeType === 1 && root.matches && root.matches(altTexts)) {
      _applyStaticAttribute(root, 'alt', 'data-alt-', lang);
    }
    if (root.querySelectorAll) {
      root.querySelectorAll(altTexts).forEach(function (el) {
        _applyStaticAttribute(el, 'alt', 'data-alt-', lang);
      });
    }

    var displayedBlockLang = document.querySelector('[data-lang-show="' + lang + '"]') ? lang : DEFAULT_LANG;
    if (root.nodeType === 1 && root.matches && root.matches('[data-lang-show]')) {
      root.style.display = root.getAttribute('data-lang-show') === displayedBlockLang ? '' : 'none';
    }
    if (root.querySelectorAll) {
      root.querySelectorAll('[data-lang-show]').forEach(function (el) {
        el.style.display = el.getAttribute('data-lang-show') === displayedBlockLang ? '' : 'none';
      });
    }
  }

  function _applyStaticElement(el, lang) {
    /* Keep nested icons/markup intact; explicit translations are for leaf labels. */
    if (el.childElementCount !== 0) return;
    var text = el.getAttribute('data-' + lang);
    if (text === null) text = el.getAttribute('data-id') || el.getAttribute('data-en');
    if (text !== null && el.textContent !== text) el.textContent = text;
  }

  function _applyStaticAttribute(el, name, prefix, lang) {
    var text = el.getAttribute(prefix + lang);
    if (text === null) text = el.getAttribute(prefix + 'id') || el.getAttribute(prefix + 'en');
    if (text !== null && el.getAttribute(name) !== text) el.setAttribute(name, text);
  }

  function _restoreAutoTranslations() {
    var walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_TEXT);
    var node;
    while ((node = walker.nextNode())) {
      var state = translationStates.get(node);
      if (state && node.data === state.translated) node.data = state.source;
      translationStates.delete(node);
    }

    document.querySelectorAll('[placeholder], [title], [aria-label], [alt], meta[name="description"], meta[property="og:title"]').forEach(function (el) {
      var state = attributeStates.get(el);
      if (!state) return;
      Object.keys(state).forEach(function (name) {
        if (el.getAttribute(name) === state[name].translated) {
          el.setAttribute(name, state[name].source);
        }
        delete state[name];
      });
    });
  }

  function _isTranslatableText(node) {
    if (!node.data || !/[A-Za-z\u00C0-\u024F\u4E00-\u9FFF]/.test(node.data)) return false;
    var parent = node.parentElement;
    if (!parent || parent.closest(
      'script, style, noscript, code, pre, kbd, samp, svg, canvas, template, ' +
      'textarea, input, select, option, [contenteditable="true"], [translate="no"], ' +
      '.notranslate, [data-proper-noun="true"], #lang-switcher, #rm-lang-status'
    )) return false;
    var explicitTranslation = parent.closest('[data-id], [data-en], [data-zh]');
    if (explicitTranslation && explicitTranslation.childElementCount === 0) return false;
    return true;
  }

  function _translationUnits(lang) {
    var units = [];
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    var node;
    var titleNode = document.querySelector('head title');
    if (titleNode && titleNode.firstChild && titleNode.firstChild.nodeType === Node.TEXT_NODE) {
      var titleText = titleNode.firstChild;
      if (/[A-Za-z\u00C0-\u024F\u4E00-\u9FFF]/.test(titleText.data)) {
        var titleState = translationStates.get(titleText);
        if (!(titleState && titleState.status === 'pending' && titleState.lang === lang) &&
            !(titleState && titleText.data === titleState.translated && titleState.lang === lang)) {
          var sourceTitle = titleState && titleText.data === titleState.translated ? titleState.source : titleText.data;
          units.push({ kind: 'text', node: titleText, source: sourceTitle, value: sourceTitle.trim(),
            prefix: (sourceTitle.match(/^\s*/) || [''])[0], suffix: (sourceTitle.match(/\s*$/) || [''])[0] });
        }
      }
    }
    while ((node = walker.nextNode())) {
      if (!_isTranslatableText(node)) continue;
      var state = translationStates.get(node);
      if (state && state.status === 'pending' && state.lang === lang && node.data === state.source) continue;
      if (state && node.data === state.translated && state.lang === lang) continue;
      if (state && node.data !== state.translated) translationStates.delete(node);
      var source = state && node.data === state.translated ? state.source : node.data;
      var trimmed = source.trim();
      if (!trimmed || trimmed.length > 8000) continue;
      units.push({
        kind: 'text',
        node: node,
        source: source,
        value: trimmed,
        prefix: (source.match(/^\s*/) || [''])[0],
        suffix: (source.match(/\s*$/) || [''])[0]
      });
    }

    document.querySelectorAll('[placeholder], [title], [aria-label], [alt], meta[name="description"], meta[property="og:title"]').forEach(function (el) {
      if (el.closest && el.closest('#lang-switcher, #rm-lang-status, .notranslate, [translate="no"], [data-proper-noun="true"]')) return;
      ['placeholder', 'title', 'aria-label', 'alt', 'content'].forEach(function (name) {
        if (!el.hasAttribute(name)) return;
        if (name === 'content' && !el.matches('meta[name="description"], meta[property="og:title"]')) return;
        var explicitPrefix = name === 'placeholder' ? 'data-ph-' : name === 'aria-label' ? 'data-aria-' : 'data-' + name + '-';
        if (name !== 'content' && el.hasAttribute(explicitPrefix + lang)) return;
        var states = attributeStates.get(el) || {};
        var state = states[name];
        var current = el.getAttribute(name);
        if (state && state.status === 'pending' && state.lang === lang && current === state.source) return;
        if (state && current === state.translated && state.lang === lang) return;
        if (state && current !== state.translated) delete states[name];
        var source = state && current === state.translated ? state.source : current;
        if (!source || !/[A-Za-z\u00C0-\u024F\u4E00-\u9FFF]/.test(source) || source.length > 8000) return;
        units.push({ kind: 'attribute', element: el, name: name, source: source, value: source });
      });
    });
    return units;
  }

  function _loadSupabaseConfig() {
    if (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.url && window.SUPABASE_CONFIG.publishableKey) {
      return Promise.resolve(window.SUPABASE_CONFIG);
    }
    if (!scriptUrl) return Promise.reject(new Error('Tidak dapat menemukan lokasi konfigurasi Supabase.'));
    return new Promise(function (resolve, reject) {
      var configScript = document.createElement('script');
      configScript.src = new URL('supabase-config.js', scriptUrl).href;
      configScript.onload = function () {
        if (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.url && window.SUPABASE_CONFIG.publishableKey) {
          resolve(window.SUPABASE_CONFIG);
        } else {
          reject(new Error('Konfigurasi Supabase tidak memiliki URL atau publishable key.'));
        }
      };
      configScript.onerror = function () { reject(new Error('Gagal memuat konfigurasi Supabase.')); };
      document.head.appendChild(configScript);
    });
  }

  function _cachedTranslation(lang, source) {
    return translationCache[lang + '\n' + source];
  }

  function _saveTranslation(lang, source, translated) {
    translationCache[lang + '\n' + source] = translated;
    var keys = Object.keys(translationCache);
    while (keys.length > CACHE_LIMIT) delete translationCache[keys.shift()];
  }

  function _persistTranslationCache() {
    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(translationCache)); }
    catch (e) { console.warn('[RMlang] Cache terjemahan tidak dapat disimpan.', e); }
  }

  function _translateBatch(config, lang, units, run) {
    var cachedUnits = [];
    var uncachedUnits = [];
    units.forEach(function (unit) {
      var cached = _cachedTranslation(lang, unit.value);
      if (cached) {
        cachedUnits.push({ unit: unit, text: cached });
      } else {
        uncachedUnits.push(unit);
      }
    });
    cachedUnits.forEach(function (entry) { _applyTranslation(entry.unit, entry.text, lang); });
    if (!uncachedUnits.length || run !== translationRun || lang !== currentLang) return Promise.resolve();
    uncachedUnits.forEach(function (unit) {
      if (unit.kind === 'text') {
        translationStates.set(unit.node, { source: unit.source, translated: null, lang: lang, status: 'pending' });
      } else {
        var states = attributeStates.get(unit.element) || {};
        states[unit.name] = { source: unit.source, translated: null, lang: lang, status: 'pending' };
        attributeStates.set(unit.element, states);
      }
    });

    return fetch(config.url.replace(/\/$/, '') + '/functions/v1/translate-page', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': config.publishableKey,
        'Authorization': 'Bearer ' + config.publishableKey
      },
      body: JSON.stringify({ lang: lang, texts: uncachedUnits.map(function (unit) { return unit.value; }) })
    }).then(function (response) {
      return response.json().then(function (payload) {
        if (!response.ok) {
          var message = payload && payload.error ? payload.error : 'Permintaan terjemahan gagal (HTTP ' + response.status + ').';
          throw new Error(message);
        }
        if (!payload || !Array.isArray(payload.translations) || payload.translations.length !== uncachedUnits.length) {
          throw new Error('Respons terjemahan tidak sesuai dengan teks yang diminta.');
        }
        if (run !== translationRun || lang !== currentLang) return;
        var hasNewTranslations = false;
        payload.translations.forEach(function (text, index) {
          if (typeof text !== 'string' || !text.trim()) return;
          var unit = uncachedUnits[index];
          _saveTranslation(lang, unit.value, text);
          _applyTranslation(unit, text, lang);
          hasNewTranslations = true;
        });
        if (hasNewTranslations) _persistTranslationCache();
      });
    });
  }

  function _applyTranslation(unit, translated, lang) {
    if (unit.kind === 'text') {
      unit.node.data = unit.prefix + translated.trim() + unit.suffix;
      translationStates.set(unit.node, {
        source: unit.source,
        translated: unit.node.data,
        lang: lang,
        status: 'done'
      });
      return;
    }
    var states = attributeStates.get(unit.element) || {};
    unit.element.setAttribute(unit.name, translated);
    states[unit.name] = { source: unit.source, translated: translated, lang: lang, status: 'done' };
    attributeStates.set(unit.element, states);
  }

  function _translatePage(lang, run) {
    if (lang === DEFAULT_LANG || !document.body) return;
    var units = _translationUnits(lang);
    var uncachedUnits = [];
    units.forEach(function (unit) {
      var cached = _cachedTranslation(lang, unit.value);
      if (cached) {
        _applyTranslation(unit, cached, lang);
      } else {
        uncachedUnits.push(unit);
      }
    });
    if (!uncachedUnits.length || run !== translationRun || lang !== currentLang) return;

    var batches = [];
    var batch = [];
    var characters = 0;
    uncachedUnits.forEach(function (unit) {
      if (batch.length >= 8 || characters + unit.value.length > 3000) {
        if (batch.length) batches.push(batch);
        batch = [];
        characters = 0;
      }
      batch.push(unit);
      characters += unit.value.length;
    });
    if (batch.length) batches.push(batch);
    if (!batches.length) return;

    _setTranslationStatus('Menerjemahkan halaman…');
    _loadSupabaseConfig().then(function (config) {
      return batches.reduce(function (promise, currentBatch) {
        return promise.then(function () {
          if (run !== translationRun || lang !== currentLang) return;
          return _translateBatch(config, lang, currentBatch, run);
        });
      }, Promise.resolve()).then(function () {
        if (run === translationRun && lang === currentLang) _setTranslationStatus('');
      });
    }).catch(function (error) {
      if (run !== translationRun || lang !== currentLang) return;
      _clearPendingTranslations(lang);
      console.error('[RMlang] Terjemahan halaman gagal:', error);
      _setTranslationStatus('Sebagian teks belum diterjemahkan: ' + error.message, true);
    });
  }

  function _clearPendingTranslations(lang) {
    var walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_TEXT);
    var node;
    while ((node = walker.nextNode())) {
      var state = translationStates.get(node);
      if (state && state.status === 'pending' && state.lang === lang) translationStates.delete(node);
    }
    document.querySelectorAll('[placeholder], [title], [aria-label], [alt], meta[name="description"], meta[property="og:title"]').forEach(function (el) {
      var states = attributeStates.get(el);
      if (!states) return;
      Object.keys(states).forEach(function (name) {
        if (states[name].status === 'pending' && states[name].lang === lang) delete states[name];
      });
    });
  }

  function _setTranslationStatus(message, isError) {
    var status = document.getElementById('rm-lang-status');
    if (!message) {
      if (status) status.remove();
      return;
    }
    if (!status) {
      status = document.createElement('div');
      status.id = 'rm-lang-status';
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');
      document.body.appendChild(status);
    }
    status.className = isError ? 'rm-lang-status rm-lang-status--error' : 'rm-lang-status';
    status.textContent = message;
    if (isError) {
      var retry = document.createElement('button');
      retry.type = 'button';
      retry.textContent = 'Coba lagi';
      retry.addEventListener('click', function () {
        status.remove();
        applyLang(currentLang, false);
      });
      status.appendChild(retry);
    }
  }

  function _ensureLanguageAssets() {
    if (!scriptUrl) return;
    var stylesheetUrl = new URL('../css/lang.css', scriptUrl).href;
    var exists = Array.prototype.some.call(document.querySelectorAll('link[rel="stylesheet"]'), function (link) {
      return link.href === stylesheetUrl;
    });
    if (!exists) {
      var stylesheet = document.createElement('link');
      stylesheet.rel = 'stylesheet';
      stylesheet.href = stylesheetUrl;
      document.head.appendChild(stylesheet);
    }
    if (!document.getElementById('rm-lang-global-style')) {
      var style = document.createElement('style');
      style.id = 'rm-lang-global-style';
      style.textContent =
        '#rm-lang-floating{position:fixed;top:12px;right:12px;z-index:9999}' +
        '#rm-lang-status{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:10000;' +
        'max-width:min(92vw,560px);padding:10px 14px;border-radius:10px;background:#0f172a;color:#fff;' +
        'font:13px/1.4 system-ui,sans-serif;box-shadow:0 6px 24px #0003}' +
        '#rm-lang-status.rm-lang-status--error{background:#7f1d1d}' +
        '#rm-lang-status button{margin-left:12px;padding:4px 9px;border:1px solid #fff8;border-radius:6px;' +
        'background:transparent;color:inherit;cursor:pointer}';
      document.head.appendChild(style);
    }
  }

  function _ensureLanguageSwitcher(force) {
    if (document.getElementById('lang-switcher') || (!force && document.getElementById('rm-navbar-root'))) return;
    var wrapper = document.createElement('div');
    wrapper.id = 'rm-lang-floating';
    wrapper.innerHTML =
      '<div id="lang-switcher" role="group" aria-label="Pilih Bahasa / Select Language">' +
      '<button id="lang-trigger" type="button" aria-haspopup="listbox" aria-expanded="false" aria-controls="lang-dropdown">' +
      '<span id="lang-trigger-flag" aria-hidden="true">🇮🇩</span> ' +
      '<span id="lang-trigger-label">ID</span>' +
      '<svg class="lang-chevron" viewBox="0 0 10 10" fill="none" aria-hidden="true">' +
      '<path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>' +
      '</svg></button><div id="lang-dropdown" role="listbox" aria-label="Daftar bahasa">' +
      '<div class="lang-dropdown__header">Bahasa / Language</div>' +
      '<button type="button" data-lang-option="id" role="option"><span class="lang-opt__flag">🇮🇩</span><span class="lang-opt__name">Indonesia</span></button>' +
      '<button type="button" data-lang-option="en" role="option"><span class="lang-opt__flag">🇬🇧</span><span class="lang-opt__name">English</span></button>' +
      '</div></div>';
    document.body.appendChild(wrapper);
  }

  function _observeDynamicContent() {
    if (observer || !document.body || typeof MutationObserver === 'undefined') return;
    observer = new MutationObserver(function (mutations) {
      var changed = false;
      mutations.forEach(function (mutation) {
        var targetElement = mutation.target.nodeType === 1
          ? mutation.target
          : mutation.target.parentElement;
        if (targetElement && targetElement.closest('#lang-switcher, #rm-lang-status')) return;
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach(function (node) {
            if (node.nodeType !== 1) return;
            if (node.matches('#lang-switcher, #rm-lang-status')) return;
            _applyStaticTranslations(node, currentLang);
            changed = true;
          });
        } else if (mutation.type === 'characterData') {
          var state = translationStates.get(mutation.target);
          if (state && mutation.target.data !== state.translated) translationStates.delete(mutation.target);
          changed = true;
        }
      });
      if (changed && currentLang !== DEFAULT_LANG) {
        clearTimeout(observer.translateTimer);
        observer.translateTimer = setTimeout(function () {
          _translatePage(currentLang, translationRun);
        }, 120);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  /* ── Perbarui tampilan tombol aktif di dropdown ── */
  function _updateWidgetUI(lang) {
    var trigger = document.getElementById('lang-trigger-label');
    if (trigger) trigger.textContent = lang === 'id' ? 'ID' : 'EN';

    var flag = document.getElementById('lang-trigger-flag');
    if (flag) flag.textContent = lang === 'id' ? '🇮🇩' : '🇬🇧';

    /* Sembunyikan indikator "mendeteksi" */
    var detecting = document.getElementById('lang-detecting');
    if (detecting) detecting.classList.remove('visible');

    /* Active state tiap option */
    document.querySelectorAll('[data-lang-option]').forEach(function (btn) {
      var isActive = btn.getAttribute('data-lang-option') === lang;
      btn.setAttribute('aria-pressed',  isActive ? 'true' : 'false');
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
      btn.classList.toggle('lang-opt--active', isActive);
    });
  }


  /* ════════════════════════════════════════════════════════
     2. DETEKSI BROWSER LANGUAGE
     ════════════════════════════════════════════════════════ */
  function detectByBrowser() {
    var nav = (navigator.language || navigator.userLanguage || '').toLowerCase();
    if (nav.startsWith('en')) return 'en';
    return null;
  }


  /* Hanya deteksi browser English yang mengaktifkan auto-translate. */
  function _fallback() {
    return detectByBrowser() || DEFAULT_LANG;
  }


  /* ════════════════════════════════════════════════════════
     4. INISIALISASI
     ════════════════════════════════════════════════════════ */
  function init() {
    _ensureLanguageAssets();
    _ensureLanguageSwitcher();
    _observeDynamicContent();
    var saved = null;
    try { saved = localStorage.getItem(STORAGE_KEY); } catch (e) { /* */ }

    if (saved && VALID_LANGS.indexOf(saved) !== -1) {
      /* Sudah pernah memilih → pakai langsung, tidak perlu fetch IP */
      applyLang(saved);
    } else {
      /* Bahasa otomatis tidak disimpan sebagai preferensi manual. */
      applyLang(_fallback(), false);
    }

    /* Pasang event ke dropdown (akan retry jika navbar belum ada) */
    _bindDropdownWhenReady();
  }


  /* ════════════════════════════════════════════════════════
     5. EVENT DROPDOWN
     Polling karena navbar di-fetch async oleh layout.js.
     ════════════════════════════════════════════════════════ */
  function _bindDropdownWhenReady(attempts) {
    attempts = attempts || 0;
    if (attempts > 60) {
      _ensureLanguageSwitcher(true);
      var fallbackWrapper = document.getElementById('lang-switcher');
      if (fallbackWrapper) _bindDropdown(fallbackWrapper);
      return;
    }
    var wrapper = document.getElementById('lang-switcher');
    if (wrapper) {
      _bindDropdown(wrapper);
    } else {
      setTimeout(function () { _bindDropdownWhenReady(attempts + 1); }, 50);
    }
  }

  function _bindDropdown(wrapper) {
    var trigger  = document.getElementById('lang-trigger');
    var dropdown = document.getElementById('lang-dropdown');
    if (!trigger || !dropdown) return;

    /* Pastikan tidak dipasang dua kali */
    if (wrapper.dataset.langBound) return;
    wrapper.dataset.langBound = '1';

    /* Buka / tutup dropdown */
    trigger.addEventListener('click', function (e) {
      e.stopPropagation();
      var isOpen = dropdown.classList.toggle('lang-dropdown--open');
      trigger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });

    /* Klik option bahasa */
    dropdown.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-lang-option]');
      if (!btn) return;
      var chosen = btn.getAttribute('data-lang-option');
      applyLang(chosen, true);
      dropdown.classList.remove('lang-dropdown--open');
      trigger.setAttribute('aria-expanded', 'false');
    });

    /* Tutup saat klik di luar */
    document.addEventListener('click', function (e) {
      if (!wrapper.contains(e.target)) {
        dropdown.classList.remove('lang-dropdown--open');
        trigger.setAttribute('aria-expanded', 'false');
      }
    });

    /* Tutup dengan Escape */
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        dropdown.classList.remove('lang-dropdown--open');
        trigger.setAttribute('aria-expanded', 'false');
        trigger.focus();
      }
    });

    /* Sync UI ke bahasa saat ini (navbar baru saja di-inject) */
    _updateWidgetUI(currentLang);
  }


  /* ════════════════════════════════════════════════════════
     6. PUBLIC API
     Dapat dipakai dari konsol browser atau script lain.
     ════════════════════════════════════════════════════════ */
  window.RMlang = {
    /** Atur bahasa secara manual, misal: RMlang.set('en') */
    set: applyLang,

    /** Dapatkan bahasa aktif saat ini */
    get: function () { return currentLang; },

    /** Hapus pilihan manual & deteksi ulang dari bahasa browser */
    reset: function () {
      try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* */ }
      applyLang(_fallback(), false);
    }
  };

  /* ════════════════════════════════════════════════════════
     7. TAMENG NOTRANSLATE — DOM Protection Logic
     Elemen dengan class 'notranslate' atau atribut
     data-proper-noun="true" tidak akan diterjemahkan.
     Saat bahasa non-ID aktif, elemen ini dikunci agar
     tetap menampilkan konten asli (nama, nomor pajak, dll).
     ════════════════════════════════════════════════════════ */
  function _applyNotranslateShield() {
    document.querySelectorAll('.notranslate, [data-proper-noun="true"]').forEach(function (el) {
      el.setAttribute('translate', 'no');
    });
  }


  /* ── Tunggu DOM siap lalu init ── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
