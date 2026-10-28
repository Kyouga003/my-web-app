// Product detail page
import { supabase } from '/js/init.js';
import { formatMoney, formatDateTime, escapeHtml, renderStars } from '/js/ui.js';
import { renderAuthLinks, updateCartCount } from '/js/nav.js';

const params = new URLSearchParams(window.location.search);
const productId = params.get('id');

const loadingEl = document.getElementById('product-loading');
const contentEl = document.getElementById('product-content');
const notFoundEl = document.getElementById('product-not-found');

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
  if (currentUser) {
    try {
      const { data: cart } = await supabase.from('carts').select('id').eq('user_id', currentUser.id).maybeSingle();
      if (cart) {
        const { data: items } = await supabase.from('cart_items').select('quantity').eq('cart_id', cart.id);
        updateCartCount(items ? items.reduce((s, i) => s + (i.quantity || 0), 0) : 0);
      }
    } catch (_) {}
  } else { updateCartCount(0); }
});

async function loadProduct() {
  if (!supabase || !productId) { notFoundEl.style.display = 'block'; loadingEl.style.display = 'none'; return; }
  const { data, error } = await supabase
    .from('products')
    .select('*, product_images(*), shops(*), categories(*), profiles(display_name)')
    .eq('id', productId)
    .single();
  if (error || !data) {
    loadingEl.style.display = 'none';
    notFoundEl.style.display = 'block';
    return;
  }
  const p = data;
  document.title = escapeHtml(p.name) + ' — Handmade & Co.';
  document.getElementById('product-name').textContent = p.name;
  document.getElementById('product-description').textContent = p.description || 'No description provided.';
  document.getElementById('product-price').textContent = formatMoney(p.price_cents, p.currency);
  document.getElementById('product-seller-name').textContent = p.shops?.name || 'Unknown maker';
  document.getElementById('product-seller-name').onclick = () => { window.location.href = 'seller-shop.html?slug=' + encodeURIComponent(p.shops?.slug || ''); };
  document.getElementById('product-seller-name').style.cursor = 'pointer';

  const meta = [];
  if (p.status !== 'published') meta.push('<span class="badge badge-draft">Draft / not public</span>');
  meta.push('<span class="badge badge-success">By ' + escapeHtml(p.shops?.name || 'a maker') + '</span>');
  document.getElementById('product-meta').innerHTML = meta.join('');

  const attrs = [];
  if (p.materials) attrs.push({ label: 'Materials', value: p.materials });
  if (p.dimensions) attrs.push({ label: 'Dimensions', value: p.dimensions });
  if (p.weight) attrs.push({ label: 'Weight', value: p.weight });
  if (p.color) attrs.push({ label: 'Color', value: p.color });
  if (p.style) attrs.push({ label: 'Style', value: p.style });
  if (p.personalization) attrs.push({ label: 'Personalization', value: p.personalization });
  if (p.processing_time) attrs.push({ label: 'Processing time', value: p.processing_time });
  if (p.shipping_info) attrs.push({ label: 'Shipping', value: p.shipping_info });
  const attrEl = document.getElementById('product-attrs');
  attrEl.innerHTML = attrs.map(a => `
    <div style="display:flex;justify-content:space-between;padding:0.5rem 0;border-bottom:1px solid var(--border)">
      <span style="color:var(--text-secondary)">${escapeHtml(a.label)}</span>
      <span>${escapeHtml(a.value)}</span>
    </div>`).join('') || '<p style="color:var(--text-secondary)">No additional details provided.</p>';

  const stockEl = document.getElementById('product-stock');
  const stock = p.quantity == null ? 0 : p.quantity;
  if (stock <= 0) stockEl.innerHTML = '<div class="product-stock out">Sold out</div>';
  else if (stock <= 3) stockEl.innerHTML = '<div class="product-stock low">Only ' + stock + ' left in stock</div>';

  const images = p.product_images || [];
  const mainEl = document.getElementById('product-gallery-main');
  const thumbEl = document.getElementById('product-gallery-thumbs');
  const setImg = (url) => { mainEl.innerHTML = '<img src="' + escapeHtml(url) + '" alt="' + escapeHtml(p.name) + '" style="width:100%;height:100%;object-fit:cover">;'; };
  if (images.length) {
    setImg(images[0].url);
    thumbEl.innerHTML = images.map((img, i) =>
      '<div style="width:64px;height:80px;border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;cursor:pointer;margin-right:0.5rem' + (i === 0 ? ';border-color:var(--brand-purple)' : '') + '"><img src="' + escapeHtml(img.url) + '" style="width:100%;height:100%;object-fit:cover" onclick="(function(){setMain(' + i + ')})()"></div>').join('');
  } else {
    mainEl.innerHTML = '<div style="width:100%;height:100%;background:var(--warm-beige);display:flex;align-items:center;justify-content:center;color:var(--text-secondary)">No images</div>';
  }
  window.setMain = (i) => { setImg(images[i].url); document.querySelectorAll('#product-gallery-thumbs > div').forEach((d, idx) => { d.style.borderColor = idx === i ? 'var(--brand-purple)' : 'var(--border)'; }); };

  const actions = document.getElementById('product-actions');
  const { currentUser } = await import('/js/init.js');
  const isSoldOut = stock <= 0;
  let html = '<label style="font-size:0.9rem;color:var(--text-secondary)">Quantity</label> ';
  html += '<input type="number" id="product-qty" value="1" min="1" ' + (isSoldOut ? 'disabled' : '') + ' style="width:80px;padding:0.6rem;border:1px solid var(--border);border-radius:var(--radius)"> ';
  if (isSoldOut) {
    html += '<button class="btn btn-ghost" disabled>Sold out</button>';
  } else {
    html += '<button id="product-add-cart" class="btn btn-primary">Add to cart</button> ';
  }
  html += '<button class="fav-btn" id="product-fav" data-product-id="' + p.id + '" aria-label="Favorite"><svg class="fav-fill" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg></button>';
  actions.innerHTML = html;

  document.getElementById('product-add-cart')?.addEventListener('click', async () => {
    const qty = parseInt(document.getElementById('product-qty').value) || 1;
    const { currentUser: u } = await import('/js/init.js');
    if (!u) { window.location.href = 'login.html'; return; }
    let { data: cart } = await supabase.from('carts').select('id').eq('user_id', u.id).maybeSingle();
    if (!cart) {
      const { data: created } = await supabase.from('carts').insert([{ user_id: u.id }]).select().single();
      cart = created;
    }
    const { data: existing } = await supabase.from('cart_items').select('*').eq('cart_id', cart.id).eq('product_id', p.id).maybeSingle();
    if (existing) {
      await supabase.from('cart_items').update({ quantity: existing.quantity + qty }).eq('id', existing.id);
    } else {
      await supabase.from('cart_items').insert([{ cart_id: cart.id, product_id: p.id, quantity: qty }]);
    }
    showToast(p.name + ' added to cart.');
    updateCartCountBadge();
  });

  document.getElementById('product-fav')?.addEventListener('click', async (e) => {
    e.preventDefault(); e.stopPropagation();
    const { currentUser: u } = await import('/js/init.js');
    if (!u) { window.location.href = 'login.html'; return; }
    const btn = document.getElementById('product-fav');
    const { data: existing } = await supabase.from('favorites').select('id').eq('product_id', p.id).maybeSingle();
    if (existing) {
      await supabase.from('favorites').delete().eq('id', existing.id);
      btn.classList.remove('active');
    } else {
      await supabase.from('favorites').insert([{ product_id: p.id }]);
      btn.classList.add('active');
    }
  });

  loadingEl.style.display = 'none';
  contentEl.style.display = 'block';
  loadReviews();
  loadRelated(p.category_id, p.shops.id, p.id);
}

