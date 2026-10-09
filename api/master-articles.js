(function (global) {
  'use strict';

  var TABLE = 'content_articles';
  var BUCKET = 'article-covers';
  var SELECT_FIELDS = 'id, title, excerpt, content, category, tags, cover_url, author_id, author_name, author_city, reviewer_name, status, is_headline, headline_order, archived_at, published_at, created_at, updated_at';

  async function _adminClient() {
    if (!global.BobAuth || typeof global.BobAuth.getClient !== 'function') {
      throw new Error('Modul autentikasi belum dimuat.');
    }
    var client = await global.BobAuth.getClient();
    var authResult = await client.auth.getUser();
    if (authResult.error) throw new Error(authResult.error.message);
    if (!authResult.data.user) throw new Error('Silakan masuk terlebih dahulu.');

    var profileResult = await client
      .from('profiles')
      .select('role, display_name, city')
      .eq('id', authResult.data.user.id)
      .single();
    if (profileResult.error) throw new Error('Gagal memeriksa role akun: ' + profileResult.error.message);
    if (profileResult.data.role !== 'master_admin') {
      throw new Error('Akses ditolak. Hanya master_admin yang dapat mengelola artikel.');
    }

    return {
      client: client,
      user: authResult.data.user,
      profile: profileResult.data
    };
  }

  function _checkError(error, action) {
    if (error) throw new Error(action + ': ' + error.message);
  }

  function _cleanArticle(input) {
    var title = String(input.title || '').trim();
    var excerpt = String(input.excerpt || '').trim();
    var content = String(input.content || '').trim();
    var category = String(input.category || '').trim();
    if (title.length < 5 || title.length > 160) {
      throw new Error('Judul wajib 5–160 karakter.');
    }
    if (!content) throw new Error('Isi artikel wajib diisi.');
    if (excerpt.length > 400) throw new Error('Ringkasan maksimal 400 karakter.');
    if (!category || category.length > 80) throw new Error('Kategori wajib diisi (maksimal 80 karakter).');

    return {
      title: title,
      excerpt: excerpt || content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400),
      content: content,
      category: category,
      tags: Array.isArray(input.tags)
        ? input.tags.map(function (tag) { return String(tag).trim(); }).filter(Boolean).slice(0, 20)
        : String(input.tags || '').split(',').map(function (tag) { return tag.trim(); }).filter(Boolean).slice(0, 20),
      cover_url: input.cover_url || null
    };
  }

  function _publishAstraStatus(detail) {
    if (typeof global.dispatchEvent === 'function' && typeof global.CustomEvent === 'function') {
      global.dispatchEvent(new global.CustomEvent('astra-sync-status', { detail: detail }));
    }
  }

  async function _syncAstraAfterChange(client) {
    try {
      var result = await client.functions.invoke('sync-astra-articles', { body: { action: 'sync' } });
      if (result.error) throw result.error;
      var data = result.data || {};
      var failed = Array.isArray(data.failed) && data.failed.length > 0;
      _publishAstraStatus({
        connected: data.connected === true,
        pending: Number(data.pending) || 0,
        message: failed ? 'Sebagian artikel belum tersinkron ke Astra.' : ''
      });
    } catch (error) {
      console.error('Astra synchronization is pending:', error.message);
      _publishAstraStatus({
        connected: false,
        pending: 1,
        message: error.message
      });
    }
  }

  var MasterArticlesAPI = {
    getPublished: async function (options) {
      options = options || {};
      var client = await global.BobAuth.getClient();
      var page = Math.max(1, Number(options.page) || 1);
      var limit = Math.min(50, Math.max(1, Number(options.limit) || 12));
      var query = client
        .from(TABLE)
        .select('id, title, excerpt, category, tags, cover_url, author_name, author_city, published_at, is_headline, headline_order', { count: 'exact' })
        .eq('status', 'published')
        .is('archived_at', null);

      if (options.category) query = query.eq('category', options.category);
      var result = await query
        .order('is_headline', { ascending: false })
        .order('headline_order', { ascending: true, nullsFirst: false })
        .order('published_at', { ascending: false })
        .range((page - 1) * limit, page * limit - 1);
      _checkError(result.error, 'Gagal memuat artikel publik');
      return {
        data: result.data || [],
        meta: {
          total: result.count || 0,
          page: page,
          limit: limit,
          total_pages: Math.ceil((result.count || 0) / limit)
        }
      };
    },

    list: async function () {
      var context = await _adminClient();
      var result = await context.client
        .from(TABLE)
        .select(SELECT_FIELDS)
        .order('archived_at', { ascending: true, nullsFirst: true })
        .order('is_headline', { ascending: false })
        .order('headline_order', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(200);
      _checkError(result.error, 'Gagal memuat artikel');
      return result.data || [];
    },

    create: async function (input) {
      var context = await _adminClient();
      var article = _cleanArticle(input);
      var result = await context.client
        .from(TABLE)
        .insert(Object.assign(article, {
          author_id: context.user.id,
          author_name: context.profile.display_name || context.user.email || 'Master Admin',
          author_city: context.profile.city || '',
          reviewed_by: context.user.id,
          reviewer_name: context.profile.display_name || 'Master Admin',
          status: 'published'
        }))
        .select(SELECT_FIELDS)
        .single();
      _checkError(result.error, 'Gagal membuat artikel');
      await _syncAstraAfterChange(context.client);
      return result.data;
    },

    update: async function (id, input) {
      var context = await _adminClient();
      var result = await context.client
        .from(TABLE)
        .update(Object.assign(_cleanArticle(input), { updated_at: new Date().toISOString() }))
        .eq('id', id)
        .select(SELECT_FIELDS)
        .single();
      _checkError(result.error, 'Gagal menyimpan perubahan artikel');
      await _syncAstraAfterChange(context.client);
      return result.data;
    },

    setHeadline: async function (id, enabled) {
      var context = await _adminClient();
      var result = await context.client.rpc('set_content_article_headline', {
        target_article_id: id,
        enabled: Boolean(enabled)
      });
      _checkError(result.error, 'Gagal mengubah headline');
      await _syncAstraAfterChange(context.client);
      return result.data;
    },

    archive: async function (id) {
      var context = await _adminClient();
      var result = await context.client
        .from(TABLE)
        .update({
          archived_at: new Date().toISOString(),
          is_headline: false,
          headline_order: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .is('archived_at', null)
        .select(SELECT_FIELDS)
        .single();
      _checkError(result.error, 'Gagal mengarsipkan artikel');
      await _syncAstraAfterChange(context.client);
      return result.data;
    },

    restore: async function (id) {
      var context = await _adminClient();
      var result = await context.client
        .from(TABLE)
        .update({ archived_at: null, updated_at: new Date().toISOString() })
        .eq('id', id)
        .not('archived_at', 'is', null)
        .select(SELECT_FIELDS)
        .single();
      _checkError(result.error, 'Gagal memulihkan artikel');
      await _syncAstraAfterChange(context.client);
      return result.data;
    },

    uploadCover: async function (file) {
      var context = await _adminClient();
      if (!file || !/^image\/(jpeg|png|webp|avif)$/.test(file.type)) {
        throw new Error('Gunakan gambar JPEG, PNG, WebP, atau AVIF.');
      }
      if (file.size > 5 * 1024 * 1024) throw new Error('Ukuran gambar maksimal 5 MB.');

      var extension = file.type.split('/')[1].replace('jpeg', 'jpg');
      var path = context.user.id + '/' + crypto.randomUUID() + '.' + extension;
      var result = await context.client.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false });
      _checkError(result.error, 'Gagal mengunggah gambar');
      return context.client.storage.from(BUCKET).getPublicUrl(result.data.path).data.publicUrl;
    },

    checkSupabase: async function () {
      var context = await _adminClient();
      var result = await context.client.from(TABLE).select('id').limit(1);
      _checkError(result.error, 'Pemeriksaan Supabase gagal');
      return { connected: true };
    },

    checkAstra: async function () {
      var context = await _adminClient();
      var result = await context.client.functions.invoke('sync-astra-articles', { body: { action: 'check' } });
      _checkError(result.error, 'Pemeriksaan Astra gagal');
      if (!result.data || result.data.connected !== true) {
        throw new Error('Astra belum mengonfirmasi koneksi.');
      }
      return result.data;
    },

    syncAstra: async function () {
      var context = await _adminClient();
      var result = await context.client.functions.invoke('sync-astra-articles', { body: { action: 'sync' } });
      _checkError(result.error, 'Sinkronisasi Astra gagal');
      if (!result.data || !result.data.connected) {
        throw new Error('Astra belum mengonfirmasi koneksi.');
      }
      return result.data;
    }
  };

  global.MasterArticlesAPI = MasterArticlesAPI;
})(window);
