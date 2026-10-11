(function (global) {
  'use strict';

  var SESSION_KEY = 'bob_profile_hint';
  var ACCOUNT_HISTORY_KEY = 'bob_account_history';
  var PENDING_SWITCH_KEY = 'bob_pending_switch_email';
  var LOGIN_PAGE = 'login.html';
  var clientPromise = null;
  var REDIRECT_MAP = {
    member: 'pages/main/dashboard.html',
    penguna: 'pages/main/dashboard.html',
    seller: 'pages/main/dashboard.html',
    penjual: 'pages/main/dashboard.html',
    mekanik: 'pages/main/dashboard.html',
    penyedia_jasa: 'pages/main/dashboard.html',
    admin: 'pages/main/dashboard.html',
    master_admin: 'pages/main/dashboard.html'
  };

  function rootPrefix() {
    var path = global.location.pathname.replace(/\\/g, '/');
    var parts = path.split('/').filter(Boolean);
    var pagesIndex = parts.lastIndexOf('pages');
    if (pagesIndex >= 0) return Array(Math.max(1, parts.length - pagesIndex - 1)).fill('..').join('/') + '/';
    var depth = Math.max(0, parts.length - 1);
    return depth ? Array(depth).fill('..').join('/') + '/' : './';
  }

  function redirect(relativePath) {
    global.location.replace(rootPrefix() + relativePath);
  }

  function postLoginRedirect(role) {
    var next = new URLSearchParams(global.location.search).get('next');
    if (next) {
      try {
        var target = new URL(next, global.location.origin);
        if (target.origin === global.location.origin) {
          global.location.replace(target.href);
          return;
        }
      } catch (error) {
        console.warn('Ignoring invalid post-login redirect.');
      }
    }
    redirect(REDIRECT_MAP[role] || REDIRECT_MAP.member);
  }

  function authRedirect(page) {
    var url = new URL(rootPrefix() + 'pages/auth/' + page, global.location.href);
    var next = new URLSearchParams(global.location.search).get('next');
    if (next) url.searchParams.set('next', next);
    return url.href;
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var existing = document.querySelector('script[data-auth-src="' + src + '"]');
      if (existing) {
        if (existing.dataset.loaded === 'true') return resolve();
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', function () { reject(new Error('Gagal memuat konfigurasi autentikasi.')); }, { once: true });
        return;
      }
      var script = document.createElement('script');
      script.src = src;
      script.dataset.authSrc = src;
      script.onload = function () { script.dataset.loaded = 'true'; resolve(); };
      script.onerror = function () { reject(new Error('Gagal memuat konfigurasi autentikasi.')); };
      document.head.appendChild(script);
    });
  }

  async function getClient() {
    if (global.supabaseClient && global.supabaseClient.auth) return global.supabaseClient;
    if (!clientPromise) {
      clientPromise = (async function () {
        if (!global.supabase || !global.SUPABASE_CONFIG) {
          var prefix = rootPrefix();
          if (!global.supabase) await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2');
          if (!global.SUPABASE_CONFIG) await loadScript(prefix + 'assets/js/supabase-config.js');
        }
        if (!global.supabase || !global.SUPABASE_CONFIG) {
          throw new Error('Konfigurasi Supabase tidak tersedia.');
        }
        global.supabaseClient = global.supabase.createClient(
          global.SUPABASE_CONFIG.url,
          global.SUPABASE_CONFIG.publishableKey
        );
        return global.supabaseClient;
      })().catch(function (error) {
        clientPromise = null;
        throw error;
      });
    }
    return clientPromise;
  }

  function saveProfileHint(user, profile) {
    rememberAccount(user);
    var hint = {
      id: user.id,
      name: profile.display_name || user.email || 'User',
      email: user.email || '',
      role: profile.role || 'member',
      city: profile.city || ''
    };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(hint));
    sessionStorage.setItem('bob_user_id', hint.id);
    sessionStorage.setItem('bob_user_name', hint.name);
    sessionStorage.setItem('bob_user_email', hint.email);
    sessionStorage.setItem('bob_user_role', hint.role);
    sessionStorage.setItem('bob_user_city', hint.city);
    return hint;
  }

  function rememberAccount(user) {
    if (!user || !user.email) return;
    try {
      var history = JSON.parse(global.localStorage.getItem(ACCOUNT_HISTORY_KEY) || '[]');
      if (!Array.isArray(history)) history = [];
      var account = {
        email: user.email,
        provider: user.app_metadata && user.app_metadata.provider === 'google' ? 'google' : 'password',
        lastUsed: Date.now()
      };
      history = history.filter(function (item) {
        return item && typeof item.email === 'string'
          && item.email.toLowerCase() !== account.email.toLowerCase();
      });
      history.unshift(account);
      global.localStorage.setItem(ACCOUNT_HISTORY_KEY, JSON.stringify(history.slice(0, 5)));
    } catch (error) {
      console.warn('Riwayat akun tidak dapat disimpan:', error.message);
    }
  }

  function getAccountHistory() {
    try {
      var history = JSON.parse(global.localStorage.getItem(ACCOUNT_HISTORY_KEY) || '[]');
      return Array.isArray(history) ? history.filter(function (item) {
        return item && typeof item.email === 'string';
      }).slice(0, 5) : [];
    } catch (error) {
      console.warn('Riwayat akun tersimpan tidak dapat dibaca:', error.message);
      return [];
    }
  }

  function clearProfileHint() {
    sessionStorage.removeItem(SESSION_KEY);
    ['bob_user_id', 'bob_user_name', 'bob_user_email', 'bob_user_role', 'bob_user_city'].forEach(function (key) {
      sessionStorage.removeItem(key);
    });
  }

  async function verifiedContext() {
    var client = await getClient();
    var auth = await client.auth.getUser();
    if (auth.error) throw new Error('Gagal memvalidasi sesi Supabase: ' + auth.error.message);
    if (!auth.data.user) return null;
    var profile = await client.from('profiles')
      .select('display_name, role, city')
      .eq('id', auth.data.user.id)
      .single();
    if (profile.error) throw new Error('Gagal memeriksa profil akun: ' + profile.error.message);
    return { client: client, user: auth.data.user, profile: profile.data };
  }

  var BobAuth = {
    getClient: getClient,

    getSession: function () {
      try {
        var hint = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
        return hint && typeof hint === 'object' ? hint : null;
      } catch (error) {
        console.warn('Ignoring malformed cached profile data.');
        clearProfileHint();
        return null;
      }
    },

    requireAuth: async function () {
      try {
        var context = await verifiedContext();
        if (!context) {
          clearProfileHint();
          redirect(LOGIN_PAGE + '?next=' + encodeURIComponent(global.location.href));
          return false;
        }
        saveProfileHint(context.user, context.profile);
        return true;
      } catch (error) {
        console.error('Authentication check failed:', error.message);
        clearProfileHint();
        redirect(LOGIN_PAGE + '?next=' + encodeURIComponent(global.location.href));
        return false;
      }
    },

    redirectIfAuthenticated: async function () {
      try {
        var client = await getClient();
        var auth = await client.auth.getUser();
        if (auth.error) throw new Error('Gagal memvalidasi sesi Supabase: ' + auth.error.message);
        if (!auth.data.user) return false;

        var pendingEmail = global.localStorage.getItem(PENDING_SWITCH_KEY);
        if (pendingEmail && pendingEmail.toLowerCase() !== String(auth.data.user.email || '').toLowerCase()) {
          var signOut = await client.auth.signOut();
          if (signOut.error) throw signOut.error;
          clearProfileHint();
          global.localStorage.removeItem(PENDING_SWITCH_KEY);
          global.location.replace(global.location.pathname + '?switchError=account_mismatch');
          return false;
        }

        var context = await verifiedContext();
        if (!context) return false;
        if (pendingEmail) global.localStorage.removeItem(PENDING_SWITCH_KEY);
        var session = saveProfileHint(context.user, context.profile);
        postLoginRedirect(session.role);
        return true;
      } catch (error) {
        console.error('Existing session check failed:', error.message);
        return false;
      }
    },

    requireRole: async function (allowedRoles) {
      try {
        var context = await verifiedContext();
        if (!context) {
          clearProfileHint();
          redirect(LOGIN_PAGE);
          return false;
        }
        var session = saveProfileHint(context.user, context.profile);
        var roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
        if (!roles.includes(context.profile.role)) {
          redirect(REDIRECT_MAP[session.role] || REDIRECT_MAP.member);
          return false;
        }
        return true;
      } catch (error) {
        console.error('Role check failed:', error.message);
        clearProfileHint();
        redirect(LOGIN_PAGE);
        return false;
      }
    },

    login: async function (email, password) {
      try {
        var client = await getClient();
        var result = await client.auth.signInWithPassword({ email: email, password: password });
        if (result.error) throw result.error;
        var context = await verifiedContext();
        if (!context) throw new Error('Sesi masuk tidak dapat diverifikasi.');
        var session = saveProfileHint(context.user, context.profile);
        postLoginRedirect(session.role);
        return { success: true };
      } catch (error) {
        console.error('Authentication failed:', error.message);
        return { success: false, error: error.message };
      }
    },

    register: async function (name, email, password, city) {
      try {
        var client = await getClient();
        var result = await client.auth.signUp({
          email: email,
          password: password,
          options: {
            data: { display_name: name, city: city },
            emailRedirectTo: new URL(rootPrefix() + 'login.html?confirmed=1', global.location.href).href
          }
        });
        if (result.error) throw result.error;
        if (!result.data.session) {
          return {
            success: true,
            needsEmailConfirmation: true,
            message: 'Pendaftaran berhasil. Periksa email untuk mengonfirmasi akun sebelum masuk.'
          };
        }
        var context = await verifiedContext();
        if (!context) throw new Error('Akun dibuat, tetapi sesi belum dapat diverifikasi. Silakan masuk kembali.');
        var session = saveProfileHint(context.user, context.profile);
        postLoginRedirect(session.role);
        return { success: true };
      } catch (error) {
        console.error('Registration failed:', error.message);
        return { success: false, error: error.message };
      }
    },

    resendConfirmation: async function (email) {
      var client = await getClient();
      var result = await client.auth.resend({
        type: 'signup',
        email: email,
        options: { emailRedirectTo: authRedirect('email-confirmed.html') }
      });
      if (result.error) throw result.error;
      return { success: true };
    },

    requestPasswordReset: async function (email) {
      var client = await getClient();
      var result = await client.auth.resetPasswordForEmail(email, {
        redirectTo: authRedirect('update-password.html')
      });
      if (result.error) throw result.error;
      return { success: true };
    },

    updatePassword: async function (password) {
      var client = await getClient();
      var auth = await client.auth.getUser();
      if (auth.error) throw auth.error;
      if (!auth.data.user) throw new Error('Tautan reset tidak valid atau sudah kedaluwarsa. Minta tautan reset baru.');
      var result = await client.auth.updateUser({ password: password });
      if (result.error) throw result.error;
      return { success: true };
    },

    loginSocial: async function (provider, options) {
      try {
        var client = await getClient();
        var oauthOptions = { redirectTo: global.location.href };
        if (options && options.promptAccountSelection) {
          oauthOptions.queryParams = { prompt: 'select_account' };
        }
        var result = await client.auth.signInWithOAuth({
          provider: provider,
          options: oauthOptions
        });
        if (result.error) throw result.error;
        return { success: true };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },

    switchAccount: async function (email, provider) {
      var client = await getClient();
      var result = await client.auth.signOut();
      if (result.error) throw result.error;
      clearProfileHint();

      if (provider === 'google') {
        if (!email) throw new Error('Email akun Google yang dipilih tidak tersedia.');
        global.localStorage.setItem(PENDING_SWITCH_KEY, email);
        try {
          var authResult = await client.auth.signInWithOAuth({
            provider: 'google',
            options: {
              redirectTo: authRedirect('login.html'),
              queryParams: { prompt: 'select_account' }
            }
          });
          if (authResult.error) throw authResult.error;
        } catch (error) {
          global.localStorage.removeItem(PENDING_SWITCH_KEY);
          throw error;
        }
        return { success: true };
      }

      var targetPage = provider === 'register' ? 'login.html?mode=register' : LOGIN_PAGE;
      var loginUrl = new URL(rootPrefix() + targetPage, global.location.href);
      loginUrl.searchParams.set('switchAccount', '1');
      if (email) loginUrl.searchParams.set('email', email);
      global.location.assign(loginUrl.href);
      return { success: true };
    },

    getAccountHistory: getAccountHistory,
    rememberAccount: rememberAccount,

    logout: async function (options) {
      if (!(options && options.confirmed)
        && !global.confirm('Keluar dari akun ini? Anda perlu masuk kembali untuk melanjutkan.')) {
        return { success: false, cancelled: true };
      }
      var client = await getClient();
      var result = await client.auth.signOut();
      if (result.error) throw result.error;
      clearProfileHint();
      global.localStorage.removeItem(PENDING_SWITCH_KEY);
      redirect(LOGIN_PAGE);
      return { success: true };
    }
  };

  global.BobAuth = BobAuth;
  global.racikAuth = BobAuth;
})(window);
