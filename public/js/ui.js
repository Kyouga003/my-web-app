// Shared UI helpers — formatting, escaping, toasts, errors, modals.

export function formatMoney(cents, currency = 'USD') {
  if (cents == null) cents = 0;
  const units = (cents / 100).toFixed(2);
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(units);
}

export function formatDateTime(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  } catch (_) { return iso; }
}

export function escapeHtml(text) {
  if (text == null) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function renderStars(rating, showCount = false) {
  const n = Math.max(0, Math.min(5, Math.round(rating || 0)));
  let html = '';
  for (let i = 1; i <= 5; i++) {
    html += '<span class="star' + (i <= n ? ' filled' : '') + '" aria-hidden="true">&#9733;</span>';
  }
  if (showCount) html += '<span class="rating-count" style="margin-left:0.35rem;color:var(--text-secondary);font-size:0.85rem"> (' + rating + ')</span>';
  return html;
}

let toastTimer = null;
export function showToast(message, type = 'success') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  const el = document.createElement('div');
  el.className = 'toast toast-' + type;
  el.setAttribute('role', 'alert');
  el.setAttribute('aria-live', 'polite');
  el.innerHTML = '<span class="toast-message">' + escapeHtml(message) + '</span>';
  container.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, 4000);
}

export function showError(form, fieldId, message) {
  clearErrors(form);
  const field = document.getElementById(fieldId);
  if (field) {
    field.setAttribute('aria-invalid', 'true');
    const hint = document.createElement('p');
    hint.className = 'form-error';
    hint.style.color = 'var(--danger)';
    hint.style.fontSize = '0.85rem';
    hint.style.marginTop = '0.25rem';
    hint.textContent = escapeHtml(message);
    field.parentNode.insertBefore(hint, field.nextSibling);
    field.focus();
  }
}

export function clearErrors(form) {
  form.querySelectorAll('[aria-invalid="true"]').forEach(f => f.removeAttribute('aria-invalid'));
  form.querySelectorAll('.form-error').forEach(e => e.remove());
}

export function openModal(el) {
  if (!el) return;
  el.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  el.addEventListener('keydown', function escHandler(e) {
    if (e.key === 'Escape') { closeModal(el); el.removeEventListener('keydown', escHandler); }
  });
}

export function closeModal(el) {
  if (!el) return;
  el.style.display = 'none';
  document.body.style.overflow = '';
}
