// Checkout — sandbox payment flow (no live provider configured)
import { supabase } from '/js/init.js';
import { formatMoney, escapeHtml, showToast, showError } from '/js/ui.js';
import { renderAuthLinks, updateCartCount } from '/js/nav.js';

const form = document.getElementById('checkout-form');
const submitBtn = document.getElementById('checkout-submit');
const itemsEl = document.getElementById('checkout-items');
const totalEl = document.getElementById('checkout-total');
const errorEl = document.getElementById('checkout-error');
const requireLoginEl = document.getElementById('checkout-require-login');
const loadingEl = document.getElementById('checkout-loading');
const formWrap = document.getElementById('checkout-form-wrap');
const emptyEl = document.getElementById('checkout-empty');

function showSetup(message) {
  const b = document.getElementById('setup-banner');
  b.innerHTML = '<strong>Setup needed:</strong> ' + escapeHtml(message) + ' Run <code>schema.sql</code> in your Supabase SQL Editor to enable the marketplace.';
  b.style.display = 'block';
}

async function loadDbStatus() {
  try {
    const res = await fetch('/api/db/status');
    const status = await res.json();
    const missing = Object.entries(status).filter(([, v]) => !v.exists).map(([k]) => k);
    if (missing.length) showSetup('Database tables not found: ' + missing.join(', '));
  } catch (_) {}
}

window.addEventListener('authstate', async () => {
  const { currentUser } = await import('/js/init.js');
  const prof = currentUser ? await supabase.from('profiles').select('role,display_name').eq('id', currentUser.id).maybeSingle() : null;
  renderAuthLinks(currentUser, prof && prof.data);
  if (!currentUser) {
    requireLoginEl.style.display = 'block';
    loadingEl.style.display = 'none';
    return;
  }
  requireLoginEl.style.display = 'none';
  loadCart();
});

async function ensureCart(userId) {
  let { data: cart } = await supabase.from('carts').select('id').eq('user_id', userId).maybeSingle();
  if (!cart) {
    const { data: created } = await supabase.from('carts').insert([{ user_id: userId }]).select().single();
    cart = created;
  }
  return cart.id;
}

async function loadCart() {
  const { currentUser } = await import('/js/init.js');
  const cartId = await ensureCart(currentUser.id);
  const { data: items } = await supabase
    .from('cart_items')
    .select('*, products(price_cents, currency, name, quantity, status)')
    .eq('cart_id', cartId);
  const rows = items || [];
  loadingEl.style.display = 'none';
  if (rows.length === 0) {
    emptyEl.style.display = 'block';
    formWrap.style.display = 'none';
    return;
  }
  formWrap.style.display = 'block';
  let total = 0;
  let html = '';
  rows.forEach(r => {
    const p = r.products;
    if (p.status !== 'published' || (p.quantity || 0) < r.quantity) {
      html += '<div style="color:var(--danger);font-size:0.9rem">' + escapeHtml(p.name) + ' is no longer available. Please update your cart.</div>';
      return;
    }
    total += p.price_cents * r.quantity;
    html += '<div class="flex" style="justify-content:space-between;margin-bottom:0.5rem;font-size:0.9rem">' +
      '<span>' + escapeHtml(p.name) + ' ×' + r.quantity + '</span>' +
      '<span>' + formatMoney(p.price_cents * r.quantity, p.currency) + '</span></div>';
  });
  itemsEl.innerHTML = html;
  totalEl.textContent = formatMoney(total, rows[0]?.products.currency || 'USD');
  window.checkoutTotal = total;
  window.checkoutItems = rows.filter(r => { const p = r.products; return p.status === 'published' && (p.quantity || 0) >= r.quantity; });
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorEl.style.display = 'none';
  const shipping_address = {
    name: document.getElementById('ship-name').value.trim(),
    email: document.getElementById('ship-email').value.trim(),
    address: document.getElementById('ship-address').value.trim(),
    city: document.getElementById('ship-city').value.trim(),
    postal: document.getElementById('ship-postal').value.trim(),
    country: document.getElementById('ship-country').value
  };
  if (!shipping_address.name || !shipping_address.email || !shipping_address.address || !shipping_address.city || !shipping_address.postal) {
    return showError(form, 'ship-name', 'Please fill in all shipping details.');
  }
  const items = window.checkoutItems || [];
  const total = window.checkoutTotal || 0;
  if (!items.length) return;

  submitBtn.disabled = true;
  submitBtn.textContent = 'Processing…';

  const { data: intent, error: ie } = await fetchJson('/api/payments/create-intent', { amount_cents: total });
  if (ie) { submitBtn.disabled = false; submitBtn.textContent = 'Continue to payment'; errorEl.textContent = ie; errorEl.style.display = 'block'; return; }

  const orderItems = items.map(i => ({ product_id: i.product_id, quantity: i.quantity }));
  const { data: orderRes, error: oe } = await fetchJson('/api/orders', {
    items: orderItems,
    shipping_address,
    delivery_method: 'standard',
    payment_intent_id: intent.intent_id
  });
  if (oe) {
    submitBtn.disabled = false; submitBtn.textContent = 'Continue to payment';
    errorEl.textContent = oe.error || oe.message || 'Order could not be placed.';
    errorEl.style.display = 'block';
    return;
  }

  const { data: payRes, error: pe } = await fetchJson('/api/payments/confirm', { intent_id: intent.intent_id });
  if (pe) {
    submitBtn.disabled = false; submitBtn.textContent = 'Continue to payment';
    errorEl.textContent = pe.error || pe.message;
    errorEl.style.display = 'block';
    return;
  }

  showToast('Order placed successfully.');
  window.location.href = 'orders.html?id=' + orderRes.order.id + '&paid=1';
});

async function fetchJson(path, body) {
  const { currentUser } = await import('/js/init.js');
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: session ? 'Bearer ' + session.access_token : '' },
    body: JSON.stringify(body)
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return { error: json.error || json.message || 'Request failed (' + res.status + ')' };
  return { data: json };
}

loadDbStatus();
loadCart();
