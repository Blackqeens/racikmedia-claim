(function () {
  'use strict';

  var form = document.getElementById('newsletter-form');
  if (!form) return;

  var emailInput = document.getElementById('newsletter-email');
  var submitButton = document.getElementById('newsletter-submit');
  var status = document.getElementById('newsletter-status');
  var scriptUrl = document.currentScript && document.currentScript.src;

  function loadScript(src, label) {
    return new Promise(function (resolve, reject) {
      var existing = document.querySelector('script[data-newsletter-src="' + src + '"]');
      if (existing) {
        if (existing.dataset.loaded === 'true') return resolve();
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', function () {
          reject(new Error(label + ' gagal dimuat.'));
        }, { once: true });
        return;
      }

      var script = document.createElement('script');
      script.src = src;
      script.dataset.newsletterSrc = src;
      script.onload = function () {
        script.dataset.loaded = 'true';
        resolve();
      };
      script.onerror = function () {
        reject(new Error(label + ' gagal dimuat.'));
      };
      document.head.appendChild(script);
    });
  }

  function getSupabaseClient() {
    if (window.supabaseClient && typeof window.supabaseClient.rpc === 'function') {
      return Promise.resolve(window.supabaseClient);
    }
    if (!scriptUrl) {
      return Promise.reject(new Error('Lokasi konfigurasi Newsletter tidak tersedia.'));
    }

    var configUrl = new URL('supabase-config.js', scriptUrl).href;
    var libraryUrl = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
    var configPromise = window.SUPABASE_CONFIG
      ? Promise.resolve()
      : loadScript(configUrl, 'Konfigurasi Supabase');
    var libraryPromise = window.supabase
      ? Promise.resolve()
      : loadScript(libraryUrl, 'Library Supabase');

    return Promise.all([configPromise, libraryPromise]).then(function () {
      var config = window.SUPABASE_CONFIG;
      if (!config || !config.url || !config.publishableKey || !window.supabase) {
        throw new Error('Konfigurasi Supabase Newsletter belum lengkap.');
      }
      if (!window.supabaseClient) {
        window.supabaseClient = window.supabase.createClient(config.url, config.publishableKey);
      }
      return window.supabaseClient;
    });
  }

  function showStatus(messageId, messageEn, isError) {
    var isEnglish = window.RMlang && window.RMlang.get && window.RMlang.get() === 'en';
    status.textContent = isEnglish ? messageEn : messageId;
    status.classList.toggle('text-red-700', isError);
    status.classList.toggle('text-emerald-700', !isError);
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    if (!form.reportValidity()) return;

    var email = emailInput.value.trim().toLowerCase();
    emailInput.value = email;
    submitButton.disabled = true;
    submitButton.textContent = 'Memproses…';
    status.textContent = '';

    getSupabaseClient()
      .then(function (client) {
        return client.rpc('subscribe_newsletter', {
          p_email: email,
          p_consent: document.getElementById('newsletter-consent').checked
        });
      })
      .then(function (result) {
        if (result.error) throw result.error;
        form.reset();
        showStatus(
          'Terima kasih! Email Anda sudah terdaftar untuk menerima tabloid bulanan Racik Media.',
          'Thank you! Your email is registered for Racik Media’s monthly tabloid.',
          false
        );
      })
      .catch(function (error) {
        console.error('Pendaftaran Newsletter gagal:', error);
        showStatus(
          'Pendaftaran belum berhasil. Silakan coba lagi beberapa saat.',
          'We could not complete your subscription. Please try again shortly.',
          true
        );
      })
      .finally(function () {
        submitButton.disabled = false;
        submitButton.textContent = 'Langganan Gratis';
      });
  });
})();
