/* ═══════════════════════════════════════
   NCC Bangla — splash.js
   Mandatory registration gate shown on first visit.
   Calls bootApp() (defined in app.js) on success.
   ═══════════════════════════════════════ */

'use strict';

/* Replace these two placeholders when deploying — see Backend task. */
var EDGE_FUNCTION_URL = '__EDGE_FUNCTION_URL__';   /* ← wire after Edge Function deploy */
var TURNSTILE_SITE_KEY = '__TURNSTILE_SITE_KEY__'; /* ← wire after Cloudflare Turnstile setup */

var splash = (function () {

  // ─── private helpers ─────────────────

  function el(id) { return document.getElementById(id); }

  function setError(msg) {
    var errorEl = el('splash-error');
    errorEl.textContent = '';
    errorEl.hidden = false;

    var msgNode = document.createElement('span');
    msgNode.textContent = msg;
    errorEl.appendChild(msgNode);

    var retryBtn = document.createElement('button');
    retryBtn.className = 'btn btn-ghost btn-sm splash-retry-btn';
    retryBtn.textContent = 'Riprova';
    retryBtn.addEventListener('click', function () {
      errorEl.hidden = true;
      _setSubmitIdle();
    });
    errorEl.appendChild(retryBtn);
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
    try {
      localStorage.setItem('ncc_registered', 'true');
      localStorage.setItem('ncc_email', email);
    } catch (e) {
      /* localStorage unavailable — proceed anyway, user will see splash again next visit */
    }
    el('splash-overlay').hidden = true;
    el('app-shell').hidden = false;
    bootApp();
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
    var errorEl   = el('splash-error');

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
    if (errorEl) errorEl.hidden = true;
  }

  function _getTurnstileToken() {
    /* Returns the Turnstile response token, or empty string if widget not loaded. */
    var resp = document.querySelector('.cf-turnstile [name="cf-turnstile-response"]');
    return resp ? resp.value : '';
  }

  function _resetTurnstile() {
    if (window.turnstile && typeof window.turnstile.reset === 'function') {
      window.turnstile.reset();
    }
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
    var errorEl = el('splash-error');
    errorEl.hidden = true;

    var email = (el('splash-login-email').value || '').trim().toLowerCase();
    var hp    = (document.querySelector('#splash-form-login [name="company_url"]').value || '');
    var token = _getTurnstileToken();
    var btn   = el('splash-btn-login');

    if (!_isValidEmail(email)) {
      setError('Email non valida.');
      return;
    }

    _setSubmitLoading(btn);

    fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'lookup', email: email, turnstile_token: token, hp: hp }),
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.error) {
          setError(data.error);
          _resetTurnstile();
          return;
        }
        if (data.exists === true) {
          _dismissSplash(email);
        } else {
          /* Unknown email — switch to registration with email pre-filled. */
          _setSubmitIdle();
          _switchToRegister(email);
          setError('Email non trovata. Compila il modulo di registrazione.');
        }
      })
      .catch(function () {
        setError('Errore di rete. Controlla la connessione e riprova.');
        _resetTurnstile();
      });
  }

  // ─── registration submit ──────────────

  function _handleRegisterSubmit(e) {
    e.preventDefault();
    var errorEl = el('splash-error');
    errorEl.hidden = true;

    var name    = (el('splash-reg-name').value  || '').trim();
    var email   = (el('splash-reg-email').value || '').trim().toLowerCase();
    var phone   = (el('splash-reg-phone').value || '').trim();
    var consent = el('splash-reg-consent').checked;
    var hp      = (document.querySelector('#splash-form-register [name="company_url"]').value || '');
    var token   = _getTurnstileToken();
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
        turnstile_token: token,
        hp: hp,
      }),
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.error) {
          setError(data.error);
          _resetTurnstile();
          return;
        }
        _dismissSplash(email);
      })
      .catch(function () {
        setError('Errore di rete. Controlla la connessione e riprova.');
        _resetTurnstile();
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

    /* Render Turnstile widget if the API has loaded; else it self-renders via data-sitekey. */
    if (window.turnstile && typeof window.turnstile.render === 'function') {
      var container = document.querySelector('.cf-turnstile');
      if (container && !container.dataset.rendered) {
        window.turnstile.render(container, { sitekey: TURNSTILE_SITE_KEY });
        container.dataset.rendered = '1';
      }
    }
  }

  return { init: init };

}());
