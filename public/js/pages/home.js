// Homepage: featured products + categories
import { supabase } from '/js/init.js';
import { formatMoney, escapeHtml } from '/js/ui.js';
import { renderAuthLinks, updateCartCount } from '/js/nav.js';

const featuredGrid = document.getElementById('featured-grid');
const categoryGrid = document.getElementById('category-grid');
const setupBanner = document.getElementById('setup-banner');

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
        <div class="product-seller">by ${escapeHtml(p.seller_name || 'a maker')}</div>
        <div class="product-stock ${stockClass}">${stockLabel}</div>
      </div>
      <div class="product-card-footer">
        <a href="product.html?id=${p.id}" class="btn btn-sm btn-ghost">View</a>
        <a href="shop.html" class="btn btn-sm btn-outline">Shop</a>
      </div>
    </article>
  `;
}

async function loadFeatured() {
  if (!supabase) return;
  featuredGrid.innerHTML = '<div class="loading-state"><div class="skeleton-lg"></div></div>';
  try {
    const { data, error } = await supabase
      .from('products')
      .select('*, product_images(url, is_main), categories(name), profiles(display_name)')
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .limit(8);
    if (error) throw error;
    const rows = data || [];
    if (rows.length === 0) {
      featuredGrid.innerHTML = '<div class="empty-state"><h2>No listings yet</h2><p>The marketplace is waiting for its first products. <a href="seller-dashboard.html" class="btn btn-primary">Start selling</a></p></div>';
    } else {
      featuredGrid.innerHTML = rows.map(productCard).join('');
      wireFavButtons();
    }
  } catch (err) {
    featuredGrid.innerHTML = '<div class="empty-state"><h2>Unable to load products</h2><p>' + escapeHtml(err.message) + '</p></div>';
  }
}

async function loadCategories() {
  if (!supabase) return;
  try {
    const { data, error } = await supabase.from('categories').select('*').order('name').limit(8);
    if (error) throw error;
    const rows = data || [];
    if (rows.length === 0) {
      categoryGrid.innerHTML = '<div class="empty-state"><p>No categories yet.</p></div>';
    } else {
      categoryGrid.innerHTML = rows.map(c => `
        <a href="shop.html?category=${encodeURIComponent(c.slug)}" class="product-card" style="flex-direction:row; align-items:center; text-align:left;">
          <div style="width:72px;height:72px;background:var(--warm-beige);border-radius:var(--radius);display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-right:1rem;font-size:2rem;">✧</div>
          <div>
            <div class="product-cat" style="margin-bottom:0.25rem">${escapeHtml(c.name)}</div>
            <div style="font-size:0.85rem;color:var(--text-secondary)">${escapeHtml(c.description || '')}</div>
          </div>
        </a>
      `).join('');
    }
  } catch (err) {
    categoryGrid.innerHTML = '';
  }
}

function wireFavButtons() {
  document.querySelectorAll('.fav-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
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

loadDbStatus();
loadFeatured();
loadCategories();
