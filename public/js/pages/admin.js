// Administration dashboard (admins only)
import { supabase } from '/js/init.js';
import { formatMoney, formatDateTime, escapeHtml, showToast } from '/js/ui.js';
import { renderAuthLinks, updateCartCount } from '/js/nav.js';

const requireAuthEl = document.getElementById('admin-require-auth');
const wrap = document.getElementById('admin-wrap');
const reportsList = document.getElementById('reports-list');
const activityList = document.getElementById('activity-list');
const productsEl = document.getElementById('admin-products');
const ordersEl = document.getElementById('admin-orders');
const catsEl = document.getElementById('admin-categories');
const reportsEl = document.getElementById('admin-reports');
const accountsEl = document.getElementById('admin-account-list');
const accountStatusFilter = document.getElementById('account-status-filter');
const productQueueEl = document.getElementById('admin-product-queue');
const pendingProductCount = document.getElementById('pending-product-count');

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
  const role = prof && prof.data ? prof.data.role : 'buyer';
  updateCartCount(0);
  if (role !== 'admin') {
    wrap.innerHTML = '<div class="empty-state"><h2>Administrator access required</h2><a href="index.html" class="btn btn-primary">Back to home</a></div>';
    wrap.style.display = 'block';
    return;
  }
  wrap.style.display = 'block';
  loadDashboard();
  loadAccounts();
  loadPendingProducts();
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

async function adminFetch(path, options = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Your session expired. Sign in again.');
  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + session.access_token,
      ...(options.headers || {})
    }
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Request failed (' + response.status + ')');
  return result;
}

async function loadAccounts() {
  accountsEl.innerHTML = '<p class="text-secondary">Loading accounts...</p>';
  try {
    const status = accountStatusFilter.value;
    const rows = await adminFetch('/api/admin/accounts?status=' + encodeURIComponent(status));
    renderAccounts(rows);
  } catch (error) {
    accountsEl.innerHTML = '<p class="text-secondary">' + escapeHtml(error.message) + '</p>';
  }
}

function renderAccounts(rows) {
  if (!rows.length) {
    accountsEl.innerHTML = '<div class="empty-state"><p>No accounts in this view.</p></div>';
    return;
  }
  accountsEl.innerHTML = rows.map(account => `
    <article class="admin-queue-card">
      <div class="admin-queue-head">
        <div>
          <h4>${escapeHtml(account.display_name || 'New maker')}</h4>
          <div class="admin-queue-meta">${escapeHtml(account.email || 'No email')}<br>Joined ${formatDateTime(account.created_at)}</div>
        </div>
        <span class="badge ${account.approval_status === 'approved' ? 'badge-success' : account.approval_status === 'rejected' ? 'badge-draft' : 'badge-outline'}">${escapeHtml(account.approval_status)}</span>
      </div>
      <div class="admin-queue-meta">Role: ${escapeHtml(account.role)}</div>
      ${account.approval_status !== 'approved' ? `
        <div class="admin-queue-actions">
          <button class="btn btn-sm btn-primary" data-account-action="approved" data-account-id="${account.id}">Approve account</button>
          ${account.approval_status !== 'rejected' ? `<button class="btn btn-sm btn-ghost" data-account-action="rejected" data-account-id="${account.id}">Reject</button>` : ''}
        </div>` : ''}
    </article>
  `).join('');
}

async function loadPendingProducts() {
  productQueueEl.innerHTML = '<p class="text-secondary">Loading listings...</p>';
  try {
    const rows = await adminFetch('/api/admin/products?status=pending');
    pendingProductCount.textContent = rows.length + ' pending';
    renderPendingProducts(rows);
  } catch (error) {
    productQueueEl.innerHTML = '<p class="text-secondary">' + escapeHtml(error.message) + '</p>';
  }
}

