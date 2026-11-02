// Authentication pages: sign in, register, password reset.
// Uses Supabase Auth (email + password). Session handling is managed by init.js.

import { supabase } from '/js/init.js';
import { showToast, showError, clearErrors } from '/js/ui.js';
import { renderAuthLinks, refreshCartCount } from '/js/nav.js';

function safeNextPage() {
  const requested = new URLSearchParams(window.location.search).get('next') || '';
  return /^[a-z0-9-]+\.html$/i.test(requested) ? requested : null;
}

window.addEventListener('authstate', async () => {
  const { currentUser } = await import('/js/init.js');
  const profile = currentUser
    ? await supabase.from('profiles').select('role, display_name').eq('id', currentUser.id).maybeSingle()
    : null;
  renderAuthLinks(currentUser, profile && profile.data);
  refreshCartCount();
});

export async function setupLogin(form, defaultRedirect) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors(form);
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    if (!email || !password) {
      return showError(form, 'login-email', 'Please enter your email address and password.');
    }
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    submit.textContent = 'Signing in�';
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    submit.disabled = false;
    submit.textContent = 'Sign in';
    if (error) {
      return showError(form, 'login-email', error.message || 'Sign in failed. Please try again.');
    }
    const next = safeNextPage() || defaultRedirect || 'index.html';
    showToast('Welcome back!');
    window.location.href = next;
  });
}

export async function setupRegister(form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors(form);
    const name = document.getElementById('reg-name').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const termsEl = form.querySelector('input[name="terms"]');
    if (!name || !email || !password) {
      return showError(form, 'reg-name', 'Please fill in all fields.');
    }
    if (password.length < 8) {
      return showError(form, 'reg-password', 'Password must be at least 8 characters.');
    }
    if (!termsEl || !termsEl.checked) {
      return showError(form, 'reg-name', 'You must accept the Terms of Service and Privacy Policy.');
    }
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    submit.textContent = 'Creating account�';
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: name } }
    });
    submit.disabled = false;
    submit.textContent = 'Create account';
    if (error) {
      return showError(form, 'reg-email', error.message || 'Could not create account. Please try again.');
    }
    showToast('Account created! Check your email to confirm your address, then sign in.');
    const next = safeNextPage();
    window.location.href = next ? 'login.html?next=' + encodeURIComponent(next) : 'login.html';
  });
}

export async function setupReset(form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors(form);
    const email = document.getElementById('reset-email').value.trim();
    if (!email) {
      return showError(form, 'reset-email', 'Please enter your email address.');
    }
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    submit.textContent = 'Sending�';
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    submit.disabled = false;
    submit.textContent = 'Send reset link';
    if (error) {
      return showError(form, 'reset-email', error.message || 'Could not send a reset link. Please try again.');
    }
    form.reset();
    showToast('If an account exists for that email, you will receive a password reset link.');
  });
}
