import { createClient } from 'npm:@supabase/supabase-js@2';

type SyncOperation = 'upsert' | 'delete';

interface QueueItem {
  article_id: string;
  operation: SyncOperation;
  attempts: number;
  updated_at: string;
}

interface Article {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  cover_url: string | null;
  author_id: string;
  status: string;
  archived_at: string | null;
  published_at: string | null;
}

const jsonHeaders = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

function corsHeaders(request: Request): Record<string, string> {
  const allowedOrigins = (Deno.env.get('APP_ALLOWED_ORIGINS') || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const requestOrigin = request.headers.get('Origin') || '';
  const allowOrigin = allowedOrigins.length === 0
    ? '*'
    : allowedOrigins.includes(requestOrigin) ? requestOrigin : '';

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin'
  };
}

function jsonResponse(request: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...jsonHeaders, ...corsHeaders(request) }
  });
}

function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing Edge Function secret: ${name}`);
  return value;
}

function astraApiUrl(endpoint: string, keyspace: string, collection: string): string {
  const base = new URL(endpoint);
  if (base.protocol !== 'https:') throw new Error('ASTRA_DB_API_ENDPOINT must use HTTPS.');
  base.pathname = `/api/json/v1/${encodeURIComponent(keyspace)}/${encodeURIComponent(collection)}`;
  base.search = '';
  base.hash = '';
  return base.toString();
}

async function sendAstraCommand(url: string, token: string, command: unknown): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Token': token },
    body: JSON.stringify(command)
  });

  const responseText = await response.text();
  let result: Record<string, unknown>;
  try {
    result = responseText ? JSON.parse(responseText) : {};
  } catch {
    throw new Error(`Astra returned a non-JSON response (HTTP ${response.status}).`);
  }

  const status = result.status as Record<string, unknown> | undefined;
  const hasErrors = (Array.isArray(result.errors) && result.errors.length > 0)
    || (status && Array.isArray(status.errors) && status.errors.length > 0);
  if (!response.ok || hasErrors) {
    const detail = JSON.stringify(result.errors || status?.errors || result).slice(0, 1000);
    throw new Error(`Astra Data API failed (HTTP ${response.status}): ${detail}`);
  }
  return result;
}

/**
 * Peta data artikel Supabase → dokumen Astra DB.
 *
 * Field `content` adalah satu-satunya text source yang dibaca vectorizer
 * ($vectorize mengarah ke field ini via koleksi DDL).  Field lain berfungsi
 * sebagai metadata filter dan tidak masuk ke embedding.
 *
 * ── Konfigurasi koleksi Astra DB ──────────────────────────────────────
 * Provider   : nvidia
 * Model      : nvidia/nv-embedqa-e5-v5
 * Dimensions : 1024
 * Similarity : cosine
 *
 * DDL createCollection (jalankan sekali via Astra Data API):
 * {
 *   "createCollection": {
 *     "name": "media_contents_collection",
 *     "options": {
 *       "vector": { "dimension": 1024, "metric": "cosine" },
 *       "vectorize": {
 *         "provider": "nvidia",
 *         "modelName": "nvidia/nv-embedqa-e5-v5",
 *         "sourceField": "content"
 *       }
 *     }
 *   }
 * }
 *
 * Skema output dokumen (diverifikasi di Astra DB Dashboard → Data Explorer):
 * {
 *   "content_id":   "media-art-<uuid>",             // filter key untuk upsert idempoten
 *   "content":      "<teks plain-text artikel>",     // ← SATU-SATUNYA vectorize source
 *   "title":        "Judul Artikel",
 *   "category":     "kuliner",
 *   "tags":         ["kopi", "aceh"],
 *   "author_id":    "<uuid>",
 *   "media_url":    "https://…/catalog-images/<seller_id>/<file>.webp",
 *   "published_at": "2025-01-15T08:00:00.000Z",
 *   "_metadata":    { "source": "supabase", "synced_at": "<ISO timestamp>" }
 * }
 */
function astraDocument(article: Article): Record<string, unknown> {
  // Strip HTML tags; jadikan teks bersih sebagai satu-satunya vectorize source
  const content = article.content
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    content_id:   `media-art-${article.id}`,
    content,                                          // vectorize source
    title:        article.title,
    category:     article.category,
    tags:         Array.isArray(article.tags) ? article.tags : [],
    author_id:    article.author_id,
    media_url:    article.cover_url ?? null,          // storage bucket catalog-images
    published_at: article.published_at ?? null,
    _metadata: {
      source:    'supabase',
      synced_at: new Date().toISOString()
    }
  };
}

Deno.serve(async (request: Request) => {
  const cors = corsHeaders(request);
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }
  if (cors['Access-Control-Allow-Origin'] === '') {
    return jsonResponse(request, { error: 'Origin is not allowed.' }, 403);
  }
  if (request.method !== 'POST') {
    return jsonResponse(request, { error: 'Method not allowed.' }, 405);
  }

  try {
    const authorization = request.headers.get('Authorization');
    if (!authorization) return jsonResponse(request, { error: 'Authentication required.' }, 401);

    const supabaseUrl = requiredEnv('SUPABASE_URL');
    const anonKey = requiredEnv('SUPABASE_ANON_KEY');
    const serviceRoleKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY');
    const authenticatedClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const userResult = await authenticatedClient.auth.getUser();
    if (userResult.error || !userResult.data.user) {
      return jsonResponse(request, { error: 'Invalid or expired session.' }, 401);
    }

    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const roleResult = await serviceClient
      .from('profiles')
      .select('role')
      .eq('id', userResult.data.user.id)
      .single();
    if (roleResult.error || roleResult.data?.role !== 'master_admin') {
      return jsonResponse(request, { error: 'Master admin access required.' }, 403);
    }

    let payload: { action?: string };
    try {
      payload = await request.json();
    } catch {
      return jsonResponse(request, { error: 'Request body must be valid JSON.' }, 400);
    }
    if (payload.action !== 'check' && payload.action !== 'sync') {
      return jsonResponse(request, { error: 'action must be check or sync.' }, 400);
    }

    const token = requiredEnv('ASTRA_DB_APPLICATION_TOKEN');
    const apiUrl = astraApiUrl(
      requiredEnv('ASTRA_DB_API_ENDPOINT'),
      Deno.env.get('ASTRA_DB_KEYSPACE') || 'default_keyspace',
      Deno.env.get('ASTRA_DB_COLLECTION') || 'media_contents_collection'
    );
    await sendAstraCommand(apiUrl, token, {
      findOne: { filter: { content_id: '__bob_astra_health_check__' } }
    });

    if (payload.action === 'check') {
      const pendingResult = await serviceClient
        .from('astra_sync_queue')
        .select('article_id', { count: 'exact', head: true })
        .is('synced_at', null);
      if (pendingResult.error) throw new Error(`Could not inspect Astra sync queue: ${pendingResult.error.message}`);
      return jsonResponse(request, { connected: true, pending: pendingResult.count || 0, synced: 0, failed: [] });
    }

    const queueResult = await serviceClient
      .from('astra_sync_queue')
      .select('article_id, operation, attempts, updated_at')
      .is('synced_at', null)
      .order('updated_at', { ascending: true })
      .limit(25);
    if (queueResult.error) throw new Error(`Could not read Astra sync queue: ${queueResult.error.message}`);

    const synced: string[] = [];
    const failed: Array<{ article_id: string; error: string }> = [];
    const now = new Date().toISOString();

    for (const item of (queueResult.data || []) as QueueItem[]) {
      try {
        const articleResult = await serviceClient
          .from('content_articles')
          .select('id, title, content, category, tags, cover_url, author_id, status, archived_at, published_at')
          .eq('id', item.article_id)
          .maybeSingle();
        if (articleResult.error) throw new Error(articleResult.error.message);

        const article = articleResult.data as Article | null;
        const shouldUpsert = item.operation === 'upsert'
          && article
          && article.status === 'published'
          && article.archived_at === null;
        const contentId = `media-art-${item.article_id}`;
        if (shouldUpsert && article) {
          await sendAstraCommand(apiUrl, token, {
            updateOne: {
              filter: { content_id: contentId },
              update: { $set: astraDocument(article) },
              options: { upsert: true }
            }
          });
        } else {
          await sendAstraCommand(apiUrl, token, {
            deleteOne: { filter: { content_id: contentId } }
          });
        }

        const ack = await serviceClient
          .from('astra_sync_queue')
          .update({ synced_at: now, last_error: null })
          .eq('article_id', item.article_id)
          .eq('updated_at', item.updated_at)
          .is('synced_at', null);
        if (ack.error) throw new Error(`Astra updated but queue acknowledgement failed: ${ack.error.message}`);
        synced.push(item.article_id);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const updateResult = await serviceClient
          .from('astra_sync_queue')
          .update({ attempts: item.attempts + 1, last_error: message.slice(0, 1000) })
          .eq('article_id', item.article_id)
          .eq('updated_at', item.updated_at)
          .is('synced_at', null);
        if (updateResult.error) {
          console.error('Failed to record Astra sync error:', item.article_id, updateResult.error.message);
        }
        console.error('Astra sync failed:', item.article_id, message);
        failed.push({ article_id: item.article_id, error: message });
      }
    }

    const pendingResult = await serviceClient
      .from('astra_sync_queue')
      .select('article_id', { count: 'exact', head: true })
      .is('synced_at', null);
    if (pendingResult.error) throw new Error(`Could not count pending Astra sync items: ${pendingResult.error.message}`);

    return jsonResponse(request, {
      connected: true,
      synced: synced.length,
      pending: pendingResult.count || 0,
      failed
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Astra sync function error:', message);
    return jsonResponse(request, { error: message }, 500);
  }
});
