import { createClient } from 'npm:@supabase/supabase-js@2';
import { PDFDocument, StandardFonts, rgb } from 'npm:pdf-lib@1.17.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function pdfText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\xFF]/g, '?');
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const authorization = request.headers.get('Authorization');
  if (!authorization) return jsonResponse({ error: 'Unauthorized' }, 401);

  let payload: { invoice_id?: string };
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }
  if (!payload.invoice_id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload.invoice_id)) {
    return jsonResponse({ error: 'Valid invoice_id is required' }, 400);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error('Missing Supabase environment configuration.');
    return jsonResponse({ error: 'Invoice service is unavailable' }, 503);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const authResult = await userClient.auth.getUser();
  if (authResult.error || !authResult.data.user) return jsonResponse({ error: 'Unauthorized' }, 401);

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const userId = authResult.data.user.id;
  const [profileResult, invoiceResult] = await Promise.all([
    adminClient.from('profiles').select('role, display_name').eq('id', userId).single(),
    adminClient.from('b2b_invoices').select('*, corporate_clients(company_name, npwp, address, user_id), seller:profiles!b2b_invoices_seller_id_fkey(display_name)').eq('id', payload.invoice_id).single(),
  ]);
  if (profileResult.error || invoiceResult.error) {
    console.error('Invoice lookup failed:', profileResult.error?.message, invoiceResult.error?.message);
    return jsonResponse({ error: 'Invoice not found' }, 404);
  }

  const invoice = invoiceResult.data;
  const client = invoice.corporate_clients;
  const isAdmin = ['admin', 'master_admin'].includes(profileResult.data.role);
  if (!isAdmin && invoice.seller_id !== userId && client.user_id !== userId) {
    return jsonResponse({ error: 'Forbidden' }, 403);
  }

  try {
    const document = await PDFDocument.create();
    const regular = await document.embedFont(StandardFonts.Helvetica);
    const bold = await document.embedFont(StandardFonts.HelveticaBold);
    let page = document.addPage([595.28, 841.89]);
    const left = 56;
    let y = 780;
    const draw = (text: string, size = 11, strong = false, color = rgb(0.12, 0.18, 0.16)) => {
      const font = strong ? bold : regular;
      const paragraphs = pdfText(text).split(/\r?\n/);
      for (const paragraph of paragraphs) {
        const lines: string[] = [];
        let line = '';
        for (const word of paragraph.split(/\s+/).filter(Boolean)) {
          let remaining = word;
          while (remaining) {
            const candidate = line ? line + ' ' + remaining : remaining;
            if (font.widthOfTextAtSize(candidate, size) <= 480) {
              line = candidate;
              remaining = '';
            } else if (line) {
              lines.push(line);
              line = '';
            } else {
              let length = remaining.length;
              while (length > 1 && font.widthOfTextAtSize(remaining.slice(0, length), size) > 480) length--;
              lines.push(remaining.slice(0, length));
              remaining = remaining.slice(length);
            }
          }
        }
        if (line || !lines.length) lines.push(line);
        for (const wrappedLine of lines) {
          if (y < 64) {
            page = document.addPage([595.28, 841.89]);
            y = 780;
          }
          page.drawText(wrappedLine, { x: left, y, size, font, color });
          y -= size + 4;
        }
        y -= 9;
      }
    };
    const money = (amount: number) => 'Rp ' + new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(amount);

    draw('RACIK MEDIA NUSANTARA', 18, true, rgb(0.02, 0.38, 0.28));
    draw('INVOICE', 24, true);
    draw('Nomor: ' + invoice.invoice_number);
    draw('Tanggal terbit: ' + new Date(invoice.created_at).toLocaleDateString('id-ID'));
    draw('Jatuh tempo: ' + invoice.due_date);
    y -= 14;
    draw('DITAGIHKAN KEPADA', 10, true, rgb(0.02, 0.38, 0.28));
    draw(client.company_name, 14, true);
    draw('NPWP: ' + client.npwp);
    draw('Alamat: ' + client.address);
    y -= 14;
    draw('PENYEDIA: ' + (invoice.seller?.display_name || 'Seller Racik Media'), 11, true);
    y -= 20;
    page.drawLine({ start: { x: left, y }, end: { x: 539, y }, thickness: 1, color: rgb(0.8, 0.84, 0.82) });
    y -= 28;
    draw('Deskripsi: ' + invoice.description);
    draw('Kuantitas: ' + invoice.quantity + ' × ' + money(Number(invoice.unit_price)));
    draw('Subtotal: ' + money(Number(invoice.subtotal)), 11, true);
    draw('PPN (' + invoice.tax_pct + '%): ' + money(Number(invoice.tax_amount)));
    y -= 8;
    draw('TOTAL TAGIHAN: ' + money(Number(invoice.total_amount)), 16, true, rgb(0.02, 0.38, 0.28));
    y -= 18;
    draw('Status: ' + invoice.status.toUpperCase());
    draw('Pembayaran dilakukan sesuai ketentuan yang telah disepakati.');
    y -= 22;
    page.drawLine({ start: { x: left, y }, end: { x: 539, y }, thickness: 1, color: rgb(0.8, 0.84, 0.82) });
    y -= 24;
    draw('Dokumen elektronik ini diterbitkan oleh Racik Media Nusantara.', 9);
    draw('Simpan invoice ini sebagai referensi pembayaran.', 9);

    const pdfBytes = await document.save();
    const filePath = invoice.client_id + '/' + invoice.id + '.pdf';
    const uploadResult = await adminClient.storage.from('b2b-invoices').upload(filePath, pdfBytes, {
      contentType: 'application/pdf',
      upsert: true,
    });
    if (uploadResult.error) throw uploadResult.error;

    const updateResult = await adminClient.from('b2b_invoices')
      .update({ pdf_path: filePath })
      .eq('id', invoice.id);
    if (updateResult.error) throw updateResult.error;

    const signedResult = await adminClient.storage.from('b2b-invoices').createSignedUrl(filePath, 300);
    if (signedResult.error || !signedResult.data.signedUrl) throw signedResult.error || new Error('Could not create signed invoice URL');
    return jsonResponse({ signed_url: signedResult.data.signedUrl, expires_in: 300 });
  } catch (error) {
    console.error('Invoice PDF generation failed:', error);
    return jsonResponse({ error: 'Invoice PDF could not be generated' }, 500);
  }
});
