(function () {
  'use strict';

  var CART_KEY = 'racikmedia-cart';
  var PRODUCTS = {
    'product-kopi-gayo': {
      id: 'product-kopi-gayo',
      price: 22000,
      image: 'https://images.unsplash.com/photo-1610889556528-9a770e32642f?w=900&q=80'
    },
    'product-madu-hutan': {
      id: 'product-madu-hutan',
      price: 78000,
      image: 'https://images.unsplash.com/photo-1571115177098-24ec42ed204d?w=900&q=85'
    },
    'product-tas-rotan': {
      id: 'product-tas-rotan',
      price: 145000,
      image: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=900&q=85'
    },
    'product-beras-organik': {
      id: 'product-beras-organik',
      price: 28000,
      image: 'https://images.unsplash.com/photo-1574943320219-553eb213f72d?w=900&q=85'
    }
  };

  function readCart() {
    var saved = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
    if (!Array.isArray(saved)) throw new Error('Format keranjang tidak valid.');
    return saved;
  }

  function init() {
    var urlParams = new URLSearchParams(location.search);
    var productId = urlParams.get('id') || location.pathname.split('/').pop().replace('.html', '');
    var product = PRODUCTS[productId] || PRODUCTS['product-' + productId] || PRODUCTS[productId.replace('prd-', 'product-')];
    var button = Array.from(document.querySelectorAll('button')).find(function (candidate) {
      return candidate.textContent.trim() === 'Tambah ke Keranjang';
    });
    if (!product || !button) return;

    var title = document.querySelector('main h1');
    var image = document.querySelector('#main-img, main img');
    if (!title || !image) {
      console.error('Informasi produk tidak lengkap; produk tidak dapat ditambahkan ke keranjang.');
      return;
    }

    document.querySelectorAll('a[href*="wa.me"]').forEach(function (link) {
      link.remove();
    });

    button.addEventListener('click', function () {
      try {
        var cart = readCart();
        var existing = cart.find(function (item) { return item.id === product.id; });
        if (existing) {
          existing.quantity = Math.max(1, Number(existing.quantity) || 1) + 1;
        } else {
          cart.push({
            id: product.id,
            name: title.textContent.trim(),
            image: image.currentSrc || image.src || product.image,
            unitPrice: product.price,
            quantity: 1
          });
        }
        localStorage.setItem(CART_KEY, JSON.stringify(cart));
        location.href = 'cart.html';
      } catch (error) {
        console.error('Gagal menyimpan produk ke keranjang:', error);
        window.alert('Produk belum dapat dimasukkan ke keranjang. Periksa ruang penyimpanan browser dan coba lagi.');
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
