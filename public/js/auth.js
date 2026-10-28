// Shared authentication UI handlers
import { supabase, ensureProfile, currentUser } from '/js/init.js';
import { showToast, showError, clearErrors, formatMoney } from '/js/ui.js';

export async function initLoginForm(form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors(form);
    const email = form.email.value.trim();
    const password = form.password.value;
    if (!email || !password) return showError(form, 'email', 'Email and password are required');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return showError(form, 'email', error.message || 'Login failed');
    showToast('Welcome back!');
    window.location.href = form.dataset.redirect || 'index.html';
  });
}

export async function initRegisterForm(form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors(form);
    const displayName = form['display-name'].value.trim();
    const email = form.email.value.trim();
    const password = form.password.value;
    const terms = form.elements['terms'] && form.elements['terms'].checked;
    if (!displayName) return showError(form, 'display-name', 'Display name is required');
    if (!email) return showError(form, 'email', 'Email is required');
    if (!password || password.length < 8) return showError(form, 'password', 'Password must be at least 8 characters');
    if (!terms) return showError(form, 'terms', 'You must accept the terms and privacy policy');
    const { error } = await supabase.auth.signUp({ email, password, options: { data: { display_name: displayName } } });
    if (error) return showError(form, 'email', error.message || 'Registration failed');
    showToast('Account created. Please check your email to confirm your address, then sign in.');
    window.location.href = 'login.html';
  });
}

export function initResetForm(form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors(form);
    const email = form.email.value.trim();
    if (!email) return showError(form, 'email', 'Email is required');
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/reset-password.html'
    });
    if (error) return showError(form, 'email', error.message);
    showToast('If an account exists for that email, a password reset link has been sent.');
  });
}

export function requireAuth() {
  if (!currentUser) {
    window.location.href = 'login.html?next=' + encodeURIComponent(window.location.pathname);
    return false;
  }
  return true;
}

export function requireRole(allowed) {
  return (user) => {
    const profile = user && user.profile;
    if (!allowed.includes(profile && profile.role)) {
      showToast('You do not have permission to view this page.', 'error');
      setTimeout(() => { window.location.href = 'index.html'; }, 600);
      return false;
    }
    return true;
  };
}
