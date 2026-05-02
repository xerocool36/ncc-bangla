/* ═══════════════════════════════════════
   NCC Bangla — splash.js
   Mandatory registration gate shown on first visit.
   Calls bootApp() (defined in app.js) on success.
   ═══════════════════════════════════════ */

'use strict';

var EDGE_FUNCTION_URL = 'https://drypjcgloclnxayfzdsz.supabase.co/functions/v1/ncc-registrations';

var splash = (function () {

  // ─── private helpers ─────────────────

  function el(id) { return document.getElementById(id); }

  function setError(msg) {
    /* Show inline error and immediately re-enable the form so user can retry. */
    var errorEl = el('splash-error');
    errorEl.textContent = msg;
    errorEl.hidden = false;
    _setSubmitIdle();
  }

  function clearError() {
    var errorEl = el('splash-error');
    errorEl.textContent = '';
    errorEl.hidden = true;
  }

  function _setSubmitLoading(btn) {
    btn.disabled = true;
    btn.dataset.origText = btn.textContent;
    btn.textContent = 'Inviando…';
  }

  function _setSubmitIdle() {
    /* Re-enable whichever submit button is currently visible. */
    var loginBtn = el('splash-btn-login');
    var regBtn   = el('splash-btn-register');
    if (loginBtn) { loginBtn.disabled = false; loginBtn.textContent = 'Accedi'; }
    if (regBtn)   { regBtn.disabled   = false; regBtn.textContent   = 'Registrati'; }
  }

  function _dismissSplash(email) {
    /* Boot the app FIRST so any failure leaves the splash visible
       (with the form re-enabled by the caller) instead of stranding
       the user on a broken app shell. */
    el('app-shell').hidden = false;
    bootApp();
    try {
      localStorage.setItem('ncc_registered', 'true');
      localStorage.setItem('ncc_email', email);
    } catch (e) {
      /* localStorage unavailable — user will see splash next visit, accept */
    }
    el('splash-overlay').hidden = true;
  }

  function _switchToRegister(email) {
    /* Switch to registration tab with email pre-filled. */
    _activateTab('register');
    var emailField = el('splash-reg-email');
    if (emailField) emailField.value = email || '';
  }

  function _activateTab(tab) {
    var loginTab = el('splash-tab-login');
    var regTab   = el('splash-tab-register');
    var loginForm = el('splash-form-login');
    var regForm   = el('splash-form-register');

    if (tab === 'login') {
      loginTab.classList.add('active');
      regTab.classList.remove('active');
      loginTab.setAttribute('aria-selected', 'true');
      regTab.setAttribute('aria-selected', 'false');
      loginForm.hidden = false;
      regForm.hidden   = true;
    } else {
      regTab.classList.add('active');
      loginTab.classList.remove('active');
      regTab.setAttribute('aria-selected', 'true');
      loginTab.setAttribute('aria-selected', 'false');
      regForm.hidden   = false;
      loginForm.hidden = true;
    }
    clearError();
    _setSubmitIdle();
  }

  function _isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function _isValidPhone(phone) {
    /* At least 8 digits (strips non-digit chars for the count). */
    return (phone.replace(/\D/g, '').length >= 8);
  }

  // ─── login submit ─────────────────────

  function _handleLoginSubmit(e) {
    e.preventDefault();
    clearError();

    var email = (el('splash-login-email').value || '').trim().toLowerCase();
    var hp    = (document.querySelector('#splash-form-login [name="company_url"]').value || '');
    var btn   = el('splash-btn-login');

    if (!_isValidEmail(email)) {
      setError('Email non valida.');
      return;
    }

    _setSubmitLoading(btn);

    fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'lookup', email: email, hp: hp }),
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.error) {
          setError(data.error);
          return;
        }
        if (data.exists === true) {
          _dismissSplash(email);
        } else {
          /* Unknown email — switch to registration with email pre-filled. */
          _switchToRegister(email);
          setError('Email non trovata. Compila il modulo di registrazione.');
        }
      })
      .catch(function () {
        setError('Errore di rete. Controlla la connessione e riprova.');
      });
  }

  // ─── registration submit ──────────────

  function _handleRegisterSubmit(e) {
    e.preventDefault();
    clearError();

    var name    = (el('splash-reg-name').value  || '').trim();
    var email   = (el('splash-reg-email').value || '').trim().toLowerCase();
    var phone   = (el('splash-reg-phone').value || '').trim();
    var consent = el('splash-reg-consent').checked;
    var hp      = (document.querySelector('#splash-form-register [name="company_url"]').value || '');
    var btn     = el('splash-btn-register');

    if (!name) {
      setError('Inserisci il tuo nome.');
      return;
    }
    if (!_isValidEmail(email)) {
      setError('Email non valida.');
      return;
    }
    if (!_isValidPhone(phone)) {
      setError('Numero di telefono non valido (minimo 8 cifre).');
      return;
    }
    if (!consent) {
      setError('Devi accettare la privacy policy per continuare.');
      return;
    }

    _setSubmitLoading(btn);

    fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'register',
        email: email,
        name: name,
        phone: phone,
        marketing_consent: consent,
        hp: hp,
      }),
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.error) {
          setError(data.error);
          return;
        }
        /* Success: dismiss splash inside a try so any bootApp() exception
           still leaves the user with a re-enabled form to retry. */
        try {
          _dismissSplash(email);
        } catch (err) {
          setError('Errore inatteso. Ricarica la pagina e riprova.');
        }
      })
      .catch(function () {
        setError('Errore di rete. Controlla la connessione e riprova.');
      });
  }

  // ─── public API ──────────────────────

  function init() {
    /* Show splash overlay; wire tab toggles + form submissions. */

    el('splash-tab-login').addEventListener('click', function () {
      _activateTab('login');
    });

    el('splash-tab-register').addEventListener('click', function () {
      _activateTab('register');
    });

    el('splash-form-login').addEventListener('submit', _handleLoginSubmit);
    el('splash-form-register').addEventListener('submit', _handleRegisterSubmit);
  }

  return { init: init };

}());
