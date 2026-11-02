// Contact/support form — persists to the messages table via /api/messages.
import { supabase } from '/js/init.js';
import { showToast, showError, clearErrors } from '/js/ui.js';

const form = document.getElementById('contact-form');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearErrors(form);
  const payload = {
    name: document.getElementById('contact-name').value.trim(),
    email: document.getElementById('contact-email').value.trim(),
    subject: document.getElementById('contact-subject').value.trim(),
    message: document.getElementById('contact-message').value.trim()
  };
  if (!payload.name || !payload.email || !payload.subject || !payload.message) {
    return showError(form, 'contact-name', 'Please fill in every field.');
  }
  const submit = form.querySelector('button[type="submit"]');
  submit.disabled = true;
  submit.textContent = 'Sending…';
  const res = await fetch('/api/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  submit.disabled = false;
  submit.textContent = 'Send message';
  if (!res.ok) return showError(form, 'contact-message', 'Could not send. Please try again later.');
  showToast('Message sent! We will reply to your email.');
  form.reset();
});

// Support inquiries are stored as messages whose content is a JSON blob with
// the fields (name, email, subject, message). Admins can read them via
// /api/messages (authenticated, admin-only).
