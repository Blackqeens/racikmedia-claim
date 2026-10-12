(function () {
  'use strict';

  var applicationRoot = null;

  function getRoleDashboardPath(role) {
    switch (role) {
      case 'master_admin':
        return 'pages/master-admin/dashboard.html';
      case 'admin':
        return 'pages/admin/dashboard.html';
      case 'seller':
      case 'penjual':
      case 'penyedia_jasa':
      case 'mekanik':
        return 'pages/seller/seller-dashboard.html';
      case 'member':
      case 'pengguna':
      default:
        return 'pages/main/dashboard.html';
    }
  }

  function getActiveRole() {
    var isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
    var userRole = localStorage.getItem('user_role') || sessionStorage.getItem('bob_user_role');
    if (!userRole) {
      try {
        var hint = JSON.parse(sessionStorage.getItem('bob_profile_hint'));
        if (hint && (hint.role || hint.email)) {
          userRole = hint.role || 'member';
          isLoggedIn = true;
        }
      } catch (e) {}
    }
    return isLoggedIn ? (userRole || 'member') : null;
  }

  function syncRacikLogo(forcedRole) {
    var role = typeof forcedRole !== 'undefined' ? forcedRole : getActiveRole();
    var logoLinks = document.querySelectorAll('.rm-public-header__logo, a.site-header__logo, a.nav-brand-logo, [data-racik-logo]');

    logoLinks.forEach(function (logoLink) {
      if (role) {
        var targetPath = getRoleDashboardPath(role);
        var targetUrl = applicationRoot ? new URL(targetPath, applicationRoot).href : ('/' + targetPath);
        logoLink.href = targetUrl;
        logoLink.setAttribute('aria-label', 'Racik Media — Dashboard ' + role);
        logoLink.title = 'Kembali ke Dashboard';
      } else {
        var homeUrl = applicationRoot ? new URL('index.html', applicationRoot).href : '/index.html';
        logoLink.href = homeUrl;
        logoLink.setAttribute('aria-label', 'Racik Media — Beranda');
        logoLink.title = 'Halaman Utama';
      }
    });
  }

  window.syncRacikLogo = syncRacikLogo;

  document.addEventListener('click', function (event) {
    var logoLink = event.target.closest('.rm-public-header__logo, a.site-header__logo, a.nav-brand-logo, [data-racik-logo]');
    if (!logoLink) return;
    var role = getActiveRole();
    event.preventDefault();
    if (role) {
      var targetPath = getRoleDashboardPath(role);
      var targetUrl = applicationRoot ? new URL(targetPath, applicationRoot).href : ('/' + targetPath);
      window.location.href = targetUrl;
    } else {
      var homeUrl = applicationRoot ? new URL('index.html', applicationRoot).href : '/index.html';
      window.location.href = homeUrl;
    }
  });

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
          syncRacikLogo();
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
  applicationRoot = new URL('../../', scriptUrl);
  syncRacikLogo();
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
