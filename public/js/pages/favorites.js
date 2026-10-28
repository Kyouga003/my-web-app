// Favorites page
import { supabase } from '/js/init.js';
import { formatMoney, escapeHtml } from '/js/ui.js';
import { renderAuthLinks, updateCartCount } from '/js/nav.js';

const grid = document.getElementById('fav-grid');
const emptyEl = document.getElementById('fav-empty');
const loadingEl = document.getElementById('fav-loading');
const requireLoginEl = document.getElementById('fav-require-login');

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
  loadFavorites();
});

function productCard(p) {
  const main = (p.product_images || [])[0];
  const stock = p.quantity == null ? 0 : p.quantity;
  const stockClass = stock <= 0 ? 'out' : stock <= 2 ? 'low' : 'ok';
  const stockLabel = stock <= 0 ? 'Sold out' : stock + ' available';
  return `
    <article class="product-card">
      <div class="product-card-media">
        <img src="${escapeHtml(main ? main.url : '/images/placeholder.svg')}" alt="${escapeHtml(p.name)}" loading="lazy">
        <span class="badge badge-outline">${escapeHtml(stock <= 0 ? 'Sold out' : 'Available')}</span>
        <button class="fav-btn active" data-product-id="${p.id}" aria-label="Remove favorite"><svg class="fav-fill" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg></button>
      </div>
      <div class="product-card-info">
        <div class="product-cat">${escapeHtml(p.category_name || 'Handmade')}</div>
        <h3><a href="product.html?id=${p.id}">${escapeHtml(p.name)}</a></h3>
        <div class="product-price">${formatMoney(p.price_cents, p.currency)}</div>
        <div class="product-stock ${stockClass}">${stockLabel}</div>
      </div>
      <div class="product-card-footer">
        <a href="product.html?id=${p.id}" class="btn btn-sm btn-ghost">View</a>
        ${stock > 0 ? '<a href="cart.html?add=' + p.id + '" class="btn btn-sm btn-primary">Add to cart</a>' : ''}
      </div>
    </article>
  `;
}

async function loadFavorites() {
  const { currentUser } = await import('/js/init.js');
  const { data, error } = await supabase
    .from('favorites')
    .select('*, products(*, product_images(url, is_main), categories(name))')
    .order('created_at', { ascending: false });
  loadingEl.style.display = 'none';
  if (error || !data || !data.length) {
    emptyEl.style.display = 'block';
    grid.style.display = 'none';
    return;
  }
  emptyEl.style.display = 'none';
  grid.style.display = 'grid';
  const rows = data.map(f => f.products).filter(Boolean);
  grid.innerHTML = rows.map(productCard).join('');
  document.querySelectorAll('.fav-btn.active').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault(); e.stopPropagation();
      const id = btn.dataset.productId;
      await supabase.from('favorites').delete().eq('product_id', id);
      btn.closest('.product-card').remove();
      if (grid.children.length === 0) { emptyEl.style.display = 'block'; grid.style.display = 'none'; }
    });
  });
}

loadDbStatus();
loadFavorites();
