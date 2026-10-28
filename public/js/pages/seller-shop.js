// Public seller shop page
import { supabase } from '/js/init.js';
import { formatMoney, formatDateTime, escapeHtml, showToast } from '/js/ui.js';

const slug = new URLSearchParams(window.location.search).get('slug');
const loadingEl = document.getElementById('shop-loading');
const contentEl = document.getElementById('shop-content');
const notFoundEl = document.getElementById('shop-not-found');

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

async function loadShop() {
  if (!slug) {
    notFoundEl.style.display = 'block';
    loadingEl.style.display = 'none';
    return;
  }
  loadingEl.style.display = 'none';
  contentEl.style.display = 'none';
  const { data, error } = await supabase
    .from('shops')
    .select('*, profiles(*)')
    .eq('slug', slug)
    .single();
  if (error || !data) {
    notFoundEl.style.display = 'block';
    notFoundEl.querySelector('p').textContent = 'This shop does not exist or has been taken down.';
    return;
  }
  const shop = data;
  contentEl.style.display = 'block';
  document.title = escapeHtml(shop.name) + ' — Handmade & Co.';
  document.getElementById('shop-name').textContent = shop.name;
  document.getElementById('shop-seller').textContent = shop.profiles?.display_name || 'A maker';
  document.getElementById('shop-desc').textContent = shop.description || 'No introduction yet.';
  document.getElementById('shop-processing-text').textContent = shop.processing_time || '—';
  document.getElementById('shop-shipping-text').textContent = shop.shipping_info || '—';
  document.getElementById('shop-return-text').textContent = shop.return_policy || '—';
  const contact = document.getElementById('shop-contact-link');
  if (shop.social_links?.email) {
    contact.href = 'mailto:' + shop.social_links.email;
  } else {
    contact.textContent = 'Contact the maker';
  }
  const permalink = document.getElementById('share-link');
  permalink.href = window.location.href;
  permalink.textContent = window.location.href;

  const banner = document.getElementById('shop-banner-img');
  if (shop.banner_url) banner.innerHTML = '<img src="' + escapeHtml(shop.banner_url) + '" style="width:100%;height:320px;object-fit:cover;border-radius:var(--radius)" alt="">';
  document.getElementById('shop-banner').innerHTML = '<div style="padding:1rem;background:var(--soft-lilac);border-radius:var(--radius)">Shop: <code>'+ escapeHtml(shop.slug) +'</code></div>';

  const { data: products } = await supabase
    .from('products')
    .select('*, product_images(url, is_main), categories(name)')
    .eq('shop_id', shop.id)
    .eq('status', 'published')
    .order('created_at', { ascending: false });
  const rows = products || [];
  const grid = document.getElementById('shop-products');
  if (!rows.length) {
    grid.innerHTML = '<div class="empty-state"><h2>No products listed yet.</h2><p>This seller will publish their work soon.</p></div>';
    return;
  }
  grid.innerHTML = rows.map(p => {
    const img = (p.product_images || [])[0];
    const stock = p.quantity == null ? 0 : p.quantity;
    const stockClass = stock <= 0 ? 'out' : stock <= 2 ? 'low' : 'ok';
    return `
      <article class="product-card">
        <div class="product-card-media">
          <img src="${escapeHtml(img ? img.url : '/images/placeholder.svg')}" alt="${escapeHtml(p.name)}" loading="lazy">
          ${stock <= 0 ? '<span class="badge badge-outline">Sold out</span>' : ''}
        </div>
        <div class="product-card-info">
          <div class="product-cat">${escapeHtml(p.category_name || 'Handmade')}</div>
          <h3><a href="product.html?id=${p.id}">${escapeHtml(p.name)}</a></h3>
          <div class="product-price">${formatMoney(p.price_cents, p.currency)}</div>
        </div>
      </article>
    `;
  }).join('');
}

loadDbStatus();
loadShop();
