// Buyer order history + order detail
import { supabase } from '/js/init.js';
import { formatMoney, formatDateTime, escapeHtml, showToast } from '/js/ui.js';
import { renderAuthLinks, updateCartCount } from '/js/nav.js';

const params = new URLSearchParams(window.location.search);
const viewId = params.get('id');
const paid = params.get('paid');

const listEl = document.getElementById('orders-list');
const detailEl = document.getElementById('orders-detail');
const loadingEl = document.getElementById('orders-loading');
const requireLoginEl = document.getElementById('orders-require-login');
const contentBox = document.getElementById('orders-content-box');
const sortSelect = document.getElementById('orders-sort');
let orderRows = [];

function cmp(a,b,key,dir){ let av=a[key],bv=b[key]; if(key==='created_at'){ av=av?new Date(av).getTime():0; bv=bv?new Date(bv).getTime():0; } if(typeof av==='string') av=String(av).toLowerCase(); if(typeof bv==='string') bv=String(bv).toLowerCase(); if(av==null&&bv==null) return 0; if(av==null) return 1; if(bv==null) return -1; return (av<bv?-1:av>bv?1:0)*dir; }
function sortedOrders(rows, mode) {
  const list = rows.slice();
  if (mode==='date-asc') list.sort((a,b)=>cmp(a,b,'created_at',1));
  else if (mode==='total-desc') list.sort((a,b)=>cmp(a,b,'total_cents',-1));
  else if (mode==='total-asc') list.sort((a,b)=>cmp(a,b,'total_cents',1));
  else if (mode==='alpha-asc') list.sort((a,b)=>cmp(a,b,'order_number',1));
  else if (mode==='alpha-desc') list.sort((a,b)=>cmp(a,b,'order_number',-1));
  else list.sort((a,b)=>cmp(a,b,'created_at',-1));
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
    updateCartCount(0);
    return;
  }
  requireLoginEl.style.display = 'none';
  if (!viewId) loadOrders();
});

async function fetchJson(path) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(path, { headers: session ? { Authorization: 'Bearer ' + session.access_token } : {} });
  if (!res.ok) throw new Error(res.statusText || 'Request failed');
  return res.json();
}

function statusChip(status) {
  const map = { pending_payment: 'status-pending', paid: 'status-paid', processing: 'status-paid', shipped: 'status-shipped', completed: 'status-completed', cancelled: 'status-cancelled', refunded: 'status-cancelled' };
  return '<span class="status-chip ' + (map[status] || 'status-pending') + '">' + String(status || '').replace('_', ' ') + '</span>';
}

function renderOrderList() {
  const rows = sortedOrders(orderRows, sortSelect?.value || 'date-desc');
  if (rows.length === 0) {
    if (contentBox) contentBox.style.display = 'none';
    listEl.innerHTML = '<div class="empty-state"><h2>No orders yet</h2><p><a href="shop.html" class="btn btn-primary">Browse handmade goods</a></p></div>';
    listEl.style.display = 'block';
    return;
  }
  if (contentBox) contentBox.style.display = 'block';
  listEl.style.display = 'block';
  listEl.innerHTML = rows.map(o => `
    <article class="order-card">
      <div class="flex-between" style="flex-wrap:wrap;gap:1rem">
        <div>
          <div style="font-weight:700">Order #${escapeHtml(String(o.order_number || ''))}</div>
          <div class="text-secondary" style="font-size:0.875rem">${formatDateTime(o.created_at)}</div>
          ${o.order_items && o.order_items.length ? '<div style="font-size:0.9rem;color:var(--text-secondary);margin-top:0.35rem">' + o.order_items.map(oi => escapeHtml(oi.product_name_snapshot) + ' ×' + oi.quantity).join(', ') + '</div>' : ''}
        </div>
        <div class="flex" style="align-items:center;gap:0.75rem;flex-wrap:wrap">
          ${statusChip(o.status)}
          <div style="font-weight:700">${formatMoney(o.total_cents, o.currency)}</div>
          <a href="orders.html?id=${o.id}" class="btn btn-sm btn-ghost">View</a>
        </div>
      </div>
    </article>
  `).join('');
}

async function loadOrders() {
  try {
    const rows = await fetchJson('/api/orders');
    loadingEl.style.display = 'none';
    if (paid === '1') showToast('Order placed and payment confirmed.');
    orderRows = rows || [];
    renderOrderList();
  } catch (err) {
    loadingEl.style.display = 'none';
    if (contentBox) contentBox.style.display = 'none';
    listEl.style.display = 'block';
    listEl.innerHTML = '<div class="empty-state"><h2>Unable to load orders</h2><p>' + escapeHtml(err.message) + '</p></div>';
  }
}

async function loadOrderDetail(id) {
  try {
    const o = await fetchJson('/api/orders/' + id);
    loadingEl.style.display = 'none';
    if (contentBox) contentBox.style.display = 'none';
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
      <h2 style="margin-top:0">Order #${escapeHtml(String(o.order_number || ''))}</h2>
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
    const { data: { session } } = await supabase.auth.getSession();
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

if (sortSelect) sortSelect.addEventListener('change', renderOrderList);
if (viewId) { loadOrderDetail(viewId); } else { /* list loads on authstate */ }
loadDbStatus();
