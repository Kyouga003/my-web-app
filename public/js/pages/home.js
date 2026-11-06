// Homepage: featured products + categories
import { supabase } from '/js/init.js';
import { formatMoney, escapeHtml } from '/js/ui.js';
import { renderAuthLinks, updateCartCount } from '/js/nav.js';

const featuredGrid = document.getElementById('featured-grid');
const categoryGrid = document.getElementById('category-grid');
const setupBanner = document.getElementById('setup-banner');
const featuredSort = document.getElementById('featured-sort');
const categorySort = document.getElementById('category-sort');
let featuredRows = [];
let categoryRows = [];

function showSetup(message) {
  setupBanner.innerHTML = '<strong>Setup needed:</strong> ' + escapeHtml(message) +
    ' Run <code>schema.sql</code> in your Supabase SQL Editor to enable the marketplace.';
  setupBanner.style.display = 'block';
}

async function loadDbStatus() {
  try {
    const res = await fetch('/api/db/status');
    const status = await res.json();
    const missing = Object.entries(status).filter(([, v]) => !v.exists).map(([k]) => k);
    if (missing.length) showSetup('Database tables not found: ' + missing.join(', '));
  } catch (_) {}
}

function compareValues(a, b, key, dir) {
  let av = a[key], bv = b[key];
  if (key === 'created_at') { av = av ? new Date(av).getTime() : 0; bv = bv ? new Date(bv).getTime() : 0; }
  if (typeof av === 'string') av = av.toLowerCase();
  if (typeof bv === 'string') bv = bv.toLowerCase();
  if (av == null && bv == null) return 0;
  if (av == null) return 1;
  if (bv == null) return -1;
  return (av < bv ? -1 : av > bv ? 1 : 0) * dir;
}

function sortProducts(rows, mode) {
  const list = rows.slice();
  if (mode === 'oldest') list.sort((a, b) => compareValues(a, b, 'created_at', 1));
  else if (mode === 'alpha-asc') list.sort((a, b) => compareValues(a, b, 'name', 1));
  else if (mode === 'alpha-desc') list.sort((a, b) => compareValues(a, b, 'name', -1));
  else if (mode === 'price-asc') list.sort((a, b) => compareValues(a, b, 'price_cents', 1));
  else if (mode === 'price-desc') list.sort((a, b) => compareValues(a, b, 'price_cents', -1));
  else list.sort((a, b) => compareValues(a, b, 'created_at', -1));
  return list;
}

function sortCategories(rows, mode) {
  const list = rows.slice();
  if (mode === 'oldest') list.sort((a, b) => compareValues(a, b, 'created_at', 1));
  else if (mode === 'newest') list.sort((a, b) => compareValues(a, b, 'created_at', -1));
  else if (mode === 'alpha-desc') list.sort((a, b) => compareValues(a, b, 'name', -1));
  else list.sort((a, b) => compareValues(a, b, 'name', 1));
  return list;
}

function productCard(p) {
  const imgs = p.product_images || [];
  const main = imgs.find(i => i.is_main && i.url) || imgs.find(i => i.url) || {};
  const imgUrl = main.url || '/images/placeholder.svg';
  const stock = p.quantity == null ? 0 : p.quantity;
  return `
    <article class="product-card">
      <div class="product-card-media">
        <a href="product.html?id=${p.id}">
          <img src="${escapeHtml(imgUrl)}" alt="${escapeHtml(p.name || '')}" loading="lazy" onerror="this.src='/images/placeholder.svg'">
        </a>
        ${stock <= 0 ? '<span class="product-badge soldout">Sold Out</span>' : ''}
        <button class="fav-btn" data-product-id="${p.id}" aria-label="Add to favorites">
          <svg class="fav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
        </button>
      </div>
      <div class="product-card-content">
        <span class="product-category">${escapeHtml(p.categories?.name || 'Handmade')}</span>
        <h3 class="product-card-title"><a href="product.html?id=${p.id}">${escapeHtml(p.name)}</a></h3>
        <p class="product-card-seller">Handcrafted</p>
        <div class="product-card-bottom">
          <div class="product-price">${formatMoney(p.price_cents, p.currency)}</div>
          ${stock > 0 ? `<a href="product.html?id=${p.id}" class="product-card-link">View Details</a>` : `<span class="product-stock">Out of Stock</span>`}
        </div>
      </div>
    </article>
  `;
}

