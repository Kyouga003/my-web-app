// Product catalog: search, filters, sorting, pagination
import { supabase } from '/js/init.js';
import { formatMoney, escapeHtml } from '/js/ui.js';
import { renderAuthLinks, updateCartCount } from '/js/nav.js';

const grid = document.getElementById('shop-grid');
const paginationEl = document.getElementById('shop-pagination');
const form = document.getElementById('search-form');
const qInput = document.getElementById('search-q');
const filtersPanel = document.getElementById('filters-panel');
const filtersContent = document.getElementById('filters-content');
const activeFiltersEl = document.getElementById('active-filters');
const toggleFilters = document.getElementById('toggle-filters');
const applyFilters = document.getElementById('apply-filters');
const resetFilters = document.getElementById('reset-filters');
const setupBanner = document.getElementById('setup-banner');

const PAGE_SIZE = 20;
let state = {
  q: '', category: '', min: '', max: '', availability: 'all', sort: 'newest', page: 1
};
let categories = [];

function paramsFromState() {
  const p = new URLSearchParams();
  if (state.q) p.set('q', state.q);
  if (state.category) p.set('category', state.category);
  if (state.min) p.set('min', state.min);
  if (state.max) p.set('max', state.max);
  if (state.availability !== 'all') p.set('availability', state.availability);
  p.set('sort', state.sort);
  p.set('page', state.page);
  return p;
}

function readParams() {
  const p = new URLSearchParams(window.location.search);
  state.q = p.get('q') || '';
  state.category = p.get('category') || '';
  state.min = p.get('min') || '';
  state.max = p.get('max') || '';
  state.availability = p.get('availability') || 'all';
  state.sort = p.get('sort') || 'newest';
  state.page = parseInt(p.get('page')) || 1;
  qInput.value = state.q;
}