async function updateCartCountBadge() {
  try {
    const { currentUser: u } = await import('/js/init.js');
    const { data: cart } = await supabase.from('carts').select('id').eq('user_id', u.id).maybeSingle();
    if (cart) {
      const { data: items } = await supabase.from('cart_items').select('quantity').eq('cart_id', cart.id);
      updateCartCount(items ? items.reduce((s, i) => s + (i.quantity || 0), 0) : 0);
    }
  } catch (_) {}
}

async function loadReviews() {
  const { data } = await supabase.from('reviews').select('*, profiles(display_name, avatar_url)').eq('product_id', productId).order('created_at', { ascending: false });
  const rows = data || [];
  const el = document.getElementById('product-reviews');
  if (rows.length === 0) { el.innerHTML = '<p style="color:var(--text-secondary)">No reviews yet. Be the first to review this product!</p>'; return; }
  const avg = rows.reduce((s, r) => s + r.rating, 0) / rows.length;
  el.innerHTML = '<div style="margin-bottom:1rem"><div style="font-size:1.5rem;letter-spacing:0.1rem">' + renderStars(avg).split('<span class="rating-count">')[0] + '</div><div class="text-secondary" style="font-size:0.9rem">' + rows.length + ' review' + (rows.length !== 1 ? 's' : '') + '</div></div>' +
    rows.map(r => `
      <div style="border:1px solid var(--border);border-radius:var(--radius);padding:1rem;margin-bottom:0.75rem">
        <div class="flex" style="justify-content:space-between;margin-bottom:0.4rem">
          <div><strong>${escapeHtml(r.profiles?.display_name || 'A buyer')}</strong> ${renderStars(r.rating)}</div>
          <div class="text-secondary" style="font-size:0.8rem">${formatDateTime(r.created_at)}</div>
        </div>
        <p style="margin:0">${escapeHtml(r.comment || '')}</p>
      </div>
    `).join('');
}

async function loadRelated(categoryId, shopId, excludeId) {
  let query = supabase.from('products').select('*, product_images(url, is_main), profiles(display_name)').eq('status', 'published').limit(6);
  if (categoryId) query = query.eq('category_id', categoryId);
  const { data } = await query;
  const rows = (data || []).filter(p => p.id !== excludeId).slice(0, 4);
  const el = document.getElementById('product-related');
  if (rows.length === 0) { el.innerHTML = '<p style="color:var(--text-secondary)">No related products.</p>'; return; }
  el.innerHTML = rows.map(p => {
    const main = (p.product_images || [])[0];
    const stock = p.quantity == null ? 0 : p.quantity;
    return `
      <article class="product-card">
        <div class="product-card-media">
          <img src="${escapeHtml(main ? main.url : '/images/placeholder.svg')}" alt="${escapeHtml(p.name)}" loading="lazy">
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
loadProduct();
