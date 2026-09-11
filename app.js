const SUPABASE_URL = 'https://gzogytnwwmbmkbhrousj.supabase.co';
const SUPABASE_KEY = 'sb_publishable_M5R43WlF407aDZCnIe76Dg_t9qRVwmQ';

let supabase = null;

async function createSupabaseClient() {
  try {
    const module = await import('https://esm.sh/@supabase/supabase-js@2.57.4?bundle');
    return module.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
  } catch (firstError) {
    console.warn('Primärer Supabase-Loader fehlgeschlagen:', firstError);
    const module = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm');
    return module.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
  }
}

async function startBurnLabBackend() {
  try {
    supabase = await createSupabaseClient();
    renderCartCount();
    await loadProducts();
    await initAccount();
    await initAdmin();
  } catch (error) {
    console.error('BurnLab Backend konnte nicht geladen werden:', error);
    setGlobalError(`Backend konnte nicht geladen werden: ${error?.message || 'Unbekannter Fehler'}`);
  }
}

function getCart() {
  try { return JSON.parse(localStorage.getItem('burnlab_cart') || '[]'); }
  catch { return []; }
}

function saveCart(cart) {
  localStorage.setItem('burnlab_cart', JSON.stringify(cart));
  renderCartCount();
}

function addToCart(product) {
  const cart = getCart();
  const existing = cart.find(item => item.id === product.id);
  if (existing) existing.quantity += 1;
  else cart.push({ id: product.id, name: product.name_de, price_cents: product.price_cents, quantity: 1 });
  saveCart(cart);
  alert(`${product.name_de} wurde in den Warenkorb gelegt.`);
}

function renderCartCount() {
  const count = getCart().reduce((sum, item) => sum + item.quantity, 0);
  document.querySelectorAll('[data-cart-count]').forEach(el => el.textContent = count);
}

async function loadProducts() {
  if (!supabase) return;
  const { data, error } = await supabase.from('products').select('*').eq('active', true).order('created_at');
  if (error) {
    console.error('Produkte konnten nicht geladen werden:', error);
    return;
  }
  const grid = document.querySelector('[data-products]');
  if (!grid) return;
  grid.innerHTML = data.map(product => `
    <article class="card">
      <div class="chili">${product.category === 'plant' ? '🌱' : '🌶️'.repeat(Math.max(1, Math.min(3, Math.ceil(product.heat_level / 4))))}</div>
      <h2>${escapeHtml(product.name_de)}</h2>
      <p>${escapeHtml(product.description_de || '')}</p>
      <strong>${(product.price_cents / 100).toFixed(2).replace('.', ',')} €</strong>
      <p>Schärfe: ${'🌶️'.repeat(product.heat_level)}</p>
      <button data-add-product="${product.id}">In den Warenkorb</button>
    </article>`).join('');
  grid.querySelectorAll('[data-add-product]').forEach(button => {
    button.addEventListener('click', () => {
      const product = data.find(p => p.id === button.dataset.addProduct);
      if (product) addToCart(product);
    });
  });
}

