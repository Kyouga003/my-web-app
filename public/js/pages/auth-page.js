// Shared authentication flows for login / register / reset-password pages
import { supabase } from '/js/init.js';
import { showToast, showError, clearErrors } from '/js/ui.js';

export function setupLogin(form, redirectTo) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors(form);
    const email = form.email.value.trim();
    const password = form.password.value;
    if (!email || !password) return showError(form, 'email', 'Email and password are required');
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    submit.textContent = 'Signing in…';
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    submit.disabled = false;
    submit.textContent = 'Sign in';
    if (error) return showError(form, 'email', error.message || 'Login failed');
    showToast('Signed in successfully.');
    window.location.href = redirectTo || 'index.html';
  });
}

export function setupRegister(form) {
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
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    submit.textContent = 'Creating account…';
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { data: { display_name: displayName } }
    });
    submit.disabled = false;
    submit.textContent = 'Create account';
    if (error) return showError(form, 'email', error.message || 'Registration failed');
    showToast('Account created! Check your email to confirm your address, then sign in.');
    window.location.href = 'login.html';
  });
}

export function setupReset(form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors(form);
    const email = form.email.value.trim();
    if (!email) return showError(form, 'email', 'Email is required');
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    submit.textContent = 'Sending…';
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/reset-password.html'
    });
    submit.disabled = false;
    submit.textContent = 'Send reset link';
    if (error) return showError(form, 'email', error.message);
    showToast('If an account exists for that email, a password reset link has been sent.');
    form.reset();
  });
}
