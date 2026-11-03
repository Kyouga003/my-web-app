// Product detail page
import { supabase } from '/js/init.js';
import { formatMoney, formatDateTime, escapeHtml, renderStars, showToast } from '/js/ui.js';
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
    .select('*, product_images(*), shops(*)')
    .eq('id', productId)
    .single();
  if (error || !data) {
    loadingEl.style.display = 'none';
    notFoundEl.style.display = 'block';
    return;
  }
  const p = data;
  document.title = escapeHtml(p.name) + ' — YouMadeIt';
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
  attrEl.innerHTML = attrs.length ? '<h4 style="margin-bottom:0.75rem">Product details</h4>' + attrs.map(a => `
    <div style="display:flex;justify-content:space-between;padding:0.6rem 0;border-bottom:1px solid var(--border)">
      <span style="color:var(--text-secondary);font-weight:500">${escapeHtml(a.label)}</span>
      <span style="text-align:right;max-width:60%">${escapeHtml(a.value)}</span>
    </div>`).join('') : '';

  if (stock <= 0) stockEl.innerHTML = '<div class="product-stock out" style="color:var(--danger)">Sold out</div>';
  else if (stock <= 3) stockEl.innerHTML = '<div class="product-stock low" style="color:var(--warning)">Only ' + stock + ' left in stock</div>';
  else stockEl.innerHTML = '<div class="text-secondary" style="font-size:0.9rem">' + stock + ' in stock</div>';

  const images = (p.product_images || []).filter(img => img.url);
  const mainEl = document.getElementById('product-gallery-main');
  const thumbEl = document.getElementById('product-gallery-thumbs');
  const setImg = (url) => { mainEl.innerHTML = '<img src="' + escapeHtml(url) + '" alt="' + escapeHtml(p.name) + '" style="width:100%;height:100%;object-fit:cover" onerror="this.src=\'/images/placeholder.svg\'">'; };
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
  let html = '<div style="display:flex;align-items:center;gap:0.75rem;flex-wrap:wrap">';
  html += '<div style="display:flex;align-items:center;gap:0.5rem"><label for="product-qty" style="font-size:0.9rem;color:var(--text-secondary);font-weight:500">Quantity:</label> ';
  html += '<input type="number" id="product-qty" value="1" min="1" max="' + stock + '" ' + (isSoldOut ? 'disabled' : '') + ' style="width:80px;padding:0.6rem;border:1px solid var(--border);border-radius:var(--radius);background:var(--surface);color:var(--text-primary)"> </div>';
  if (isSoldOut) {
    html += '<button class="btn btn-ghost" disabled>Sold out</button>';
  } else {
    html += '<button id="product-add-cart" class="btn btn-primary">Add to cart</button> ';
  }
  html += '<button class="fav-btn" id="product-fav" data-product-id="' + p.id + '" aria-label="Add to favorites" title="Add to favorites"><svg class="fav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg></button>';
  html += '</div>';
  const actionsDiv = document.getElementById('product-actions');
  actionsDiv.innerHTML = html;
  const contactBtn = document.createElement('button');
  contactBtn.type = 'button';
  contactBtn.className = 'btn btn-outline';
  contactBtn.textContent = 'Contact the seller';
  actionsDiv.appendChild(contactBtn);

  document.getElementById('product-add-cart')?.addEventListener('click', async () => {
    const qty = parseInt(document.getElementById('product-qty').value) || 1;
    if (qty > stock) {
      return showToast('Not enough stock available.', 'error');
    }
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

  // Initial favorite state
  (async () => {
    try {
      const { currentUser: u2 } = await import('/js/init.js');
      if (u2) {
        const { data: fav } = await supabase.from('favorites').select('id').eq('product_id', p.id).eq('user_id', u2.id).maybeSingle();
        if (fav) btn.classList.add('active');
      }
    } catch (_) {}
  })();

  // Review eligibility: a buyer may review a product from a completed order.
  // The server enforces this via Row Level Security on the reviews table.
  (async () => {
    try {
      const { currentUser: u3 } = await import('/js/init.js');
      if (!u3) return;
      const { data: mine } = await supabase.from('reviews').select('id, rating, comment, created_at').eq('product_id', p.id).eq('buyer_id', u3.id).order('created_at', { ascending: false }).limit(1);
      const reviewsEl = document.getElementById('product-reviews');
      if (mine && mine.length) {
        reviewsEl.insertAdjacentHTML('beforeend', '<p class="form-hint" style="margin-top:1rem">You reviewed this product on ' + formatDateTime(mine[0].created_at) + '.</p>');
        return;
      }
      const { data: items } = await supabase.from('order_items').select('id, orders(status, created_at)').eq('product_id', p.id).eq('orders.buyer_id', u3.id).eq('orders.status', 'completed').order('orders.created_at', { ascending: false }).limit(1);
      const eligible = (items || [])[0];
      if (!eligible) return;
      const orderItemId = eligible.id;
      const formHtml = '<div class="review-form" style="border:1px solid var(--border);border-radius:var(--radius);padding:1rem;margin-top:1.5rem">' +
        '<h4 style="margin-top:0">Write a review</h4>' +
        '<div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.75rem">' +
        '<span style="font-size:1.3rem;color:var(--text-secondary)">Rating</span>' +
        '<div id="review-stars" style="color:#d8cee3;cursor:pointer;display:flex;gap:0.25rem;font-size:1.4rem">&#9734;&#9734;&#9734;&#9734;&#9734;</div>' +
        '<input type="hidden" id="review-rating" value="0">' +
        '</div>' +
        '<textarea id="review-comment" class="form-textarea" placeholder="Share your experience with this handmade piece…" style="min-height:96px"></textarea>' +
        '<button class="btn btn-primary btn-sm" id="review-submit">Submit review</button>' +
        '<p id="review-message" style="color:var(--danger);font-size:0.85rem;margin-top:0.5rem;display:none"></p>' +
        '</div>';
      reviewsEl.insertAdjacentHTML('beforeend', formHtml);
      let ratingValue = 0;
      const starsEl = document.getElementById('review-stars');
      const ratingInput = document.getElementById('review-rating');
      const updateStars = () => {
        starsEl.innerHTML = '';
        for (let i = 1; i <= 5; i++) {
          const s = document.createElement('span');
          s.textContent = '&#9733;';
          s.style.color = i <= ratingValue ? 'var(--brand-purple)' : 'var(--text-secondary)';
          s.style.cursor = 'pointer';
          s.dataset.value = i;
          starsEl.appendChild(s);
        }
      };
      starsEl.addEventListener('click', (e) => {
        const v = parseInt(e.target.dataset.value, 10);
        if (v) { ratingValue = v; ratingInput.value = v; updateStars(); }
      });
      updateStars();
      document.getElementById('review-submit').addEventListener('click', async () => {
        const comment = document.getElementById('review-comment').value.trim();
        if (!ratingValue) return document.getElementById('review-message').textContent = 'Please select a rating.';
        if (!comment) return document.getElementById('review-message').textContent = 'Please write a few words.';
        document.getElementById('review-message').style.display = 'none';
        const { error } = await supabase.from('reviews').insert([{
          product_id: p.id, order_item_id: orderItemId, buyer_id: u3.id, rating: ratingValue, comment
        }]);
        if (error) return document.getElementById('review-message').textContent = error.message || 'Could not submit review.';
        showToast('Review submitted.');
        document.getElementById('review-submit').disabled = true;
        document.getElementById('review-submit').textContent = 'Submitted';
      });
    } catch (_) {}
  })();

  // Contact the seller (requires sign-in; stored as a seller inquiry).
  (async () => {
    try {
      const { currentUser: u4 } = await import('/js/init.js');
      if (!u4) return;
      const actions = document.getElementById('product-actions');
      const contactBtn = Array.from(actions.querySelectorAll('button')).find(b => b.textContent.includes('Contact'));
      if (!contactBtn) return;
      const formHtml = '<div id="inquiry-form-wrap" style="border:1px solid var(--border);border-radius:var(--radius-lg);padding:1.25rem;margin-top:1.25rem;background:var(--surface-alt);display:none">' +
        '<h4 style="margin-top:0">Message the maker</h4>' +
        '<div class="form-group"><label for="inquiry-subject">Subject</label><input type="text" id="inquiry-subject" class="form-input" placeholder="Question about materials or personalisation"></div>' +
        '<div class="form-group"><label for="inquiry-message">Message</label><textarea id="inquiry-message" class="form-textarea" placeholder="What would you like to ask?" style="min-height:96px"></textarea></div>' +
        '<div style="display:flex;gap:0.75rem;flex-wrap:wrap"><button class="btn btn-primary btn-sm" id="inquiry-submit">Send message</button><button class="btn btn-ghost btn-sm" id="inquiry-cancel">Cancel</button></div>' +
        '<p id="inquiry-message-msg" style="color:var(--danger);font-size:0.85rem;margin-top:0.5rem;display:none"></p>' +
        '</div>';
      contactBtn.parentElement.insertAdjacentHTML('afterend', formHtml);
      const wrap = document.getElementById('inquiry-form-wrap');
      contactBtn.addEventListener('click', () => { wrap.style.display = wrap.style.display === 'none' ? 'block' : 'none'; if (wrap.style.display === 'block') window.scrollTo({ top: wrap.offsetTop - 100, behavior: 'smooth' }); });
      document.getElementById('inquiry-cancel').addEventListener('click', () => { wrap.style.display = 'none'; });
      document.getElementById('inquiry-submit').addEventListener('click', async () => {
        const subject = document.getElementById('inquiry-subject').value.trim();
        const message = document.getElementById('inquiry-message').value.trim();
        if (!subject || !message) return document.getElementById('inquiry-message-msg').textContent = 'Please fill in both fields.';
        document.getElementById('inquiry-message-msg').style.display = 'none';
        const { error } = await fetchJson('/api/seller-inquiries', {
          shop_id: p.shops.id, product_id: p.id, subject, message
        });
        if (error) return document.getElementById('inquiry-message-msg').textContent = error;
        showToast('Message sent to the seller.');
        wrap.style.display = 'none';
        document.getElementById('inquiry-subject').value = '';
        document.getElementById('inquiry-message').value = '';
      });
    } catch (_) {}
  })();

  async function fetchJson(path, body) {
    const { currentUser: cu } = await import('/js/init.js');
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: session ? 'Bearer ' + session.access_token : '' },
      body: JSON.stringify(body)
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { error: json.error || json.message || 'Request failed (' + res.status + ')' };
    return { data: json };
  }

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
  const { data } = await supabase.from('reviews').select('*, profiles:public_profiles(display_name, avatar_url)').eq('product_id', productId).order('created_at', { ascending: false });
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
  let query = supabase.from('products').select('*, product_images(*)').limit(6);
  if (categoryId) query = query.eq('category_id', categoryId);
  const { data } = await query;
  const rows = (data || []).filter(p => p.id !== excludeId).slice(0, 4);
  const el = document.getElementById('product-related');
  if (rows.length === 0) { el.innerHTML = '<p style="color:var(--text-secondary)">No related products.</p>'; return; }
  el.innerHTML = rows.map(p => {
    const imgs = p.product_images || [];
    const main = imgs.find(i => i.is_main && i.url) || imgs.find(i => i.url) || {};
    const stock = p.quantity == null ? 0 : p.quantity;
    return `
      <article class="product-card">
        <div class="product-card-media">
          <img src="${escapeHtml(main.url || '/images/placeholder.svg')}" alt="${escapeHtml(p.name)}" loading="lazy" onerror="this.src='/images/placeholder.svg'">
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
