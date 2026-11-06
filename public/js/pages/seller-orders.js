// Seller order management � sellers see only their own order items.
import { supabase } from '/js/init.js';
import { formatMoney, formatDateTime, escapeHtml, showToast, openModal, closeModal } from '/js/ui.js';
import { renderAuthLinks, updateCartCount } from '/js/nav.js';

const requireAuthEl = document.getElementById('seller-orders-require-auth');
const wrap = document.getElementById('seller-orders-wrap');
const loadingEl = document.getElementById('orders-loading');
const tableWrap = document.getElementById('orders-table-wrap');
const shipModal = document.getElementById('ship-modal');
const contentBox = document.getElementById('orders-content-box');
const sortSelect = document.getElementById('seller-orders-sort');
let orderRows = [];
let meId = null;

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
  const prof = currentUser ? await supabase.from('profiles').select('role').eq('id', currentUser.id).single() : null;
  renderAuthLinks(currentUser, prof && prof.data);
  if (!currentUser) {
    requireAuthEl.style.display = 'block';
    updateCartCount(0);
    return;
  }
  requireAuthEl.style.display = 'none';
  const role = prof.data.role;
  updateCartCount(0);
  if (role !== 'seller' && role !== 'admin') {
    wrap.innerHTML = '<div class="empty-state"><h2>Only sellers can manage orders.</h2><a href="seller-dashboard.html" class="btn btn-primary">Back to dashboard</a></div>';
    wrap.style.display = 'block';
    return;
  }
  wrap.style.display = 'block';
  loadOrders();
});

async function getMe() {
  const { data } = await supabase.auth.getUser();
  return data.user;
}

function renderSellerOrders() {
  const rows = sortedOrders(orderRows, sortSelect?.value || 'date-desc');
  if (!rows.length) {
    if (contentBox) contentBox.style.display = 'none';
    tableWrap.innerHTML = '<div class="empty-state"><h2>No orders yet.</h2><p>Orders will appear here once customers buy from your shop.</p></div>';
    tableWrap.style.display = 'block';
    return;
  }
  if (contentBox) contentBox.style.display = 'block';
  tableWrap.style.display = 'block';
  let html = '<table><thead><tr><th>Order</th><th>Product</th><th>Qty</th><th>Buyer</th><th>Method</th><th>Date</th><th>Payment</th><th>Fulfilment</th><th>Actions</th></tr></thead><tbody>';
  rows.forEach((o) => {
    const mine = (o.order_items || []).filter((oi) => oi.seller_id === meId);
    const canShip = o.status === 'paid' || o.status === 'processing';
    const buyer = (o.shipping_address && o.shipping_address.name) ? escapeHtml(o.shipping_address.name) : '�';
    html += `
      <tr>
        <td style="font-weight:600">#${escapeHtml(String(o.order_number || ''))}</td>
        <td>${(mine.map((oi) => escapeHtml(oi.product_name_snapshot) + ' ×' + oi.quantity).join('<br>') || '�')}</td>
        <td>${mine.reduce((s, oi) => s + oi.quantity, 0)}</td>
        <td>${buyer}</td>
        <td>${escapeHtml(o.delivery_method || 'standard')}</td>
        <td>${formatDateTime(o.created_at)}</td>
        <td>${formatMoney(o.total_cents, o.currency)}</td>
        <td>${statusChip(o.status)}</td>
        <td>
          ${canShip ? '<button class="btn btn-sm btn-primary" onclick="shipOrder(\'' + o.id + '\')">Ship order</button>' : ''}
          ${o.tracking_number ? '<span class="text-secondary" style="font-size:0.8rem;display:block;margin-top:0.25rem">Tracking set</span>' : ''}
        </td>
      </tr>`;
  });
  html += '</tbody></table>';
  tableWrap.innerHTML = html;
}

async function loadOrders() {
  loadingEl.style.display = 'none';
  if (tableWrap) tableWrap.innerHTML = '<div class="loading-state" style="text-align:center"><div class="skeleton-lg"></div></div>';
  try {
    const { data } = await supabase.from('orders').select('*, order_items(*)').order('created_at', { ascending: false });
    const me = await getMe();
    meId = me?.id;
    orderRows = (data || []).filter((o) => (o.order_items || []).some((oi) => oi.seller_id === meId));
    renderSellerOrders();
  } catch (err) {
    if (contentBox) contentBox.style.display = 'none';
    tableWrap.innerHTML = '<div class="empty-state"><h2>Unable to load orders</h2><p>' + escapeHtml(err.message) + '</p></div>';
  }
}

function statusChip(status) {
  const map = { pending_payment: 'status-pending', paid: 'status-paid', processing: 'status-paid', shipped: 'status-shipped', completed: 'status-completed', cancelled: 'status-cancelled', refunded: 'status-cancelled' };
  return '<span class="status-chip ' + (map[status] || 'status-pending') + '">' + String(status || '').replace('_', ' ') + '</span>';
}

window.shipOrder = async (orderId) => {
  const { data: order } = await supabase.from('orders').select('*, buyer_id').eq('id', orderId).single();
  if (!order) return;
  document.getElementById('ship-tracking').value = order.tracking_number || '';
  document.getElementById('ship-form').dataset.orderId = orderId;
  openModal(shipModal);
};

document.getElementById('ship-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const orderId = document.getElementById('ship-form').dataset.orderId;
  const { data: order } = await supabase.from('orders').select('status').eq('id', orderId).single();
  if (order.status !== 'paid' && order.status !== 'processing') {
    alert('This order is not ready to ship.');
    return;
  }
  const { error } = await supabase.from('orders').update({
    tracking_number: document.getElementById('ship-tracking').value.trim(),
    status: 'shipped'
  }).eq('id', orderId);
  if (error) return alert('Failed: ' + error.message);
  showToast('Order marked as shipped.');
  closeModal(shipModal);
  loadOrders();
});

const shipModalClose = document.getElementById('ship-modal-close');
if (shipModalClose) shipModalClose.addEventListener('click', () => closeModal(shipModal));
document.getElementById('ship-cancel').addEventListener('click', () => closeModal(shipModal));
shipModal.addEventListener('click', (e) => { if (e.target === shipModal) closeModal(shipModal); });
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(shipModal); });
if (sortSelect) sortSelect.addEventListener('change', renderSellerOrders);

loadDbStatus();
