// Seller dashboard
import { supabase } from '/js/init.js';
import { formatMoney, escapeHtml, showToast } from '/js/ui.js';
import { renderAuthLinks, updateCartCount } from '/js/nav.js';

const onboard = document.getElementById('seller-onboard');
const statsEl = document.getElementById('seller-stats');
const recentEl = document.getElementById('seller-recent-orders');
const requireAuthEl = document.getElementById('seller-require-auth');

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

async function getMe() {
  const { data } = await supabase.auth.getUser();
  return data.user;
}

window.addEventListener('authstate', async () => {
  const { currentUser } = await import('/js/init.js');
  const prof = currentUser ? await supabase.from('profiles').select('role,display_name').eq('id', currentUser.id).single() : null;
  renderAuthLinks(currentUser, prof && prof.data);
  if (!currentUser) {
    requireAuthEl.style.display = 'block';
    updateCartCount(0);
    return;
  }
  requireAuthEl.style.display = 'none';
  const role = prof.data.role;
  updateCartCount(0);
  if (role === 'buyer') {
    onboard.style.display = 'block';
    statsEl.style.display = 'none';
    recentEl.style.display = 'none';
    document.getElementById('onboard-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const { error } = await supabase.from('shops').insert([{
        owner_id: currentUser.id,
        name: document.getElementById('shop-name').value.trim(),
        slug: document.getElementById('shop-slug').value.trim(),
        description: document.getElementById('shop-desc').value.trim()
      }]);
      if (error) return alert('Could not create shop: ' + error.message);
      await supabase.from('profiles').update({ role: 'seller' }).eq('id', currentUser.id);
      showToast('Shop created! You can now add products.');
      onboard.style.display = 'none';
      statsEl.style.display = 'grid';
      recentEl.style.display = 'block';
      loadStats();
      loadRecentOrders();
    });
    return;
  }
  onboard.style.display = 'none';
  statsEl.style.display = 'grid';
  recentEl.style.display = 'block';
  loadStats();
  loadRecentOrders();
});

async function loadStats() {
  const me = await getMe();
  const { data: products } = await supabase.from('products').select('id, status, quantity').eq('seller_id', me.id);
  const rows = products || [];
  const published = rows.filter(r => r.status === 'published').length;
  const lowStock = rows.filter(r => r.status === 'published' && (r.quantity || 0) > 0 && (r.quantity || 0) <= 2).length;
  const soldOut = rows.filter(r => r.status === 'published' && (r.quantity || 0) <= 0).length;

  const { data: orders } = await supabase.from('orders').select('status, order_items(*)').order('created_at', { ascending: false });
  const all = orders || [];
  const myOrders = all.filter(o => (o.order_items || []).some(oi => oi.seller_id === me.id));
  let revenue = 0;
  myOrders.forEach(o => {
    if (['paid', 'processing', 'shipped', 'completed'].includes(o.status)) {
      (o.order_items || []).forEach(oi => { if (oi.seller_id === me.id) revenue += oi.price_cents * oi.quantity; });
    }
  });

  statsEl.innerHTML = `
    <div class="metric-card"><div class="label">Products listed</div><div class="value">${rows.length}</div><div class="delta">${published} published</div></div>
    <div class="metric-card"><div class="label">Orders received</div><div class="value">${myOrders.length}</div><div class="delta ok">${soldOut} sold out</div></div>
    <div class="metric-card"><div class="label">Low stock (≤2)</div><div class="value">${lowStock}</div><div class="delta bad">needs attention</div></div>
    <div class="metric-card"><div class="label">Gross sales (paid+)</div><div class="value">${formatMoney(revenue, 'USD')}</div><div class="delta ok">Your share of paid orders</div></div>
  `;
}

async function loadRecentOrders() {
  const me = await getMe();
  const { data: orders } = await supabase.from('orders').select('order_number, status, total_cents, currency, created_at, order_items(*)').order('created_at', { ascending: false }).limit(8);
  const rows = (orders || []).filter(o => (o.order_items || []).some(oi => oi.seller_id === me.id));
  recentEl.style.display = 'block';
  if (!rows.length) { recentEl.innerHTML = '<div class="empty-state"><p>No orders yet.</p></div>'; return; }
  const statusMap = { pending_payment: 'status-pending', paid: 'status-paid', processing: 'status-paid', shipped: 'status-shipped', completed: 'status-completed', cancelled: 'status-cancelled', refunded: 'status-cancelled' };
  recentEl.innerHTML = rows.map(o => {
    const mine = (o.order_items || []).filter(oi => oi.seller_id === me.id);
    const mineTotal = mine.reduce((s, oi) => s + oi.price_cents * oi.quantity, 0);
    return `
      <div style="border:1px solid var(--border);border-radius:var(--radius);padding:0.75rem 1rem;margin-bottom:0.75rem;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.75rem">
        <div>
          <div style="font-weight:600">Order #${escapeHtml(o.order_number)}</div>
          <div class="text-secondary" style="font-size:0.85rem">${mine.map(oi => oi.product_name_snapshot).join(', ')}</div>
        </div>
        <div class="flex" style="align-items:center;gap:0.75rem;flex-wrap:wrap">
          <span class="status-chip ${statusMap[o.status] || 'status-pending'}">${o.status.replace('_', ' ')}</span>
          <div style="font-weight:700">${formatMoney(mineTotal, o.currency)} (your share)</div>
        </div>
      </div>`;
  }).join('');
}

loadDbStatus();
