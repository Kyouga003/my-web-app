// Shopping cart (bound to the signed-in user's account)
import { supabase } from '/js/init.js';
import { formatMoney, escapeHtml } from '/js/ui.js';
import { renderAuthLinks, updateCartCount } from '/js/nav.js';

const params = new URLSearchParams(window.location.search);
const addOnLoad = params.get('add');

const itemsWrap = document.getElementById('cart-items-wrap');
const summary = document.getElementById('cart-summary');
const emptyEl = document.getElementById('cart-empty');
const loadingEl = document.getElementById('cart-loading');
const requireLoginEl = document.getElementById('cart-require-login');
const subtotalEl = document.getElementById('cart-subtotal');
const totalEl = document.getElementById('cart-total');

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
    updateCartCount(0);
    return;
  }
  requireLoginEl.style.display = 'none';
  loadCart();
});

async function ensureCart(userId) {
  let { data: cart } = await supabase.from('carts').select('id').eq('user_id', userId).maybeSingle();
  if (!cart) {
    const { data: created } = await supabase.from('carts').insert([{ user_id: userId }]).select().single();
async function loadCart() {
  const { currentUser } = await import('/js/init.js');
  const user = currentUser;
  const cartId = await ensureCart(user.id);
  const { data: items } = await supabase
    .from('cart_items')
    .select('*, products(*, product_images(url, is_main), shops(name))')
    .eq('cart_id', cartId);
  const rows = items || [];
  renderCart(rows);
  if (addOnLoad && rows.findIndex(r => r.product_id === addOnLoad) < 0) {
    const { data: prod } = await supabase.from('products').select('quantity,status').eq('id', addOnLoad).single();
    if (prod && prod.status === 'published' && (prod.quantity || 0) > 0) {
      await supabase.from('cart_items').insert([{ cart_id: cartId, product_id: addOnLoad, quantity: 1 }]);
      window.history.replaceState(null, '', '/cart.html');
      showToast('Added to cart.');
      loadCart();
    }
  }
}

function renderCart(rows) {
  loadingEl.style.display = 'none';
  if (rows.length === 0) {
    emptyEl.style.display = 'block';
    summary.style.display = 'none';
    itemsWrap.style.display = 'none';
    updateCartCount(0);
    return;
  }
  emptyEl.style.display = 'none';
  itemsWrap.style.display = 'block';
  summary.style.display = 'block';
  let subtotal = 0;
  let html = '<div class="table-wrap"><table><thead><tr><th style="width:44%">Product</th><th style="width:14%">Price</th><th style="width:14%">Qty</th><th style="width:14%">Subtotal</th><th style="width:14%"></th></tr></thead><tbody>';
  rows.forEach(r => {
    const p = r.products;
    const img = (p.product_images || [])[0];
    const price = p.price_cents;
    const line = price * r.quantity;
    subtotal += line;
    const stock = p.quantity == null ? 0 : p.quantity;
    html += `
      <tr>
        <td>
          <div class="flex" style="align-items:center">
            <img src="${escapeHtml(img ? img.url : '/images/placeholder.svg')}" alt="" style="width:72px;height:92px;object-fit:cover;border-radius:var(--radius);border:1px solid var(--border)">
            <div>
              <div style="font-weight:600">${escapeHtml(p.name)}</div>
              <div class="text-secondary" style="font-size:0.85rem">by ${escapeHtml(p.shops?.name || 'a maker')}</div>
              ${stock <= 0 ? '<div class="product-stock out" style="font-size:0.8rem">Sold out</div>' : ''}
            </div>
          </div>
        </td>
        <td>${formatMoney(price, p.currency)}</td>
        <td>
          ${stock <= 0 ? '<span class="product-stock out">—</span>' : `
            <input type="number" value="${r.quantity}" min="1" max="${stock}" data-id="${r.id}" class="cart-qty form-input" style="width:70px">
            <button class="btn-ghost btn-sm" onclick="updateItem('${r.id}', ${r.quantity - 1})" ${r.quantity <= 1 ? 'disabled' : ''}>&minus;</button>
            <button class="btn-ghost btn-sm" onclick="updateItem('${r.id}', ${r.quantity + 1})" ${stock <= r.quantity ? 'disabled' : ''}>&plus;</button>
          `}
        </td>
        <td>${formatMoney(line, p.currency)}</td>
        <td><button class="btn-ghost btn-sm" onclick="removeItem('${r.id}')" style="color:var(--danger)">Remove</button></td>
      </tr>`;
  });
  html += '</tbody></table></div>';
  itemsWrap.innerHTML = html;
  subtotalEl.textContent = formatMoney(subtotal, rows[0].products.currency || 'USD');
  totalEl.textContent = formatMoney(subtotal, rows[0].products.currency || 'USD');
  updateCartCount(rows.reduce((s, r) => s + r.quantity, 0));
}

window.updateItem = async (itemId, qty) => {
  if (qty < 1) { removeItem(itemId); return; }
  await supabase.from('cart_items').update({ quantity: qty }).eq('id', itemId);
  loadCart();
};

window.removeItem = async (itemId) => {
  await supabase.from('cart_items').delete().eq('id', itemId);
  loadCart();
};

loadDbStatus();
loadCart();

    cart = created;
  }
  return cart.id;
}
