// Seller order management
import { supabase } from '/js/init.js';
import { formatMoney, formatDateTime, escapeHtml, showToast } from '/js/ui.js';
import { renderAuthLinks, updateCartCount } from '/js/nav.js';

const requireAuthEl = document.getElementById('seller-orders-require-auth');
const wrap = document.getElementById('seller-orders-wrap');
const loadingEl = document.getElementById('orders-loading');
const tableWrap = document.getElementById('orders-table-wrap');

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

async function loadOrders() {
  loadingEl.style.display = 'none';
  tableWrap.innerHTML = '<div class="loading-state" style="text-align:center"><div class="skeleton-lg"></div></div>';
  try {
    const { data } = await supabase.from('orders').select('id, order_number, status, total_cents, currency, created_at, delivery_method, tracking_number').order('created_at', { ascending: false });
    const me = await getMe();
    const rows = (data || []).filter(o => (o.order_items || []).some(oi => oi.seller_id === me.id));
    if (!rows.length) { tableWrap.innerHTML = '<div class="empty-state"><h2>No orders yet.</h2><p>Orders will appear here once customers buy from your shop.</p></div>'; return; }
    let html = '<table><thead><tr><th>Order</th><th>Product</th><th>Qty</th><th>Buyer</th><th>Method</th><th>Date</th><th>Payment</th><th>Fulfilment</th><th>Actions</th></tr></thead><tbody>';
    rows.forEach(o => {
      const mine = (o.order_items || []).filter(oi => oi.seller_id === me.id);
      const canShip = o.status === 'paid' || o.status === 'processing';
      html += `
        <tr>
          <td style="font-weight:600">#${escapeHtml(o.order_number)}</td>
          <td>${mine.map(oi => oi.product_name_snapshot + ' ×' + oi.quantity).join('<br>') || '—'}</td>
          <td>${mine.reduce((s, oi) => s + oi.quantity, 0)}</td>
          <td>${o.buyer_id ? '—' : ''}</td>
          <td>${escapeHtml(o.delivery_method || 'standard')}</td>
          <td>${formatDateTime(o.created_at)}</td>
          <td>${formatMoney(o.total_cents, o.currency)}</td>
          <td>${statusChip(o.status)}</td>
          <td>
            ${canShip ? `<button class="btn btn-sm btn-primary" onclick="shipOrder('${o.id}')">Ship order</button>` : ''}
            ${o.tracking_number ? `<button class="btn btn-sm btn-ghost" style="color:var(--deep-purple)">View tracking</button>` : ''}
          </td>
        </tr>`;
    });
    html += '</tbody></table>';
    tableWrap.innerHTML = html;
  } catch (err) {
    tableWrap.innerHTML = '<div class="empty-state"><h2>Unable to load orders</h2><p>' + escapeHtml(err.message) + '</p></div>';
  }
}

function statusChip(status) {
  const map = { pending_payment: 'status-pending', paid: 'status-paid', processing: 'status-paid', shipped: 'status-shipped', completed: 'status-completed', cancelled: 'status-cancelled', refunded: 'status-cancelled' };
  return '<span class="status-chip ' + (map[status] || 'status-pending') + '">' + status.replace('_', ' ') + '</span>';
}

window.shipOrder = async (orderId) => {
  const { data: order } = await supabase.from('orders').select('*, buyer_id').eq('id', orderId).single();
  if (!order) return;
  document.getElementById('ship-order-id').value = orderId;
  document.getElementById('ship-seller').value = 'Handmade & Co. staff';
  document.getElementById('ship-tracking').value = order.tracking_number || '';
  document.getElementById('ship-form').dataset.orderId = orderId;
  document.getElementById('ship-modal').style.display = 'flex';
  openModal(document.getElementById('ship-modal'));
};

document.getElementById('ship-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const orderId = document.getElementById('ship-form').dataset.orderId;
  const { data: order } = await supabase.from('orders').select('status').eq('id', orderId).single();
  if (order.status !== 'paid' && order.status !== 'processing') {
    alert('This order is not ready to ship.');
    return;
  }
  const { error } = await supabase.from('orders').update({ tracking_number: document.getElementById('ship-tracking').value.trim(), status: 'shipped' }).eq('id', orderId);
  if (error) return alert('Failed: ' + error.message);
  showToast('Order marked as shipped.');
  modal.style.display = 'none';
  loadOrders();
});


