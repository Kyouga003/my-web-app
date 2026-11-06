// Favorites page
import { supabase } from '/js/init.js';
import { formatMoney, escapeHtml } from '/js/ui.js';
import { renderAuthLinks, updateCartCount } from '/js/nav.js';

const grid = document.getElementById('fav-grid');
const emptyEl = document.getElementById('fav-empty');
const loadingEl = document.getElementById('fav-loading');
const requireLoginEl = document.getElementById('fav-require-login');
const contentBox = document.getElementById('fav-content-box');
const sortSelect = document.getElementById('fav-sort');
let favRows = [];

function cmp(a,b,key,dir){ let av=a[key],bv=b[key]; if(key==='created_at'){ av=av?new Date(av).getTime():0; bv=bv?new Date(bv).getTime():0; } if(typeof av==='string') av=av.toLowerCase(); if(typeof bv==='string') bv=bv.toLowerCase(); if(av==null&&bv==null) return 0; if(av==null) return 1; if(bv==null) return -1; return (av<bv?-1:av>bv?1:0)*dir; }
function sortedFav(rows, mode) {
  const list = rows.map(r => ({ favId: r.id, savedAt: r.created_at, p: r.products, _name: r.products?.name||'', _price: r.products?.price_cents||0, _saved: r.created_at||'' })).filter(x=>x.p);
  if (mode==='saved-asc') list.sort((a,b)=>cmp(a,b,'_saved',1));
  else if (mode==='alpha-asc') list.sort((a,b)=>cmp(a,b,'_name',1));
  else if (mode==='alpha-desc') list.sort((a,b)=>cmp(a,b,'_name',-1));
  else if (mode==='price-asc') list.sort((a,b)=>cmp(a,b,'_price',1));
  else if (mode==='price-desc') list.sort((a,b)=>cmp(a,b,'_price',-1));
  else list.sort((a,b)=>cmp(a,b,'_saved',-1));
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
  const prof = currentUser ? await supabase.from('profiles').select('role,display_name').eq('id', currentUser.id).maybeSingle() : null;
  renderAuthLinks(currentUser, prof && prof.data);
  if (!currentUser) {
    requireLoginEl.style.display = 'block';
    loadingEl.style.display = 'none';
    if (contentBox) contentBox.style.display = 'none';
    updateCartCount(0);
    return;
  }
  requireLoginEl.style.display = 'none';
  loadFavorites();
});

function productCard(p) {
  const imgs = p.product_images || [];
  const main = imgs.find(i=>i.is_main) || imgs[0];
  const stock = p.quantity == null ? 0 : p.quantity;
  return `
    <article class="product-card">
      <div class="product-card-media">
        <a href="product.html?id=${p.id}">
          <img src="${escapeHtml(main ? main.url : '/images/placeholder.svg')}" alt="${escapeHtml(p.name || '')}" loading="lazy" onerror="this.src='/images/placeholder.svg'">
        </a>
        ${stock <= 0 ? '<span class="product-badge soldout">Sold Out</span>' : ''}
        <button class="fav-btn active" data-product-id="${p.id}" aria-label="Remove favorite">
          <svg class="fav-icon" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5">
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

function renderFavorites() {
  const rows = sortedFav(favRows, sortSelect?.value || 'saved-desc');
  if (!rows.length) {
    if (contentBox) contentBox.style.display = 'none';
    emptyEl.style.display = 'block';
    return;
  }
  emptyEl.style.display = 'none';
  if (contentBox) contentBox.style.display = 'block';
  grid.innerHTML = rows.map(x => productCard(x.p)).join('');
  grid.querySelectorAll('.fav-btn.active').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault(); e.stopPropagation();
      const id = btn.dataset.productId;
      await supabase.from('favorites').delete().eq('product_id', id);
      favRows = favRows.filter(r => r.products?.id !== id);
      renderFavorites();
    });
  });
}

async function loadFavorites() {
  const { data, error } = await supabase
    .from('favorites')
    .select('id,created_at,products(*,product_images(url,is_main),categories(name))')
    .order('created_at', { ascending: false });
  loadingEl.style.display = 'none';
  if (error || !data || !data.length) {
    favRows = [];
    if (contentBox) contentBox.style.display = 'none';
    emptyEl.style.display = 'block';
    return;
  }
  favRows = data;
  renderFavorites();
}

if (sortSelect) sortSelect.addEventListener('change', renderFavorites);
loadDbStatus();
