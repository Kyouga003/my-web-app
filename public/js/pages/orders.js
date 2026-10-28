// Buyer order history + order detail
import { supabase } from '/js/init.js';
import { formatMoney, formatDateTime, escapeHtml } from '/js/ui.js';
import { renderAuthLinks, updateCartCount } from '/js/nav.js';

const params = new URLSearchParams(window.location.search);
const viewId = params.get('id');
const paid = params.get('paid');

const listEl = document.getElementById('orders-list');
const detailEl = document.getElementById('orders-detail');
const loadingEl = document.getElementById('orders-loading');
const requireLoginEl = document.getElementById('orders-require-login');

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
  loadOrders();
});

async function fetchJson(path) {
  const { currentUser } = await import('/js/init.js');
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(path, { headers: session ? { Authorization: 'Bearer ' + session.access_token } : {} });
  if (!res.ok) throw new Error(res.statusText || 'Request failed');
  return res.json();
}

function statusChip(status) {
  const map = { pending_payment: 'status-pending', paid: 'status-paid', processing: 'status-paid', shipped: 'status-shipped', completed: 'status-completed', cancelled: 'status-cancelled', refunded: 'status-cancelled' };
  return '<span class="status-chip ' + map[status] + '">' + status.replace('_', ' ') + '</span>';
}

async function loadOrders() {
  try {
    const rows = await fetchJson('/api/orders');
    loadingEl.style.display = 'none';
    if (paid === '1') showToast('Order placed and payment confirmed.');
    if (rows.length === 0) {
      listEl.innerHTML = '<div class="empty-state"><h2>No orders yet</h2><p><a href="shop.html" class="btn btn-primary">Browse handmade goods</a></p></div>';
      listEl.style.display = 'block';
      return;
    }
    listEl.style.display = 'block';
    listEl.innerHTML = rows.map(o => `
      <div style="border:1px solid var(--border);border-radius:var(--radius);padding:1rem;margin-bottom:1rem;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:1rem">
        <div>
          <div style="font-weight:600">Order #${escapeHtml(o.order_number)}</div>
          <div class="text-secondary" style="font-size:0.85rem">${formatDateTime(o.created_at)}</div>
          ${o.order_items && o.order_items.length ? '<div style="font-size:0.9rem;color:var(--text-secondary);margin-top:0.25rem">' + o.order_items.map(oi => oi.product_name_snapshot + ' ×' + oi.quantity).join(', ') + '</div>' : ''}
        </div>
        <div class="flex" style="align-items:center;gap:0.75rem;flex-wrap:wrap">
          ${statusChip(o.status)}
          <div style="font-weight:700">${formatMoney(o.total_cents, o.currency)}</div>
          <a href="orders.html?id=${o.id}" class="btn btn-sm btn-ghost">View</a>
        </div>
      </div>
    `).join('');
  } catch (err) {
    loadingEl.style.display = 'none';
    listEl.style.display = 'block';
    listEl.innerHTML = '<div class="empty-state"><h2>Unable to load orders</h2><p>' + escapeHtml(err.message) + '</p></div>';
  }
}

async function loadOrderDetail(id) {
  try {
    const o = await fetchJson('/api/orders/' + id);
    loadingEl.style.display = 'none';
    detailEl.style.display = 'block';
    const itemsHtml = (o.order_items || []).map(oi => `
      <tr>
        <td>${escapeHtml(oi.product_name_snapshot)}</td>
        <td>${oi.quantity}</td>
        <td>${formatMoney(oi.price_cents, o.currency)}</td>
        <td>${formatMoney(oi.price_cents * oi.quantity, o.currency)}</td>
      </tr>`).join('');
    let actions = '';
    if (o.status === 'pending_payment' || o.status === 'paid') {
      actions += '<button class="btn btn-sm btn-outline" onclick="cancelOrder(\'' + o.id + '\')">Cancel order</button> ';
    }
    if (o.tracking_number) actions += '<span style="color:var(--text-secondary)">Tracking: ' + escapeHtml(o.tracking_number) + '</span>';
    detailEl.innerHTML = `
      <h2>Order #${escapeHtml(o.order_number)}</h2>
      <p class="text-secondary">${formatDateTime(o.created_at)} · ${statusChip(o.status)}</p>
      <div class="table-wrap"><table><thead><tr><th>Product</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead><tbody>${itemsHtml}</tbody></table></div>
      <div class="flex-between" style="margin-top:1rem"><span>Total</span><span style="font-weight:700">${formatMoney(o.total_cents, o.currency)}</span></div>
      <div style="margin-top:1rem"><h3 style="margin-top:0">Shipping to</h3><p style="margin:0;white-space:pre-wrap">${escapeHtml(JSON.stringify(o.shipping_address, null, 2))}</p></div>
      <div style="margin-top:1.5rem">${actions}</div>
      <p class="form-hint" style="margin-top:1rem">Prices and product names are recorded as they were at the time of purchase.</p>
    `;
  } catch (err) {
    loadingEl.style.display = 'none';
    detailEl.style.display = 'block';
    detailEl.innerHTML = '<div class="empty-state"><h2>Unable to load order</h2><p>' + escapeHtml(err.message) + '</p></div>';
  }
}

window.cancelOrder = async (id) => {
  if (!confirm('Cancel this order? Stock will be restored for available items.')) return;
  try {
    const { data: { session } } = await (await import('/js/init.js')).supabase.auth.getSession();
    const res = await fetch('/api/orders/' + id + '/cancel', {
      method: 'PATCH',
      headers: { 'Authorization': 'Bearer ' + session.access_token }
    });
    if (!res.ok) throw new Error('Cancel failed');
    showToast('Order cancelled.');
    window.location.href = 'orders.html';
  } catch (err) {
    alert(err.message);
  }
};

if (viewId) { loadOrderDetail(viewId); } else { loadOrders(); }
loadDbStatus();