function renderFeatured() {
  if (featuredRows.length === 0) {
    featuredGrid.innerHTML = '<div class="empty-state"><h2>No listings yet</h2><p>Be the first to share your handmade creations.</p><a href="seller-dashboard.html" class="btn btn-primary" style="margin-top:1rem">Start Selling</a></div>';
  } else {
    featuredGrid.innerHTML = sortProducts(featuredRows, featuredSort?.value || 'newest').map(productCard).join('');
    wireFavButtons();
  }
}

async function loadFeatured() {
  if (!supabase) return;
  featuredGrid.innerHTML = '<div class="loading-state"><div class="skeleton-lg"></div></div>';
  try {
    const { data, error } = await supabase
      .from('products')
      .select('*, product_images(*), categories(name)')
      .eq('status', 'published')
      .eq('moderation_status', 'approved')
      .order('created_at', { ascending: false })
      .limit(12);
    if (error) throw error;
    featuredRows = data || [];
    renderFeatured();
  } catch (err) {
    featuredGrid.innerHTML = '<div class="empty-state"><h2>Unable to load products</h2><p>' + escapeHtml(err.message) + '</p></div>';
  }
}

function renderCategories() {
  if (categoryRows.length === 0) {
    categoryGrid.innerHTML = '<div class="empty-state"><p>Categories coming soon.</p></div>';
  } else {
    categoryGrid.innerHTML = sortCategories(categoryRows, categorySort?.value || 'alpha-asc').map(c => `
      <a href="shop.html?category=${encodeURIComponent(c.slug)}" class="category-card">
        <div class="category-card-icon">🎨</div>
        <div class="category-card-content">
          <h3>${escapeHtml(c.name)}</h3>
          <p>${escapeHtml(c.description || 'Explore handmade items')}</p>
        </div>
        <svg class="category-card-arrow" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M7.5 15L12.5 10L7.5 5"/>
        </svg>
      </a>
    `).join('');
  }
}

async function loadCategories() {
  if (!supabase) return;
  try {
    const { data, error } = await supabase.from('categories').select('*').order('name').limit(8);
    if (error) throw error;
    categoryRows = data || [];
    renderCategories();
  } catch (err) {
    categoryGrid.innerHTML = '';
  }
}

if (featuredSort) featuredSort.addEventListener('change', renderFeatured);
if (categorySort) categorySort.addEventListener('change', renderCategories);

function wireFavButtons() {
  document.querySelectorAll('.fav-btn').forEach(btn => {
    btn.onclick = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const id = btn.dataset.productId;
      const { currentUser } = await import('/js/init.js');
      if (!currentUser) { window.location.href = 'login.html'; return; }
      const { data: existing } = await supabase.from('favorites').select('id').eq('product_id', id).maybeSingle();
      if (existing) {
        await supabase.from('favorites').delete().eq('id', existing.id);
        btn.classList.remove('active');
      } else {
        await supabase.from('favorites').insert([{ product_id: id }]);
        btn.classList.add('active');
      }
    };
  });
}
window.addEventListener('authstate', async () => {
  const { currentUser } = await import('/js/init.js');
  const prof = currentUser ? await supabase.from('profiles').select('role,display_name').eq('id', currentUser.id).maybeSingle() : null;
  renderAuthLinks(currentUser, prof && prof.data);
  if (currentUser) {
    try {
      const { data: cart } = await supabase.from('carts').select('id').eq('user_id', currentUser.id).maybeSingle();
      if (cart) {
        const { data: items } = await supabase.from('cart_items').select('quantity').eq('cart_id', cart.id);
        updateCartCount(items ? items.reduce((s, i) => s + (i.quantity || 0), 0) : 0);
      }
    } catch (_) {}
  } else { updateCartCount(0); }
  wireFavButtons();
});

loadDbStatus();
loadFeatured();
loadCategories();
