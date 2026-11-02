// Seller product management — create, edit, publish/unpublish, delete, images.
import { supabase } from '/js/init.js';
import { formatMoney, escapeHtml, showToast, openModal, closeModal } from '/js/ui.js';
import { renderAuthLinks, updateCartCount } from '/js/nav.js';

const cfg = window.SUPABASE_CONFIG || {};
const MAX_FILE_SIZE = 4 * 1024 * 1024;

const requireAuthEl = document.getElementById('seller-products-require-auth');
const wrap = document.getElementById('seller-products-wrap');
const tableWrap = document.getElementById('products-table-wrap');
const emptyEl = document.getElementById('products-empty');
const modal = document.getElementById('product-modal');
const form = document.getElementById('product-form');
const modalTitle = document.getElementById('modal-title');
const prodId = document.getElementById('prod-id');
const prodName = document.getElementById('prod-name');
const prodDesc = document.getElementById('prod-desc');
const prodPrice = document.getElementById('prod-price');
const prodQty = document.getElementById('prod-qty');
const prodSku = document.getElementById('prod-sku');
const prodCategory = document.getElementById('prod-category');
const prodTags = document.getElementById('prod-tags');
const prodPublish = document.getElementById('prod-publish');
const prodImageInput = document.getElementById('prod-image');
const imagesList = document.getElementById('images-list');
const btnSave = document.getElementById('prod-save');
const btnCancel = document.getElementById('modal-cancel');

let images = []; // { id, url, storage_path, is_main, sort_order, file, removed }
let editingId = null;

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

function escapeHtmlAttr(text) {
  return String(text == null ? '' : text).replace(/"/g, '&quot;');
}

window.addEventListener('authstate', async () => {
  const { currentUser } = await import('/js/init.js');
  const prof = currentUser ? await supabase.from('profiles').select('role,display_name').eq('id', currentUser.id).maybeSingle() : null;
  renderAuthLinks(currentUser, prof && prof.data);
  if (!currentUser) {
    requireAuthEl.style.display = 'block';
    updateCartCount(0);
    return;
  }
  requireAuthEl.style.display = 'none';
  wrap.style.display = 'block';
  loadCategories();
  loadProducts();
});

async function loadCategories() {
  let cats = [];
  const { data, error } = await fetchJson('/api/categories');
  if (!error && data) cats = data;
  else {
    const { data: d } = await supabase.from('categories').select('id, name').order('name');
    cats = d || [];
  }
  prodCategory.innerHTML = cats.map((c) => '<option value="' + escapeHtmlAttr(c.id) + '">' + escapeHtml(c.name) + '</option>').join('');
}

async function getSessionToken() {
  const { data: { session } } = await supabase.auth.getSession();
  return session ? session.access_token : '';
}

async function getShopId() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: shops } = await supabase.from('shops').select('id').eq('owner_id', user.id).limit(1);
  return (shops && shops[0]) ? shops[0].id : null;
}

async function loadProducts() {
  const me = (await supabase.auth.getUser()).data.user;
  if (!me) return;
  const { data, error } = await supabase
    .from('products')
    .select('*, categories(name), product_images(*)')
    .eq('seller_id', me.id)
    .order('created_at', { ascending: false });
  if (error) {
    tableWrap.innerHTML = '<div class="empty-state"><h2>Unable to load products</h2><p>' + escapeHtml(error.message) + '</p></div>';
    return;
  }
  renderProductsTable(data || []);
}

function renderProductsTable(rows) {
  if (!rows || !rows.length) {
    wrap.style.display = 'block';
    tableWrap.style.display = 'none';
    emptyEl.style.display = 'block';
    return;
  }
  wrap.style.display = 'block';
  tableWrap.style.display = '';
  emptyEl.style.display = 'none';
  let html = '<table><thead><tr><th>Image</th><th>Product</th><th>Category</th><th>Price</th><th>Stock</th><th>Status</th><th>Actions</th></tr></thead><tbody>';
  rows.forEach((p) => {
    const imgs = p.product_images || [];
    const main = imgs.find((i) => i.is_main) || imgs[0];
    const stockClass = (p.quantity || 0) <= 0 ? 'out' : (p.quantity || 0) <= 2 ? 'low' : 'ok';
    const stockLabel = (p.quantity || 0) <= 0 ? 'Sold out' : (p.quantity || 0) <= 2 ? 'Low stock' : (p.quantity || 0) + ' in stock';
    const imgUrl = main ? main.url : '/images/placeholder.svg';
    html += '\
      <tr>\
        <td><img src="' + escapeHtml(imgUrl) + '" alt="" style="width:48px;height:48px;object-fit:cover;border-radius:var(--radius);border:1px solid var(--border)"></td>\
        <td style="font-weight:600">' + escapeHtml(p.name) + '</td>\
        <td>' + escapeHtml(p.category_name || '—') + '</td>\
        <td>' + formatMoney(p.price_cents, p.currency) + '</td>\
        <td class="product-stock ' + stockClass + '">' + stockLabel + '</td>\
        <td><span class="badge ' + (p.status === 'published' ? 'badge-success' : 'badge-draft') + '">' + escapeHtml(p.status) + '</span></td>\
        <td>\
          <button class="btn-ghost btn-sm" onclick="editProduct(\'' + p.id + '\')" title="Edit details">Edit</button>\
          <button class="btn-ghost btn-sm" onclick="togglePublish(\'' + p.id + '\', \'' + (p.status === 'published' ? 'draft' : 'published') + '\')" title="' + (p.status === 'published' ? 'Unpublish' : 'Publish') + '">' + (p.status === 'published' ? 'Unpublish' : 'Publish') + '</button>\
          <button class="btn-ghost btn-sm" onclick="deleteProduct(\'' + p.id + '\', \'' + escapeHtml(p.name) + '\')" style="color:var(--danger)" title="Delete">Delete</button>\
        </td>\
      </tr>';
  });
  html += '</tbody></table>';
  tableWrap.innerHTML = html;
}

