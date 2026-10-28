// Shared UI helpers
export function showToast(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 300);
  }, 4000);
  return el;
}

export function showError(form, fieldId, message) {
  const field = form.querySelector('#' + fieldId);
  let err = form.querySelector('.form-error[data-for="' + fieldId + '"]');
  if (!err) {
    err = document.createElement('p');
    err.className = 'form-error';
    err.setAttribute('data-for', fieldId);
    field.parentNode.appendChild(err);
  }
  err.textContent = message;
  if (field) field.setAttribute('aria-invalid', 'true');
}

export function clearErrors(form) {
  form.querySelectorAll('.form-error').forEach(e => e.remove());
  form.querySelectorAll('[aria-invalid]').forEach(e => e.removeAttribute('aria-invalid'));
}

export function openModal(modalEl) {
  modalEl.classList.add('open');
  modalEl.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

export function closeModal(modalEl) {
  modalEl.classList.remove('open');
  modalEl.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

export function formatMoney(cents, currency = 'USD') {
  if (cents == null) return '–';
  const units = (cents / 100).toFixed(2);
  const symbol = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : currency;
  return symbol + units;
}

export function formatDate(iso) {
  if (!iso) return '–';
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatDateTime(iso) {
  if (!iso) return '–';
  return new Date(iso).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function escapeHtml(text) {
  if (!text) return '';
  const d = document.createElement('div');
  d.textContent = text;
  return d.innerHTML;
}

export function renderStars(rating, count) {
  const n = Math.round(rating || 0);
  let stars = '';
  for (let i = 1; i <= 5; i++) stars += i <= n ? '★' : '☆';
  const label = count ? ` (${count})` : '';
  return `<span class="rating" aria-label="Rating ${rating} of 5">${stars}</span><span class="rating-count">${escapeHtml(label)}</span>`;
}