function renderPendingProducts(rows) {
  if (!rows.length) {
    productQueueEl.innerHTML = '<div class="empty-state"><p>No listings need review.</p></div>';
    return;
  }
  productQueueEl.innerHTML = rows.map(product => {
    const images = product.product_images || [];
    const mainImage = images.find(image => image.is_main) || images[0];
    const imageUrl = mainImage ? mainImage.url : '/images/placeholder.svg';
    return `
      <article class="admin-queue-card" data-product-id="${product.id}" data-seller-id="${product.seller_id}">
        <div class="admin-product-identity">
          <img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(product.name)}" loading="lazy">
          <div class="admin-product-summary">
            <h4>${escapeHtml(product.name)}</h4>
            <div class="admin-queue-meta">${escapeHtml(product.shops?.name || 'Shop')} · ${escapeHtml(product.profiles?.display_name || 'Seller')}</div>
            <div class="admin-queue-meta">${escapeHtml(product.profiles?.email || 'No email')} · ${formatDateTime(product.created_at)}</div>
            <strong>${formatMoney(product.price_cents, product.currency)}</strong>
          </div>
        </div>
        <p>${escapeHtml(product.description || 'No description provided.')}</p>
        <label class="form-group">Review note
          <textarea class="form-textarea" data-review-note maxlength="1000" placeholder="Optional feedback for the seller"></textarea>
        </label>
        <div class="admin-queue-actions">
          <button class="btn btn-sm btn-primary" data-product-decision="approved">Approve</button>
          <button class="btn btn-sm btn-outline" data-product-decision="rejected">Reject</button>
        </div>
        <form class="admin-message-form" data-message-form>
          <strong>Message uploader</strong>
          <input class="form-input" name="subject" maxlength="160" required value="About your listing: ${escapeHtml(product.name)}" aria-label="Message subject">
          <textarea class="form-textarea" name="body" maxlength="5000" required placeholder="Write a private message to this account"></textarea>
          <button class="btn btn-sm btn-ghost" type="submit">Send message</button>
        </form>
      </article>
    `;
  }).join('');
}

accountStatusFilter.addEventListener('change', loadAccounts);
accountsEl.addEventListener('click', async event => {
  const button = event.target.closest('[data-account-action]');
  if (!button) return;
  button.disabled = true;
  try {
    await adminFetch('/api/admin/accounts/' + encodeURIComponent(button.dataset.accountId) + '/approval', {
      method: 'PATCH',
      body: JSON.stringify({ approval_status: button.dataset.accountAction })
    });
    showToast(button.dataset.accountAction === 'approved' ? 'Account approved.' : 'Account rejected.');
    await loadAccounts();
  } catch (error) {
    button.disabled = false;
    showToast(error.message, 'error');
  }
});

productQueueEl.addEventListener('click', async event => {
  const button = event.target.closest('[data-product-decision]');
  if (!button) return;
  const card = button.closest('[data-product-id]');
  button.disabled = true;
  try {
    await adminFetch('/api/admin/products/' + encodeURIComponent(card.dataset.productId) + '/review', {
      method: 'PATCH',
      body: JSON.stringify({
        decision: button.dataset.productDecision,
        note: card.querySelector('[data-review-note]').value
      })
    });
    showToast(button.dataset.productDecision === 'approved' ? 'Listing approved.' : 'Listing rejected.');
    await loadPendingProducts();
  } catch (error) {
    button.disabled = false;
    showToast(error.message, 'error');
  }
});

productQueueEl.addEventListener('submit', async event => {
  const form = event.target.closest('[data-message-form]');
  if (!form) return;
  event.preventDefault();
  const card = form.closest('[data-product-id]');
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    await adminFetch('/api/admin/messages', {
      method: 'POST',
      body: JSON.stringify({
        recipient_id: card.dataset.sellerId,
        product_id: card.dataset.productId,
        subject: form.elements.subject.value,
        body: form.elements.body.value
      })
    });
    form.reset();
    showToast('Message sent to the uploader.');
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    button.disabled = false;
  }
});

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
