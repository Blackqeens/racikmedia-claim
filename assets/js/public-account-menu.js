(function () {
  'use strict';

  var dialog;
  var currentUser;

  function setLoginState(isAuthenticated) {
    [
      document.getElementById('btn-login'),
      document.querySelector('.rm-public-header__mobile-login')
    ].filter(Boolean).forEach(function (link) {
      if (!link.dataset.loginLabel) link.dataset.loginLabel = link.textContent;
      if (!link.dataset.loginHref) link.dataset.loginHref = link.getAttribute('href');
      link.textContent = isAuthenticated ? 'Keluar' : link.dataset.loginLabel;
      link.href = isAuthenticated ? '#' : link.dataset.loginHref;
      link.dataset.id = isAuthenticated ? 'Keluar' : 'Masuk / Daftar';
      link.dataset.en = isAuthenticated ? 'Sign out' : 'Sign In / Register';
      link.setAttribute('aria-haspopup', isAuthenticated ? 'dialog' : 'false');
      link.onclick = isAuthenticated ? function (event) {
        event.preventDefault();
        openDialog();
      } : null;
    });
  }

  function createDialog() {
    if (dialog) return dialog;

    dialog = document.createElement('div');
    dialog.className = 'rm-account-overlay';
    dialog.hidden = true;
    dialog.innerHTML = [
      '<section class="rm-account-dialog" role="dialog" aria-modal="true" aria-labelledby="rm-account-title">',
      '  <button type="button" class="rm-account-dialog__close" aria-label="Tutup">×</button>',
      '  <h2 id="rm-account-title">Akun Anda</h2>',
      '  <p class="rm-account-dialog__current"></p>',
      '  <div class="rm-account-dialog__message" role="status" aria-live="polite"></div>',
      '  <div class="rm-account-dialog__stage" data-stage="main">',
      '    <button type="button" class="rm-account-dialog__action" data-action="switch">Ganti akun</button>',
      '    <button type="button" class="rm-account-dialog__action rm-account-dialog__action--logout" data-action="confirm-logout">Keluar dari akun</button>',
      '  </div>',
      '  <div class="rm-account-dialog__stage" data-stage="accounts" hidden>',
      '    <h3>Pilih akun yang pernah digunakan</h3>',
      '    <div class="rm-account-dialog__accounts"></div>',
      '    <button type="button" class="rm-account-dialog__action" data-action="other-account">Gunakan akun lain</button>',
      '    <a class="rm-account-dialog__register" href="#" data-action="register">Belum punya akun? Daftar</a>',
      '    <button type="button" class="rm-account-dialog__back" data-action="back">Kembali</button>',
      '  </div>',
      '  <div class="rm-account-dialog__stage" data-stage="logout" hidden>',
      '    <h3>Konfirmasi keluar</h3>',
      '    <p>Anda akan keluar dari akun ini. Untuk melanjutkan nanti, Anda perlu masuk kembali.</p>',
      '    <button type="button" class="rm-account-dialog__action rm-account-dialog__action--logout" data-action="logout">Ya, keluar</button>',
      '    <button type="button" class="rm-account-dialog__back" data-action="back">Batalkan</button>',
      '  </div>',
      '</section>'
    ].join('');
    document.body.appendChild(dialog);

    dialog.addEventListener('click', function (event) {
      if (event.target === dialog || event.target.closest('.rm-account-dialog__close')) {
        closeDialog();
        return;
      }
      var actionButton = event.target.closest('[data-action]');
      if (!actionButton) return;
      if (actionButton.tagName === 'A') event.preventDefault();

      var action = actionButton.dataset.action;
      if (action === 'switch') showAccounts();
      if (action === 'confirm-logout') showStage('logout');
      if (action === 'back') showStage('main');
      if (action === 'other-account') switchAccount('', 'password');
      if (action === 'register') switchAccount('', 'register');
      if (action === 'logout') logout();
      if (action === 'account') switchAccount(
        actionButton.dataset.email,
        actionButton.dataset.provider
      );
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !dialog.hidden) closeDialog();
    });
    return dialog;
  }

  function showStage(stage) {
    dialog.querySelectorAll('.rm-account-dialog__stage').forEach(function (element) {
      element.hidden = element.dataset.stage !== stage;
    });
    dialog.querySelector('.rm-account-dialog__message').textContent = '';
  }

  function openDialog() {
    createDialog();
    dialog.querySelector('.rm-account-dialog__current').textContent =
      currentUser && currentUser.email ? currentUser.email : '';
    showStage('main');
    dialog.hidden = false;
    dialog.querySelector('.rm-account-dialog__close').focus();
  }

  function closeDialog() {
    if (dialog) dialog.hidden = true;
  }

  function showError(message) {
    dialog.querySelector('.rm-account-dialog__message').textContent = message;
  }

  function showAccounts() {
    showStage('accounts');
    var list = dialog.querySelector('.rm-account-dialog__accounts');
    list.replaceChildren();
    var activeEmail = String(currentUser && currentUser.email || '').toLowerCase();
    var accounts = window.BobAuth.getAccountHistory().filter(function (account) {
      return account.email.toLowerCase() !== activeEmail;
    });

    if (!accounts.length) {
      var empty = document.createElement('p');
      empty.className = 'rm-account-dialog__empty';
      empty.textContent = 'Belum ada akun lain di riwayat perangkat ini.';
      list.appendChild(empty);
      return;
    }

    accounts.forEach(function (account) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'rm-account-dialog__account';
      button.dataset.action = 'account';
      button.dataset.email = account.email;
      button.dataset.provider = account.provider === 'google' ? 'google' : 'password';
      button.textContent = account.email + (account.provider === 'google' ? ' · Google' : '');
      list.appendChild(button);
    });
  }

  async function switchAccount(email, provider) {
    showError('Menyiapkan pergantian akun…');
    try {
      await window.BobAuth.switchAccount(email, provider);
    } catch (error) {
      setLoginState(false);
      showError('Pergantian akun gagal: ' + error.message + ' Silakan masuk kembali.');
    }
  }

  async function logout() {
    showError('Keluar dari akun…');
    try {
      await window.BobAuth.logout({ confirmed: true });
    } catch (error) {
      showError('Tidak dapat keluar: ' + error.message);
    }
  }

  async function initialize() {
    if (!window.BobAuth || typeof window.BobAuth.getClient !== 'function') {
      throw new Error('Modul autentikasi tidak tersedia.');
    }
    var client = await window.BobAuth.getClient();
    var result = await client.auth.getUser();
    if (result.error) throw result.error;
    currentUser = result.data.user || null;
    if (currentUser) window.BobAuth.rememberAccount(currentUser);
    setLoginState(Boolean(currentUser));
    createDialog();
  }

  initialize().catch(function (error) {
    console.error('Status akun navbar gagal diverifikasi:', error.message);
  });
})();
