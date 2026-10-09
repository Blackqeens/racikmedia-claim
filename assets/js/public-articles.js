(function (global) {
  'use strict';

  var TABLE = 'content_articles';
  var ARTICLE_FIELDS = 'id, title, excerpt, content, category, tags, cover_url, author_id, author_name, author_city, published_at';
  var CARD_FIELDS = 'id, title, excerpt, category, tags, cover_url, author_id, author_name, published_at';

  function check(error, action) {
    if (error) throw new Error(action + ': ' + error.message);
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
    });
  }

  function safeImageUrl(value) {
    try {
      var url = new URL(String(value || ''), global.location.href);
      return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
    } catch (error) {
      return '';
    }
  }

  function sanitizeContent(html) {
    var parser = new DOMParser();
    var parsed = parser.parseFromString(String(html || ''), 'text/html');
    var allowed = new Set(['P', 'H2', 'H3', 'H4', 'UL', 'OL', 'LI', 'STRONG', 'B', 'EM', 'I', 'BLOCKQUOTE', 'BR', 'A', 'PRE', 'CODE', 'HR']);
    var blocked = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'MATH', 'TEMPLATE']);

    function copy(node) {
      if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.textContent || '');
      if (node.nodeType !== Node.ELEMENT_NODE) return document.createDocumentFragment();
      var tag = node.tagName;
      if (blocked.has(tag)) return document.createDocumentFragment();
      if (!allowed.has(tag)) {
        var unwrapped = document.createDocumentFragment();
        Array.from(node.childNodes).forEach(function (child) { unwrapped.appendChild(copy(child)); });
        return unwrapped;
      }
      var element = document.createElement(tag.toLowerCase());
      if (tag === 'A') {
        var href = node.getAttribute('href') || '';
        try {
          var url = new URL(href, global.location.href);
          if (url.protocol === 'http:' || url.protocol === 'https:') {
            element.href = url.href;
            element.rel = 'noopener noreferrer';
            element.target = '_blank';
          }
        } catch (error) {
          element.removeAttribute('href');
        }
      }
      Array.from(node.childNodes).forEach(function (child) { element.appendChild(copy(child)); });
      return element;
    }

    var output = document.createElement('div');
    Array.from(parsed.body.childNodes).forEach(function (node) { output.appendChild(copy(node)); });
    return output.innerHTML;
  }

  function getClient() {
    if (!global.BobAuth || typeof global.BobAuth.getClient !== 'function') {
      throw new Error('Modul Supabase Auth belum dimuat.');
    }
    return global.BobAuth.getClient();
  }

  async function currentUser(client) {
    var result = await client.auth.getUser();
    if (result.error) throw result.error;
    return result.data.user || null;
  }

  async function getEngagement(client, articleId) {
    var result = await client.rpc('get_content_article_engagement', { target_article_id: articleId });
    check(result.error, 'Gagal memuat interaksi artikel');
    return Array.isArray(result.data) ? result.data[0] : result.data;
  }

  var PublicArticles = {
    escapeHtml: escapeHtml,
    safeImageUrl: safeImageUrl,
    sanitizeContent: sanitizeContent,

    list: async function (options) {
      options = options || {};
      var client = await getClient();
      var page = Math.max(1, Number(options.page) || 1);
      var limit = Math.min(30, Math.max(1, Number(options.limit) || 9));
      var query = client.from(TABLE)
        .select(CARD_FIELDS, { count: 'exact' })
        .eq('status', 'published')
        .is('archived_at', null);
      if (options.category) query = query.eq('category', options.category);
      if (options.tag) query = query.contains('tags', [options.tag]);
      if (options.authorId) query = query.eq('author_id', options.authorId);
      var result = await query.order('published_at', { ascending: false })
        .range((page - 1) * limit, page * limit - 1);
      check(result.error, 'Gagal memuat artikel');
      return {
        data: result.data || [],
        total: result.count || 0,
        page: page,
        limit: limit,
        totalPages: Math.ceil((result.count || 0) / limit)
      };
    },

    get: async function (articleId) {
      var client = await getClient();
      var result = await client.from(TABLE).select(ARTICLE_FIELDS)
        .eq('id', articleId)
        .eq('status', 'published')
        .is('archived_at', null)
        .maybeSingle();
      check(result.error, 'Gagal memuat artikel');
      return result.data;
    },

    categoriesAndTags: async function () {
      var client = await getClient();
      var result = await client.from(TABLE).select('category, tags')
        .eq('status', 'published')
        .is('archived_at', null)
        .limit(1000);
      check(result.error, 'Gagal memuat kategori dan tag');
      var categories = new Set();
      var tags = new Set();
      (result.data || []).forEach(function (row) {
        if (row.category) categories.add(row.category);
        (row.tags || []).forEach(function (tag) { if (tag) tags.add(tag); });
      });
      return { categories: Array.from(categories).sort(), tags: Array.from(tags).sort() };
    },

    getEngagement: async function (articleId) {
      return getEngagement(await getClient(), articleId);
    },

    getComments: async function (articleId) {
      var client = await getClient();
      var result = await client.from('content_article_comments')
        .select('id, author_id, author_name, comment_text, created_at')
        .eq('article_id', articleId)
        .order('created_at', { ascending: true })
        .limit(200);
      check(result.error, 'Gagal memuat komentar');
      return result.data || [];
    },

    addComment: async function (articleId, text) {
      var client = await getClient();
      var user = await currentUser(client);
      if (!user) throw new Error('Masuk ke akun untuk mengirim komentar.');
      var comment = String(text || '').trim();
      if (comment.length < 1 || comment.length > 2000) throw new Error('Komentar harus berisi 1–2000 karakter.');
      var result = await client.from('content_article_comments')
        .insert({ article_id: articleId, author_id: user.id, comment_text: comment });
      check(result.error, 'Gagal mengirim komentar');
    },

    deleteComment: async function (commentId) {
      var client = await getClient();
      var user = await currentUser(client);
      if (!user) throw new Error('Masuk ke akun untuk menghapus komentar Anda.');
      var result = await client.from('content_article_comments')
        .delete()
        .eq('id', commentId)
        .eq('author_id', user.id);
      check(result.error, 'Gagal menghapus komentar');
    },

    toggleReaction: async function (articleId, reactionType) {
      if (reactionType !== 'like' && reactionType !== 'bookmark') throw new Error('Jenis interaksi tidak valid.');
      var client = await getClient();
      var user = await currentUser(client);
      if (!user) throw new Error('Masuk ke akun untuk menyukai atau menyimpan artikel.');
      var existing = await client.from('content_article_reactions').select('id')
        .eq('article_id', articleId)
        .eq('user_id', user.id)
        .eq('reaction_type', reactionType)
        .maybeSingle();
      check(existing.error, 'Gagal memeriksa interaksi');
      var result = existing.data
        ? await client.from('content_article_reactions').delete().eq('id', existing.data.id)
        : await client.from('content_article_reactions').insert({
          article_id: articleId,
          user_id: user.id,
          reaction_type: reactionType
        });
      check(result.error, 'Gagal menyimpan interaksi');
      return getEngagement(client, articleId);
    },

    getPublicAuthor: async function (authorId) {
      var client = await getClient();
      var result = await client.rpc('get_public_author_profile', { target_author_id: authorId });
      check(result.error, 'Gagal memuat profil penulis');
      return Array.isArray(result.data) ? result.data[0] || null : result.data;
    },

    getBookmarks: async function () {
      var client = await getClient();
      var user = await currentUser(client);
      if (!user) throw new Error('Silakan masuk untuk melihat artikel tersimpan.');
      var result = await client.from('content_article_reactions')
        .select('created_at, article:content_articles!content_article_reactions_article_id_fkey(' + CARD_FIELDS + ')')
        .eq('user_id', user.id)
        .eq('reaction_type', 'bookmark')
        .order('created_at', { ascending: false });
      check(result.error, 'Gagal memuat artikel tersimpan');
      return (result.data || []).map(function (row) { return row.article; }).filter(Boolean);
    },

    dateLabel: function (value) {
      return new Intl.DateTimeFormat('id-ID', { dateStyle: 'long' }).format(new Date(value));
    }
  };

  global.PublicArticles = PublicArticles;
})(window);
