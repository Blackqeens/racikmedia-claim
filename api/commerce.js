/**
 * BOB · Racik Media Nusantara
 * Mock API Layer — Commerce B2C/B2B/Hybrid Module
 * ─────────────────────────────────────────────────────────────────────────────
 * Mensimulasikan seluruh logika transaksi hybrid menggunakan localStorage.
 *
 * Cara pakai:
 *   <script src="../../api/commerce.js"></script>
 *   CommerceAPI.checkout({ item_id, item_type, quantity }).then(...)
 *
 * Tiga alur transaksi:
 *   B2C     → checkout langsung, gerbang pembayaran ritel otomatis
 *   B2B     → validasi minimum_order → terbitkan invoice/tempo
 *   Hybrid  → qty < minimum_order → alur B2C; qty >= minimum_order → alur B2B
 *
 * Ketika backend nyata siap, ganti implementasi _callBackend() dari
 * localStorage menjadi fetch('/api/v1/...') — antarmuka tetap sama.
 * ─────────────────────────────────────────────────────────────────────────────
 */

(function (global) {
  'use strict';

  /* ═══════════════════════════════════════════════════════════
     STORAGE KEYS
  ═══════════════════════════════════════════════════════════ */
  var KEYS = {
    PRODUCTS:    'bob_retail_products',
    SERVICES:    'bob_services',
    ORDERS:      'bob_orders',
    INVOICES:    'bob_invoices',
    ASSIGNMENTS: 'bob_assignments',
    CORP:        'bob_corporate_clients',
  };

  /* ═══════════════════════════════════════════════════════════
     MOCK DATABASE — mencerminkan seed data di schema-b2b.sql
  ═══════════════════════════════════════════════════════════ */
  var SEED_PRODUCTS = [
    {
      id: 'prd-001', seller_id: 'sel-001',
      name: 'Kopi Gayo Premium 100g', slug: 'kopi-gayo-100g',
      price: 85000, stock: 500, unit: 'pcs',
      target_model: 'B2C',
      minimum_order: 1,
      b2b_price: null, b2b_discount_pct: null,
      category: 'kopi', is_active: true,
    },
    {
      id: 'prd-002', seller_id: 'sel-001',
      name: 'Kopi Gayo Bulk 25kg', slug: 'kopi-gayo-bulk-25kg',
      price: 1800000, stock: 200, unit: 'karung',
      target_model: 'B2B',
      minimum_order: 10,    // ← wajib dipenuhi sebelum checkout
      b2b_price: 1600000, b2b_discount_pct: 11.11,
      category: 'kopi', is_active: true,
    },
    {
      id: 'prd-003', seller_id: 'sel-001',
      name: 'Madu Hutan Kalimantan 500ml', slug: 'madu-hutan-500ml',
      price: 145000, stock: 300, unit: 'botol',
      target_model: 'Hybrid',
      minimum_order: 20,    // ← di bawah ini → B2C; >= 20 → B2B
      b2b_price: null, b2b_discount_pct: 15.00,
      category: 'madu', is_active: true,
    },
  ];

  var SEED_SERVICES = [
    {
      id: 'svc-001', seller_id: 'sel-002',
      name: 'Servis Mesin Jahit', slug: 'servis-mesin-jahit',
      base_price: 150000, unit: 'per-kunjungan',
      target_model: 'B2C',
      minimum_order: 1,
      max_mechanics: 1, requires_lead: false,
      category: 'servis', is_active: true,
    },
    {
      id: 'svc-002', seller_id: 'sel-002',
      name: 'Overhaul Lini Produksi Rotan', slug: 'overhaul-lini-produksi',
      base_price: 5000000, unit: 'per-proyek',
      target_model: 'B2B',
      minimum_order: 5,     // ← minimal 5 unit/kunjungan
      b2b_price: null,
      max_mechanics: 8, requires_lead: true,  // ← wajib lead_mechanic
      category: 'industri', is_active: true,
      estimated_duration_hours: 40,
    },
  ];

  var SEED_CORP_CLIENTS = [
    {
      id: 'corp-001', user_id: 'user-corp-001',
      company_name: 'PT Mitra Kopi Nusantara', npwp: '01.234.567.8-901.000',
      pic_name: 'Budi Hartono', pic_email: 'budi@mitrakopi.co.id',
      payment_terms: 30, credit_limit: 50000000, is_verified: true,
    },
  ];

  /* ═══════════════════════════════════════════════════════════
     INTERNAL STORAGE HELPERS
  ═══════════════════════════════════════════════════════════ */
  function _load(key, seed) {
    try {
      var raw = localStorage.getItem(key);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    if (seed) {
      _save(key, seed.map(function (r) { return Object.assign({}, r); }));
      return _load(key, null);
    }
    return [];
  }

  function _save(key, data) {
    try { localStorage.setItem(key, JSON.stringify(data)); }
    catch (e) { console.warn('[CommerceAPI] localStorage write failed:', e); }
  }

  function _uuid(prefix) {
    return (prefix || 'id') + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  }

  function _now() { return new Date().toISOString(); }

  function _orderNumber() {
    var d = new Date();
    var date = d.getFullYear().toString()
      + String(d.getMonth() + 1).padStart(2, '0')
      + String(d.getDate()).padStart(2, '0');
    return 'ORD-' + date + '-' + Math.random().toString(36).slice(2, 7).toUpperCase();
  }

  function _invoiceNumber() {
    var d = new Date();
    return 'INV-'
      + d.getFullYear().toString()
      + String(d.getMonth() + 1).padStart(2, '0')
      + '-'
      + Math.random().toString(36).slice(2, 7).toUpperCase();
  }

  /** Simulasi delay jaringan */
  function _async(fn) {
    return new Promise(function (resolve, reject) {
      setTimeout(function () {
        try { resolve(fn()); }
        catch (e) { reject(e); }
      }, 60 + Math.random() * 80);
    });
  }

  /* ═══════════════════════════════════════════════════════════
     LOGIKA RESOLUSI ALUR: resolveOrderFlow()
     Inti dari sistem hybrid — menentukan order_type, unit_price,
     dan apakah invoice perlu diterbitkan.
  ═══════════════════════════════════════════════════════════ */

  /**
   * Tentukan alur transaksi berdasarkan target_model dan kuantitas.
   *
   * @param {object} item    - Record produk atau jasa
   * @param {number} qty     - Kuantitas yang dipesan
   * @returns {object}       - { order_type, unit_price, requires_invoice, effective_model }
   *
   * Logika:
   *   B2C     → selalu retail, harga normal
   *   B2B     → validasi minimum_order, harga b2b, alur invoice
   *   Hybrid  → qty < min → retail B2C; qty >= min → corporate B2B
   */
  function resolveOrderFlow(item, qty) {
    var model   = item.target_model;
    var minQty  = item.minimum_order || 1;
    var basePrice = item.price || item.base_price;

    /* ── B2C murni ── */
    if (model === 'B2C') {
      return {
        order_type:       'retail',
        unit_price:       basePrice,
        requires_invoice: false,
        effective_model:  'B2C',
        min_qty_check:    null,  // tidak ada pengecekan minimum
      };
    }

    /* ── B2B murni ── */
    if (model === 'B2B') {
      /* VALIDASI WAJIB: cek minimum_order sebelum mengizinkan checkout */
      if (qty < minQty) {
        return {
          order_type:       null,
          unit_price:       null,
          requires_invoice: true,
          effective_model:  'B2B',
          min_qty_check:    {
            passed: false,
            required: minQty,
            provided: qty,
            message: 'Minimum pembelian untuk produk/jasa ini adalah '
              + minQty + ' ' + (item.unit || 'unit')
              + '. Kuantitas Anda (' + qty + ') tidak memenuhi syarat.',
          },
        };
      }
      /* Harga B2B: pakai b2b_price jika ada; jika tidak, terapkan diskon persentase */
      var b2bPrice = item.b2b_price
        ? item.b2b_price
        : (item.b2b_discount_pct
            ? basePrice * (1 - item.b2b_discount_pct / 100)
            : basePrice);

      return {
        order_type:       'corporate',
        unit_price:       Math.round(b2bPrice),
        requires_invoice: true,   // alihkan ke sistem invoice/tempo resmi
        effective_model:  'B2B',
        min_qty_check:    { passed: true, required: minQty, provided: qty },
      };
    }

    /* ── Hybrid ── */
    if (model === 'Hybrid') {
      if (qty < minQty) {
        /* Di bawah ambang batas → alur B2C ritel */
        return {
          order_type:       'retail',
          unit_price:       basePrice,
          requires_invoice: false,
          effective_model:  'B2C',
          min_qty_check:    { passed: true, required: minQty, provided: qty },
          hybrid_note:      'Qty ' + qty + ' < min_order ' + minQty
            + ' → dialihkan ke alur ritel B2C (pembayaran gateway otomatis).',
        };
      } else {
        /* Memenuhi atau melampaui ambang → alur B2B korporat */
        var hybridPrice = item.b2b_price
          ? item.b2b_price
          : (item.b2b_discount_pct
              ? basePrice * (1 - item.b2b_discount_pct / 100)
              : basePrice);

        return {
          order_type:       'corporate',
          unit_price:       Math.round(hybridPrice),
          requires_invoice: true,
          effective_model:  'B2B',
          min_qty_check:    { passed: true, required: minQty, provided: qty },
          hybrid_note:      'Qty ' + qty + ' >= min_order ' + minQty
            + ' → dialihkan ke alur korporat B2B (invoice/tempo resmi).',
        };
      }
    }

    throw { status: 400, error: 'target_model tidak dikenal: ' + model };
  }

  /* ═══════════════════════════════════════════════════════════
     PUBLIC API
  ═══════════════════════════════════════════════════════════ */
  var CommerceAPI = {

    /* ──────────────────────────────────────────────────────────
       PRODUCTS
    ─────────────────────────────────────────────────────────── */

    /** Ambil semua produk aktif */
    getProducts: function (opts) {
      opts = opts || {};
      return _async(function () {
        var list = _load(KEYS.PRODUCTS, SEED_PRODUCTS).filter(function (p) { return p.is_active; });
        if (opts.target_model) list = list.filter(function (p) { return p.target_model === opts.target_model; });
        if (opts.category)     list = list.filter(function (p) { return p.category === opts.category; });
        return { data: list, total: list.length };
      });
    },

    /** Ambil satu produk by ID */
    getProduct: function (id) {
      return _async(function () {
        var products = _load(KEYS.PRODUCTS, SEED_PRODUCTS);
        var p = products.find(function (x) { return x.id === id; });
        if (!p) throw { status: 404, error: 'Produk tidak ditemukan.', code: 'NOT_FOUND' };
        return Object.assign({}, p);
      });
    },

    /* ──────────────────────────────────────────────────────────
       SERVICES
    ─────────────────────────────────────────────────────────── */

    getServices: function (opts) {
      opts = opts || {};
      return _async(function () {
        var list = _load(KEYS.SERVICES, SEED_SERVICES).filter(function (s) { return s.is_active; });
        if (opts.target_model) list = list.filter(function (s) { return s.target_model === opts.target_model; });
        return { data: list, total: list.length };
      });
    },

    getService: function (id) {
      return _async(function () {
        var services = _load(KEYS.SERVICES, SEED_SERVICES);
        var s = services.find(function (x) { return x.id === id; });
        if (!s) throw { status: 404, error: 'Jasa tidak ditemukan.', code: 'NOT_FOUND' };
        return Object.assign({}, s);
      });
    },

    /* ──────────────────────────────────────────────────────────
       CHECKOUT — Inti Logika B2C / B2B / Hybrid
       Backend: POST /api/v1/orders/checkout

       Alur:
         1. Ambil item (produk/jasa) dari DB
         2. Panggil resolveOrderFlow() → tentukan order_type & harga
         3. Jika B2B: validasi minimum_order → tolak jika tidak memenuhi
         4. Buat record order
         5. Jika B2B/Hybrid≥min: terbitkan invoice resmi
         6. Jika B2C/Hybrid<min: redirect ke gateway pembayaran ritel
    ─────────────────────────────────────────────────────────── */
    checkout: function (payload) {
      /*
       * payload: {
       *   item_id       : string  — ID produk atau jasa
       *   item_type     : 'product' | 'service'
       *   quantity      : number
       *   buyer_id      : string  — user_id pembeli
       *   seller_id     : string
       *   corp_client_id: string  — wajib untuk B2B (diisi jika ada sesi korporat)
       *   buyer_notes   : string  — opsional
       * }
       */
      return _async(function () {
        var qty        = Number(payload.quantity) || 1;
        var itemType   = payload.item_type;

        /* ── 1. Ambil item ── */
        var itemList   = itemType === 'product'
          ? _load(KEYS.PRODUCTS, SEED_PRODUCTS)
          : _load(KEYS.SERVICES, SEED_SERVICES);

        var item = itemList.find(function (x) { return x.id === payload.item_id; });
        if (!item) throw { status: 404, error: 'Item tidak ditemukan.', code: 'ITEM_NOT_FOUND' };
        if (!item.is_active) throw { status: 422, error: 'Item tidak tersedia saat ini.', code: 'ITEM_INACTIVE' };

        /* ── 2. Resolusi alur B2C / B2B / Hybrid ── */
        var flow = resolveOrderFlow(item, qty);

        /* ── 3. Validasi minimum_order untuk B2B ── */
        if (flow.min_qty_check && !flow.min_qty_check.passed) {
          /* Tolak checkout — minimum_order tidak terpenuhi */
          throw {
            status: 422,
            error:  flow.min_qty_check.message,
            code:   'MIN_ORDER_NOT_MET',
            details: {
              target_model:  item.target_model,
              minimum_order: flow.min_qty_check.required,
              provided_qty:  flow.min_qty_check.provided,
            },
          };
        }

        /* ── 3b. Validasi korporat untuk alur B2B ── */
        if (flow.order_type === 'corporate' && !payload.corp_client_id) {
          throw {
            status: 422,
            error:  'Transaksi B2B memerlukan identitas perusahaan. Silakan lengkapi data korporat Anda.',
            code:   'CORP_CLIENT_REQUIRED',
          };
        }

        /* ── 4. Cek stok produk ── */
        if (itemType === 'product' && item.stock < qty) {
          throw {
            status: 422,
            error:  'Stok tidak mencukupi. Tersedia: ' + item.stock + ' ' + item.unit + '.',
            code:   'INSUFFICIENT_STOCK',
          };
        }

        /* ── 5. Hitung harga ── */
        var unitPrice  = flow.unit_price;
        var subtotal   = unitPrice * qty;
        var taxPct     = flow.order_type === 'corporate' ? 11 : 0; // PPN 11% untuk B2B
        var taxAmount  = Math.round(subtotal * taxPct / 100);
        var total      = subtotal + taxAmount;

        /* ── 6. Buat record order ── */
        var now      = _now();
        var orderId  = _uuid('ord');
        var order    = {
          id:                  orderId,
          order_number:        _orderNumber(),
          buyer_id:            payload.buyer_id    || 'user-current',
          seller_id:           payload.seller_id   || item.seller_id,
          corporate_client_id: flow.order_type === 'corporate' ? payload.corp_client_id : null,
          order_type:          flow.order_type,
          status:              'confirmed',
          item_type:           itemType,
          item_id:             item.id,
          item_name:           item.name,
          quantity:            qty,
          unit_price:          unitPrice,
          subtotal:            subtotal,
          tax_amount:          taxAmount,
          discount_amount:     0,
          total_amount:        total,
          payment_method:      null,   // diisi setelah payment step
          payment_gateway_id:  null,
          payment_due_date:    null,
          paid_at:             null,
          buyer_notes:         payload.buyer_notes || null,
          effective_model:     flow.effective_model,
          hybrid_note:         flow.hybrid_note    || null,
          created_at:          now,
          updated_at:          now,
        };

        /* ── 7. Simpan order ── */
        var orders = _load(KEYS.ORDERS, []);
        orders.push(order);
        _save(KEYS.ORDERS, orders);

        /* ── 8. Kurangi stok (untuk produk fisik) ── */
        if (itemType === 'product') {
          var products = _load(KEYS.PRODUCTS, SEED_PRODUCTS);
          var idx = products.findIndex(function (p) { return p.id === item.id; });
          if (idx !== -1) {
            products[idx].stock -= qty;
            _save(KEYS.PRODUCTS, products);
          }
        }

        /* ── 9. Alur Pembayaran berdasarkan order_type ── */
        var paymentStep;

        if (flow.order_type === 'retail') {
          /* ── B2C: Gerbang Ritel Otomatis ──
             Dalam implementasi nyata: panggil Midtrans/Xendit API untuk
             membuat payment_token, lalu redirect ke halaman pembayaran. */
          paymentStep = {
            method:        'gateway_redirect',
            gateway:       'midtrans',           // atau 'xendit', 'doku', dll.
            payment_token: 'mock-token-' + orderId,
            redirect_url:  '/payment/checkout?order=' + order.order_number,
            instruction:   'Anda akan diarahkan ke halaman pembayaran ritel. '
              + 'Selesaikan pembayaran dalam 24 jam.',
          };
          console.log('[CommerceAPI] 💳 B2C — Gateway redirect:', paymentStep.redirect_url);

        } else {
          /* ── B2B: Terbitkan Invoice / Tempo Resmi ──
             Alihkan dari gateway ritel ke sistem penerbitan invoice. */
          var corpClients = _load(KEYS.CORP, SEED_CORP_CLIENTS);
          var corp = corpClients.find(function (c) { return c.id === payload.corp_client_id; });
          var paymentTerms = corp ? corp.payment_terms : 30;
          var dueDate = new Date();
          dueDate.setDate(dueDate.getDate() + paymentTerms);
          var dueDateStr = dueDate.toISOString().split('T')[0];

          /* Buat record invoice */
          var invoiceId  = _uuid('inv');
          var invoice = {
            id:             invoiceId,
            order_id:       orderId,
            invoice_number: _invoiceNumber(),
            issued_to:      payload.corp_client_id,
            issued_by:      item.seller_id,
            issued_at:      now,
            due_date:       dueDateStr,
            paid_at:        null,
            subtotal:       subtotal,
            tax_pct:        taxPct,
            tax_amount:     taxAmount,
            total_amount:   total,
            status:         'unpaid',
            notes:          'Invoice diterbitkan otomatis untuk order ' + order.order_number,
            pdf_url:        null,
            created_at:     now,
            updated_at:     now,
          };

          var invoices = _load(KEYS.INVOICES, []);
          invoices.push(invoice);
          _save(KEYS.INVOICES, invoices);

          /* Update order: isi payment_due_date & status invoice_issued */
          orders = _load(KEYS.ORDERS, []);
          var oi = orders.findIndex(function (o) { return o.id === orderId; });
          if (oi !== -1) {
            orders[oi].status            = 'invoice_issued';
            orders[oi].payment_due_date  = dueDateStr;
            orders[oi].payment_gateway_id = invoice.invoice_number;
            orders[oi].updated_at        = _now();
          }
          _save(KEYS.ORDERS, orders);
          order.status           = 'invoice_issued';
          order.payment_due_date = dueDateStr;

          paymentStep = {
            method:         'invoice',
            invoice_number: invoice.invoice_number,
            due_date:       dueDateStr,
            payment_terms:  'NET ' + paymentTerms,
            bank_account:   { bank: 'BCA', no: '1234567890', name: 'BOB Escrow' },
            total_amount:   total,
            instruction:    'Invoice telah diterbitkan. Lakukan transfer ke rekening di atas '
              + 'paling lambat ' + dueDateStr + ' (NET ' + paymentTerms + ' hari).',
          };

          console.log('[CommerceAPI] 📄 B2B — Invoice diterbitkan:', invoice.invoice_number,
            '| Jatuh tempo:', dueDateStr);
        }

        return {
          order: {
            id:             order.id,
            order_number:   order.order_number,
            status:         order.status,
            order_type:     order.order_type,
            effective_model: order.effective_model,
            quantity:       qty,
            unit_price:     unitPrice,
            subtotal:       subtotal,
            tax_amount:     taxAmount,
            total_amount:   total,
            hybrid_note:    order.hybrid_note,
          },
          payment: paymentStep,
        };
      });
    },

    /* ──────────────────────────────────────────────────────────
       ASSIGN MECHANIC — Penugasan Mekanik Multilevel B2B
       Backend: POST /api/v1/orders/:id/assignments

       Aturan:
         1. Order harus berjenis service & order_type = 'corporate'
         2. Tidak bisa menambah staf sebelum ada lead_mechanic
         3. Satu mekanik hanya satu peran per order
         4. Jumlah mekanik tidak boleh melebihi services.max_mechanics
    ─────────────────────────────────────────────────────────── */
    assignMechanic: function (payload) {
      /*
       * payload: {
       *   order_id       : string  — ID order jasa B2B
       *   mechanic_id    : string  — user_id mekanik yang ditugaskan
       *   role           : 'lead_mechanic' | 'staff'
       *   assigned_by    : string  — user_id yang menugaskan
       *   task_description: string — opsional
       * }
       */
      return _async(function () {
        var orders = _load(KEYS.ORDERS, []);
        var order  = orders.find(function (o) { return o.id === payload.order_id; });

        /* ── Validasi order ── */
        if (!order) {
          throw { status: 404, error: 'Order tidak ditemukan.', code: 'ORDER_NOT_FOUND' };
        }
        if (order.item_type !== 'service') {
          throw { status: 422, error: 'Penugasan mekanik hanya berlaku untuk order jasa.', code: 'NOT_SERVICE_ORDER' };
        }
        if (order.order_type !== 'corporate') {
          throw {
            status: 422,
            error:  'Penugasan multilevel hanya aktif untuk transaksi korporat B2B. '
              + 'Order ini adalah transaksi ritel B2C (satu mekanik standar).',
            code:   'B2C_SINGLE_MECHANIC',
          };
        }

        /* ── Ambil data jasa untuk cek max_mechanics ── */
        var services = _load(KEYS.SERVICES, SEED_SERVICES);
        var svc = services.find(function (s) { return s.id === order.item_id; });
        var maxMechanics = svc ? svc.max_mechanics : 8;

        /* ── Ambil penugasan yang sudah ada di order ini ── */
        var allAssignments = _load(KEYS.ASSIGNMENTS, []);
        var orderAssignments = allAssignments.filter(function (a) {
          return a.order_id === payload.order_id && a.status !== 'reassigned';
        });

        /* ── Cek: mekanik sudah ditugaskan? ── */
        var alreadyAssigned = orderAssignments.find(function (a) {
          return a.mechanic_id === payload.mechanic_id;
        });
        if (alreadyAssigned) {
          throw {
            status: 409,
            error:  'Mekanik ini sudah ditugaskan dalam order yang sama dengan peran "'
              + alreadyAssigned.role + '".',
            code:   'MECHANIC_ALREADY_ASSIGNED',
          };
        }

        /* ── Cek: kapasitas tim tidak melebihi max_mechanics ── */
        if (orderAssignments.length >= maxMechanics) {
          throw {
            status: 422,
            error:  'Kapasitas tim penuh. Maksimal ' + maxMechanics
              + ' mekanik untuk jasa ini. Sudah ditugaskan: ' + orderAssignments.length + '.',
            code:   'TEAM_CAPACITY_FULL',
          };
        }

        /* ── Validasi: staf tidak bisa ditambah sebelum ada lead_mechanic ── */
        if (payload.role === 'staff') {
          var hasLead = orderAssignments.some(function (a) {
            return a.role === 'lead_mechanic' && a.status !== 'reassigned';
          });
          if (!hasLead) {
            throw {
              status: 422,
              error:  'Tidak dapat menambahkan staf: order ini belum memiliki Lead Mechanic. '
                + 'Tunjuk Lead Mechanic terlebih dahulu sebelum menambah anggota staf.',
              code:   'LEAD_REQUIRED_FIRST',
            };
          }
        }

        /* ── Validasi: setiap order hanya boleh memiliki satu lead_mechanic aktif ── */
        if (payload.role === 'lead_mechanic') {
          var existingLead = orderAssignments.find(function (a) {
            return a.role === 'lead_mechanic' && a.status !== 'reassigned';
          });
          if (existingLead) {
            throw {
              status: 409,
              error:  'Order ini sudah memiliki Lead Mechanic ('
                + existingLead.mechanic_id + '). '
                + 'Gunakan reassignLead() untuk mengganti Lead Mechanic.',
              code:   'LEAD_ALREADY_EXISTS',
            };
          }
        }

        /* ── Buat record penugasan ── */
        var now = _now();
        var assignment = {
          id:               _uuid('asgn'),
          order_id:         payload.order_id,
          mechanic_id:      payload.mechanic_id,
          role:             payload.role,
          assigned_by:      payload.assigned_by,
          assigned_at:      now,
          status:           'assigned',
          accepted_at:      null,
          started_at:       null,
          completed_at:     null,
          task_description: payload.task_description || null,
          notes:            null,
          created_at:       now,
          updated_at:       now,
        };

        allAssignments.push(assignment);
        _save(KEYS.ASSIGNMENTS, allAssignments);

        console.log('[CommerceAPI] 👷 Mekanik ditugaskan:',
          payload.mechanic_id, '— peran:', payload.role,
          '— order:', payload.order_id);

        /* Kembalikan tim lengkap setelah penugasan baru */
        var updatedTeam = allAssignments.filter(function (a) {
          return a.order_id === payload.order_id && a.status !== 'reassigned';
        });

        return {
          assignment: assignment,
          team_summary: {
            order_id:        payload.order_id,
            total_assigned:  updatedTeam.length,
            max_mechanics:   maxMechanics,
            has_lead:        updatedTeam.some(function (a) { return a.role === 'lead_mechanic'; }),
            staff_count:     updatedTeam.filter(function (a) { return a.role === 'staff'; }).length,
          },
        };
      });
    },

    /* ──────────────────────────────────────────────────────────
       GET ORDER TEAM — Tampilkan seluruh tim mekanik B2B
       Backend: GET /api/v1/orders/:id/team
    ─────────────────────────────────────────────────────────── */
    getOrderTeam: function (orderId) {
      return _async(function () {
        var allAssignments = _load(KEYS.ASSIGNMENTS, []);
        var team = allAssignments.filter(function (a) {
          return a.order_id === orderId;
        });

        /* Pisahkan lead dan staf */
        var lead  = team.filter(function (a) { return a.role === 'lead_mechanic'; });
        var staff = team.filter(function (a) { return a.role === 'staff'; });

        return {
          order_id:    orderId,
          lead:        lead,
          staff:       staff,
          total:       team.length,
          all_accepted: team.every(function (a) {
            return a.status === 'accepted' || a.status === 'in_progress' || a.status === 'completed';
          }),
        };
      });
    },

    /* ──────────────────────────────────────────────────────────
       REASSIGN LEAD — Ganti Lead Mechanic
       Backend: PUT /api/v1/orders/:id/assignments/lead
    ─────────────────────────────────────────────────────────── */
    reassignLead: function (orderId, newMechanicId, assignedBy, reason) {
      return _async(function () {
        var allAssignments = _load(KEYS.ASSIGNMENTS, []);
        var now = _now();

        /* Tandai lead lama sebagai 'reassigned' */
        var updated = false;
        allAssignments = allAssignments.map(function (a) {
          if (a.order_id === orderId && a.role === 'lead_mechanic' && a.status !== 'reassigned') {
            updated = true;
            return Object.assign({}, a, { status: 'reassigned', notes: reason || 'Diganti lead baru', updated_at: now });
          }
          return a;
        });

        if (!updated) {
          throw { status: 404, error: 'Tidak ada Lead Mechanic aktif pada order ini.', code: 'NO_ACTIVE_LEAD' };
        }

        /* Buat penugasan lead baru */
        var newLead = {
          id:               _uuid('asgn'),
          order_id:         orderId,
          mechanic_id:      newMechanicId,
          role:             'lead_mechanic',
          assigned_by:      assignedBy,
          assigned_at:      now,
          status:           'assigned',
          accepted_at:      null, started_at: null, completed_at: null,
          task_description: null, notes: null,
          created_at:       now, updated_at: now,
        };
        allAssignments.push(newLead);
        _save(KEYS.ASSIGNMENTS, allAssignments);

        console.log('[CommerceAPI] 🔄 Lead Mechanic diganti:', newMechanicId, 'pada order:', orderId);
        return { assignment: newLead, message: 'Lead Mechanic berhasil diganti.' };
      });
    },

    /* ──────────────────────────────────────────────────────────
       GET INVOICES — Daftar Invoice per Klien / Seller
    ─────────────────────────────────────────────────────────── */
    getInvoices: function (opts) {
      opts = opts || {};
      return _async(function () {
        var invoices = _load(KEYS.INVOICES, []);
        if (opts.corp_client_id) invoices = invoices.filter(function (i) { return i.issued_to === opts.corp_client_id; });
        if (opts.seller_id)      invoices = invoices.filter(function (i) { return i.issued_by === opts.seller_id; });
        if (opts.status)         invoices = invoices.filter(function (i) { return i.status === opts.status; });
        invoices.sort(function (a, b) { return new Date(b.issued_at) - new Date(a.issued_at); });
        return { data: invoices, total: invoices.length };
      });
    },

    /* ──────────────────────────────────────────────────────────
       MARK INVOICE PAID — Konfirmasi Pelunasan Invoice B2B
       Backend: POST /api/v1/invoices/:id/pay
    ─────────────────────────────────────────────────────────── */
    markInvoicePaid: function (invoiceId) {
      return _async(function () {
        var invoices = _load(KEYS.INVOICES, []);
        var idx = invoices.findIndex(function (i) { return i.id === invoiceId; });
        if (idx === -1) throw { status: 404, error: 'Invoice tidak ditemukan.', code: 'NOT_FOUND' };
        if (invoices[idx].status === 'paid') throw { status: 409, error: 'Invoice sudah lunas.', code: 'ALREADY_PAID' };

        var now = _now();
        invoices[idx].status     = 'paid';
        invoices[idx].paid_at    = now;
        invoices[idx].updated_at = now;
        _save(KEYS.INVOICES, invoices);

        /* Sinkronisasi status order */
        var orders = _load(KEYS.ORDERS, []);
        var oi = orders.findIndex(function (o) { return o.id === invoices[idx].order_id; });
        if (oi !== -1) {
          orders[oi].status  = 'invoice_paid';
          orders[oi].paid_at = now;
          orders[oi].updated_at = now;
          _save(KEYS.ORDERS, orders);
        }

        console.log('[CommerceAPI] ✅ Invoice lunas:', invoices[idx].invoice_number);
        return { invoice: invoices[idx], message: 'Invoice berhasil dilunasi.' };
      });
    },

    /* ──────────────────────────────────────────────────────────
       DEV HELPER — reset semua data ke seed
    ─────────────────────────────────────────────────────────── */
    _reset: function () {
      Object.values(KEYS).forEach(function (k) { localStorage.removeItem(k); });
      console.log('[CommerceAPI] Database reset ke seed data.');
    },

    /* Expose resolveOrderFlow untuk testing / debugging di konsol */
    _resolveOrderFlow: resolveOrderFlow,
  };

  global.CommerceAPI = CommerceAPI;

}(window));
