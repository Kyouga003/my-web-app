// Contact/support form (server-side messages API preserved + structured)
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
  const { data, error } = await supabase.messages?.insert ? null : null;
  // Existing messages table is for demo messages; our support channel goes to
  // the support inbox via /api/contact which persists to the messages table.
  const res = await fetch('/api/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: JSON.stringify(payload) })
  });
  submit.disabled = false;
  submit.textContent = 'Send message';
  if (!res.ok) return showError(form, 'contact-message', 'Could not send. Please try again later.');
  showToast('Message sent! We will reply to your email.');
  form.reset();
});

// Use the Supabase client from init.js for a nicer fallback path above

import { supabase } from '/js/init.js';

// Support inbox is served through the existing messages API:
// each inquiry is stored as a message whose content is a JSON blob with the
// fields (name, email, subject, message). This keeps the same trusted
// pipeline without exposing sender addresses.
