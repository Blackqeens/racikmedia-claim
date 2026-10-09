(function () {
  'use strict';

  var articles = [];
  var currentFilter = 'all';
  var searchQuery = '';
  var editorArticleId = null;
  var previewArticleId = null;

  function escapeHTML(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[character];
    });
  }

  function safeImageUrl(value) {
    try {
      var url = new URL(value);
      return url.protocol === 'https:' ? url.href : '';
    } catch (error) {
      return '';
    }
  }

  function showToast(message, icon) {
    var toast = document.getElementById('master-toast');
    document.getElementById('toast-msg').textContent = message;
    document.getElementById('toast-icon').textContent = icon || '✓';
    toast.classList.remove('hidden');
    window.setTimeout(function () { toast.classList.add('hidden'); }, 3800);
  }

  function showError(error) {
    var container = document.getElementById('articles-grid');
    container.innerHTML = '<div class="col-span-full p-8 text-center bg-red-950/30 rounded-2xl border border-red-900/60">' +
      '<p class="text-sm font-bold text-red-300">Gagal memuat atau menyimpan data artikel</p>' +
      '<p class="text-xs text-red-200 mt-2">' + escapeHTML(error.message || error) + '</p>' +
      '<button data-action="reload" class="mt-4 px-4 py-2 rounded-lg bg-slate-800 text-xs text-white">Coba lagi</button></div>';
  }

  function setConnectionStatus(elementId, connected, label) {
    var element = document.getElementById(elementId);
    element.textContent = label;
    element.className = connected
      ? 'text-xs text-emerald-300 bg-emerald-950/60 border border-emerald-800/50 px-2 py-0.5 rounded font-mono'
      : 'text-xs text-rose-300 bg-rose-950/60 border border-rose-800/50 px-2 py-0.5 rounded font-mono';
  }

  function updateCounters() {
    var activeArticles = articles.filter(function (article) { return !article.archived_at; });
    var headlineCount = activeArticles.filter(function (article) { return article.is_headline; }).length;
    document.getElementById('stat-ready-count').textContent = activeArticles.length;
    document.getElementById('stat-active-count').textContent = headlineCount;
    document.getElementById('badge-ready-count').textContent = headlineCount + ' Headline Aktif';
  }

  function renderArticles() {
    updateCounters();
    var filtered = articles.filter(function (article) {
      var archived = Boolean(article.archived_at);
      if (currentFilter === 'active' && (!article.is_headline || archived)) return false;
      if (currentFilter === 'archived' && !archived) return false;
      if (currentFilter === 'all' && archived) return false;

      if (searchQuery) {
        var query = searchQuery.toLocaleLowerCase();
        var haystack = [article.title, article.author_name, article.reviewer_name, article.category]
          .join(' ').toLocaleLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });

    var container = document.getElementById('articles-grid');
    if (!filtered.length) {
      container.innerHTML = '<div class="col-span-full p-12 text-center bg-slate-900/40 rounded-2xl border border-slate-800">' +
        '<p class="text-sm font-bold text-white">Belum ada artikel pada daftar ini</p>' +
        '<p class="text-xs text-slate-400 mt-1">Data yang tampil berasal dari tabel editorial Supabase, bukan data contoh browser.</p></div>';
      return;
    }

    container.innerHTML = filtered.map(function (article) {
      var archived = Boolean(article.archived_at);
      var image = safeImageUrl(article.cover_url);
      var headline = article.is_headline && !archived;
      return '<article class="m-card flex flex-col justify-between overflow-hidden ' +
        (headline ? 'ring-2 ring-emerald-500/60 ' : '') + (archived ? 'opacity-75 ' : '') + '">' +
        '<div><div class="relative h-44 w-full overflow-hidden bg-slate-950">' +
        (image ? '<img src="' + escapeHTML(image) + '" alt="' + escapeHTML(article.title) + '" class="w-full h-full object-cover" loading="lazy">' :
          '<div class="h-full flex items-center justify-center text-xs text-slate-500">Belum ada gambar sampul</div>') +
        '<div class="absolute top-3 left-3 flex gap-1.5"><span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-900/90 text-purple-300">' +
        escapeHTML(article.category) + '</span>' +
        (headline ? '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-600 text-white">★ Headline #' + escapeHTML(article.headline_order) + '</span>' : '') +
        (archived ? '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-700 text-slate-200">Diarsipkan</span>' : '') +
        '</div></div><div class="p-5">' +
        '<p class="text-[10px] text-emerald-400 font-semibold mb-2">Oleh ' + escapeHTML(article.author_name || '—') +
        (article.author_city ? ' · ' + escapeHTML(article.author_city) : '') + ' · ' + escapeHTML(article.status) + '</p>' +
        '<h3 class="font-serif text-base font-bold text-white leading-snug line-clamp-2">' + escapeHTML(article.title) + '</h3>' +
        '<p class="text-xs text-slate-400 mt-2 line-clamp-3 leading-relaxed">' + escapeHTML(article.excerpt) + '</p></div></div>' +
        '<div class="p-4 border-t border-slate-800 bg-slate-950/40 flex flex-wrap items-center justify-between gap-2">' +
        '<button data-action="preview" data-id="' + escapeHTML(article.id) + '" class="text-xs text-slate-300 hover:text-white">Detail</button>' +
        '<div class="flex gap-2">' +
        '<button data-action="edit" data-id="' + escapeHTML(article.id) + '" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-700 hover:bg-slate-600 text-white">Edit</button>' +
        (archived
          ? '<button data-action="restore" data-id="' + escapeHTML(article.id) + '" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-700 hover:bg-blue-600 text-white">Pulihkan</button>'
          : '<button data-action="headline" data-enabled="' + (!headline) + '" data-id="' + escapeHTML(article.id) + '" class="px-3 py-1.5 rounded-lg text-xs font-semibold ' +
            (headline ? 'bg-emerald-700 hover:bg-emerald-600' : 'bg-purple-700 hover:bg-purple-600') + ' text-white">' +
            (headline ? 'Lepas headline' : 'Jadikan headline') + '</button>' +
            '<button data-action="archive" data-id="' + escapeHTML(article.id) + '" class="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-900 hover:bg-rose-800 text-white">Arsipkan</button>') +
        '</div></div></article>';
    }).join('');
  }

  async function loadArticles() {
    try {
      articles = await MasterArticlesAPI.list();
      setConnectionStatus('status-supabase', true, 'Supabase: terhubung');
      renderArticles();
    } catch (error) {
      setConnectionStatus('status-supabase', false, 'Supabase: gagal');
      showError(error);
    }
  }

  function createEditor() {
    var editor = document.createElement('div');
    editor.id = 'article-editor-modal';
    editor.className = 'fixed inset-0 z-50 hidden items-center justify-center p-4 modal-backdrop';
    editor.innerHTML = '<div class="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">' +
      '<div class="flex items-center justify-between mb-5"><h2 id="article-editor-heading" class="text-xl font-bold text-white">Artikel Baru</h2>' +
      '<button type="button" data-action="close-editor" class="text-slate-300 hover:text-white">✕</button></div>' +
      '<form id="article-editor-form" class="space-y-4">' +
      '<label class="block text-xs text-slate-300">Judul<input id="editor-title" maxlength="160" required class="mt-1 w-full rounded-lg bg-slate-800 border border-slate-700 p-3 text-sm text-white"></label>' +
      '<label class="block text-xs text-slate-300">Kategori<input id="editor-category" maxlength="80" required class="mt-1 w-full rounded-lg bg-slate-800 border border-slate-700 p-3 text-sm text-white"></label>' +
      '<label class="block text-xs text-slate-300">Ringkasan (maks. 400 karakter)<textarea id="editor-excerpt" maxlength="400" rows="3" class="mt-1 w-full rounded-lg bg-slate-800 border border-slate-700 p-3 text-sm text-white"></textarea></label>' +
      '<label class="block text-xs text-slate-300">Isi artikel<textarea id="editor-content" required rows="8" class="mt-1 w-full rounded-lg bg-slate-800 border border-slate-700 p-3 text-sm text-white"></textarea></label>' +
      '<label class="block text-xs text-slate-300">Tag (pisahkan dengan koma)<input id="editor-tags" placeholder="kuliner, umk_lokal" class="mt-1 w-full rounded-lg bg-slate-800 border border-slate-700 p-3 text-sm text-white"></label>' +
      '<label class="block text-xs text-slate-300">URL gambar sampul<input id="editor-cover-url" type="url" placeholder="https://…" class="mt-1 w-full rounded-lg bg-slate-800 border border-slate-700 p-3 text-sm text-white"></label>' +
      '<label class="block text-xs text-slate-300">Atau unggah gambar (JPEG, PNG, WebP, AVIF; maks. 5 MB)<input id="editor-cover-file" type="file" accept="image/jpeg,image/png,image/webp,image/avif" class="mt-1 block w-full text-xs text-slate-300"></label>' +
      '<p id="article-editor-error" class="hidden text-sm text-rose-300" role="alert"></p>' +
      '<div class="flex justify-end gap-2 pt-2"><button type="button" data-action="close-editor" class="px-4 py-2 rounded-lg bg-slate-700 text-xs text-white">Batal</button>' +
      '<button id="article-editor-submit" type="submit" class="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-xs font-bold text-white">Simpan</button></div>' +
      '</form></div>';
    document.body.appendChild(editor);

    var preview = document.createElement('div');
    preview.id = 'article-content-preview';
    preview.className = 'fixed inset-0 z-50 hidden items-center justify-center p-4 modal-backdrop';
    preview.innerHTML = '<div class="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">' +
      '<div class="flex items-start justify-between gap-4"><div><span id="content-preview-category" class="text-xs text-purple-300"></span>' +
      '<h2 id="content-preview-title" class="mt-2 text-xl font-bold text-white"></h2><p id="content-preview-author" class="mt-1 text-xs text-slate-400"></p></div>' +
      '<button type="button" data-action="close-preview" class="text-slate-300 hover:text-white">✕</button></div>' +
      '<img id="content-preview-image" class="hidden mt-5 w-full max-h-72 object-cover rounded-xl" alt="Sampul artikel">' +
      '<p id="content-preview-body" class="mt-5 whitespace-pre-wrap text-sm leading-relaxed text-slate-200"></p>' +
      '<div class="mt-6 flex justify-end"><button type="button" data-action="close-preview" class="px-4 py-2 rounded-lg bg-slate-700 text-xs text-white">Tutup</button></div></div>';
    document.body.appendChild(preview);
  }

  function openEditor(article) {
    editorArticleId = article ? article.id : null;
    document.getElementById('article-editor-heading').textContent = article ? 'Edit Artikel' : 'Artikel Baru';
    document.getElementById('editor-title').value = article ? article.title : '';
    document.getElementById('editor-category').value = article ? article.category : '';
    document.getElementById('editor-excerpt').value = article ? article.excerpt : '';
    document.getElementById('editor-content').value = article ? article.content : '';
    document.getElementById('editor-tags').value = article && article.tags ? article.tags.join(', ') : '';
    document.getElementById('editor-cover-url').value = article ? article.cover_url || '' : '';
    document.getElementById('editor-cover-file').value = '';
    document.getElementById('article-editor-error').classList.add('hidden');
    document.getElementById('article-editor-modal').classList.remove('hidden');
    document.getElementById('article-editor-modal').classList.add('flex');
  }

  function closeEditor() {
    var editor = document.getElementById('article-editor-modal');
    editor.classList.add('hidden');
    editor.classList.remove('flex');
    editorArticleId = null;
  }

  function openPreview(article) {
    document.getElementById('content-preview-category').textContent = article.category;
    document.getElementById('content-preview-title').textContent = article.title;
    document.getElementById('content-preview-author').textContent = 'Oleh ' + article.author_name + ' · ' + article.status;
    document.getElementById('content-preview-body').textContent = article.content;
    var image = document.getElementById('content-preview-image');
    var imageUrl = safeImageUrl(article.cover_url);
    image.src = imageUrl;
    image.classList.toggle('hidden', !imageUrl);
    document.getElementById('article-content-preview').classList.remove('hidden');
    document.getElementById('article-content-preview').classList.add('flex');
    previewArticleId = article.id;
  }

  function closePreview() {
    var preview = document.getElementById('article-content-preview');
    preview.classList.add('hidden');
    preview.classList.remove('flex');
    previewArticleId = null;
  }

  async function handleEditorSubmit(event) {
    event.preventDefault();
    var form = event.currentTarget;
    var wasEditing = Boolean(editorArticleId);
    var submit = document.getElementById('article-editor-submit');
    var errorNode = document.getElementById('article-editor-error');
    submit.disabled = true;
    submit.textContent = 'Menyimpan…';
    errorNode.classList.add('hidden');

    try {
      var imageUrl = document.getElementById('editor-cover-url').value.trim() || null;
      var file = document.getElementById('editor-cover-file').files[0];
      if (file) imageUrl = await MasterArticlesAPI.uploadCover(file);

      var input = {
        title: document.getElementById('editor-title').value,
        category: document.getElementById('editor-category').value,
        excerpt: document.getElementById('editor-excerpt').value,
        content: document.getElementById('editor-content').value,
        tags: document.getElementById('editor-tags').value,
        cover_url: imageUrl
      };
      if (editorArticleId) await MasterArticlesAPI.update(editorArticleId, input);
      else await MasterArticlesAPI.create(input);

      closeEditor();
      await loadArticles();
      showToast(wasEditing ? 'Perubahan artikel tersimpan.' : 'Artikel baru berhasil dibuat.');
    } catch (error) {
      errorNode.textContent = error.message;
      errorNode.classList.remove('hidden');
    } finally {
      submit.disabled = false;
      submit.textContent = 'Simpan';
    }
  }

  async function handleArticleAction(action, id, enabled) {
    var article = articles.find(function (item) { return item.id === id; });
    if (!article && action !== 'reload') return;
    try {
      if (action === 'headline') {
        await MasterArticlesAPI.setHeadline(id, enabled);
        showToast(enabled ? 'Artikel ditetapkan sebagai headline.' : 'Artikel dilepas dari headline.');
      } else if (action === 'archive') {
        if (!window.confirm('Arsipkan artikel ini? Artikel tidak dihapus permanen dan dapat dipulihkan.')) return;
        await MasterArticlesAPI.archive(id);
        showToast('Artikel diarsipkan dan dilepas dari headline.');
      } else if (action === 'restore') {
        await MasterArticlesAPI.restore(id);
        showToast('Artikel dipulihkan.');
      } else if (action === 'preview') {
        openPreview(article);
        return;
      } else if (action === 'edit') {
        openEditor(article);
        return;
      } else if (action === 'reload') {
        await loadArticles();
        return;
      }
      await loadArticles();
    } catch (error) {
      showToast(error.message, '!');
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    createEditor();
    var session = BobAuth.getSession();
    if (session) {
      document.getElementById('master-user-name').textContent = (session.name || 'Master Admin') + ' (Master)';
      document.getElementById('master-user-email').textContent = session.email || '';
    }

    document.getElementById('create-article-button').addEventListener('click', function () { openEditor(null); });
    document.getElementById('filter-container').addEventListener('click', function (event) {
      var button = event.target.closest('[data-filter]');
      if (!button) return;
      currentFilter = button.dataset.filter;
      document.querySelectorAll('.filter-btn').forEach(function (item) {
        item.className = item === button
          ? 'filter-btn px-3 py-1.5 rounded-lg text-xs font-bold bg-purple-600 text-white transition-all whitespace-nowrap'
          : 'filter-btn px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 bg-slate-800/80 hover:bg-slate-700 hover:text-white transition-all whitespace-nowrap';
      });
      renderArticles();
    });
    document.getElementById('search-input').addEventListener('input', function (event) {
      searchQuery = event.target.value.trim();
      renderArticles();
    });
    document.getElementById('articles-grid').addEventListener('click', function (event) {
      var button = event.target.closest('[data-action]');
      if (button) handleArticleAction(button.dataset.action, button.dataset.id, button.dataset.enabled === 'true');
    });
    document.body.addEventListener('click', function (event) {
      var button = event.target.closest('[data-action="close-editor"], [data-action="close-preview"]');
      if (!button) return;
      if (button.dataset.action === 'close-editor') closeEditor();
      else closePreview();
    });
    document.getElementById('article-editor-form').addEventListener('submit', handleEditorSubmit);
    document.getElementById('article-editor-modal').addEventListener('click', function (event) {
      if (event.target.id === 'article-editor-modal') closeEditor();
    });
    document.getElementById('article-content-preview').addEventListener('click', function (event) {
      if (event.target.id === 'article-content-preview') closePreview();
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        closeEditor();
        closePreview();
      }
    });
    document.getElementById('retry-astra-sync').addEventListener('click', function () {
      setConnectionStatus('status-astra', false, 'Astra: menyinkronkan…');
      MasterArticlesAPI.syncAstra().then(function (result) {
        setConnectionStatus(
          'status-astra',
          result.pending === 0,
          result.pending ? 'Astra: sync tertunda (' + result.pending + ')' : 'Astra: terhubung'
        );
        var failure = result.failed && result.failed[0];
        showToast(failure
          ? 'Sinkronisasi gagal untuk ' + failure.article_id + ': ' + failure.error
          : 'Sinkronisasi Astra selesai. Tersinkron: ' + result.synced + ', tertunda: ' + result.pending + '.',
        failure ? '!' : '✓');
      }).catch(function (error) {
        setConnectionStatus('status-astra', false, 'Astra: gagal');
        document.getElementById('status-astra').title = error.message;
        showToast(error.message, '!');
      });
    });
    window.addEventListener('astra-sync-status', function (event) {
      var detail = event.detail || {};
      setConnectionStatus(
        'status-astra',
        detail.connected && !detail.pending,
        detail.connected
          ? (detail.pending ? 'Astra: sync tertunda (' + detail.pending + ')' : 'Astra: terhubung')
          : 'Astra: sync tertunda'
      );
      document.getElementById('status-astra').title = detail.message || '';
    });

    MasterArticlesAPI.checkSupabase().then(function () {
      setConnectionStatus('status-supabase', true, 'Supabase: terhubung');
    }).catch(function (error) {
      setConnectionStatus('status-supabase', false, 'Supabase: gagal');
      console.error('Supabase health check failed:', error.message);
    });
    MasterArticlesAPI.checkAstra().then(function (result) {
      setConnectionStatus(
        'status-astra',
        result.pending === 0,
        result.pending ? 'Astra: sync tertunda (' + result.pending + ')' : 'Astra: terhubung'
      );
    }).catch(function (error) {
      setConnectionStatus('status-astra', false, 'Astra: belum terhubung');
      document.getElementById('status-astra').title = error.message;
      console.error('Astra health check failed:', error.message);
    });
    loadArticles();
  });
})();
