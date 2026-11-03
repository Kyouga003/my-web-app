// Authentication pages: sign in, register, password reset.
// Uses Supabase Auth (email + password). Session handling is managed by init.js.

import { supabase } from '/js/init.js';
import { showToast, showError, clearErrors } from '/js/ui.js';
import { renderAuthLinks, refreshCartCount } from '/js/nav.js';

function safeNextPage() {
  const requested = new URLSearchParams(window.location.search).get('next') || '';
  return /^[a-z0-9-]+\.html$/i.test(requested) ? requested : null;
}

function authErrorMessage(error, action) {
  const message = String(error && error.message || '');
  const normalized = message.toLowerCase();
  if (normalized.includes('email rate limit exceeded') || normalized.includes('rate limit')) {
    return 'Supabase is temporarily limiting emails. Wait before retrying, or configure a custom SMTP provider in Supabase Auth.';
  }
  if (normalized.includes('invalid login credentials')) {
    return 'The email/password pair was not accepted, or the email is not confirmed. Check the email, try password reset, and confirm signup completed.';
  }
  if (normalized.includes('email not confirmed')) {
    return 'Confirm your email using the link Supabase sent, then sign in.';
  }
  if (normalized.includes('fetch failed') || normalized.includes('failed to fetch')) {
    return 'Could not reach Supabase. Check the project URL and connection, then try again.';
  }
  return message || action + ' failed. Please try again.';
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
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return showError(form, 'login-email', authErrorMessage(error, 'Sign in'));
    } catch (error) {
      return showError(form, 'login-email', authErrorMessage(error, 'Sign in'));
    } finally {
      submit.disabled = false;
      submit.textContent = 'Sign in';
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
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { display_name: name } }
      });
      if (error) return showError(form, 'reg-email', authErrorMessage(error, 'Create account'));
    } catch (error) {
      return showError(form, 'reg-email', authErrorMessage(error, 'Create account'));
    } finally {
      submit.disabled = false;
      submit.textContent = 'Create account';
    }
    showToast('Application received. Confirm your email, then wait for marketplace approval before shopping or selling.');
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
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      if (error) return showError(form, 'reset-email', authErrorMessage(error, 'Password reset'));
    } catch (error) {
      return showError(form, 'reset-email', authErrorMessage(error, 'Password reset'));
    } finally {
      submit.disabled = false;
      submit.textContent = 'Send reset link';
    }
    form.reset();
    showToast('If an account exists for that email, you will receive a password reset link.');
  });
}
