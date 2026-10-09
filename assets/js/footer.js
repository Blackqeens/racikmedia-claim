(function () {
  'use strict';

  var root = document.getElementById('rm-footer-root');
  var footer = root || document.querySelector('footer');
  if (!footer) return;

  var scriptUrl = document.currentScript && document.currentScript.src;
  if (!scriptUrl) {
    console.error('Footer gagal dimuat: lokasi skrip tidak tersedia.');
    return;
  }

  fetch(new URL('../../layouts/_footer.html', scriptUrl))
    .then(function (response) {
      if (!response.ok) throw new Error('Footer gagal dimuat: HTTP ' + response.status);
      return response.text();
    })
    .then(function (html) {
      if (root) {
        root.innerHTML = html;
      } else {
        footer.outerHTML = html;
      }
      if (window.RMlang && typeof window.RMlang.set === 'function') {
        window.RMlang.set(window.RMlang.get(), false);
      }
    })
    .catch(function (error) {
      console.error(error.message);
    });
})();
