/**
 * BOB · Racik Media Nusantara
 * Shared Products & Featured Store Module
 * Menghubungkan Etalase Marketplace dan Produk Pilihan di Beranda
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'bob_catalog_and_featured_products';

  var DEFAULT_PRODUCTS = [
    {
      id: 'prd-01',
      name: 'Kopi Gayo Premium 100g',
      category: 'produk',
      subcat: 'kopi',
      model: 'B2C',
      price: 22000,
      priceStr: 'Rp 22.000',
      unit: 'kemasan 100g',
      origin: 'Takengon, Aceh Tengah',
      rating: 4.9,
      sold: '520+ terjual',
      img: 'https://images.unsplash.com/photo-1610889556528-9a770e32642f?w=600&q=80',
      badge: 'Produk Unggulan',
      desc: 'Biji kopi arabika dipetik merah dari dataran tinggi Gayo dengan cita rasa asam lembut dan aroma karamel yang pekat.',
      detailUrl: 'pages/products/product-detail.html?id=prd-kopi-gayo',
      is_featured: true,
      featured_order: 1
    },
    {
      id: 'prd-02',
      name: 'Madu Hutan Kalimantan 250ml',
      category: 'produk',
      subcat: 'herbal',
      model: 'B2C',
      price: 65000,
      priceStr: 'Rp 65.000',
      unit: 'botol 250ml',
      origin: 'Kapuas Hulu, Kalimantan Barat',
      rating: 4.9,
      sold: '310+ terjual',
      img: 'https://images.unsplash.com/photo-1571115177098-24ec42ed204d?w=600&q=80',
      badge: 'Organik Alami',
      desc: 'Madu murni hasil panen lebah liar Apis dorsata pada pohon sialang hutan tropis tanpa pemanasan buatan.',
      detailUrl: 'pages/products/product-detail.html?id=prd-madu-hutan',
      is_featured: true,
      featured_order: 2
    },
    {
      id: 'prd-03',
      name: 'Tas Anyam Rotan Natural',
      category: 'produk',
      subcat: 'kerajinan',
      model: 'B2C',
      price: 135000,
      priceStr: 'Rp 135.000',
      unit: '1 pcs',
      origin: 'Tegalwangi, Cirebon',
      rating: 4.8,
      sold: '190+ terjual',
      img: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&q=80',
      badge: 'Artisan Handcrafted',
      desc: 'Anyaman rotan alami dengan lapisan vernis ramah lingkungan dan furing kain blacu katun premium buatan pengrajin lokal.',
      detailUrl: 'pages/products/product-detail.html?id=prd-tas-rotan',
      is_featured: true,
      featured_order: 3
    },
    {
      id: 'prd-04',
      name: 'Beras Organik Merah 1kg',
      category: 'produk',
      subcat: 'pangan',
      model: 'B2C',
      price: 32000,
      priceStr: 'Rp 32.000',
      unit: 'pack 1kg',
      origin: 'Cianjur, Jawa Barat',
      rating: 4.9,
      sold: '530+ terjual',
      img: 'https://images.unsplash.com/photo-1574943320219-553eb213f72d?w=600&q=80',
      badge: 'Sertifikasi Organik',
      desc: 'Beras merah kaya serat ditanam dengan pupuk kompos alami dan mikroba lokal tanpa bahan kimia sintetis.',
      detailUrl: 'pages/products/product-detail.html?id=prd-beras-organik',
      is_featured: true,
      featured_order: 4
    },
    {
      id: 'prd-05',
      name: 'Minyak Kelapa Murni (VCO) 500ml',
      category: 'produk',
      subcat: 'organik',
      model: 'B2C',
      price: 45000,
      priceStr: 'Rp 45.000',
      unit: 'botol 500ml',
      origin: 'Kulon Progo, Yogyakarta',
      rating: 4.8,
      sold: '270+ terjual',
      img: 'https://images.unsplash.com/photo-1615485290382-441e4d049cb5?w=600&q=80',
      badge: 'Cold Pressed',
      desc: 'Virgin Coconut Oil diproses melalui metode fermentasi dingin higienis untuk menjaga kemurnian asam laurat.',
      detailUrl: '/etalase',
      is_featured: true,
      featured_order: 5
    },
    {
      id: 'prd-06',
      name: 'Kain Tenun Ikat Tradisional NTT',
      category: 'produk',
      subcat: 'fashion',
      model: 'B2C',
      price: 285000,
      priceStr: 'Rp 285.000',
      unit: 'lembar 200x60cm',
      origin: 'Maumere, Flores NTT',
      rating: 5.0,
      sold: '85+ terjual',
      img: 'https://images.unsplash.com/photo-1596461404969-9ae70f2830c1?w=600&q=80',
      badge: 'Pewarna Alam',
      desc: 'Ditenun tangan oleh penenun lansia Flores menggunakan serat kapas lokal dan pewarna akar alami warisan leluhur.',
      detailUrl: 'pages/products/product-detail.html?id=prd-baju-tenun',
      is_featured: true,
      featured_order: 6
    },
    {
      id: 'prd-07',
      name: 'Garam Laut Organik Kusamba 250g',
      category: 'produk',
      subcat: 'pangan',
      model: 'B2C',
      price: 28000,
      priceStr: 'Rp 28.000',
      unit: 'kemasan 250g',
      origin: 'Klungkung, Bali',
      rating: 4.9,
      sold: '390+ terjual',
      img: 'https://images.unsplash.com/photo-1518843875459-f738682238a6?w=600&q=80',
      badge: 'Garam Artisan',
      desc: 'Diproduksi secara tradisional di atas bilah pohon kelapa dengan air laut pesisir Kusamba murni kaya mineral.',
      detailUrl: '/etalase',
      is_featured: true,
      featured_order: 7
    },
    {
      id: 'prd-08',
      name: 'Cokelat Single Origin Ransiki 80g',
      category: 'produk',
      subcat: 'kuliner',
      model: 'B2C',
      price: 38000,
      priceStr: 'Rp 38.000',
      unit: 'batang 80g',
      origin: 'Manokwari Selatan, Papua Barat',
      rating: 4.9,
      sold: '410+ terjual',
      img: 'https://images.unsplash.com/photo-1549007994-cb92caebd54b?w=600&q=80',
      badge: 'Kaya Antioksidan',
      desc: 'Cokelat artisan 70% kakao dari perkebunan rakyat Ransiki dengan profil rasa buah berry dan nutty alami.',
      detailUrl: '/etalase',
      is_featured: true,
      featured_order: 8
    },
    {
      id: 'prd-09',
      name: 'Kopi Gayo Roasted Bean Bulk 25kg',
      category: 'produk',
      subcat: 'kuliner',
      model: 'B2B',
      price: 1800000,
      priceStr: 'Rp 1.800.000',
      unit: 'karung 25kg (Min. 5)',
      origin: 'Bener Meriah, Aceh',
      rating: 4.9,
      sold: '110 karung',
      img: 'https://images.unsplash.com/photo-1559525839-b184a4d698c7?w=600&q=80',
      badge: 'Grosir B2B',
      desc: 'Pasokan khusus untuk roastery, kedai kopi, dan hotel dengan profil sangrai konsisten.',
      detailUrl: 'pages/products/product-detail.html?id=prd-kopi-gayo',
      is_featured: false,
      featured_order: null
    },
    {
      id: 'prd-10',
      name: 'Madu Hutan Raw Murni Drum 20L',
      category: 'produk',
      subcat: 'kuliner',
      model: 'B2B',
      price: 2800000,
      priceStr: 'Rp 2.800.000',
      unit: 'drum 20 Liter',
      origin: 'Riau & Jambi',
      rating: 4.8,
      sold: '45 drum',
      img: 'https://images.unsplash.com/photo-1587049352846-4a222e784d38?w=600&q=80',
      badge: 'Grosir B2B',
      desc: 'Pasokan bahan baku murni untuk industri jamu herbal, kosmetik alami, dan produsen makanan sehat.',
      detailUrl: '/etalase',
      is_featured: false,
      featured_order: null
    },
    {
      id: 'prd-11',
      name: 'Beras Organik Pasokan Restoran 50kg',
      category: 'produk',
      subcat: 'pangan',
      model: 'B2B',
      price: 750000,
      priceStr: 'Rp 750.000',
      unit: 'karung 50kg',
      origin: 'Cianjur, Jawa Barat',
      rating: 4.9,
      sold: '80 karung',
      img: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=600&q=80',
      badge: 'Grosir B2B',
      desc: 'Pasokan teratur beras putih pandan wangi organik bersertifikat dengan kontrak pasok berkala.',
      detailUrl: '/etalase',
      is_featured: false,
      featured_order: null
    },
    {
      id: 'prd-12',
      name: 'Minyak Atsiri Sereh Wangi Murni 100ml',
      category: 'produk',
      subcat: 'herbal',
      model: 'B2C',
      price: 115000,
      priceStr: 'Rp 115.000',
      unit: 'botol pipet 100ml',
      origin: 'Gayo Lues, Aceh',
      rating: 4.8,
      sold: '240+ terjual',
      img: 'https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?w=600&q=80',
      badge: 'Essential Oil',
      desc: 'Penyulingan uap daun sereh wangi segar, aroma relaksasi alami dan pengusir serangga ramah lingkungan.',
      detailUrl: '/etalase',
      is_featured: false,
      featured_order: null
    },
    {
      id: 'srv-01',
      name: 'Jasa Pelatihan & Workshop Kriya Rotan',
      category: 'jasa',
      subcat: 'kriya',
      model: 'JASA',
      price: 1500000,
      priceStr: 'Rp 1.500.000',
      unit: 'per batch / grup',
      origin: 'Cirebon / On-site',
      rating: 5.0,
      sold: '32 kelas',
      img: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&q=80',
      badge: 'Layanan Jasa',
      desc: 'Lokakarya teknik anyam rotan modern dibimbing langsung oleh instruktur pengrajin ahli Tegalwangi.',
      detailUrl: 'pages/products/service-detail.html?id=srv-01',
      is_featured: true,
      featured_order: 1
    },
    {
      id: 'srv-02',
      name: 'Jasa Kurasi & Uji Organoleptik Kopi Nusantara',
      category: 'jasa',
      subcat: 'kurasi kopi',
      model: 'JASA',
      price: 750000,
      priceStr: 'Rp 750.000',
      unit: 'per sampel / sesi cupping',
      origin: 'Bandung / Online Sample',
      rating: 4.9,
      sold: '85 sesi',
      img: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=600&q=80',
      badge: 'Layanan Jasa',
      desc: 'Evaluasi cita rasa, cupping score, dan penerbitan lembar audit profil rasa oleh Q-Grader terlisensi.',
      detailUrl: 'pages/products/service-detail.html?id=srv-02',
      is_featured: true,
      featured_order: 2
    },
    {
      id: 'srv-03',
      name: 'Jasa Liputan & Dokumentasi Visual UMKM',
      category: 'jasa',
      subcat: 'dokumentasi',
      model: 'JASA',
      price: 2200000,
      priceStr: 'Rp 2.200.000',
      unit: 'per paket narasi + foto',
      origin: 'Seluruh Nusantara',
      rating: 4.9,
      sold: '50+ UMKM',
      img: 'https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?w=600&q=80',
      badge: 'Layanan Jasa',
      desc: 'Liputan jurnalisme foto lapangan mendalam untuk membangun brand storytelling produk lokal Anda.',
      detailUrl: 'pages/products/service-detail.html?id=srv-03',
      is_featured: true,
      featured_order: 3
    },
    {
      id: 'srv-04',
      name: 'Jasa Pendampingan Sertifikasi Organik & Halal',
      category: 'jasa',
      subcat: 'sertifikasi',
      model: 'JASA',
      price: 3500000,
      priceStr: 'Rp 3.500.000',
      unit: 'per UMKM / siklus',
      origin: 'Jakarta & Yogyakarta',
      rating: 5.0,
      sold: '28 klien',
      img: 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=600&q=80',
      badge: 'Layanan Jasa',
      desc: 'Audit SOP, penyusunan dokumen, uji laboratorium pendukung hingga sertifikat resmi terbit.',
      detailUrl: 'pages/products/service-detail.html?id=srv-04',
      is_featured: true,
      featured_order: 4
    },
    {
      id: 'srv-05',
      name: 'Jasa Workshop Seduh Manual & Barista Komunitas',
      category: 'jasa',
      subcat: 'workshop',
      model: 'JASA',
      price: 850000,
      priceStr: 'Rp 850.000',
      unit: 'per peserta (2 hari)',
      origin: 'Bandung & Malang',
      rating: 4.9,
      sold: '64 peserta',
      img: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=600&q=80',
      badge: 'Layanan Jasa',
      desc: 'Kelas praktik brewing V60, Aeropress, Kalita Wave, serta pemahaman karakter green bean Nusantara.',
      detailUrl: 'pages/products/service-detail.html?id=srv-05',
      is_featured: true,
      featured_order: 5
    }
  ];

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Sinkronisasi: pastikan item jasa default ada dan terisi link detail/is_featured
          var needsSave = false;
          DEFAULT_PRODUCTS.forEach(function (def) {
            var found = parsed.find(function (p) { return p.id === def.id; });
            if (!found) {
              parsed.push(def);
              needsSave = true;
            } else {
              // Migrasikan link produk lama ke template dinamis product-detail.html
              if (def.detailUrl && def.detailUrl.indexOf('product-detail.html') !== -1 && (!found.detailUrl || found.detailUrl.indexOf('product-') !== -1)) {
                found.detailUrl = def.detailUrl;
                needsSave = true;
              }
              if (def.category === 'jasa') {
                if (def.is_featured && !found.is_featured && found.featured_order === null) {
                  found.is_featured = true;
                  found.featured_order = def.featured_order;
                  needsSave = true;
                }
                if (def.detailUrl && (!found.detailUrl || found.detailUrl.indexOf('etalase.html') !== -1)) {
                  found.detailUrl = def.detailUrl;
                  needsSave = true;
                }
              }
            }
          });
          if (needsSave) {
            save(parsed);
          }
          return parsed;
        }
      }
    } catch (e) {
      console.warn('[BobProductsStore] Gagal membaca storage, menggunakan data default.', e);
    }
    save(DEFAULT_PRODUCTS);
    return DEFAULT_PRODUCTS;
  }

  function save(items) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
      if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(new CustomEvent('bob:products-updated', { detail: { count: items.length } }));
      }
    } catch (e) {
      console.error('[BobProductsStore] Gagal menyimpan ke storage.', e);
    }
  }

  var store = {
    STORAGE_KEY: STORAGE_KEY,

    getAll: function () {
      return load();
    },

    getFeatured: function (category) {
      var all = load();
      return all
        .filter(function (p) {
          if (!Boolean(p.is_featured)) return false;
          if (category === 'produk') return p.category === 'produk' || p.category !== 'jasa';
          if (category === 'jasa') return p.category === 'jasa';
          return true;
        })
        .sort(function (a, b) {
          return (a.featured_order || 999) - (b.featured_order || 999);
        });
    },

    getFeaturedProducts: function () {
      return store.getFeatured('produk');
    },

    getFeaturedServices: function () {
      var featured = store.getFeatured('jasa');
      if (featured.length > 0) return featured;
      return load().filter(function (p) { return p.category === 'jasa'; });
    },

    getById: function (id) {
      return load().find(function (p) { return p.id === id; });
    },

    setFeatured: function (id, isFeatured, order) {
      var all = load();
      var target = all.find(function (p) { return p.id === id; });
      if (!target) return false;

      target.is_featured = Boolean(isFeatured);
      if (target.is_featured) {
        if (typeof order === 'number') {
          target.featured_order = order;
        } else if (!target.featured_order) {
          var highest = 0;
          all.forEach(function (p) {
            if (p.is_featured && p.featured_order > highest) highest = p.featured_order;
          });
          target.featured_order = highest + 1;
        }
      } else {
        target.featured_order = null;
      }

      save(all);
      return true;
    },

    add: function (productData) {
      var all = load();
      var newProduct = Object.assign({
        id: 'prd-' + Date.now().toString(36),
        category: 'produk',
        model: 'B2C',
        rating: 5.0,
        sold: 'Baru Terdaftar',
        badge: 'Produk Mitra',
        is_featured: false,
        featured_order: null,
        detailUrl: '/etalase'
      }, productData);

      if (!newProduct.priceStr && typeof newProduct.price === 'number') {
        newProduct.priceStr = 'Rp ' + Number(newProduct.price).toLocaleString('id-ID');
      }

      all.unshift(newProduct);
      save(all);
      return newProduct;
    },

    update: function (id, updates) {
      var all = load();
      var idx = all.findIndex(function (p) { return p.id === id; });
      if (idx === -1) return null;

      all[idx] = Object.assign({}, all[idx], updates);
      if (typeof updates.price === 'number') {
        all[idx].priceStr = 'Rp ' + Number(updates.price).toLocaleString('id-ID');
      }
      save(all);
      return all[idx];
    },

    delete: function (id) {
      var all = load();
      var filtered = all.filter(function (p) { return p.id !== id; });
      if (filtered.length !== all.length) {
        save(filtered);
        return true;
      }
      return false;
    },

    resetToDefault: function () {
      save(DEFAULT_PRODUCTS);
      return DEFAULT_PRODUCTS;
    },

    resolveUrl: function (url, context) {
      if (!url || url === '#' || url.indexOf('javascript:') === 0) return url;
      if (url.indexOf('http://') === 0 || url.indexOf('https://') === 0) return url;

      // Handle clean absolute URLs directly
      if (url.indexOf('/') === 0) return url;

      // Normalize clean URLs without leading slash
      if (url === 'etalase' || url === 'articles' || url.indexOf('etalase?') === 0 || url.indexOf('articles?') === 0) {
        return '/' + url;
      }

      // Convert legacy paths to clean URLs
      if (url.indexOf('pages/main/etalase.html') === 0) {
        return url.replace('pages/main/etalase.html', '/etalase');
      }
      if (url.indexOf('pages/main/etalase') === 0) {
        return url.replace('pages/main/etalase', '/etalase');
      }
      if (url.indexOf('pages/main/articles.html') === 0) {
        return url.replace('pages/main/articles.html', '/articles');
      }
      if (url.indexOf('pages/main/articles') === 0) {
        return url.replace('pages/main/articles', '/articles');
      }

      var clean = url.replace(/^(\.\.\/)+/, '').replace(/^\.\//, '');
      if (clean.indexOf('pages/') !== 0) {
        clean = 'pages/' + clean;
      }

      if (context === 'root' || !context) {
        return clean;
      }
      if (context === 'main') {
        if (clean.indexOf('pages/main/') === 0) {
          return './' + clean.slice('pages/main/'.length);
        }
        return '../' + clean.slice('pages/'.length);
      }
      if (context === 'products') {
        if (clean.indexOf('pages/products/') === 0) {
          return './' + clean.slice('pages/products/'.length);
        }
        return '../' + clean.slice('pages/'.length);
      }
      if (context === 'master-admin' || context === 'admin') {
        return '../../' + clean;
      }
      return clean;
    }
  };

  global.BobProductsStore = store;
})(typeof window !== 'undefined' ? window : this);
