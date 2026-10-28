// Seller product management
import { supabase } from '/js/init.js';
import { formatMoney, escapeHtml, showToast } from '/js/ui.js';
import { renderAuthLinks, updateCartCount } from '/js/nav.js';

const cfg = window.SUPABASE_CONFIG || {};
const wrap = document.getElementById('seller-products-wrap');
const requireAuthEl = document.getElementById('seller-products-require-auth');
const tableWrap = document.getElementById('products-table-wrap');
const emptyEl = document.getElementById('products-empty');

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
  const prof = currentUser ? await supabase.from('profiles').select('role').eq('id', currentUser.id).single() : null;
  renderAuthLinks(currentUser, prof && prof.data);
  if (!currentUser) {
    requireAuthEl.style.display = 'block';
    updateCartCount(0);
    return;
  }
  requireAuthEl.style.display = 'none';
  const role = prof.data.role;
  updateCartCount(0);
  if (role !== 'seller' && role !== 'admin') {
    wrap.innerHTML = '<div class="empty-state"><h2>Seller account required</h2><p>Open a shop from the seller dashboard to list products.</p><a href="seller-dashboard.html" class="btn btn-primary">Go to seller dashboard</a></div>';
    wrap.style.display = 'block';
    return;
  }
  wrap.style.display = 'block';
  loadCategories();
  loadProducts();
});

async function loadCategories() {
  const { data } = await supabase.from('categories').select('*').order('name');
  const sel = document.getElementById('prod-category');
  sel.innerHTML = '<option value="">None</option>' + (data || []).map(c => '<option value="' + c.id + '">' + escapeHtml(c.name) + '</option>').join('');
}

async function loadProducts() {
  const me = await getMe();
  const { data } = await supabase.from('products').select('*, product_images(url, is_main)').eq('seller_id', me.id).order('created_at', { ascending: false });
  const rows = data || [];
  renderTable(rows);
}

function statusBadge(s) {
  return s === 'published' ? '<span class="badge badge-success">Published</span>' : '<span class="badge badge-draft">Draft</span>';
}

function renderTable(rows) {
  if (!rows.length) {
    tableWrap.style.display = 'none';
    emptyEl.style.display = 'block';
    return;
  }
  emptyEl.style.display = 'none';
  tableWrap.style.display = 'block';
  let html = '<table><thead><tr><th>Image</th><th>Product</th><th>Status</th><th>Price</th><th>Stock</th><th>Updated</th><th>Actions</th></tr></thead><tbody>';
  rows.forEach(p => {
    const main = (p.product_images || [])[0];
    const stock = p.quantity || 0;
    const stockClass = stock <= 0 ? 'out' : stock <= 2 ? 'low' : 'ok';
    const updated = new Date(p.updated_at).toLocaleDateString();
    html += `
      <tr>
        <td><img src="${escapeHtml(main ? main.url : '/images/placeholder.svg')}" alt="" style="width:48px;height:60px;object-fit:cover;border:1px solid var(--border);border-radius:6px"></td>
        <td style="font-weight:600">${escapeHtml(p.name)}</td>
        <td>${statusBadge(p.status)}</td>
        <td>${formatMoney(p.price_cents, p.currency)}</td>
        <td><span class="product-stock ${stockClass}">${stock <= 0 ? 'Sold out' : stock}</span></td>
        <td>${updated}</td>
        <td>
          <button class="btn-ghost btn-sm" onclick="editProduct('${p.id}')">Edit</button>
          <button class="btn-ghost btn-sm" onclick="togglePublish('${p.id}', ${p.status === 'published'})">${p.status === 'published' ? 'Unpublish' : 'Publish'}</button>
          <button class="btn-ghost btn-sm" onclick="deleteProduct('${p.id}')" style="color:var(--danger)">Delete</button>
        </td>
      </tr>`;
  });
  html += '</tbody></table>';
  tableWrap.innerHTML = html;
}

window.togglePublish = async (id, currentlyPublished) => {
  const { error } = await supabase.from('products').update({ status: currentlyPublished ? 'draft' : 'published', ...(currentlyPublished ? {} : { published_at: new Date().toISOString() }) }).eq('id', id);
  if (error) return alert('Failed: ' + error.message);
  showToast(currentlyPublished ? 'Product unpublished.' : 'Product published.');
  loadProducts();
};

window.deleteProduct = async (id) => {
  if (!confirm('Delete this product? This cannot be undone.')) return;
  const { error } = await supabase.from('products').delete().eq('id', id);
  if (error) return alert('Failed: ' + error.message);
  showToast('Product deleted.');
  loadProducts();
};

window.togglePublish = async (id, currentlyPublished) => {
  const { error } = await supabase.from('products').update({ status: currentlyPublished ? 'draft' : 'published', ...(currentlyPublished ? {} : { published_at: new Date().toISOString() }) }).eq('id', id);
  if (error) return alert('Failed: ' + error.message);
  showToast(currentlyPublished ? 'Product unpublished.' : 'Product published.');
  loadProducts();
};

window.deleteProduct = async (id) => {
  if (!confirm('Delete this product? This cannot be undone.')) return;
  const { error } = await supabase.from('products').delete().eq('id', id);
  if (error) return alert('Failed: ' + error.message);
  showToast('Product deleted.');
  loadProducts();
};