async function initAccount() {
  if (!supabase) return;
  const status = document.querySelector('[data-account-status]');
  const form = document.querySelector('[data-auth-form]');
  const submit = document.querySelector('[data-auth-submit]');
  const logout = document.querySelector('[data-logout]');
  const register = document.querySelector('[data-register]');
  if (!form) return;

  const setStatus = message => { if (status) status.textContent = message; };
  const setBusy = busy => {
    if (!submit) return;
    submit.disabled = busy;
    submit.textContent = busy ? (form.dataset.mode === 'register' ? 'Registriere …' : 'Melde an …') : (form.dataset.mode === 'register' ? 'Registrieren' : 'Einloggen');
  };

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    console.error('Session konnte nicht geladen werden:', sessionError);
    setStatus(`Session-Fehler: ${sessionError.message}`);
  } else if (sessionData?.session?.user) {
    showLoggedIn(sessionData.session.user);
  }

  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && session?.user) showLoggedIn(session.user);
    if (event === 'SIGNED_OUT') showLoggedOut();
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const email = form.email.value.trim().toLowerCase();
    const password = form.password.value;
    const mode = form.dataset.mode || 'login';
    if (!email || !password) return setStatus('Bitte E-Mail-Adresse und Passwort eingeben.');
    if (password.length < 6) return setStatus('Das Passwort muss mindestens 6 Zeichen lang sein.');
    setBusy(true);
    setStatus(mode === 'register' ? 'Konto wird erstellt …' : 'Anmeldung wird geprüft …');
    try {
      const result = mode === 'register'
        ? await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/account.html` } })
        : await supabase.auth.signInWithPassword({ email, password });
      if (result.error) {
        console.error('Supabase Auth Fehler:', result.error);
        setStatus(authErrorMessage(result.error));
        return;
      }
      if (mode === 'register') {
        if (result.data.session && result.data.user) {
          setStatus('Konto erstellt und erfolgreich eingeloggt.');
          showLoggedIn(result.data.user);
        } else {
          setStatus('Konto erstellt. Falls E-Mail-Bestätigung aktiviert ist, bestätige die E-Mail und logge dich danach ein.');
        }
      } else if (result.data.session && result.data.user) {
        setStatus('Erfolgreich eingeloggt.');
        showLoggedIn(result.data.user);
      } else {
        setStatus('Login abgeschlossen, aber keine Sitzung wurde erstellt.');
      }
    } catch (error) {
      console.error('Unerwarteter Auth-Fehler:', error);
      setStatus(`Login/Registrierung fehlgeschlagen: ${error?.message || 'Unbekannter Fehler'}`);
    } finally { setBusy(false); }
  });

  register?.addEventListener('click', () => {
    const nextMode = form.dataset.mode === 'register' ? 'login' : 'register';
    form.dataset.mode = nextMode;
    register.textContent = nextMode === 'register' ? 'Zur Anmeldung' : 'Konto erstellen';
    if (submit) submit.textContent = nextMode === 'register' ? 'Registrieren' : 'Einloggen';
    setStatus(nextMode === 'register' ? 'Neues Konto erstellen.' : 'Mit deinem BurnLab-Konto anmelden.');
  });

  logout?.addEventListener('click', async () => {
    const { error } = await supabase.auth.signOut();
    if (error) return setStatus(authErrorMessage(error));
    showLoggedOut();
  });

  function showLoggedIn(user) {
    form.classList.add('hidden'); register?.classList.add('hidden'); logout?.classList.remove('hidden');
    setStatus(`Eingeloggt als ${user.email}`); loadOrders(user.id);
  }
  function showLoggedOut() {
    form.classList.remove('hidden'); register?.classList.remove('hidden'); logout?.classList.add('hidden');
    setStatus('Bitte einloggen oder ein Konto erstellen.'); form.reset();
  }
  async function loadOrders(userId) {
    const list = document.querySelector('[data-orders]');
    if (!list) return;
    const { data, error } = await supabase.from('orders').select('id,status,total_cents,created_at').eq('user_id', userId).order('created_at', { ascending: false });
    if (error) { list.innerHTML = '<p>Bestellungen konnten nicht geladen werden.</p>'; return; }
    list.innerHTML = data.length ? data.map(order => `<div class="card"><strong>Bestellung ${escapeHtml(order.id.slice(0, 8))}</strong><p>Status: ${escapeHtml(order.status)}</p><p>${(order.total_cents / 100).toFixed(2).replace('.', ',')} €</p></div>`).join('') : '<p>Noch keine Bestellungen.</p>';
  }
}

async function initAdmin() {
  const form = document.querySelector('[data-admin-form]');
  if (!form || !supabase) return;
  const status = document.querySelector('[data-admin-status]');
  const panel = document.querySelector('[data-admin-panel]');
  const logout = document.querySelector('[data-admin-logout]');
  const setStatus = message => { if (status) status.textContent = message; };

  const checkAdmin = async user => {
    if (!user) return false;
    const { data, error } = await supabase.from('profiles').select('is_admin').eq('id', user.id).maybeSingle();
    if (error) { console.error('Adminprüfung fehlgeschlagen:', error); setStatus(`Adminprüfung fehlgeschlagen: ${error.message}`); return false; }
    if (!data?.is_admin) { setStatus('Dieser Account hat keinen Admin-Zugriff.'); return false; }
    form.classList.add('hidden'); panel?.classList.remove('hidden'); logout?.classList.remove('hidden'); setStatus(`Admin-Zugriff aktiv für ${user.email}`); return true;
  };

  const { data } = await supabase.auth.getSession();
  if (data.session?.user) await checkAdmin(data.session.user);

  supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session?.user) await checkAdmin(session.user);
    if (event === 'SIGNED_OUT') { form.classList.remove('hidden'); panel?.classList.add('hidden'); logout?.classList.add('hidden'); setStatus('Bitte als Admin einloggen.'); }
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const email = form.email.value.trim().toLowerCase();
    const password = form.password.value;
    setStatus('Admin-Login wird geprüft …');
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setStatus(authErrorMessage(error)); return; }
    if (!(await checkAdmin(data.user))) { await supabase.auth.signOut(); }
  });

  logout?.addEventListener('click', async () => { await supabase.auth.signOut(); });
}

function authErrorMessage(error) {
  const message = String(error?.message || '').toLowerCase();
  if (message.includes('invalid login credentials')) return 'E-Mail oder Passwort ist falsch.';
  if (message.includes('email not confirmed')) return 'Bitte bestätige zuerst deine E-Mail-Adresse.';
  if (message.includes('user already registered')) return 'Diese E-Mail ist bereits registriert. Bitte einloggen.';
  if (message.includes('password should be at least')) return 'Das Passwort muss mindestens 6 Zeichen lang sein.';
  if (message.includes('rate limit')) return 'Zu viele Versuche. Bitte kurz warten und erneut versuchen.';
  if (message.includes('network') || message.includes('fetch')) return 'Keine Verbindung zu Supabase. Bitte Internetverbindung prüfen.';
  return error?.message || 'Authentifizierung fehlgeschlagen.';
}

function setGlobalError(message) {
  document.querySelectorAll('[data-account-status], [data-admin-status]').forEach(el => { el.textContent = message; });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char]));
}

document.addEventListener('DOMContentLoaded', () => {
  renderCartCount();
  startBurnLabBackend();
});
