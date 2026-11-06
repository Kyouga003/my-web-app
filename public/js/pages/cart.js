// Shopping cart (bound to the signed-in user's account)
import { supabase } from '/js/init.js';
import { formatMoney, escapeHtml, showToast } from '/js/ui.js';
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
const contentBox = document.getElementById('cart-content-box');
const sortSelect = document.getElementById('cart-sort');
let cartRows = [];

function cmp(a, b, key, dir) {
  let av = a[key], bv = b[key];
  if (key === 'created_at') { av = av ? new Date(av).getTime() : 0; bv = bv ? new Date(bv).getTime() : 0; }
  if (typeof av === 'string') av = av.toLowerCase();
  if (typeof bv === 'string') bv = bv.toLowerCase();
  if (av == null && bv == null) return 0;
  if (av == null) return 1;
  if (bv == null) return -1;
  return (av < bv ? -1 : av > bv ? 1 : 0) * dir;
}

function sortedCart(rows, mode) {
  const list = rows.map(r => ({
    ...r,
    _name: r.products?.name || '',
    _price: r.products?.price_cents || 0,
    _qty: r.quantity || 0,
    _added: r.created_at || r.id || ''
  }));
  if (mode === 'added-asc') list.sort((a,b)=>cmp(a,b,'_added',1));
  else if (mode === 'alpha-asc') list.sort((a,b)=>cmp(a,b,'_name',1));
  else if (mode === 'alpha-desc') list.sort((a,b)=>cmp(a,b,'_name',-1));
  else if (mode === 'price-asc') list.sort((a,b)=>cmp(a,b,'_price',1));
  else if (mode === 'price-desc') list.sort((a,b)=>cmp(a,b,'_price',-1));
  else if (mode === 'qty-desc') list.sort((a,b)=>cmp(a,b,'_qty',-1));
  else list.sort((a,b)=>cmp(a,b,'_added',-1));
  return list;
}

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
    if (contentBox) contentBox.style.display = 'none';
    summary.style.display = 'none';
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
    return created.id;
  }
  return cart.id;
}

async function loadCart() {
  const { currentUser } = await import('/js/init.js');
  const user = currentUser;
  const cartId = await ensureCart(user.id);
  const { data: items } = await supabase
    .from('cart_items')
    .select('*, products(*, product_images(url, is_main), shops(name))')
    .eq('cart_id', cartId);
  cartRows = items || [];
  renderCart(cartRows);
  if (addOnLoad && cartRows.findIndex((r) => r.product_id === addOnLoad) < 0) {
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
    if (contentBox) contentBox.style.display = 'none';
    updateCartCount(0);
    return;
  }
  emptyEl.style.display = 'none';
  if (contentBox) contentBox.style.display = 'block';
  summary.style.display = 'block';
  const display = sortedCart(rows, sortSelect?.value || 'added-desc');
  let subtotal = 0;
  let html = '<div class="cart-list">';
  display.forEach((r) => {
    const p = r.products || {};
    const imgs = p.product_images || [];
    const img = imgs.find(i => i.is_main) || imgs[0];
    const price = p.price_cents || 0;
    const line = price * (r.quantity || 0);
    subtotal += line;
    const stock = p.quantity == null ? 0 : p.quantity;
    const cur = p.currency || 'USD';
    html += `
      <article class="cart-item-card">
        <div class="cart-item-media">
          <a href="product.html?id=${escapeHtml(p.id || '')}"><img src="${escapeHtml(img ? img.url : '/images/placeholder.svg')}" alt="" onerror="this.src='/images/placeholder.svg'"></a>
        </div>
        <div class="cart-item-body">
          <h3 class="cart-item-title"><a href="product.html?id=${escapeHtml(p.id || '')}">${escapeHtml(p.name || 'Product')}</a></h3>
          <p class="cart-item-meta">by ${escapeHtml(p.shops?.name || 'a maker')}</p>
          ${stock <= 0 ? '<p class="cart-item-meta" style="color:var(--danger);margin-top:0.25rem">Sold out</p>' : ''}
          <div class="cart-item-prices">
            <span>Unit: <strong>${formatMoney(price, cur)}</strong></span>
            <span>Line: <strong>${formatMoney(line, cur)}</strong></span>
          </div>
        </div>
        <div class="cart-item-actions">
          ${stock <= 0 ? '<span class="product-stock out">Unavailable</span>' : `
            <div class="cart-qty-row">
              <label style="font-size:0.8rem;color:var(--text-secondary)">Qty</label>
              <input type="number" value="${r.quantity}" min="1" max="${stock}" data-id="${escapeHtml(r.id)}" class="cart-qty form-input">
            </div>
          `}
          <button class="btn btn-ghost btn-sm" onclick="removeItem('${escapeHtml(String(r.id))}')" style="color:var(--danger)">Remove</button>
        </div>
      </article>`;
  });
  html += '</div>';
  itemsWrap.innerHTML = html;
  itemsWrap.querySelectorAll('.cart-qty').forEach(inp => {
    inp.addEventListener('change', () => window.updateItem(inp.dataset.id, parseInt(inp.value, 10) || 1));
  });
  const currency = (rows[0]?.products?.currency) || 'USD';
  const count = rows.reduce((s, r) => s + (r.quantity || 0), 0);
  subtotalEl.innerHTML = '<span style="color:var(--text-secondary)">Subtotal (' + count + ' item' + (count !== 1 ? 's' : '') + ')</span><strong>' + formatMoney(subtotal, currency) + '</strong>';
  totalEl.innerHTML = '<span style="font-weight:700">Total</span><strong>' + formatMoney(subtotal, currency) + '</strong>';
  updateCartCount(count);
}

if (sortSelect) sortSelect.addEventListener('change', () => renderCart(cartRows));

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
