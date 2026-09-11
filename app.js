const SUPABASE_URL = 'https://gzogytnwwmbmkbhrousj.supabase.co';
const SUPABASE_KEY = 'sb_publishable_M5R43WlF407aDZCnIe76Dg_t9qRVwmQ';

const supabase = window.supabase?.createClient(SUPABASE_URL, SUPABASE_KEY);

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
  if (error) { console.error('Produkte konnten nicht geladen werden:', error); return; }
  const grid = document.querySelector('[data-products]');
  if (!grid) return;
  grid.innerHTML = data.map(product => `
    <article class="card">
      <div class="chili">${product.category === 'plant' ? '🌱' : '🌶️'.repeat(Math.max(1, Math.min(3, Math.ceil(product.heat_level / 4))))}</div>
      <h2>${escapeHtml(product.name_de)}</h2>
      <p>${escapeHtml(product.description_de || '')}</p>
      <strong>${(product.price_cents / 100).toFixed(2).replace('.', ',')} €</strong>
      <p>Schärfe: ${'🌶️'.repeat(product.heat_level)} </p>
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
  const logout = document.querySelector('[data-logout]');
  const register = document.querySelector('[data-register]');

  const { data: { session } } = await supabase.auth.getSession();
  if (session) showLoggedIn(session.user);

  form?.addEventListener('submit', async event => {
    event.preventDefault();
    const email = form.email.value.trim();
    const password = form.password.value;
    const mode = form.dataset.mode || 'login';
    const result = mode === 'register'
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });
    if (result.error) return setStatus(result.error.message);
    setStatus(mode === 'register' ? 'Konto erstellt. Prüfe gegebenenfalls deine E-Mail.' : 'Erfolgreich eingeloggt.');
    if (result.data.user) showLoggedIn(result.data.user);
  });

  register?.addEventListener('click', () => {
    form.dataset.mode = form.dataset.mode === 'register' ? 'login' : 'register';
    register.textContent = form.dataset.mode === 'register' ? 'Zur Anmeldung' : 'Konto erstellen';
    document.querySelector('[data-auth-submit]').textContent = form.dataset.mode === 'register' ? 'Registrieren' : 'Einloggen';
  });

  logout?.addEventListener('click', async () => { await supabase.auth.signOut(); location.reload(); });

  async function showLoggedIn(user) {
    form?.classList.add('hidden');
    register?.classList.add('hidden');
    logout?.classList.remove('hidden');
    if (status) status.textContent = `Eingeloggt als ${user.email}`;
    await loadOrders(user.id);
  }

  async function loadOrders(userId) {
    const list = document.querySelector('[data-orders]');
    if (!list) return;
    const { data, error } = await supabase.from('orders').select('id,status,total_cents,created_at').eq('user_id', userId).order('created_at', { ascending: false });
    if (error) return;
    list.innerHTML = data.length ? data.map(order => `<div class="card"><strong>Bestellung ${order.id.slice(0,8)}</strong><p>Status: ${escapeHtml(order.status)}</p><p>${(order.total_cents / 100).toFixed(2).replace('.', ',')} €</p></div>`).join('') : '<p>Noch keine Bestellungen.</p>';
  }

  function setStatus(message) { if (status) status.textContent = message; }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char]));
}

document.addEventListener('DOMContentLoaded', () => {
  renderCartCount();
  loadProducts();
  initAccount();
});
