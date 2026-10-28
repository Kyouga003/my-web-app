// Supabase client initialization (ES module, singleton across all page scripts)
import { createClient } from '/lib/supabase.js';

export let supabase = null;
export let currentUser = null;
export let session = null;

export function initSupabase() {
  const cfg = window.SUPABASE_CONFIG;
  if (!cfg || !cfg.url || !cfg.key) {
    console.error('Supabase config missing. Did the /js/config.js script load?');
    return null;
  }
  supabase = createClient(cfg.url, cfg.key);

  supabase.auth.onAuthStateChange((event, sess) => {
    session = sess;
    currentUser = sess ? sess.user : null;
    window.dispatchEvent(new CustomEvent('authstate', { detail: { event, user: currentUser } }));
  });

  return supabase;
}

export async function ensureProfile() {
  if (!supabase || !currentUser) return null;
  const { data } = await supabase
    .from('profiles')
    .select('id, display_name, email, avatar_url, bio, role')
    .eq('id', currentUser.id)
    .single();
  currentUser.profile = data || null;
  return currentUser.profile;
}

export async function signOut() {
  if (!supabase) return;
  await supabase.auth.signOut();
  currentUser = null;
  session = null;
  window.location.href = '/login.html';
}