async function fetchJson(path, body, method) {
  const token = await getSessionToken();
  const res = await fetch(path, {
    method: method || (body ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: body ? JSON.stringify(body) : undefined
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return { error: json.error || json.message || 'Request failed (' + res.status + ')' };
  return { data: json };
}

function openProductModal(product) {
  editingId = product ? product.id : null;
  images = (product && product.product_images ? product.product_images.slice() : []).map((img) => ({
    id: img.id, url: img.url, storage_path: img.storage_path, is_main: img.is_main, sort_order: img.sort_order, file: null, removed: false
  }));
  if (images.length && !images.some((i) => i.is_main)) images[0].is_main = true;

  form.reset();
  prodId.value = '';
  if (product) {
    modalTitle.textContent = 'Edit product';
    prodId.value = product.id;
    prodName.value = product.name || '';
    prodDesc.value = product.description || '';
    prodPrice.value = product.price_cents ? (product.price_cents / 100).toFixed(2) : '';
    prodQty.value = product.quantity || 0;
    prodSku.value = product.sku || '';
    prodTags.value = (product.tags || []).join(', ');
    prodCategory.value = product.category_id || '';
    prodPublish.checked = product.status === 'published';
  } else {
    modalTitle.textContent = 'Add a product';
    prodName.value = '';
    prodDesc.value = '';
    prodPrice.value = '';
    prodQty.value = '0';
    prodSku.value = '';
    prodTags.value = '';
    prodCategory.value = '';
    prodPublish.checked = false;
  }
  renderImages();
  openModal(modal);
}

document.getElementById('btn-add-product').addEventListener('click', (e) => {
  e.preventDefault();
  openProductModal();
});
document.getElementById('add-first').addEventListener('click', (e) => {
  e.preventDefault();
  openProductModal();
});

btnCancel.addEventListener('click', () => closeModal(modal));
modal.querySelector('.modal-close').addEventListener('click', () => closeModal(modal));
modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(modal); });
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(modal); });

prodImageInput.addEventListener('change', (e) => {
  const files = Array.from(e.target.files || []);
  for (const file of files) {
    if (!file.type.startsWith('image/')) { showToast('Please select image files only.', 'error'); continue; }
    if (file.size > MAX_FILE_SIZE) { showToast('Image must be under 4 MB.', 'error'); continue; }
    images.push({ id: null, url: URL.createObjectURL(file), storage_path: null, is_main: false, sort_order: images.length, file, removed: false });
  }
  if (images.length && !images.some((i) => i.is_main && !i.file)) {
    const first = images.find((i) => !i.file);
    if (first) first.is_main = true;
  }
  e.target.value = '';
  renderImages();
});

function renderImages() {
  let html = '';
  images.forEach((img, index) => {
    const isMain = img.is_main && !img.removed;
    html += '\
      <div class="upload-thumb" style="display:inline-block;margin-right:0.75rem;margin-bottom:0.75rem;position:relative">\
        <img src="' + escapeHtml(img.url) + '" style="width:110px;height:110px;object-fit:cover;border:2px solid ' + (isMain ? 'var(--brand-purple)' : 'var(--border)') + ';border-radius:var(--radius)">\
        <div style="position:absolute;top:2px;left:2px;background:rgba(0,0,0,0.6);color:#fff;font-size:0.7rem;padding:0.15rem 0.4rem;border-radius:4px">' + (isMain ? 'Main' : 'Alternate') + '</div>\
        <button type="button" onclick="setMainImage(' + index + ')" style="position:absolute;bottom:2px;right:2px;background:var(--brand-purple);color:#fff;border:none;border-radius:50%;width:20px;height:20px;cursor:pointer;font-size:0.7rem;' + (isMain ? 'display:none' : 'display:block') + '">Main</button>\
        <button type="button" onclick="removeImage(' + index + ')" style="position:absolute;top:-8px;right:-8px;width:22px;height:22px;border-radius:50%;background:var(--danger);color:#fff;border:none;cursor:pointer;font-size:0.7rem;line-height:1">×</button>\
        ' + (img.file ? '<div style="font-size:0.7rem;color:var(--text-secondary);text-align:center;margin-top:0.25rem">Ready to upload</div>' : '') + '\
      </div>';
  });
  imagesList.innerHTML = html || '<p class="form-hint">No images yet. Add at least one product image.</p>';
}