window.editProduct = async (id) => {
  const { data: p } = await supabase.from('products').select('*, product_images(url, is_main)').eq('id', id).single();
  if (!p) return;
  const imgList = p.product_images || [];
  document.getElementById('prod-id').value = p.id;
  document.getElementById('prod-name').value = p.name;
  document.getElementById('prod-desc').value = p.description || '';
  document.getElementById('prod-price').value = (p.price_cents / 100).toFixed(2);
  document.getElementById('prod-qty').value = p.quantity || 0;
  document.getElementById('prod-category').value = p.category_id || '';
  document.getElementById('prod-publish').checked = p.status === 'published';
  const mainEl = document.getElementById('prod-image-preview');
  const thumbs = document.getElementById('prod-thumbs');
  if (thumbs) { thumbs.innerHTML = ''; }
  if (mainEl) {
    mainEl.innerHTML = imgList.length ? `<img src="${escapeHtml(imgList[0].url)}" style="width:100%;height:200px;object-fit:cover;border-radius:var(--radius)">` : '<div id="prod-image-drop" class="image-upload" style="padding:1.5rem">Drop a main image here or <input type="file" id="prod-image" accept="image/*"></div>';
  }
  document.getElementById('modal-title').textContent = 'Edit product';
  modal.style.display = 'flex';
  openModal(modal);
};

const modal = document.getElementById('product-modal');
document.getElementById('modal-close').addEventListener('click', () => { modal.style.display = 'none'; });
modal.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });
document.getElementById('modal-cancel').addEventListener('click', () => { modal.style.display = 'none'; });

document.getElementById('btn-add-product').addEventListener('click', () => {
  document.getElementById('prod-id').value = '';
  document.getElementById('prod-name').value = '';
  document.getElementById('prod-desc').value = '';
  document.getElementById('prod-price').value = '';
  document.getElementById('prod-qty').value = '0';
  document.getElementById('prod-category').value = '';
  document.getElementById('prod-publish').checked = false;
  const mainEl = document.getElementById('prod-image-preview');
  if (mainEl) mainEl.innerHTML = '<div class="image-upload" id="prod-image-drop" style="padding:1.5rem">Drop an image here or <input type="file" id="prod-image" accept="image/*"></div>';
  document.getElementById('modal-title').textContent = 'Add product';
  modal.style.display = 'flex';
  openModal(modal);
});

window.addProduct = async () => {
  const name = document.getElementById('prod-name').value.trim();
  const desc = document.getElementById('prod-desc').value.trim();
  const me = await getMe();
  const price = parseFloat(document.getElementById('prod-price').value);
  const qty = parseInt(document.getElementById('prod-qty').value) || 0;
  const categoryId = document.getElementById('prod-category').value;
  if (!name || isNaN(price) || price < 0) return alert('Please fill in name and price.');
  const { data: product, error: pe } = await supabase.from('products').insert([{
    seller_id: me.id, shop_id: me.shop_id, category_id: categoryId, name, description: desc,
    price_cents: Math.round(price * 100), currency: 'USD', status: document.getElementById('prod-publish').checked ? 'published' : 'draft',
    quantity: qty
  }]).select().single();
  if (pe) return alert('Could not save product: ' + pe.message);

  const mainInput = document.getElementById('prod-image');
  const file = mainInput?.files?.[0];
  if (file) {
    const path = 'products/' + product.id + '/' + Date.now() + '-' + file.name.replace(/\s+/g, '_');
    const res = await fetch(cfg.url + '/storage/v1/object/product-images/' + path, {
      method: 'PUT', headers: { Authorization: 'Bearer ' + (await supabase.auth.getSession()).data.session.access_token, 'x-upsert': 'true' }, body: file
    });
    if (res.ok) {
      await supabase.from('product_images').insert([{ product_id: product.id, storage_path: path, url: cfg.url + '/storage/v1/object/public/product-images/' + path, is_main: true }]);
    }
  }
  showToast('Product saved.');
  modal.style.display = 'none';
  loadProducts();
};

document.addEventListener('click', (e) => {
  const input = e.target.closest('#prod-image');
  if (input) input.click();
});
document.addEventListener('drop', (e) => {
  const drop = e.target.closest('#prod-image-drop');
  if (drop && e.dataTransfer.files.length) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file.type.startsWith('image/')) return alert('Please drop an image.');
    const reader = new FileReader();
    reader.onload = () => {
      const preview = document.getElementById('prod-image-preview');
      if (preview) preview.innerHTML = `<img src="${escapeHtml(reader.result)}" style="width:100%;height:200px;object-fit:cover;border-radius:var(--radius)">`;
    };
    reader.readAsDataURL(file);
  }
});

// Input + drop-zone wiring for the product form
const mainInput = document.getElementById('prod-image');
if (mainInput) {
  mainInput.addEventListener('change', () => {
    const file = mainInput.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return alert('Please select an image file.');
    if (file.size > 4 * 1024 * 1024) return alert('Image must be under 4 MB.');
    const reader = new FileReader();
    reader.onload = () => {
      const preview = document.getElementById('prod-image-preview');
      if (preview) preview.innerHTML = `<img src="${escapeHtml(reader.result)}" style="width:100%;height:200px;object-fit:cover;border-radius:var(--radius)">`;
    };
    reader.readAsDataURL(file);
  });
}
document.getElementById('product-form').addEventListener('submit', (e) => {
  e.preventDefault();
  window.addProduct();
});
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { modal.style.display = 'none'; }
});
loadDbStatus();
