// Supabase client initialization — shared by every page.
// Reads the runtime config injected by /js/config.js (Supabase URL + anon key).
// Security is enforced by Row Level Security in the database, not by key secrecy.

import { createClient } from '/js/lib/supabase.js';

let supabase = null;
let currentUser = null;

export function initSupabase() {
  if (supabase) return supabase;
  const cfg = window.SUPABASE_CONFIG || {};
  if (!cfg.url || !cfg.key) {
    console.error('Supabase config is missing. Make sure /js/config.js is served by the server.');
    return null;
  }
  supabase = createClient(cfg.url, cfg.key, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      flowType: 'implicit'
    }
  });

  supabase.auth.onAuthStateChange((event, session) => {
    currentUser = session ? session.user : null;
    window.dispatchEvent(new CustomEvent('authstate', { detail: { user: currentUser, session } }));
  });

  // Restore any existing session so pages render the signed-in state immediately.
  supabase.auth.getUser().then(({ data }) => {
    currentUser = data.user || null;
    window.dispatchEvent(new CustomEvent('authstate', { detail: { user: currentUser, session: null } }));
  });

  return supabase;
}

export { supabase, currentUser };
