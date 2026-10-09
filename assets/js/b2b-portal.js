(function (global) {
  'use strict';

  function getClient() {
    if (global.supabaseClient) return global.supabaseClient;
    if (!global.supabase || !global.SUPABASE_CONFIG) {
      throw new Error('Koneksi Supabase belum siap. Muat Supabase JS dan konfigurasi terlebih dahulu.');
    }
    global.supabaseClient = global.supabase.createClient(
      global.SUPABASE_CONFIG.url,
      global.SUPABASE_CONFIG.publishableKey
    );
    return global.supabaseClient;
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
    });
  }

  function formatRupiah(value) {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0,
    }).format(Number(value) || 0);
  }

  function showMessage(element, message, isError) {
    element.textContent = message;
    element.classList.remove('hidden', 'bg-rose-50', 'text-rose-800', 'bg-emerald-50', 'text-emerald-800');
    element.classList.add(isError ? 'bg-rose-50' : 'bg-emerald-50', isError ? 'text-rose-800' : 'text-emerald-800');
  }

  global.B2BPortal = { getClient: getClient, escapeHtml: escapeHtml, formatRupiah: formatRupiah, showMessage: showMessage };
})(window);