window.setMainImage = (index) => {
  images.forEach((img) => { img.is_main = false; });
  images[index].is_main = true;
  renderImages();
};

window.removeImage = (index) => {
  const img = images[index];
  if (img.id) {
    img.removed = true;
    img.url = null;
  } else {
    images.splice(index, 1);
  }
  const remaining = images.filter((i) => !i.removed);
  if (remaining.length && !remaining.some((i) => i.is_main)) remaining[0].is_main = true;
  renderImages();
};

async function saveProduct() {
  if (!prodName.value.trim()) return alert('Product name is required.');
  const priceCents = Math.round(parseFloat(prodPrice.value || '0') * 100);
  if (priceCents < 0) return alert('Price must be zero or more.');
  const quantity = parseInt(prodQty.value || '0') || 0;
  const tags = prodTags.value.split(',').map((t) => t.trim()).filter(Boolean);
  const status = prodPublish.checked ? 'published' : 'draft';
  const shopId = await getShopId();
  if (!shopId) return alert('No shop found. Open a shop in the seller dashboard first.');
  const payload = {
    shop_id: shopId,
    category_id: prodCategory.value || null,
    name: prodName.value.trim(),
    description: prodDesc.value.trim(),
    price: priceCents / 100,
    currency: 'USD',
    status,
    sku: prodSku.value.trim() || null,
    quantity,
    tags
  };
  const submit = btnSave;
  submit.disabled = true;
  submit.textContent = 'Saving…';
  try {
    let product;
    if (editingId) {
      const { data, error } = await fetchJson('/api/products/' + editingId, payload, 'PATCH');
      if (error) throw new Error(error);
      product = data;
    } else {
      const { data, error } = await fetchJson('/api/products', payload, 'POST');
      if (error) throw new Error(error);
      product = data[0];
    }
    await syncImages(product.id);
    showToast('Product saved.');
    closeModal(modal);
    loadProducts();
  } catch (err) {
    submit.disabled = false;
    submit.textContent = 'Save product';
    alert('Failed to save product: ' + err.message);
  }
}

async function syncImages(productId) {
  // Remove deleted images
  for (const img of images.filter((i) => i.removed && i.id)) {
    if (img.storage_path) {
      await fetch(cfg.url + '/storage/v1/object/product-images/' + img.storage_path, {
        method: 'DELETE', headers: { Authorization: 'Bearer ' + (await getSessionToken()) }
      }).catch(() => {});
    }
    await supabase.from('product_images').delete().eq('id', img.id);
  }
  // Upsert images (new ones get inserted, existing keep their id)
  let order = 0;
  for (const img of images.filter((i) => !i.removed)) {
    if (img.file) {
      const path = 'products/' + productId + '/' + Date.now() + '-' + img.file.name.replace(/\s+/g, '_');
      const res = await fetch(cfg.url + '/storage/v1/object/product-images/' + path, {
        method: 'PUT',
        headers: {
          Authorization: 'Bearer ' + (await getSessionToken()),
          'x-upsert': 'true',
          'Content-Type': img.file.type
        },
        body: img.file
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error('Image upload failed: ' + txt);
      }
      img.storage_path = path;
      img.url = cfg.url + '/storage/v1/object/public/product-images/' + path;
      img.file = null;
    }
    await supabase.from('product_images').upsert([{
      id: img.id || undefined,
      product_id: productId,
      storage_path: img.storage_path,
      url: img.url,
      is_main: img.is_main,
      sort_order: order++
    }], { onConflict: 'id' });
  }
  const remaining = images.filter((i) => !i.removed);
  const mains = remaining.filter((i) => i.is_main);
  if (mains.length > 1) {
    for (let i = 1; i < mains.length; i++) mains[i].is_main = false;
    const ids = mains.slice(0, 1).concat(mains.slice(1)).filter((m) => m.id);
    // keep first main, demote the rest
    const demote = mains.slice(1).map((m) => m.id).filter(Boolean);
    if (demote.length) await supabase.from('product_images').update({ is_main: false }).in('id', demote);
  }
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  saveProduct();
});

window.editProduct = async (id) => {
  const { data, error } = await supabase.from('products').select('*, product_images(*)').eq('id', id).single();
  if (error) return alert('Could not load product: ' + error.message);
  openProductModal(data);
};

window.togglePublish = async (id, toStatus) => {
  if (!confirm('Change this product to "' + toStatus + '"?')) return;
  const { error } = await fetchJson('/api/products/' + id, { status: toStatus }, 'PATCH');
  if (error) return alert('Failed: ' + error);
  showToast('Product ' + toStatus + '.');
  loadProducts();
};

window.deleteProduct = async (id, name) => {
  if (!confirm('Delete "' + name + '"? This cannot be undone.')) return;
  const { error } = await fetchJson('/api/products/' + id, null, 'DELETE');
  if (error) return alert('Failed: ' + error);
  showToast('Product deleted.');
  loadProducts();
};

loadDbStatus();
