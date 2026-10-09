(function initializeCookieConsent() {
  const STORAGE_KEY = 'cookieDisetujui';
  const banner = document.getElementById('cookie-consent');
  const settings = document.getElementById('cookie-settings');
  const analyticsToggle = document.getElementById('cookie-analytics');
  if (!banner || !settings || !analyticsToggle) return;

  const settingsDialog = settings.querySelector('.cookie-settings__dialog');
  const settingsOpen = document.getElementById('cookie-settings-open');
  const consentError = document.getElementById('cookie-consent-error');
  const settingsError = document.getElementById('cookie-settings-error');
  let returnFocusTo = null;

  function setVisible(element, visible) {
    if (visible) {
      element.hidden = false;
      requestAnimationFrame(function () { element.classList.add('is-visible'); });
      return;
    }
    element.classList.remove('is-visible');
    element.hidden = true;
  }

  function saveChoice(decision, analytics) {
    const preference = {
      decision: decision,
      essential: true,
      analytics: Boolean(analytics),
      savedAt: new Date().toISOString()
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(preference));
      return true;
    } catch (error) {
      console.error('[CookieConsent] Tidak dapat menyimpan preferensi cookie.', error);
      return false;
    }
  }

  function closeSettings() {
    setVisible(settings, false);
    if (returnFocusTo) returnFocusTo.focus();
  }

  function commitChoice(decision, analytics) {
    const saved = saveChoice(decision, analytics);
    if (!saved) {
      consentError.hidden = false;
      settingsError.hidden = false;
      return;
    }
    consentError.hidden = true;
    settingsError.hidden = true;
    setVisible(settings, false);
    setVisible(banner, false);
  }

  function openSettings() {
    let savedValue = null;
    let savedPreference = null;
    try {
      savedValue = localStorage.getItem(STORAGE_KEY);
      savedPreference = savedValue ? JSON.parse(savedValue) : null;
    } catch (error) {
      console.error('[CookieConsent] Tidak dapat membaca preferensi cookie tersimpan.', error);
    }
    analyticsToggle.checked = Boolean(savedPreference && savedPreference.analytics);
    settingsError.hidden = true;
    returnFocusTo = document.activeElement;
    setVisible(banner, false);
    setVisible(settings, true);
    settings.querySelector('.cookie-settings__close').focus();
  }

  document.getElementById('cookie-accept-all').addEventListener('click', function () {
    commitChoice('accepted-all', true);
  });
  document.getElementById('cookie-reject-all').addEventListener('click', function () {
    commitChoice('rejected-all', false);
  });
  settingsOpen.addEventListener('click', openSettings);
  document.getElementById('cookie-settings-save').addEventListener('click', function () {
    commitChoice('custom', analyticsToggle.checked);
  });
  document.getElementById('cookie-settings-reject').addEventListener('click', function () {
    analyticsToggle.checked = false;
    commitChoice('rejected-all', false);
  });
  settings.querySelectorAll('[data-cookie-settings-close]').forEach(function (button) {
    button.addEventListener('click', closeSettings);
  });
  document.addEventListener('keydown', function (event) {
    if (settings.hidden) return;
    if (event.key === 'Escape') closeSettings();
    if (event.key === 'Tab') {
      const focusable = Array.from(settingsDialog.querySelectorAll('button, input:not(:disabled)'));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });

  let existingChoice;
  try {
    existingChoice = localStorage.getItem(STORAGE_KEY);
  } catch (error) {
    console.error('[CookieConsent] Tidak dapat membaca status persetujuan cookie.', error);
  }
  if (!existingChoice) setVisible(banner, true);
})();