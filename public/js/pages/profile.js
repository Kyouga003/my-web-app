// Profile page
import { supabase } from '/js/init.js';
import { escapeHtml, showToast } from '/js/ui.js';
import { renderAuthLinks, updateCartCount } from '/js/nav.js';

const cfg = window.SUPABASE_CONFIG || {};

const form = document.getElementById('profile-form');
const wrap = document.getElementById('profile-wrap');
const requireLoginEl = document.getElementById('profile-require-login');

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
  const prof = currentUser ? await supabase.from('profiles').select('*').eq('id', currentUser.id).single() : null;
  renderAuthLinks(currentUser, prof && prof.data);
  if (!currentUser) {
    requireLoginEl.style.display = 'block';
    updateCartCount(0);
    return;
  }
  requireLoginEl.style.display = 'none';
  wrap.style.display = 'block';
  const p = prof.data;
  document.getElementById('profile-name').value = p.display_name || '';
  document.getElementById('profile-email').value = p.email || currentUser.email || '';
  document.getElementById('profile-bio').value = p.bio || '';
  document.getElementById('profile-role').textContent = (p.role || 'buyer') + (p.role === 'seller' ? ' (seller)' : '') + (p.role === 'admin' ? ' (administrator)' : '');
  document.getElementById('stat-member').textContent = p.created_at ? new Date(p.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short' }) : '–';
  const avatar = document.getElementById('profile-avatar');
  avatar.src = p.avatar_url || '/images/placeholder.svg';

  try {
    const { data: orders } = await supabase.from('orders').select('id').eq('buyer_id', currentUser.id);
    document.getElementById('stat-orders').textContent = (orders || []).length;
    const { data: favs } = await supabase.from('favorites').select('id').eq('user_id', currentUser.id);
    document.getElementById('stat-favorites').textContent = (favs || []).length;
  } catch (_) {}
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const { currentUser } = await import('/js/init.js');
  const updates = {
    display_name: document.getElementById('profile-name').value.trim(),
    email: document.getElementById('profile-email').value.trim(),
    bio: document.getElementById('profile-bio').value.trim()
  };
  const { error } = await supabase.from('profiles').update(updates).eq('id', currentUser.id);
  if (error) return alert('Could not save: ' + error.message);
  showToast('Profile saved.');
});

document.getElementById('profile-avatar-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) return alert('Please select an image file.');
  if (file.size > 2 * 1024 * 1024) return alert('Image must be under 2 MB.');
  const { currentUser } = await import('/js/init.js');
  const path = 'avatars/' + currentUser.id + '/' + Date.now() + '-' + file.name.replace(/\s+/g, '_');
  const res = await fetch(cfg.url + '/storage/v1/object/product-images/' + path, {
    method: 'PUT',
    headers: {
      Authorization: 'Bearer ' + (await supabase.auth.getSession()).data.session.access_token,
      'x-upsert': 'true'
    },
    body: file
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    return alert('Upload failed: ' + txt);
  }
  const url = cfg.url + '/storage/v1/object/public/product-images/' + path;
  await supabase.from('profiles').update({ avatar_url: url }).eq('id', currentUser.id);
  document.getElementById('profile-avatar').src = url;
  showToast('Profile picture updated.');
});

loadDbStatus();
loadCartCount();

async function loadCartCount() {
  const { currentUser } = await import('/js/init.js');
  if (!currentUser) { updateCartCount(0); return; }
  try {
    const { data: cart } = await supabase.from('carts').select('id').eq('user_id', currentUser.id).maybeSingle();
    if (cart) {
      const { data: items } = await supabase.from('cart_items').select('quantity').eq('cart_id', cart.id);
      updateCartCount(items ? items.reduce((s, i) => s + (i.quantity || 0), 0) : 0);
    }
  } catch (_) { updateCartCount(0); }
}
