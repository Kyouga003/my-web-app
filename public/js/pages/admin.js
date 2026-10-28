// Administration dashboard (admins only)
import { supabase } from '/js/init.js';
import { formatMoney, formatDateTime, escapeHtml, showToast } from '/js/ui.js';

const requireAuthEl = document.getElementById('admin-require-auth');
const wrap = document.getElementById('admin-wrap');
const reportsList = document.getElementById('reports-list');
const activityList = document.getElementById('activity-list');
const productsEl = document.getElementById('admin-products');
const ordersEl = document.getElementById('admin-orders');
const catsEl = document.getElementById('admin-categories');
const reportsEl = document.getElementById('admin-reports');

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
  if (role !== 'admin') {
    wrap.innerHTML = '<div class="empty-state"><h2>Administrator access required</h2><a href="index.html" class="btn btn-primary">Back to home</a></div>';
    wrap.style.display = 'block';
    return;
  }
  wrap.style.display = 'block';
  loadDashboard();
});

async function loadDashboard() {
  const { data: products } = await supabase.from('products').select('*');
  const { data: orders } = await supabase.from('orders').select('*').order('created_at', { ascending: false }).limit(5);
  const { data: cats } = await supabase.from('categories').select('*');
  const { data: reports } = await supabase.from('reports').select('*').eq('status', 'open').order('created_at', { ascending: false });
  productsEl.textContent = (products || []).length;
  ordersEl.textContent = (orders || []).length;
  catsEl.textContent = (cats || []).length;
  reportsEl.textContent = (reports || []).length;

  if (reports && reports.length) {
    reportsList.innerHTML = reports.map(r => `
      <div style="border:1px solid var(--border);border-radius:var(--radius);padding:0.75rem 1rem;margin-bottom:0.75rem;display:flex;justify-content:space-between;gap:1rem">
        <div style="font-size:0.9rem">Reason: <strong>${escapeHtml(r.reason)}</strong></div>
        <div style="text-align:right">
          <span style="color:var(--text-secondary);font-size:0.85rem">${formatDateTime(r.created_at)}</span><br>
          <button class="btn btn-sm btn-outline" onclick="resolveReport('${r.id}')">Resolve</button>
        </div>
      </div>`).join('');
  } else {
    reportsList.innerHTML = '<p class="text-secondary">No open reports.</p>';
  }

  if (orders && orders.length) {
    activityList.innerHTML = orders.map(o => `
      <div style="border:1px solid var(--border);border-radius:var(--radius);padding:0.75rem 1rem;margin-bottom:0.75rem;display:flex;justify-content:space-between;gap:1rem">
        <div><div style="font-size:0.9rem">Order #${escapeHtml(o.order_number)} ${statusChip(o.status)}</div><div class="text-secondary" style="font-size:0.8rem">${escapeHtml(o.order_items ? o.order_items[0]?.product_name_snapshot : 'a product')}</div></div>
        <div style="text-align:right">${formatDateTime(o.created_at)}</div>
      </div>`).join('');
  } else {
    activityList.innerHTML = '<p class="text-secondary">No activity yet.</p>';
  }
}

window.resolveReport = async (id) => {
  const { error } = await supabase.from('reports').update({ status: 'resolved' }).eq('id', id);
  if (error) return showToast('Failed to resolve report.', 'error');
  showToast('Report resolved.');
  loadDashboard();
};

function statusChip(status) {
  const map = { pending_payment: 'status-pending', paid: 'status-paid', processing: 'status-paid', shipped: 'status-shipped', completed: 'status-completed', cancelled: 'status-cancelled', refunded: 'status-cancelled' };
  return '<span class="status-chip ' + (map[status] || 'status-pending') + '">' + status.replace('_', ' ') + '</span>';
}

loadDbStatus();