function showSetup(message) {
  setupBanner.innerHTML = '<strong>Setup needed:</strong> ' + escapeHtml(message) + ' Run <code>schema.sql</code> in your Supabase SQL Editor to enable the marketplace.';
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

async function loadCategories() {
  try {
    const { data, error } = await supabase.from('categories').select('*').order('name');
    if (error) throw error;
    categories = data || [];
    renderFilters();
  } catch (err) {
    filtersContent.innerHTML = '<p style="color:var(--danger)">Unable to load categories.</p>';
  }
}

function renderFilters() {
  let html = '<div class="form-group"><label>Category</label><select id="f-category" class="form-select"><option value="">All categories</option>' +
    categories.map(c => '<option value="' + escapeHtml(c.slug) + '">' + escapeHtml(c.name) + '</option>').join('') +
    '</select></div>';
  html += '<div class="form-group"><label>Price range</label>' +
    '<input type="number" id="f-min" name="min" class="form-input" placeholder="Min"> ' +
    '<input type="number" id="f-max" name="max" class="form-input" placeholder="Max"></div>';
  html += '<div class="form-group"><label>Availability</label><select id="f-availability" class="form-select">' +
    '<option value="all">Any</option><option value="available">In stock</option><option value="made-to-order">Made to order</option></select></div>';
  html += '<div class="form-group"><label>Sort by</label><select id="f-sort" class="form-select">' +
    '<option value="newest">Newest arrivals</option><option value="price-asc">Price: low to high</option>' +
    '<option value="price-desc">Price: high to low</option></select></div>';
  filtersContent.innerHTML = html;
  document.getElementById('f-category').value = state.category;
  document.getElementById('f-min').value = state.min;
  document.getElementById('f-max').value = state.max;
  document.getElementById('f-availability').value = state.availability;
  document.getElementById('f-sort').value = state.sort;
}

function productCard(p) {
  const main = (p.product_images && p.product_images[0]) || {};
  const imgUrl = main.url || '/images/placeholder.svg';
  const stock = p.quantity == null ? 0 : p.quantity;
  const stockLabel = stock <= 0 ? 'Sold out' : stock === 1 ? 'Only 1 left' : stock + ' available';
  const stockClass = stock <= 0 ? 'out' : stock <= 2 ? 'low' : 'ok';
  return `
    <article class="product-card">
      <div class="product-card-media">
        <img src="${escapeHtml(imgUrl)}" alt="${escapeHtml(p.name || '')}" loading="lazy">
        <span class="badge badge-outline">${escapeHtml(stock <= 0 ? 'Sold out' : 'Available')}</span>
        <button class="fav-btn" data-product-id="${p.id}" aria-label="Favorite"><svg class="fav-fill" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg></button>
      </div>
      <div class="product-card-info">
        <div class="product-cat">${escapeHtml(p.category_name || 'Handmade')}</div>
        <h3><a href="product.html?id=${p.id}">${escapeHtml(p.name)}</a></h3>
        <div class="product-price">${formatMoney(p.price_cents, p.currency)}</div>
        <div class="product-seller">by <a href="seller-shop.html?slug=${escapeHtml(p.shop_slug || '')}">${escapeHtml(p.seller_name || 'a maker')}</a></div>
        <div class="product-stock ${stockClass}">${stockLabel}</div>
      </div>
      <div class="product-card-footer">
        <a href="product.html?id=${p.id}" class="btn btn-sm btn-ghost">View</a>
        ${stock > 0 ? '<a href="cart.html?add=' + p.id + '" class="btn btn-sm btn-primary">Add to cart</a>' : ''}
      </div>
    </article>
  `;
}

async function loadProducts() {
  if (!supabase) return;
  grid.innerHTML = '<div class="loading-state" style="grid-column:1/-1"><div class="skeleton-lg"></div></div>';
  paginationEl.innerHTML = '';
  try {
    let query = supabase
      .from('products')
      .select('*, product_images(url, is_main), categories(name), shops(name, slug), profiles(display_name)', { count: 'exact' })
      .eq('status', 'published');
    if (state.q) {
      query = query.or('name.ilike.%' + state.q + '%', 'description.ilike.%' + state.q + '%', 'tags.cs.{"' + state.q + '"}');
    }
    const cat = categories.find(c => c.slug === state.category);
    if (state.category && cat) query = query.eq('category_id', cat.id);
    if (state.min) query = query.gte('price_cents', Math.round(parseFloat(state.min) * 100));
    if (state.max) query = query.lte('price_cents', Math.round(parseFloat(state.max) * 100));
    if (state.sort === 'price-asc') query = query.order('price_cents', { ascending: true });
    else if (state.sort === 'price-desc') query = query.order('price_cents', { ascending: false });
    else query = query.order('created_at', { ascending: false });
    const from = (state.page - 1) * PAGE_SIZE;
    query = query.range(from, from + PAGE_SIZE - 1);

    const { data, error, count } = await query;
    if (error) throw error;
    const rows = data || [];
    renderActiveFilters();
    if (rows.length === 0) {
      grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><h2>No products found</h2><p>Try adjusting your search or filters.</p></div>';
    } else {
      grid.innerHTML = rows.map(productCard).join('');
      wireFavButtons();
    }
    renderPagination(count || 0);
  } catch (err) {
    grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><h2>Unable to load products</h2><p>' + escapeHtml(err.message) + '</p></div>';
  }
}

function renderActiveFilters() {
  const bits = [];
  if (state.q) bits.push('Search: ' + escapeHtml(state.q));
  if (state.category) {
    const c = categories.find(x => x.slug === state.category);
    bits.push('Category: ' + escapeHtml(c && c.name));
  }
  if (state.min) bits.push('Min $' + state.min);
  if (state.max) bits.push('Max $' + state.max);
  if (state.availability !== 'all') bits.push('Availability: ' + state.availability);
  if (bits.length === 0) { activeFiltersEl.style.display = 'none'; return; }
  activeFiltersEl.style.display = 'block';
  activeFiltersEl.innerHTML = '<strong>Active filters:</strong> ' + bits.map(label =>
    '<span class="badge badge-outline" style="margin-right:0.5rem">' + label + ' <button class="btn-ghost" style="padding:0 0.4rem;background:transparent;border:none;color:inherit;font-size:0.9rem">×</button></span>').join(' ');
}

function renderPagination(total) {
  const totalPages = Math.ceil(total / PAGE_SIZE) || 1;
  if (totalPages <= 1) { paginationEl.innerHTML = ''; return; }
  const p = (n) => { state.page = n; loadProducts(); window.history.pushState(null, '', '?' + paramsFromState().toString()); };
  let html = '<span>Page ' + state.page + ' of ' + totalPages + '</span> ';
  if (state.page > 1) html += '<button class="btn-ghost" onclick="p(' + (state.page - 1) + ')">&larr; Prev</button>';
  if (state.page < totalPages) html += '<button class="btn-ghost" onclick="p(' + (state.page + 1) + ')">Next &rarr;</button>';
  paginationEl.innerHTML = html;
}

function wireFavButtons() {
  document.querySelectorAll('.fav-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault(); e.stopPropagation();
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
    });
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

// Wire UI
toggleFilters.addEventListener('click', () => { filtersPanel.style.display = filtersPanel.style.display === 'none' ? 'block' : 'none'; });
applyFilters.addEventListener('click', () => {
  state.category = document.getElementById('f-category').value;
  state.min = document.getElementById('f-min').value;
  state.max = document.getElementById('f-max').value;
  state.availability = document.getElementById('f-availability').value;
  state.sort = document.getElementById('f-sort').value;
  state.page = 1;
  filtersPanel.style.display = 'none';
  window.history.pushState(null, '', '?' + paramsFromState().toString());
  loadProducts();
});
resetFilters.addEventListener('click', () => {
  state = { q: '', category: '', min: '', max: '', availability: 'all', sort: 'newest', page: 1 };
  qInput.value = '';
  renderFilters();
  window.history.replaceState(null, '', '/shop.html');
  loadProducts();
});
form.addEventListener('submit', (e) => {
  e.preventDefault();
  state.q = qInput.value.trim();
  state.page = 1;
  window.history.pushState(null, '', '?' + paramsFromState().toString());
  loadProducts();
});

// Init
readParams();
renderFilters();
window.addEventListener('popstate', () => { readParams(); renderFilters(); loadProducts(); });
loadDbStatus();
loadCategories();
loadProducts();
