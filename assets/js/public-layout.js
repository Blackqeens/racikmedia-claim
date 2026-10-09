(function () {
  'use strict';

  function syncPublicMotion() {
    var startTime = document.timeline.currentTime;

    document.getAnimations().forEach(function (animation) {
      var target = animation.effect && animation.effect.target;
      if (!target) return;

      var isHeroBackground = animation.effect.pseudoElement === '::before'
        && target.matches('.public-hero');
      var isLoginButton = target.matches(
        '.rm-public-header__login, .rm-public-header__mobile-login'
      );

      if (isHeroBackground || isLoginButton) {
        animation.startTime = startTime;
      }
    });
  }

  function resolveNavbarPaths(container, applicationRoot) {
    container.querySelectorAll('a[href^="/"], img[src^="/"]').forEach(function (element) {
      var attribute = element.tagName === 'IMG' ? 'src' : 'href';
      var path = element.getAttribute(attribute);
      if (path.indexOf('//') === 0) return;
      element.setAttribute(attribute, new URL(path.slice(1), applicationRoot).href);
    });
  }

  function loadPartial(containerId, path, label, applicationRoot) {
    var container = document.getElementById(containerId);
    if (!container) return Promise.resolve();

    return fetch(path)
      .then(function (response) {
        if (!response.ok) throw new Error(label + ' gagal dimuat: HTTP ' + response.status);
        return response.text();
      })
      .then(function (html) {
        container.innerHTML = html;
        if (containerId === 'rm-navbar-root' && applicationRoot) {
          resolveNavbarPaths(container, applicationRoot);
        }
        if (window.RMlang && typeof window.RMlang.set === 'function') {
          window.RMlang.set(window.RMlang.get(), false);
        }
        if (containerId === 'rm-navbar-root') {
          syncPublicMotion();
        }
      })
      .catch(function (error) {
        console.error(error.message);
      });
  }

  function loadScript(path) {
    return new Promise(function (resolve, reject) {
      var src = path.href;
      var existing = document.querySelector('script[data-layout-src="' + src + '"]');
      if (existing) {
        if (existing.dataset.loaded === 'true') return resolve();
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', function () {
          reject(new Error('Skrip akun navbar gagal dimuat: ' + src));
        }, { once: true });
        return;
      }
      var script = document.createElement('script');
      script.src = src;
      script.dataset.layoutSrc = src;
      script.onload = function () {
        script.dataset.loaded = 'true';
        resolve();
      };
      script.onerror = function () {
        reject(new Error('Skrip akun navbar gagal dimuat: ' + src));
      };
      document.head.appendChild(script);
    });
  }

  function mountDashboardControls() {
    if (!document.body.classList.contains('dashboard-page')) return;

    var navbar = document.querySelector('.rm-public-header__inner');
    var logo = navbar && navbar.querySelector('.rm-public-header__logo');
    var toolbar = document.querySelector('.dashboard-toolbar > div');
    if (!navbar || !logo || !toolbar || navbar.querySelector('.dashboard-toolbar__controls')) return;

    var controls = document.createElement('div');
    controls.className = 'dashboard-toolbar__controls';
    controls.setAttribute('role', 'group');
    controls.setAttribute('aria-label', 'Alat dashboard');

    Array.prototype.slice.call(toolbar.children).forEach(function (item, index) {
      if (index > 0) controls.appendChild(item);
    });
    navbar.insertBefore(controls, logo.nextSibling);
    document.body.classList.add('dashboard-controls-mounted');

    var navbarRoot = document.getElementById('rm-navbar-root');
    var updateNavbarHeight = function () {
      if (navbarRoot) {
        document.body.style.setProperty(
          '--dashboard-navbar-height',
          navbarRoot.getBoundingClientRect().height + 'px'
        );
      }
    };
    updateNavbarHeight();
    if (window.ResizeObserver && navbarRoot) {
      new ResizeObserver(updateNavbarHeight).observe(navbarRoot);
    } else {
      window.addEventListener('resize', updateNavbarHeight);
    }
  }

  if (!document.getElementById('rm-navbar-root') && document.body) {
    var navbarRoot = document.createElement('div');
    navbarRoot.id = 'rm-navbar-root';
    document.body.insertBefore(navbarRoot, document.body.firstChild);
  }
  if (document.body) document.body.classList.add('rm-has-public-navbar');

  var scriptUrl = document.currentScript && document.currentScript.src;
  if (!scriptUrl) {
    console.error('Layout publik gagal dimuat: lokasi skrip tidak tersedia.');
    return;
  }

  var layoutUrl = new URL('../../layouts/', scriptUrl);
  var applicationRoot = new URL('../../', scriptUrl);
  var navbarPromise = loadPartial(
    'rm-navbar-root',
    new URL('_public-navbar.html', layoutUrl),
    'Navbar',
    applicationRoot
  ).then(function () {
    mountDashboardControls();
    return window.BobAuth
      ? Promise.resolve()
      : loadScript(new URL('../../api/auth.js', scriptUrl));
  }).then(function () {
    return loadScript(new URL('public-account-menu.js', scriptUrl));
  }).catch(function (error) {
    console.error('Kontrol akun navbar gagal diinisialisasi:', error.message);
  });
  Promise.all([
    navbarPromise,
    loadPartial('rm-footer-root', new URL('_footer.html', layoutUrl), 'Footer')
  ]);
})();
